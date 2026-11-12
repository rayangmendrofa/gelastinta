// The bistable origami robot's numbers, with no three.js. One input, the coil command (a small oscillating "nudge"
// at frequency f, or one large "pulse"), drives the fold angle θ through a torque balance; the fold angle sets the
// stored energy, the shape, and which way the robot can move.
//
// Where the numbers come from (Huang, Miao, Ma, Tang, Wang, Cui, Fu and Li, "Bistable origami robot for adaptive
// multimodal motion actuated by nonuniform magnetic fields", Nature Communications, article in press, 2026,
// doi:10.1038/s41467-026-79010-w, CC BY 4.0):
//   robot mass 0.81 g; PLA panels (3D printed) joined by 0.1 mm silicone film, Young's modulus 1.26 MPa;
//   four N35 magnets, 1.5 mm diameter, 3 mm long, remanence 1.2 T; hinge offsets a = [3.3, 1.8, −3.3, −1.8] mm
//   (the design a2/a1 = 1.80/3.30); bistability kept after 205 close and open cycles; crease error about 0.15 mm
//   Fig. 1C/1D, the selected design (read from the chart): open state at θ = 0, energy peak about 0.21 mJ near
//   θ = 0.62 rad, closed valley about 0.12 mJ near θ = 1.45 rad; elastic torque peaks about 0.26 N·mm near 0.25 rad
//   and dips to about −0.09 N·mm near 1.0 rad (the two central panels each turn by θ, so dE/dθ = 2 T)
//   Fig. 1F (read from the chart): peak force about 33 mN to close, about 78 mN to open (n = 5)
//   Fig. 2F: crawling speed at 6 A, about 1.15, 1.5, 1.85 and 2.7 mm/s at 1, 2, 3 and 4 Hz (read from the chart)
//   rolling 5.45 body lengths per second at 2 Hz; half a drive cycle rolls it half way round
//   field maps: about ±25 mT (crawling), ±30 mT (rolling), ±150 mT (the close and open pulse), read from the colour
//   scales of Figs. 2C, 4O and 3C
//   closing takes about 0.06 s (Fig. 3B photos at 0, 0.03 and 0.06 s); capture 4 of 100 tries; grip holds 26.5 mN
// Modelled, not measured (said on the page): the fold dynamics (an inertia and a damping chosen so the snap takes
// about 0.06 s), the nudge torque (half the torque needed to leave the valley it is in), the pulse torque (shaped like
// the magnetic torque curve of Fig. 3D), and the robot's drawing (a simplified two panel cross section with folding
// end flaps, sized from the scale bars; not the exact crease pattern).
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const P = {
  mass: 0.81, // g
  film: 0.1, // mm silicone
  filmE: 1.26, // MPa
  magD: 1.5, // mm
  magL: 3, // mm
  Br: 1.2, // T
  offsets: [3.3, 1.8, -3.3, -1.8], // mm
  cycles: 205,
  thPeak: 0.62, // rad, the top of the hill
  thClosed: 1.45, // rad, the closed valley
  thMax: 1.57, // rad, end stop
  ePeak: 0.21, // mJ
  eClosed: 0.12, // mJ
  fClose: 33, // mN, read from Fig. 1F
  fOpen: 78, // mN
  crawl: [[1, 1.15], [2, 1.5], [3, 1.85], [4, 2.7]], // Hz, mm/s at 6 A
  rollBL: 5.45, // body lengths per second at 2 Hz
  rollF: 2,
  bNudgeOpen: 25, // mT, colour scale of the crawling field map
  bNudgeClosed: 30, // mT, rolling field map
  bPulse: 150, // mT, close and open pulse
  snapTime: 0.06, // s
  capture: 4, // successes out of 100
  grip: 26.5, // mN
  fMin: 1,
  fMax: 4,
  // the dynamics (modelled)
  I: 1.2e-3, // N·mm·s², effective inertia of one panel
  c: 0.026, // N·mm·s, damping
  pulseLen: 0.08, // s
};

