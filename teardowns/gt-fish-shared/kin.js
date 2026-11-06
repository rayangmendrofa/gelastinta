// The hair clip fish's numbers, with no three.js. One input, the tail beat frequency f (beats per second), sets the
// servo, the clip's snaps, the tail and the swimming speed.
//
// Where the numbers come from (Xiong, Chen, Wilkinson, Shougat and Lipson, "Designing novel carangiform fish robots
// with undulating hair clip mechanisms", npj Robotics 4, 7, 2026, and its preprint):
//   untethered fish: 21.5 x 4.5 x 12.0 cm, 125 g, 7.4 V battery, Bluetooth board, one mini servo turning the clip's
//   centre through a silicone seal
//   its clip: PETG, t = 0.762 mm, ribbon length 2l = 174 mm, kink angle θ = −23.5°, γs = 2, tail swing 2ψ = 68°
//   tail fin film 0.127 mm
//   snap time: 17 ms in air, 50 ms in water (theory 34 ms); plastic test clip 40 ms, steel 16 ms
//   at 3 Hz (6 snaps a second): 554 cm in 12.7 s, 43.6 cm/s = 2.03 body lengths per second, Strouhal number 0.28,
//   start acceleration 20.1 cm/s²; thrust 245.66 mN at 3 Hz (peak 250.31 mN at 3.5 Hz), measured from 0.5 to 5 Hz;
//   thrust per watt 79.46 mN/W at 3 Hz; efficiency 3.89 %; cost of transport 5.14
//   energy barrier U = 3 P_cr L2 (asin(1/γs) + θ) (theory within about 10 % of simulation)
// Modelled, not measured (said on the page): the snap as a double well energy U(x) = U_b (1 − x²)² over the clip's
// state x (±1 are the two stable shapes); the tail angle as a function of x that holds near ±ψ and whips across the
// middle; the swimming speed away from 3 Hz from the measured Strouhal number with the tail amplitude falling once a
// half beat is too short for the snap to settle. The head and fin proportions are estimates from the stated size.
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const P = {
  L: 0.215, // m, body length
  W: 0.045, // m, width
  H: 0.12, // m, height with the fin
  mass: 0.125, // kg
  battery: 7.4, // V
  clipT: 0.762e-3, // m
  clip2l: 0.174, // m, the ribbon before it is folded and riveted
  theta: -23.5, // degrees, kink angle
  gamma: 2, // leg to core length ratio
  psi: 34, // degrees, half the tail swing
  snapWater: 0.05, // s
  snapAir: 0.017, // s
  snapTheory: 0.034, // s
  St: 0.28, // Strouhal number measured at 3 Hz
  fRef: 3, // Hz
  uRef: 0.436, // m/s at 3 Hz
  thrust: [[3, 245.66], [3.5, 250.31]], // mN, measured
  thrustPerW: 79.46, // mN per W at 3 Hz
  eff: 3.89, // %
  cot: 5.14,
  accel: 0.201, // m/s², start of a straight dash
  fMin: 0.5,
  fMax: 5,
  wave: 0.012, // s, how long the snap takes to run from the clip's centre to the tail tip (estimate)
};
P.ampRef = (P.St * P.uRef) / P.fRef; // m, tail tip peak to peak amplitude at 3 Hz from St = f A / U: 4.07 cm
P.powerRef = P.thrust[0][1] / P.thrustPerW; // W at 3 Hz: 3.09 W

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const easeSnap = (p) => {
  const u = clamp(p, 0, 1);
  return 1 - Math.pow(1 - u, 3);
};

/** the clip's state x at beat phase B (beats, any real), for tail beat frequency f (Hz) and snap time tau (s) */
export function clipAt(B, f, tau = P.snapWater) {
  const halfT = 1 / (2 * f); // s per snap
  const h = B * 2; // snaps so far
  const k = Math.floor(h);
  const u = h - k; // 0..1 through this half beat
  const s = k % 2 === 0 ? 1 : -1; // the shape it starts in
  // the servo loads the clip slowly, then it tips; at least a quarter of the half beat is loading
  const uTip = clamp(1 - (tau + 0.045) / halfT, 0.25, 0.92);
  if (u < uTip) {
    const k1 = smooth(u / uTip);
    return {x: s * (1 - 0.97 * k1), phase: 'load', s, u, uTip};
  }
  const ts = (u - uTip) * halfT; // s since it tipped
  if (ts < tau) {
    const p = ts / tau;
    return {x: s * (0.03 - 1.03 * easeSnap(p)), phase: 'snap', s, u, uTip};
  }
  const tw = ts - tau;
  const wob = 0.16 * Math.exp(-tw / 0.05) * Math.cos((2 * Math.PI * tw) / 0.07);
  return {x: -s * (1 + wob), phase: 'settle', s, u, uTip};
}
/** the clip's energy, scaled so the barrier is 1 */
export const energyOf = (x) => (1 - x * x) * (1 - x * x);
/** the tail angle (degrees) from the clip's state: it holds near ±ψ and whips across the middle */
export const tailOf = (x) => {
  const a = Math.abs(x);
  const g = a <= 1 ? Math.pow(a, 0.32) : a;
  return Math.sign(x) * P.psi * g;
};
/** the tail amplitude share that is left when a half beat is too short for the snap to settle (estimate) */
export const ampShare = (f) => clamp((1 / (2 * f) - P.snapWater) / 0.093, 0.55, 1);
/** swimming speed (m/s) from the Strouhal number: U = f A / St, A = the measured 4.07 cm times the share */
export const speedOf = (f) => (f * P.ampRef * ampShare(f)) / P.St;
/** body lengths per second */
export const blOf = (f) => speedOf(f) / P.L;
/** the measured thrust (mN) near f, or null away from the two published points */
export const thrustAt = (f) => {
  const m = P.thrust.find(([ff]) => Math.abs(ff - f) < 0.05);
  return m ? m[1] : null;
};
export {clamp};
