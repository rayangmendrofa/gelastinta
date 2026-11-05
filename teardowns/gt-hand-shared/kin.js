// The BEng prosthetic hand's numbers, with no three.js. One input, the wearer's muscle flex f (0..1), read through a
// surface EMG sensor, sets every servo, tendon, joint and fingertip on the page.
//
// Where the numbers come from (R T Mendrofa, "Constructing and Analysing the Performance of a Modified Prosthetic
// Hand", BEng individual project, 2023):
//   servo speed 0.15 s per 60 degrees (section 4.1.3), so 400 degrees per second
//   custom servo horn radius r = 7 mm, tendon travel about 2 cm from open to closed, servo turn 160 degrees,
//   open or close time (0.15 / 60) x 160 = 0.4 s (section 4.1.3)
//   joint frames of equal diameter at MCP, PIP and DIP, so in natural motion θ1 = θ2 = θ3 (section 4.3)
//   wrist servo: palm up to palm down (180 degrees) in 0.45 s (section 4.1.3)
//   six servos, each regulator 1 A for two servos at 5 V, at least 500 mA per servo (section 4.2)
//   EMG sampled every 100 ms at first; unfiltered, the fingers shook as they closed (section 5)
//   300 g system, 13 printed parts, at least 500 g of grip force per finger (section 5)
// Not in the report: the phalanx lengths. They are typical adult proportions (proximal, middle, distal bones of an
// average adult hand, rounded to the millimetre), so the hand on screen has a natural size. The joint frame radius ρ
// follows from the report: 19.5 mm of tendon over three equal joints that each bend 75 degrees gives ρ = 5.0 mm.
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const P = {
  hornR: 0.007, // m, the custom servo horn
  phiMax: 160, // degrees of servo turn from open to closed
  servoSpeed: 60 / 0.15, // degrees per second, 0.15 s per 60 degrees
  thetaMax: 75, // degrees per joint at full close (MCP, PIP and DIP alike)
  wristSpeed: 180 / 0.45, // degrees per second for the wrist servo
  emgDt: 0.1, // s, the EMG sample period the report started with
  filterT: 0.3, // s, the moving average window of the filtered signal
  grip: 0.5, // kg, the measured grip force per finger (at least)
  mass: 0.3, // kg, the whole hand
  servoI: 0.5, // A, at least, for each servo while it moves
};
P.tendonMax = P.hornR * P.phiMax * D2R; // 19.5 mm of tendon: the report's "about 2 cm"
P.rho = P.tendonMax / (3 * P.thetaMax * D2R); // 5.0 mm joint frame radius
P.closeTime = P.phiMax / P.servoSpeed; // 0.4 s

// the five digits: base position on the palm top (m, palm frame: x across, y up the palm, z out of the palm),
// phalanx lengths (m), the splay of the finger (degrees about z). The thumb has two phalanges and sits on the side.
export const DIGITS = [
  {key: 'thumb', name: 'THUMB', base: [-0.038, 0.05, 0.014], L: [0.034, 0.029], thumb: true},
  {key: 'index', name: 'INDEX', base: [-0.0265, 0.098, 0], L: [0.045, 0.026, 0.022], splay: 4},
  {key: 'middle', name: 'MIDDLE', base: [-0.0085, 0.101, 0], L: [0.048, 0.029, 0.023], splay: 0},
  {key: 'ring', name: 'RING', base: [0.0095, 0.099, 0], L: [0.045, 0.027, 0.022], splay: -3},
  {key: 'little', name: 'LITTLE', base: [0.027, 0.093, 0], L: [0.036, 0.021, 0.019], splay: -7},
];
export const PALM = {w: 0.078, h: 0.1, d: 0.03};

// grip modes: how much of the command each digit follows (thumb, index, middle, ring, little)
export const MODES = {
  power: {name: 'POWER GRIP', gain: [0.85, 1, 1, 1, 1]},
  pinch: {name: 'PINCH GRIP', gain: [0.733, 0.8, 1, 1, 1]}, // thumb 55° and index 60° per joint: the tips meet
  point: {name: 'POINT', gain: [0.9, 0, 1, 1, 1]},
};
export const MODE_KEYS = ['power', 'pinch', 'point'];

