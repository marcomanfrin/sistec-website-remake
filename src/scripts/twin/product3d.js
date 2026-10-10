// @ts-nocheck — codice importato dal progetto sistec-logo-showreel
/* =====================================================================
   The product's real robot cycle (assets/product/<P>.json, from tools/build_product.py),
   replayed on the KR120 model: PTP/LIN chains timed from the program's velocities,
   the blank as a chain of strips hinged on its bend lines, press/aligner/overturner actions.
   The whole cycle is pre-simulated on a fixed grid, so evaluating a time is deterministic.
   ===================================================================== */
import * as THREE from 'three';
import { V3, DEG, fk, ik, tcpOf, lerpPose, MOUNT, kpose, fromKuka } from './kin.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const s5 = p => p * p * p * (p * (p * 6 - 15) + 10);
const smooth = p => p * p * (3 - 2 * p);
const M4 = a => new THREE.Matrix4().fromArray(a);
const inv = M => M.clone().invert();
const mul = (...Ms) => Ms.reduce((A, B) => A.clone().multiply(B));

// press landmarks (cell mm): die line along X
export const PRESS = { dieY: -2428.7, holderZ: 1040 - 21.68, punchShoulderZ: 1420 - 21.68 };
const VMAX = [136, 130, 120, 292, 258, 284].map(v => v * DEG);            // KR120 R2700 axis speeds
const DT = 1 / 200;

export async function loadProduct(name, fetchJson = (n) => fetch(`assets/product/${n}.json`).then((r) => r.json())) {
  const P = await fetchJson(name);
  const t = P.thickness;
  const tc = P.tcp;
  P.TOOL = MOUNT.clone().multiply(kpose(tc.X, tc.Y, tc.Z, tc.A, tc.B, tc.C));   // flange -> TCP
  P.bendsSorted = P.blank.bends;                                                  // by x (strip order)
  P.W = Math.max(...P.blank.strips.at(-1).outline.map(p => p[0]));
  P.dieTop = PRESS.holderZ + Math.max(...P.tools.die.profile.map(p => p[1]));
  P.punchTipOpen = PRESS.punchShoulderZ + Math.min(...P.tools.punch.profile.map(p => p[1]));
  return P;
}

// ---------- part kinematics: strips 0..n-1, bend k between strip k and k+1 ----------
function hinge(P, k, a) {
  const x = P.bendsSorted[k].x, h = P.thickness / 2;
  return new THREE.Matrix4().makeTranslation(x, 0, h).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(-x, 0, -h));
}
export function chain(P, fold) {                       // strip frames in root (strip 0 = DXF frame)
  const out = [new THREE.Matrix4()];
  for (let k = 0; k < fold.length; k++) out.push(out[k].clone().multiply(hinge(P, k, fold[k])));
  return out;
}

