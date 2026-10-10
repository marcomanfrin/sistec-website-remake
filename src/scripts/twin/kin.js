// @ts-nocheck — codice importato dal progetto sistec-logo-showreel
/* KUKA KR120 R2700 kinematics shared by the cell and the finale.
   World: cell mm, Z up, robot base at the origin. Zero pose (from Robot.ini): upper arm vertical,
   forearm along +X; the flange frame is then aligned with the world (X = flange normal). */
import * as THREE from 'three';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const AXES = [[V3(0, 0, 1), V3(0, 0, 0)], [V3(0, 1, 0), V3(330, 0, 575)], [V3(0, 1, 0), V3(330, 0, 1755)],
  [V3(1, 0, 0), V3(0, 0, 1925)], [V3(0, 1, 0), V3(1510, 0, 1925)], [V3(1, 0, 0), V3(0, 0, 1925)]];
export const FLANGE = new THREE.Matrix4().makeTranslation(1740, 0, 1925);
// Obelisk/KUKA tool frames have Z pointing away from the flange; in our flange frame that is +X.
export const MOUNT = new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0, 0, 1), V3(1, 0, 0));

// KUKA E6AXIS (degrees) -> our joint angles (radians)
export const fromKuka = a => [-a[0], a[1] + 90, a[2] - 90, a[3], a[4], a[5]].map(v => v * DEG);

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4();
export function fk(q, out = []) {
  let M = new THREE.Matrix4();
  out[0] = M.clone();
  for (let i = 0; i < 6; i++) {
    const [ax, p] = AXES[i];
    _m.makeTranslation(p.x, p.y, p.z).multiply(_r.makeRotationAxis(ax, q[i])).multiply(_t.makeTranslation(-p.x, -p.y, -p.z));
    M = M.clone().multiply(_m);
    out[i + 1] = M;
  }
  return out;
}
export const tcpOf = (mats, tool) => mats[6].clone().multiply(FLANGE).multiply(tool);

// Analytic IK: elbow-up arm + spherical XYX wrist; picks the wrist branch and A4/A6 turns nearest to `seed`.
const A2 = 1180, B3 = Math.hypot(1180, 170), PHI0 = Math.atan2(170, 1180);
const _Fi = new THREE.Matrix4();
export function ik(target, seed, tool) {
  const F = target.clone().multiply(_Fi.copy(tool).invert());           // flange pose
  const e = F.elements, fx = V3(e[0], e[1], e[2]);
  const wc = V3(e[12], e[13], e[14]).addScaledVector(fx, -230);         // wrist centre
  const near = (v, ref) => v + Math.round((ref - v) / (2 * Math.PI)) * 2 * Math.PI;
  const q1 = near(Math.atan2(wc.y, wc.x), seed[0]);
  const r = Math.hypot(wc.x, wc.y) - 330, h = wc.z - 575;
  const D = Math.min(Math.hypot(r, h), A2 + B3 - 1e-3);
  const psi = Math.atan2(h, r), gam = Math.acos(clamp((A2 * A2 + D * D - B3 * B3) / (2 * A2 * D), -1, 1));
  const al = psi + gam, q2 = Math.PI / 2 - al;
  const beta = Math.atan2(h - A2 * Math.sin(al), r - A2 * Math.cos(al));
  const q3 = PHI0 - q2 - beta;
  // wrist: Rx(q4) Ry(q5) Rx(q6) = (Rz(q1) Ry(q2+q3))^T Rf
  const R03 = new THREE.Matrix4().makeRotationZ(q1).multiply(new THREE.Matrix4().makeRotationY(q2 + q3));
  const Rw = R03.transpose().multiply(new THREE.Matrix4().extractRotation(F)).elements;   // column-major
  const m = (i, j) => Rw[j * 4 + i];
  const b = Math.acos(clamp(m(0, 0), -1, 1));
  const cands = [[Math.atan2(m(1, 0), -m(2, 0)), b, Math.atan2(m(0, 1), m(0, 2))], [Math.atan2(-m(1, 0), m(2, 0)), -b, Math.atan2(-m(0, 1), -m(0, 2))]]
    .map(([a4, a5, a6]) => [q1, q2, q3, near(a4, seed[3]), a5, near(a6, seed[5])]);
  if (b < 1e-4) { cands[0][3] = seed[3]; cands[0][5] = near(Math.atan2(m(2, 1), m(1, 1)) - seed[3], seed[5]); }
  const cost = q => q.reduce((s, v, i) => s + (v - seed[i]) ** 2 * (i === 3 || i === 5 ? 1 : 0.3), 0);
  return cands[0 + (cost(cands[1]) < cost(cands[0]))];
}
export function lerpPose(A, B, p) {
  const pa = V3(), pb = V3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s = V3();
  A.decompose(pa, qa, s); B.decompose(pb, qb, s);
  return new THREE.Matrix4().compose(pa.lerp(pb, p), qa.slerp(qb, p), V3(1, 1, 1));
}
// KUKA ZYX Euler (degrees) pose
export function kpose(x, y, z, a, b, c) {
  return new THREE.Matrix4().makeRotationZ(a * DEG).multiply(new THREE.Matrix4().makeRotationY(b * DEG)).multiply(new THREE.Matrix4().makeRotationX(c * DEG)).setPosition(x, y, z);
}