// ------------------------------------------------------------ the muscle signal
// A seeded noise table, so the same time always gives the same EMG (the film and the auto tour agree).
const N = 4096;
const NOISE = new Float32Array(N);
{
  let s = 0x2f6e2b1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N; i++) NOISE[i] = (r() + r() + r() + r() - 2) * 0.9; // roughly normal, unit-ish spread
}
const noiseAt = (t) => {
  const x = (t * 400) % N;
  const i = Math.floor(x);
  const k = x - i;
  return NOISE[i] * (1 - k) + NOISE[(i + 1) % N] * k;
};
/** the raw surface EMG (mV, rectified) for flex level f at time t: bursts grow with the flex, plus a small floor */
export const emgRaw = (f, t) => Math.abs((0.06 + 1.1 * f) * noiseAt(t)) + 0.02 * Math.abs(noiseAt(t * 1.7 + 50));
/** what the EMG board passes on: the envelope the report's board produces (amplified, rectified, smoothed) */
export const emgEnvelope = (f) => 0.08 + 0.92 * f; // normalised 0..1 band of the board output
/**
 * the controller's command (0..1) from the flex history flexAt(t):
 * unfiltered: the raw envelope sampled and held every 100 ms, noise and all (the shake the report found);
 * filtered: a 300 ms moving average of the envelope with the noise mostly averaged away.
 */
export function commandAt(flexAt, t, filtered) {
  const env = (tt) => {
    const f = flexAt(Math.max(0, tt));
    return f + (0.55 * f + 0.05) * 0.28 * noiseAt(tt * 0.9 + 7);
  };
  if (!filtered) {
    const ts = Math.floor(t / P.emgDt) * P.emgDt;
    return clamp01(env(ts) * 1.04 - 0.02);
  }
  let s = 0;
  const n = 12;
  for (let i = 0; i < n; i++) s += env(t - (P.filterT * (i + 0.5)) / n);
  return clamp01((s / n) * 1.04 - 0.02);
}
export const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ------------------------------------------------------------ servo, tendon, joints, fingertip
/** one step of a servo chasing its target at its top speed (degrees, seconds) */
export const servoStep = (phi, target, dt, speed = P.servoSpeed) => {
  const d = target - phi;
  const m = speed * dt;
  return Math.abs(d) <= m ? target : phi + Math.sign(d) * m;
};
/** tendon pulled in by the horn (m) for servo angle φ (degrees): the arc length r φ */
export const tendonOf = (phi) => P.hornR * phi * D2R;
/** each joint's bend (degrees) for tendon s: the tendon wraps three equal frames of radius ρ */
export const thetaOf = (s) => (s / (3 * P.rho)) * R2D;
/**
 * the fingertip in the finger's own plane (m) from the report's position analysis, with θ1 = θ2 = θ3 = θ:
 * P3 = (l1 cos θ + l2 cos 2θ + l3 cos 3θ, l1 sin θ + l2 sin 2θ + l3 sin 3θ), θ measured from the straight finger.
 * Here "along" is up the straight finger and "out" is toward the palm side.
 */
export function tipOf(L, thDeg) {
  const th = thDeg * D2R;
  let a = 0, o = 0;
  L.forEach((l, i) => {
    a += l * Math.cos((i + 1) * th);
    o += l * Math.sin((i + 1) * th);
  });
  return {along: a, out: o};
}
/** the fingertip speed (m/s) from the report's velocity analysis, for the joint rate ω (degrees per second) */
export function tipSpeed(L, thDeg, wDeg) {
  const th = thDeg * D2R;
  const w = wDeg * D2R;
  let vx = 0, vy = 0;
  L.forEach((l, i) => {
    vx += -(i + 1) * l * Math.sin((i + 1) * th);
    vy += (i + 1) * l * Math.cos((i + 1) * th);
  });
  return Math.hypot(vx, vy) * Math.abs(w);
}
/** the current the servos draw now (A) from their speeds (deg/s): about 0.5 A for one at full speed, a little to hold */
export const currentOf = (rates) => rates.reduce((s, r) => s + 0.06 + (P.servoI - 0.06) * Math.min(1, Math.abs(r) / 150), 0) + 0.08;