export function simulate(P, opts = {}) {
  const B = Object.fromEntries(Object.entries(P.bases).map(([k, v]) => [k, M4(v)]));
  const TOOL = P.TOOL, t = P.thickness, nb = P.bendsSorted.length;
  const prog = P.program;
  const speed = opts.speed || 1, waitScale = opts.waitScale ?? 0.5;
  const S = [];                                             // samples
  const events = [];
  // state
  let q = fromKuka([-30, -120, 120, 0, 0, 0]);
  let tcp = tcpOf(fk(q), TOOL);
  const fold = Array(nb).fill(0);
  let W = null, held = -1, G = null, cups = 0, ram = 0, jaw = 0, carr = 0, stackN = opts.stack || 18, time = 0;
  const pressed = {};
  // grip used for the whole loading phase: from the aligner pick (part lies DXF-flipped on the table)
  const PcR = mul(B.Centering, new THREE.Matrix4().makeTranslation(P.W, 0, t), new THREE.Matrix4().makeRotationY(Math.PI));
  const pickAl = prog.find(s => s.name === 'PickOnAlg12');
  const Gal = mul(inv(PcR), M4(pickAl.M));                  // TCP in part (root) coords
  const stripsW = () => chain(P, fold).map(C => W.clone().multiply(C));
  const push = () => S.push({ q: q.slice(), W: W ? W.clone() : null, fold: fold.slice(), cups, ram, jaw, carr, stackN, held });
  const run = (dur, fn) => {                                // advance time, calling fn(p) per sample
    const n = Math.max(1, Math.round(dur / speed / DT));
    for (let i = 1; i <= n; i++) { fn(i / n); push(); }
    time += n * DT;
  };
  const partFromTcp = () => { if (held >= 0) W = mul(tcp, inv(G), inv(chain(P, fold)[held])); };
  const moveTo = (Mt, qt, type, dur, ease) => {
    const M0 = tcp.clone(), q0 = q.slice();
    run(dur, p => {
      const e = ease(p);
      if (type === 'PTP') { q = q0.map((v, i) => v + (qt[i] - v) * e); tcp = tcpOf(fk(q), TOOL); }
      else { tcp = lerpPose(M0, Mt, e); q = ik(tcp, q, TOOL); }
      partFromTcp();
    });
  };
  const log = (k, extra = {}) => events.push({ k, t: time, ...extra });

  // stack: blanks lie flat as the robot will find them (same grip as used at the aligner)
  const approach = M4(prog.find(s => s.name === 'ToStk1FromHome3').M);
  const pickStack = approach.clone(); pickStack.elements[14] = B.LoadPallet.elements[14] + stackN * t + 0.1;
  W = mul(pickStack, inv(Gal));
  const stackW = W.clone();
  push();

  // group moves into CONT chains
  for (let i = 0; i < prog.length; i++) {
    const s = prog[i];
    if (s.k === 'move') {
      const chainSteps = [s];
      while (chainSteps.at(-1).cont && prog[i + 1] && prog[i + 1].k === 'move') chainSteps.push(prog[++i]);
      // durations per segment
      let qs = q.slice(), Ms = tcp.clone();
      const segs = chainSteps.map(m => {
        const Mt = m.M ? M4(m.M) : tcpOf(fk(fromKuka(m.axes)), TOOL);
        const qt = m.axes ? fromKuka(m.axes) : ik(Mt, qs, TOOL);
        let d;
        if (m.type === 'PTP') d = Math.max(...qt.map((v, j) => Math.abs(v - qs[j]) / (VMAX[j] * m.vel / 100)));
        else {
          const dist = V3().setFromMatrixPosition(Mt).distanceTo(V3().setFromMatrixPosition(Ms));
          const qa = new THREE.Quaternion().setFromRotationMatrix(Ms), qb = new THREE.Quaternion().setFromRotationMatrix(Mt);
          d = Math.max(dist / (m.vel * 1000), qa.angleTo(qb) / (120 * DEG));
        }
        const seg = { m, Mt, qt, d: Math.max(0.05, d) };
        qs = qt; Ms = Mt;
        return seg;
      });
      const total = segs.reduce((a, b) => a + b.d, 0) + 0.25;            // + accel/decel
      // one ease over the whole chain; each segment linear in its share of the eased parameter
      const q0 = q.slice(), M0 = tcp.clone();
      const cum = []; let acc = 0; for (const sg of segs) { cum.push(acc); acc += sg.d; }
      const starts = segs.map((sg, k) => ({ q: k ? segs[k - 1].qt : q0, M: k ? segs[k - 1].Mt : M0 }));
      log('chain', { name: chainSteps[0].name, last: chainSteps.at(-1).name, base: chainSteps.at(-1).base });
      run(total, p => {
        const e = s5(p) * acc;
        let k = segs.length - 1; while (k > 0 && e < cum[k]) k--;
        const sg = segs[k], lp = clamp((e - cum[k]) / sg.d);
        if (sg.m.type === 'PTP') { q = starts[k].q.map((v, j) => v + (sg.qt[j] - v) * lp); tcp = tcpOf(fk(q), TOOL); }
        else { tcp = lerpPose(starts[k].M, sg.Mt, lp); q = ik(tcp, q, TOOL); }
        partFromTcp();
      });
      log('chain_end', { name: chainSteps.at(-1).name });
      continue;
    }
    switch (s.k) {
      case 'stack_pick': {
        log('stack_pick');
        moveTo(pickStack, null, 'LIN', 0.9, s5);
        run(0.25, () => {});
        held = 0; G = mul(inv(W), tcp); cups = 1; stackN--; log('grab');
        run(0.3, () => {});
        moveTo(approach, null, 'LIN', 0.7, s5);
        break;
      }
      case 'release':
        if (held >= 0) { held = -1; cups = 0; log('release'); }
        break;
      case 'pick': {
        const SW = stripsW();
        let best = 0, bd = 1e9;
        const pt = V3().setFromMatrixPosition(tcp);
        SW.forEach((M, j) => {                                  // strip nearest to the cups
          const local = pt.clone().applyMatrix4(inv(M)), st = P.blank.strips[j];
          const dx = Math.max(st.x0 - local.x, 0, local.x - st.x1);
          const d = Math.hypot(dx, local.z - t / 2);
          if (d < bd) { bd = d; best = j; }
        });
        held = best; G = mul(inv(SW[best]), tcp); cups = 1; log('pick', { strip: best });
        break;
      }
      case 'wait':
        run(Math.max(0.05, s.sec * waitScale), () => {});
        break;
      case 'align': {                                           // drop onto the tilted table, slide to the stops
        log('align');
        const W0 = W.clone(), Wt = PcR.clone();
        run(0.7, p => { jaw = smooth(clamp(p / 0.8)); W = lerpPose(W0, Wt, s5(p)); });
        break;
      }
      case 'pinch': {
        // which bend line sits on the die?
        const C = chain(P, fold);
        let bk = 0, bd = 1e9;
        P.bendsSorted.forEach((b, k) => {
          const p = V3(b.x, (b.y0 + b.y1) / 2, t / 2).applyMatrix4(W.clone().multiply(C[k]));
          const d = Math.hypot(p.y - PRESS.dieY, p.z - (P.dieTop + t / 2));
          if (d < bd) { bd = d; bk = k; }
        });
        pressed.k = bk;
        const target = P.punchTipOpen - (P.dieTop + t);
        log('pinch', { bend: bk, id: P.bendsSorted[bk].id, miss: +bd.toFixed(1) });
        run(0.45, p => { ram = target * s5(p); });
        pressed.ram0 = target;
        break;
      }
      case 'bend': {
        const k = pressed.k, b = P.bendsSorted[k];
        const W0 = W.clone(), C0 = chain(P, fold), f0 = fold[k];
        const axisRoot = C0[k].clone().multiply(new THREE.Matrix4().makeTranslation(b.x, 0, t / 2));
        // physical direction: both wings go up — pick the sign that lifts the far strip
        const trial = a => { const f = fold.slice(); f[k] = a; return V3((P.blank.strips[k + 1].x0 + P.blank.strips[k + 1].x1) / 2, (b.y0 + b.y1) / 2, 0).applyMatrix4(W0.clone().multiply(chain(P, f)[k + 1])).z; };
        const target = Math.abs(b.angle) * DEG * (trial(0.3) > trial(-0.3) ? 1 : -1);
        const dxfSign = Math.sign(-b.angle) === Math.sign(target);
        log('bend', { id: b.id, follow: s.follow, dxfConsistent: dxfSign });
        const Gh = G ? G.clone() : null, hj = held;
        run(1.4, p => {
          const e = smooth(p);
          fold[k] = f0 + target * e;
          const depth = (P.dieOpening / 2) * Math.tan(Math.abs(fold[k] - f0) / 2);
          const R = axisRoot.clone().multiply(new THREE.Matrix4().makeRotationY(-(fold[k] - f0) / 2)).multiply(inv(axisRoot));
          W = new THREE.Matrix4().makeTranslation(0, 0, -depth).multiply(W0).multiply(R);
          ram = pressed.ram0 + depth;
          if (s.follow && hj >= 0) { tcp = mul(W, chain(P, fold)[hj], Gh); q = ik(tcp, q, TOOL); }
        });
        break;
      }
      case 'open': {
        const r0 = ram;
        log('open');
        run(0.5, p => { ram = r0 * (1 - s5(p)); });
        break;
      }
      case 'clamp': log('clamp'); run(0.5, p => { carr = s5(p); }); break;
      case 'unclamp': log('unclamp'); run(0.5, p => { carr = 1 - s5(p); }); break;
      case 'deposit': {                                          // into the rack (first layer)
        log('deposit');
        // lower until the part rests on the rack's support bars (first layer)
        const M0 = tcp.clone(), z = V3().setFromMatrixColumn(M0, 2);
        let low = 1e9;
        stripsW().forEach((M, j) => { const st = P.blank.strips[j];
          for (const [x, y] of st.outline) for (const zz of [0, t]) low = Math.min(low, V3(x, y, zz).applyMatrix4(M).z); });
        const d = Math.max(0, low - (opts.rackFloor ?? 336));
        const Min = M0.clone(); Min.elements[14] -= d;                   // straight down into the rack
        moveTo(Min, null, 'LIN', 0.5 + d / 900, s5);
        held = -1; cups = 0; log('release', { depth: Math.round(d) });
        run(0.25, () => {});
        moveTo(M0, null, 'LIN', 0.6, s5);
        break;
      }
    }
  }
  log('end');
  return { S, events, dur: time, stackW, Gal };
}
