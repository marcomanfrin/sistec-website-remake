// @ts-nocheck — codice importato dal progetto sistec-logo-showreel
/* =====================================================================
   SISTEC 5317 bending cell — versione web interattiva della sezione 3D dello showreel
   (adattata da sistec-logo-showreel/cell3d.js: canvas ridimensionabile, asset compressi,
   camera libera opzionale).
   World = cell coordinates from the CAD project: millimetres, Z up, robot base at the origin.
   The robot runs the real program of the product (product3d.js); everything is a pure function
   of the section time u (seconds), like the 2D showreel.
   ===================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { fk, tcpOf, FLANGE, MOUNT } from './kin.js';
import { loadProduct, simulate, chain, PRESS } from './product3d.js';
export { fk, ik, FLANGE } from './kin.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const smooth = p => p * p * (3 - 2 * p);
const s5 = p => p * p * p * (p * (p * 6 - 15) + 10);          // smootherstep: zero accel at both ends
const expoOut = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const expoInOut = p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2);
const DEG = Math.PI / 180;
export const PRODUCT = 'K004505-42U';
export const SPEED = 1.5;                                     // cycle shown at 1.5× real time
export const DUR = 34;

const ORANGE = new THREE.Color('#F07D00');

// ---------- colour grade: CAD colours -> SISTEC industrial palette ----------
export function grade(r, g, b, out) {
  const c = new THREE.Color(r / 255, g / 255, b / 255), hsl = {};
  c.getHSL(hsl);
  const h = hsl.h * 360;
  if (h > 18 && h < 27 && hsl.s > 0.85 && hsl.l > 0.3) c.copy(ORANGE).offsetHSL(0, 0, (hsl.l - 0.5) * 0.3);     // KUKA orange -> brand orange
  else c.setHSL(hsl.h, hsl.s * (h > 180 && h < 230 ? 0.35 : 0.12), 0.03 + Math.pow(hsl.l, 1.6) * 0.3);                   // everything else: graphite, press keeps a hint of steel blue
  out.push(c.r, c.g, c.b);                                                                                // setHSL works in linear-sRGB working space
}

export async function loadPart(name, info, loader) {
  const buf = await loader.fetchGz(`${name}.bin`);
  const pos = new Float32Array(buf, 0, info.v * 3);
  const rgba = new Uint8Array(buf, info.v * 12, info.v * 4);
  const idx = new Uint32Array(buf, info.v * 16, info.f * 3);
  return { pos, rgba, idx };
}
// Flat-shaded non-indexed geometry; `pick(r,g,b)` selects faces by the colour of their first vertex.
export function makeGeo(p, pick = null) {
  const P = [], C = [];
  const { pos, rgba, idx } = p;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f];
    if (pick && !pick(rgba[a * 4], rgba[a * 4 + 1], rgba[a * 4 + 2])) continue;
    for (let k = 0; k < 3; k++) { const v = idx[f + k]; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); grade(rgba[v * 4], rgba[v * 4 + 1], rgba[v * 4 + 2], C); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- shared shader hooks: scan-line reveal (solids appear below a rising plane) ----------
const U = { uReveal: { value: 1e6 }, uBand: { value: 60 }, uBandCol: { value: new THREE.Color('#ff8a10').multiplyScalar(6) } };
function revealable(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uReveal, uBand;\nuniform vec3 uBandCol;')
      .replace('void main() {', 'void main() {\n if (vWP.z > uReveal) discard;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n gl_FragColor.rgb += uBandCol * (1.0 - smoothstep(0.0, uBand, uReveal - vWP.z));');
  };
  return mat;
}

// Blueprint edges: orange lines drawn on in order of their `aD` attribute (0..1).
const LINE_U = { uDraw: { value: 0 }, uAlpha: { value: 0 }, uCol: { value: new THREE.Color('#ff8a10') } };
const lineMat = new THREE.ShaderMaterial({
  uniforms: LINE_U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'attribute float aD; varying float vD; void main(){ vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform float uDraw, uAlpha; uniform vec3 uCol; varying float vD; void main(){ if (vD > uDraw) discard; float head = 1.0 - smoothstep(0.0, 0.04, uDraw - vD); gl_FragColor = vec4(uCol * (1.0 + 4.0 * head), uAlpha * (0.55 + 0.45 * head)); }',
});
function edges(geo, center, radius, thresh = 32) {
  const e = new THREE.EdgesGeometry(geo, thresh);
  const p = e.attributes.position.array, d = new Float32Array(p.length / 3);
  for (let i = 0; i < d.length; i += 2) {                     // both ends of a segment share the order value of its midpoint
    const x = (p[i * 3] + p[i * 3 + 3]) / 2 - center.x, y = (p[i * 3 + 1] + p[i * 3 + 4]) / 2 - center.y, z = (p[i * 3 + 2] + p[i * 3 + 5]) / 2;
    d[i] = d[i + 1] = clamp(Math.hypot(x, y) / radius * 0.85 + z / 3200 * 0.15);
  }
  e.setAttribute('aD', new THREE.BufferAttribute(d, 1));
  return new THREE.LineSegments(e, lineMat);
}

// ---------- scene ----------
export async function createCell({ canvas, width, height, pixelRatio = 1, loader, shadowSize = 2048 }) {
  let W = width, H = height;
  await loader.init();
  const man = await loader.manifest();
  const P = await loadProduct(PRODUCT, (n) => loader.fetchJson(`${n}.json`));
  const sim = simulate(P, { speed: 1 });
  const t = P.thickness;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#0d0e0f');
  scene.background = BG; scene.fog = new THREE.Fog(BG, 9000, 26000);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x16110c, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.6);
  key.position.set(5200, 4200, 9000); key.target.position.set(300, -400, 0);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -6500, right: 6500, top: 6500, bottom: -6500, near: 100, far: 25000 });
  key.shadow.mapSize.set(shadowSize, shadowSize); key.shadow.bias = -0.0004; key.shadow.normalBias = 6;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff9a40, 1.3); rim.position.set(-3000, -7000, 2500); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fb0ff, 0.5); fill.position.set(-6000, 5000, 3000); scene.add(fill);
  const pressGlow = new THREE.PointLight(0xff7a00, 0, 2500, 2); pressGlow.position.set(100, PRESS.dieY + 300, P.dieTop + 150); scene.add(pressGlow);

  // floor: dark epoxy with a 250 mm grid
  const tc = document.createElement('canvas'); tc.width = tc.height = 1024;
  const tx = tc.getContext('2d');
  tx.fillStyle = '#1b1c1d'; tx.fillRect(0, 0, 1024, 1024);
  tx.strokeStyle = 'rgba(255,255,255,0.05)'; tx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { tx.beginPath(); tx.moveTo(i * 256, 0); tx.lineTo(i * 256, 1024); tx.moveTo(0, i * 256); tx.lineTo(1024, i * 256); tx.stroke(); }
  tx.strokeStyle = 'rgba(255,255,255,0.11)'; tx.lineWidth = 4; tx.strokeRect(0, 0, 1024, 1024);
  const ft = new THREE.CanvasTexture(tc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(40, 40); ft.anisotropy = 8; ft.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.62, metalness: 0.15 }));
  floor.position.set(0, 0, -40); floor.receiveShadow = true; scene.add(floor);

  const std = (o = {}) => revealable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.35, ...o }));
  const center = V3(300, -300, 0);
  const lines = new THREE.Group(); scene.add(lines);
  const mesh = (geo, mat, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

  const names = ['static', 'stand', 'fence', 'ram', 'coupling', 'J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'gripper', 'carro_alto', 'carro_basso', 'aligner_jaw'];
  const parts = {};
  await Promise.all(names.map(async (n) => { parts[n] = await loadPart(n, man[n], loader); }));
  const staticGeo = makeGeo(parts.static);
  mesh(staticGeo, std());
  lines.add(edges(staticGeo, center, 6200));
  mesh(makeGeo(parts.stand), std());
  const fenceGeo = makeGeo(parts.fence);
  scene.add(new THREE.Mesh(fenceGeo, revealable(new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }))));
  lines.add(edges(fenceGeo, center, 6200, 20));

  // stations: overturner clamp carriages and aligner jaw
  const ST = man._stations;
  const carrAxis = V3(...ST.carriage_axis), jawAxis = V3(...ST.jaw_axis);
  const carroA = mesh(makeGeo(parts.carro_alto), std()), carroB = mesh(makeGeo(parts.carro_basso), std());
  const jaw = mesh(makeGeo(parts.aligner_jaw), std());
  for (const m of [carroA, carroB, jaw]) lines.add(edges(m.geometry, center, 6200));

  // press: ram (beam + holders) with the product's punch, die on the die holder — both from their DXF profiles
  const ram = new THREE.Group(); scene.add(ram);
  const ramGeo = makeGeo(parts.ram);
  mesh(ramGeo, std({ metalness: 0.5, roughness: 0.4 }), ram);
  ram.add(edges(ramGeo, center, 6200));
  const toolSteel = revealable(new THREE.MeshStandardMaterial({ color: '#9aa1a7', metalness: 0.9, roughness: 0.28 }));
  const pressX = xb => 97.748 + 1530 - xb;                       // press-base X (from the right end) -> world X
  function toolMesh(tool, z0, parent) {
    const sh = new THREE.Shape(tool.profile.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: tool.length, bevelEnabled: false, curveSegments: 4 });
    const m = mesh(g, toolSteel, parent);
    // profile X -> world Y (across the die), profile Y -> world Z, extrusion -> world X
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(V3(0, 1, 0), V3(0, 0, 1), V3(1, 0, 0)).setPosition(pressX(tool.position + tool.length), PRESS.dieY, z0);
    const e = edges(g, center, 6200, 40); e.applyMatrix4(m.matrix); parent.add(e);
    return m;
  }
  toolMesh(P.tools.die, PRESS.holderZ, scene);
  toolMesh(P.tools.punch, PRESS.punchShoulderZ, ram);

  // robot links
  const robotMat = revealable(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  const links = [];
  for (let j = 0; j < 7; j++) {
    const g = makeGeo(parts['J' + j]);
    const grp = new THREE.Group(); grp.matrixAutoUpdate = false;
    mesh(g, robotMat, grp); grp.add(edges(g, center, 6200, 40));
    scene.add(grp); links.push(grp);
  }
  mesh(makeGeo(parts.coupling), std({ metalness: 0.6 }), links[6]);             // quick-change male on the flange
  // the product's gripper, in its model frame on the flange; vacuum channels glow while holding
  const tool = new THREE.Group(); tool.matrixAutoUpdate = false; scene.add(tool);
  const isVac = (r, g, b) => r === 0 && g === 68 && b === 255;
  const grpBody = mesh(makeGeo(parts.gripper, (r, g, b) => !isVac(r, g, b)), std({ metalness: 0.55, roughness: 0.4 }), tool);
  const cupMat = revealable(new THREE.MeshStandardMaterial({ color: '#202224', roughness: 0.6, emissive: ORANGE, emissiveIntensity: 0 }));
  mesh(makeGeo(parts.gripper, isVac), cupMat, tool);
  tool.add(edges(grpBody.geometry, center, 6200, 40));

  // the blank: one extruded strip per flat region (outline + holes), hinged on the bend lines
  const sheetMat = revealable(new THREE.MeshStandardMaterial({ color: '#b3b9be', metalness: 0.7, roughness: 0.38, envMapIntensity: 0.7, side: THREE.DoubleSide }));
  const shapeOf = (outline, holes) => {
    const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return sh;
  };
  const stripGeo = P.blank.strips.map(s => new THREE.ExtrudeGeometry(shapeOf(s.outline, s.holes), { depth: t, bevelEnabled: false, curveSegments: 6 }));
  const part = P.blank.strips.map((s, i) => { const m = mesh(stripGeo[i], sheetMat); m.matrixAutoUpdate = false; return m; });
  // the rest of the stack under the first blank: outline-only slab
  const stackRest = sim.S[0].stackN;
  const stackMesh = mesh(new THREE.ExtrudeGeometry(new THREE.Shape([V3(0, 23.1, 0), V3(P.W, 23.1, 0), V3(P.W, 1889.2, 0), V3(0, 1889.2, 0)].map(v => new THREE.Vector2(v.x, v.y))), { depth: stackRest * t, bevelEnabled: false }),
    revealable(new THREE.MeshStandardMaterial({ color: '#8f959a', metalness: 0.5, roughness: 0.62 })));
  stackMesh.matrixAutoUpdate = false;
  stackMesh.matrix.copy(sim.stackW).multiply(new THREE.Matrix4().makeTranslation(0, 0, -stackRest * t));

  // ---------- bloom ----------
  const composer = new EffectComposer(renderer);
  const camera = new THREE.PerspectiveCamera(40, W / H, 30, 60000);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.4, 0.4, 1.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- sampled cycle -> section time ----------
  const SDT = 1 / 200;
  const idx = u => clamp(u * SPEED / SDT, 0, sim.S.length - 1);
  const sampleAt = u => {
    const f = idx(u), i = Math.floor(f), a = sim.S[i], b = sim.S[Math.min(i + 1, sim.S.length - 1)], p = f - i;
    return { a, b, p, q: a.q.map((v, k) => v + (b.q[k] - v) * p) };
  };
  const evT = (k, n = 0) => { const e = sim.events.filter(e => e.k === k)[n]; return e ? e.t / SPEED : 0; };
  const E = {
    stack: evT('stack_pick'), align: evT('align'), pinch1: evT('pinch', 0), bend1: evT('bend', 0), regrip1: evT('pick', 1),
    pinch2: evT('pinch', 1), bend2: evT('bend', 1), clamp: evT('clamp'), unclamp: evT('unclamp'),
    pinch3: evT('pinch', 2), bend3: evT('bend', 2), deposit: evT('deposit'), end: sim.dur / SPEED,
  };
  const bendIds = sim.events.filter(e => e.k === 'bend').map(e => P.blank.bends.find(b => b.id === e.id));
  const partCenterLocal = V3(P.W / 2, 956, t / 2);

  function update(u) {
    const { a, b, p, q } = sampleAt(u);
    const mats = fk(q);
    for (let j = 0; j < 7; j++) { links[j].matrix.copy(mats[j]); links[j].matrixWorldNeedsUpdate = true; }
    tool.matrix.copy(mats[6]).multiply(FLANGE).multiply(MOUNT); tool.matrixWorldNeedsUpdate = true;
    cupMat.emissiveIntensity = 2.2 * (a.cups + (b.cups - a.cups) * p);
    // part
    const fold = a.fold.map((v, k) => v + (b.fold[k] - v) * p);
    const Wp = a.W.clone();                                          // grid is fine enough; no pose interpolation needed
    const C = chain(P, fold);
    part.forEach((m, i) => { m.matrix.multiplyMatrices(Wp, C[i]); m.matrixWorldNeedsUpdate = true; });
    stackMesh.visible = true;
    // press, stations
    ram.position.z = -(a.ram + (b.ram - a.ram) * p); ram.updateMatrixWorld();
    const cj = a.carr + (b.carr - a.carr) * p;
    carroA.position.copy(carrAxis).multiplyScalar(60 * cj); carroB.position.copy(carrAxis).multiplyScalar(-60 * cj);
    jaw.position.copy(jawAxis).multiplyScalar(ST.jaw_stroke * (a.jaw + (b.jaw - a.jaw) * p));
    // bend flash
    let press = 0;
    for (const k of ['bend1', 'bend2', 'bend3']) press = Math.max(press, u >= E[k] ? Math.exp(-5 * (u - E[k])) : 0);
    pressGlow.intensity = 2.5e5 * press;
    return { q, press, partW: Wp, fold, tcp: tcpOf(mats, P.TOOL) };
  }

  // ---------- camera shots (keyed to the cycle's events) ----------
  const look = (pos, tgt, fov = 40, up = V3(0, 0, 1)) => ({ pos, tgt, fov, up });
  const orbit = (c, r, h, az) => V3(c.x + r * Math.cos(az), c.y + r * Math.sin(az), h);
  const D = V3(100, PRESS.dieY, P.dieTop);
  const shots = [
    { name: 'CAM 01 · LAYOUT', t0: 0, cam: p => look(orbit(V3(300, -700, 0), lerp(10400, 8800, s5(p)), lerp(7800, 5600, s5(p)), lerp(1.05, 1.42, s5(p))), V3(250, -900, 500), 38) },
    { name: 'CAM 02 · LOADING STACK', t0: 2.5, cam: p => look(V3(lerp(2600, 2300, s5(p)), lerp(3000, 2850, p), lerp(1500, 1350, p)), V3(lerp(600, 750, p), lerp(1500, 1400, p), lerp(400, 700, s5(p))), 36) },
    { name: 'CAM 03 · CENTERING TABLE', t0: E.align - 1.3, cam: p => look(V3(lerp(700, 850, p), lerp(2600, 2450, p), lerp(1900, 1750, p)), V3(1950, 1050, lerp(1000, 950, p)), 38) },
    { name: 'CAM 04 · PRESS BRAKE', t0: E.pinch1 - 1.6, cam: p => look(V3(lerp(1700, 1450, s5(p)), lerp(-1150, -1300, p), lerp(1800, 1650, p)), V3(lerp(250, 150, p), -2300, 1180), 40) },
    { name: 'CAM 05 · BEND 1', t0: E.bend1 - 0.6, cam: p => look(V3(lerp(950, 850, p), lerp(-1680, -1720, p), lerp(1520, 1480, p)), V3(lerp(150, 80, p), D.y - 10, D.z + 30), 34) },
    { name: 'CAM 06 · BEND 2', t0: E.pinch2 - 1.2, cam: p => look(V3(lerp(1550, 1450, p), lerp(-1900, -1950, p), lerp(1350, 1300, p)), V3(-100, D.y + 150, D.z + 60), 38) },
    { name: 'CAM 07 · REGRIP STATION', t0: E.clamp - 1.6, cam: p => look(V3(lerp(500, 750, p), lerp(700, 600, p), lerp(2500, 2350, p)), V3(1900, -250, 1800), 42) },
    { name: 'CAM 08 · BEND 3', t0: E.pinch3 - 1.2, cam: p => look(V3(lerp(-1250, -1100, p), lerp(-1550, -1650, p), lerp(1650, 1550, p)), V3(100, D.y + 60, D.z + 60), 40) },
    { name: 'CAM 09 · UNLOAD RACK', t0: E.deposit - 2.0, cam: p => look(V3(lerp(-2700, -2500, p), lerp(2900, 2750, p), lerp(1500, 1300, p)), V3(-1300, 1500, lerp(1000, 650, s5(p))), 44) },
    { name: 'CAM 10 · PLAN VIEW', t0: E.deposit + 1.2, cam: p => { const e = expoInOut(prog(p, 0, 0.6)); const a = lerp(1.1, Math.PI / 2, e);
      return look(orbit(V3(300, -600, 0), lerp(8200, 1, e), lerp(4800, 15500, e), a), V3(300, -600, 0), lerp(40, 36, e), V3(-Math.cos(a), -Math.sin(a), 0).lerp(V3(0, 1, 0), e).normalize()); } },
  ];
  shots.forEach((s, i) => { s.t1 = i + 1 < shots.length ? shots[i + 1].t0 : DUR + 0.01; });
  const shotAt = u => shots.find(s => u < s.t1) || shots.at(-1);
  function setCam(u) {
    const s = shotAt(u), c = s.cam(prog(u, s.t0, s.t1));
    camera.position.copy(c.pos); camera.up.copy(c.up); camera.lookAt(c.tgt);
    camera.fov = c.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    return s;
  }

  function render(u, fx = {}) {
    const st = update(u);
    const shot = fx.free ? shotAt(u) : setCam(u);
    if (fx.cam) { camera.position.set(...fx.cam.pos); camera.up.set(...(fx.cam.up || [0, 0, 1])); camera.lookAt(...fx.cam.tgt); camera.fov = fx.cam.fov || 40; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
    LINE_U.uDraw.value = expoOut(prog(u, 0.05, 1.5)) * 1.05;
    LINE_U.uAlpha.value = u < 2.5 ? lerp(0.55, 0.1, prog(u, 1.8, 2.5)) : 0.0;
    lines.visible = LINE_U.uAlpha.value > 0.001;
    U.uReveal.value = u < 2.5 ? lerp(-60, 3300, s5(prog(u, 1.1, 2.4))) : 1e6;
    key.shadow.intensity = u < 2.5 ? prog(u, 2.0, 2.45) : 1;
    if (!fx.free && st.press > 0.01 && /BEND/.test(shot.name)) { camera.position.z += Math.sin(u * 90) * 5 * st.press; camera.updateMatrixWorld(); }
    bloom.strength = 0.4 + (fx.bloom || 0);
    composer.render();
    return renderer.domElement;
  }
  function project(p) {
    const v = p.clone ? p.clone() : V3(...p);
    v.project(camera);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z];
  }
  function info(u) {
    const { q } = sampleAt(u);
    const shot = shotAt(u);
    // bend readout: which bend is running and its current angle
    let bend = null;
    sim.events.filter(e => e.k === 'bend').forEach((e, n) => {
      const t0 = e.t / SPEED, t1 = t0 + 1.4 / SPEED;
      if (u > t0 - 0.9 && u < t1 + 1.2) bend = { n: n + 1, id: e.id, target: Math.abs(bendIds[n].angle), angle: Math.abs(bendIds[n].angle) * smooth(prog(u, t0, t1)), t0, t1 };
    });
    return { q: q.map(v => v / DEG), shot, bend };
  }
  const partPoint = u => { const { a } = sampleAt(u); return partCenterLocal.clone().applyMatrix4(a.W.clone().multiply(chain(P, a.fold)[1])); };
  const debugIK = () => sim.events.map(e => `${(e.t / SPEED).toFixed(2)} ${e.k} ${JSON.stringify(e)}`);
  function resize(w, h, pr = pixelRatio) {
    W = w; H = h;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function dispose() {
    renderer.dispose();
    scene.traverse((o) => { o.geometry?.dispose?.(); });
  }
  render(0);
  return { renderer, camera, render, resize, dispose, project, info, partPoint, debugIK, DUR, E, shots, product: P,
    landmarks: { press: [-600, -2700, 2500], robot: [0, 0, 2150], stack: [700, 1400, 300], rack: [-1300, 1500, 1300], grippers: [-2200, 0, 2250], aligner: [2000, 1050, 1100], regrip: [2000, -350, 2100], die: [-200, PRESS.dieY, P.dieTop] } };
}
