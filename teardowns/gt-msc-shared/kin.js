// The MSc soft actuators' numbers, with no three.js. One input, the water pressure P in the limb's chambers (kPa),
// sets the bellows stroke, the water pushed, every chamber's swell and the bend of the limb.
//
// Where the numbers come from (R T Mendrofa, "Bio Inspired Pneumatic Soft Actuators for Underwater Robots", MSc
// thesis, UCL, 2025):
//   trilobite limb: length 120 mm, width 35 mm, base 5 mm thick, chambers 20 mm wide and 15 mm long, limb volume
//     0.00698 L, fluid inlet 3 mm (Table 2)
//   manta ray wing: chord 78 mm, wingspan 143 mm, wingtip 14 mm, width 88 mm, chambers 5 mm wide with lengths 5, 7, 8,
//     11, 14, 16 and 23 mm, gaps 2.9 mm, chamber volume 0.0112 L (Table 1)
//   bellows: length 40 mm, inner diameter 35 mm, outlet 2 mm, driven by a servo through a worm gear (Table 3, Figure 6)
//   material: Ecoflex 00-30 silicone (Shore 00-30), modelled with a 3 term Yeoh law (section 3.2.2)
//   FEA load cases at 15 and 20 kPa (section 4.1.1); bending is nearly linear in pressure over that range
//   FEA total deformation at the tip: trilobite limb 24.7 mm and 29.1 mm (the two limb versions, Figures 11 and 12),
//     manta wing 86.7 mm (Figure 13)
//   chambers tilted 30 degrees forward give 11 to 20% more deformation than straight ones at the same pressure
//   prototype mass 2173.9 g (prototype specification)
// Assumptions (marked on the page): the FEA tip figures are taken as the 20 kPa case, with the 24.7 mm limb as the
// straight chamber version and 29.1 mm as the 30 degree version (an 18% gain, inside the thesis's 11 to 20%); the
// manta wing figure is for tilted chambers, its straight version 18% lower; the trilobite limb has 7 chambers (as
// in the renders); the chambers take in water equal to half their own volume at 20 kPa (for the water panel only).
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const P_MAX = 20; // kPa, the top FEA load case
export const P_MID = 15; // kPa, the other FEA load case
export const TILT = 30; // degrees, the forward chamber tilt
export const GAIN = 29.103 / 24.651; // 1.18: tilted over straight, from the two FEA limb versions
export const MASS = 2.1739; // kg, the prototype

export const DESIGNS = {
  trilobite: {
    key: 'trilobite',
    name: 'TRILOBITE LIMB',
    L: 0.12, // m, the bending length
    width: 0.035,
    base: 0.005,
    n: 7, // chambers
    chamberW: 0.02,
    chamberL: 0.015,
    vol: 6.98, // mL
    inlet: 3, // mm
    tipTilted: 0.029103, // m at 20 kPa
    table: [['Length', '120 mm'], ['Width', '35 mm'], ['Base thickness', '5 mm'], ['Chamber', '20 × 15 mm'], ['Volume', '6.98 mL'], ['Inlet', '3 mm']],
  },
  manta: {
    key: 'manta',
    name: 'MANTA RAY WING',
    L: 0.143, // m, the wingspan bends along its length
    chord: 0.078,
    tip: 0.014,
    widthAll: 0.088,
    n: 7,
    chamberW: 0.005,
    chamberLs: [0.023, 0.016, 0.014, 0.011, 0.008, 0.007, 0.005], // root to tip
    vol: 11.2, // mL
    inlet: 3,
    tipTilted: 0.086703,
    table: [['Wingspan', '143 mm'], ['Root chord', '78 mm'], ['Wingtip', '14 mm'], ['Chambers', '7, 5 mm wide'], ['Volume', '11.2 mL'], ['Profile', 'NACA 2221']],
  },
};
export const DESIGN_KEYS = ['trilobite', 'manta'];

export const BELLOWS = {len: 0.04, d: 0.035, outlet: 0.002};
BELLOWS.area = (Math.PI / 4) * BELLOWS.d * BELLOWS.d; // m^2
BELLOWS.vol = BELLOWS.area * BELLOWS.len * 1e6; // mL, 38.5 mL of sweep

// ------------------------------------------------------------ constant curvature
/** distance the tip moves (m) for a strip of length L bent into one arc of total angle φ (rad) */
export const tipMove = (L, phi) => {
  if (Math.abs(phi) < 1e-6) return 0;
  const along = (L * Math.sin(phi)) / phi;
  const side = (L * (1 - Math.cos(phi))) / phi;
  return Math.hypot(L - along, side);
};
/** the bend angle (rad) whose tip movement is d, by bisection */
export function bendFor(L, d) {
  let lo = 0;
  let hi = Math.PI * 1.5;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (tipMove(L, m) < d) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
// the 20 kPa bend of each design, straight and tilted, from the FEA tip movement
for (const d of Object.values(DESIGNS)) {
  d.phiTilted = bendFor(d.L, d.tipTilted);
  d.phiStraight = bendFor(d.L, d.tipTilted / GAIN);
}
/**
 * the bend angle (rad) at pressure P (kPa): nearly linear, as the thesis finds over its range, with a slight rise near
 * the top where neighbouring chamber walls touch and push (section 3.2.2)
 */
export const shapeOf = (P) => {
  const x = Math.max(0, P) / P_MAX;
  return (x * (1 + 0.12 * x)) / 1.12;
};
export const bendAt = (design, P, tilted) => (tilted ? design.phiTilted : design.phiStraight) * shapeOf(P);
/** the chamber swell (fraction of its rest size, assumed half its volume at 20 kPa) */
export const swellAt = (P) => 0.5 * Math.max(0, P) / P_MAX;
/** water pushed into the limb (mL) and the bellows stroke that pushes it (m) */
export const waterAt = (design, P) => design.vol * swellAt(P);
export const strokeAt = (design, P) => (waterAt(design, P) * 1e-6) / BELLOWS.area;
/** the tip position in the bend plane (m): along the rest line and to the side */
export const tipAt = (L, phi) => (Math.abs(phi) < 1e-6 ? {along: L, side: 0} : {along: (L * Math.sin(phi)) / phi, side: (L * (1 - Math.cos(phi))) / phi});
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
