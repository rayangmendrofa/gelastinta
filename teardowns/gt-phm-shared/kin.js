// The Hail Mary's centrifuge mode, with no three.js. One input, the sequence s (0 cruise, 1 unspool, 2 flip, 3 spin,
// 4 spinning), sets the thrust, how much cable is out, the crew compartment's flip and the spin rate; the spin rate
// then sets the gravity everywhere on the ship.
//
// Where the numbers come from (Andy Weir, Project Hail Mary, 2021, as used in GelasTinta Talk 04):
//   the two halves separate on Zylon cables to 104 m (Grace's screen: component separation 104 m)
//   the rear half (engines, fuel, storage) is about three times heavier than the crew compartment
//   pitch rate on his screen 20.71 degrees per second: one turn every 17.4 s
//   under thrust the ship accelerates at about 1.5 g
//   the crew compartment turns 180 degrees on two hinges so its nose points inwards
// Worked out here (the same working as the talk): the halves spin about their shared centre of mass, a quarter of the
// way along the cable from the heavy half, so the crew compartment is 78 m out and the rear half 26 m out; gravity is
// a = w^2 r. Each half is treated as a point at the end of its cable, as in the talk.
// Not in the book: the shape and size of the drawn ship (an estimate that only has to look right next to 104 m of
// cable), the cables' drawn thickness, and how quickly the sequence runs (shortened so the film can show it).
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const G0 = 9.81; // m/s^2

export const P = {
  cable: 104, // m, full separation
  docked: 2.4, // m, the gap when the halves are latched (Grace's screen at the start)
  ratio: 3, // rear half mass / crew compartment mass
  wBook: 20.71, // degrees per second, the pitch rate on Grace's screen
  wSep: 0.17, // degrees per second while the cable pays out (Talk 04's figure)
  gThrust: 1.5, // g under thrust
  person: 1.8, // m, a standing person, for the head to feet difference
  walk: 1.0, // m/s, walking speed for the Coriolis readout
  wMax: 30, // degrees per second, the slider's top
};
P.rCrew = (P.cable * P.ratio) / (1 + P.ratio); // 78 m
P.rRear = P.cable / (1 + P.ratio); // 26 m
P.turn = 360 / P.wBook; // 17.38 s

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/** each half's distance from the shared centre of mass (m) for a separation d */
export const radiiOf = (d) => ({crew: (d * P.ratio) / (1 + P.ratio), rear: d / (1 + P.ratio)});
/** gravity (in g) at radius r for a spin rate w (degrees per second) */
export const gOf = (w, r) => ((w * D2R) ** 2 * r) / G0;
/** seconds per turn */
export const periodOf = (w) => (w > 1e-6 ? 360 / w : Infinity);
/** the spin rate (degrees per second) that gives g0 (in g) at radius r */
export const wFor = (g, r) => Math.sqrt((g * G0) / r) * R2D;
/** speed of the compartment along its circle (m/s) */
export const rimOf = (w, r) => w * D2R * r;
/** how much lighter your head is than your feet, standing (fraction) */
export const headFeetOf = (r) => clamp(P.person / r, 0, 1);
/** Coriolis push on someone walking at P.walk across the spin, as a share of the gravity there */
export const coriolisOf = (w, r) => {
  const g = gOf(w, r) * G0;
  return g > 1e-6 ? (2 * w * D2R * P.walk) / g : 0;
};

/**
 * the sequence s (0..4) and the spin rate it is heading for (degrees per second) -> the ship's state
 *  s 0..1   cruise: engines on, then off near 1
 *  s 1..2   unspool: the cable pays out from 2.4 m to 104 m while the ship turns slowly
 *  s 2..3   flip: the crew compartment turns 180 degrees on its hinges
 *  s 3..4   spin up to the target rate
 */
export function seqState(s, wTarget = P.wBook) {
  const thrust = 1 - smooth((s - 0.72) / 0.22);
  const pay = smoother(s - 1);
  const d = P.docked + (P.cable - P.docked) * pay;
  const flip = 180 * smoother(s - 2);
  const up = smoother(s - 3);
  const w = s < 1 ? 0 : s < 3 ? P.wSep * smooth((s - 1) / 0.25) : P.wSep + (wTarget - P.wSep) * up;
  const r = radiiOf(d);
  const stage = s < 1 ? 0 : s < 2 ? 1 : s < 3 ? 2 : 3;
  return {s, stage, thrust, d, flip, w, rCrew: r.crew, rRear: r.rear, gCrew: gOf(w, r.crew), gRear: gOf(w, r.rear)};
}
export const STAGES = [
  {key: 'cruise', name: 'CRUISE', s: 0},
  {key: 'unspool', name: 'UNSPOOL', s: 1},
  {key: 'flip', name: 'FLIP', s: 2},
  {key: 'spin', name: 'SPIN', s: 3},
];