// ------------------------------------------------------------ the elastic torque of one panel (N·mm), Fig. 1D read
const TQ = [
  [0, 0.02], [0.05, 0.1], [0.1, 0.165], [0.15, 0.21], [0.2, 0.245], [0.25, 0.26], [0.3, 0.255], [0.35, 0.235],
  [0.4, 0.205], [0.45, 0.165], [0.5, 0.12], [0.55, 0.07], [0.62, 0], [0.7, -0.035], [0.8, -0.065], [0.9, -0.085],
  [1.0, -0.092], [1.1, -0.088], [1.2, -0.075], [1.3, -0.052], [1.4, -0.02], [1.45, 0], [1.5, 0.025], [1.57, 0.06],
];
const lerpTab = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) {
      const [x0, y0] = tab[i - 1];
      const [x1, y1] = tab[i];
      const u = (x - x0) / (x1 - x0);
      const s = u * u * (3 - 2 * u);
      return y0 + (y1 - y0) * (0.35 * u + 0.65 * s) / 1;
    }
  }
  return tab[tab.length - 1][1];
};
const rawT = (th) => lerpTab(TQ, th);
// integrate E = 2 ∫ T dθ once, then scale the rising and falling parts so the hill is 0.21 mJ and the closed valley
// 0.12 mJ, as in Fig. 1C
const NE = 400;
const ETAB = new Float64Array(NE + 1);
{
  let e = 0;
  const h = P.thMax / NE;
  for (let i = 1; i <= NE; i++) {
    const a = (i - 1) * h;
    e += 2 * 0.5 * (rawT(a) + rawT(a + h)) * h;
    ETAB[i] = e;
  }
}
const eAtRaw = (th) => {
  const x = Math.max(0, Math.min(NE - 1e-9, (th / P.thMax) * NE));
  const i = Math.floor(x);
  return ETAB[i] + (ETAB[i + 1] - ETAB[i]) * (x - i);
};
const RAW_PEAK = eAtRaw(P.thPeak);
const RAW_CLOSED = eAtRaw(P.thClosed);
const kUp = P.ePeak / RAW_PEAK;
const kDown = (P.ePeak - P.eClosed) / (RAW_PEAK - RAW_CLOSED);
/** elastic torque of one panel (N·mm), positive pushes back towards open */
export const torqueOf = (th) => (th <= P.thPeak ? kUp : kDown) * rawT(th);
/** stored elastic energy (mJ) */
export const energyOf = (th) => {
  if (th <= P.thPeak) return kUp * eAtRaw(th);
  return P.ePeak - kDown * (RAW_PEAK - eAtRaw(th));
};
export const T_PEAK = Math.max(...Array.from({length: 158}, (_, i) => torqueOf(i / 100)));
export const T_DIP = -Math.min(...Array.from({length: 158}, (_, i) => torqueOf(i / 100)));

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export {clamp};
export const isClosed = (th) => th > P.thPeak;
/** crawling speed (mm/s) at 6 A, from Fig. 2F */
export const crawlSpeed = (f) => {
  const t = P.crawl;
  if (f <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (f <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (f - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
  return t[t.length - 1][1];
};

// ------------------------------------------------------------ the cross section (mm), my simplified drawing
// each half: an inner panel (width A from the central hinge) and an outer panel (width C) joined by a crease; the end
// flaps fold up over the ends. β is the inner panel's lift, ψ the outer crease's fold, χ the end flaps' fold.
export const GEO = {A: 4, C: 4.6, mid: 5.2, flap: 4.6, t: 0.8, ball: 4};
export const shapeOf = (th) => {
  const k = clamp(th / P.thClosed, 0, 1.12);
  const beta = 35 * k * D2R;
  const psi = (32 + 70 * k) * D2R;
  const chi = 84 * k * D2R;
  return {k, beta, psi, chi};
};
/** the cross section's corners (z, y) in mm, hinge at the origin, for a fold angle */
export const sectionOf = (th) => {
  const {beta, psi} = shapeOf(th);
  const pts = [[0, 0]];
  for (const s of [1, -1]) {
    const iz = s * GEO.A * Math.cos(beta);
    const iy = GEO.A * Math.sin(beta);
    pts.push([iz, iy], [iz + s * GEO.C * Math.cos(beta + psi), iy + GEO.C * Math.sin(beta + psi)]);
  }
  return pts;
};
/** the rolling centre (mm) and the perimeter of the closed section */
export const rollCentre = (th) => {
  const p = sectionOf(th);
  const cz = 0;
  const cy = p.reduce((s, q) => s + q[1], 0) / p.length;
  return [cz, cy];
};
export const PERIM = (() => {
  const p = sectionOf(P.thClosed);
  const ring = [p[0], p[1], p[2], p[4], p[3]];
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return s;
})();

// ------------------------------------------------------------ the simulation, shared by the film and the live page
/**
 * The coil command and the robot's state, stepped in sim time (s). Pure numbers.
 * s: {ts sim time, th, w, dist mm along the floor, roll rad, rolling bool, pulse: {t0, dir} or null, queued: dir or 0}
 * cmd: {nudge bool, f Hz}
 */
export const newState = () => ({ts: 0, th: 0, w: 0, dist: 0, roll: 0, rolling: false, pulse: null, queued: 0, tauM: 0, field: 0, snaps: 0});

/** the magnetic torque on one panel (N·mm) and the field on the platform (mT, signed) */
export function magOf(s, cmd) {
  let tau = 0;
  let field = 0;
  if (s.pulse) {
    const u = (s.ts - s.pulse.t0) / P.pulseLen;
    if (u >= 0 && u <= 1) {
      const sm = (a, b, x) => {
        const v = clamp((x - a) / (b - a), 0, 1);
        return v * v * (3 - 2 * v);
      };
      const e = sm(0, 0.18, u) * (1 - sm(0.75, 1, u));
      if (s.pulse.dir > 0) tau = (0.7 + 1.6 * Math.pow(Math.min(s.th, P.thClosed) / P.thClosed, 2)) * e;
      else tau = -1.0 * e;
      field = s.pulse.dir * P.bPulse * e;
    }
  }
  if (cmd.nudge && Math.abs(field) < 1) {
    const closed = isClosed(s.th);
    const amp = closed ? 0.5 * T_DIP : 0.5 * T_PEAK;
    const sn = Math.sin(2 * Math.PI * cmd.f * s.ts);
    tau += amp * sn;
    field = (closed ? P.bNudgeClosed : P.bNudgeOpen) * sn;
  }
  return {tau, field};
}
/** advance the state by dt seconds of sim time */
export function stepSim(s, dt, cmd) {
  const n = Math.max(1, Math.ceil(dt / 0.0005));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    // a queued pulse fires once the robot is upright and still
    if (s.queued && !s.rolling && !s.pulse) {
      s.pulse = {t0: s.ts, dir: s.queued};
      s.queued = 0;
    }
    if (s.pulse && s.ts - s.pulse.t0 > P.pulseLen) s.pulse = null;
    const m = magOf(s, s.pulse ? {nudge: false, f: cmd.f} : cmd);
    s.tauM = m.tau;
    s.field = m.field;
    const was = isClosed(s.th);
    const acc = (2 * (m.tau - torqueOf(s.th)) - P.c * s.w) / P.I;
    s.w += acc * h;
    s.th += s.w * h;
    if (s.th < 0) {
      s.th = 0;
      if (s.w < 0) s.w = -0.25 * s.w;
    }
    if (s.th > P.thMax) {
      s.th = P.thMax;
      if (s.w > 0) s.w = -0.25 * s.w;
    }
    if (was !== isClosed(s.th)) s.snaps++;
    // moving: crawl when open, roll when closed; a roll always finishes its turn upright
    const closed = isClosed(s.th);
    if (cmd.nudge && !s.pulse && !s.queued) {
      if (closed) {
        s.rolling = true;
        s.roll += 2 * Math.PI * cmd.f * h;
        s.dist += (PERIM * cmd.f) * h;
      } else if (!s.rolling) {
        const v = crawlSpeed(cmd.f);
        s.dist += v * (1 + 0.85 * Math.sin(2 * Math.PI * cmd.f * s.ts - 0.6)) * h;
      }
    }
    if (s.rolling && (!cmd.nudge || s.queued || !closed)) {
      const target = Math.ceil(s.roll / (2 * Math.PI) - 1e-6) * 2 * Math.PI;
      const step = 2 * Math.PI * Math.max(cmd.f, 1) * h;
      if (target - s.roll <= step) {
        s.dist += ((target - s.roll) / (2 * Math.PI)) * PERIM;
        s.roll = 0;
        s.rolling = false;
      } else {
        s.roll += step;
        s.dist += (step / (2 * Math.PI)) * PERIM;
      }
    }
    s.ts += h;
  }
  return s;
}
/** ask for a pulse: close if open, open if closed; waits until a roll has finished */
export const requestPulse = (s) => {
  if (s.pulse || s.queued) return;
  s.queued = isClosed(s.th) ? -1 : 1;
};
