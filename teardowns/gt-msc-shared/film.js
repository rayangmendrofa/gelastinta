// SOFT LIMB, the tour: the pump fills the trilobite limb to the two FEA pressures, the labels come on, the silicone
// turns see through to show the water, the close up compares straight and tilted chamber walls, the manta ray wing
// takes its place, the pump runs a walking cycle, and the robot body walks on the same pressure. render(t) is a pure
// function of t: the pressure is a closed form of the script.
import {runSim} from '../kit/runtime.js';
import {createConsole, DISPLAY} from './console.js';
import {createRigStage} from './stage.js';
import {bendAt, DESIGNS, GAIN, P_MAX, R2D, strokeAt, swellAt, tipMove, waterAt} from './kin.js';

export const SCRIPT = [
  {t: 0, view: 'rig', P: 0, design: 'trilobite', tilted: true},
  {t: 1.4, P: 15},
  {t: 3.4, P: 20},
  {t: 5.0, display: 'labels'},
  {t: 6.4, P: 0},
  {t: 7.6, display: 'glass'},
  {t: 8.6, P: 20},
  {t: 10.4, view: 'close'},
  {t: 12.0, tilted: false},
  {t: 14.0, tilted: true},
  {t: 15.6, P: 6},
  {t: 16.6, design: 'manta'},
  {t: 17.8, P: 20},
  {t: 20.0, P: 0},
  {t: 21.0, walk: true},
  {t: 24.4, view: 'robot', design: 'trilobite'},
  {t: 29.0, walk: false},
  {t: 29.6, P: 12},
  {t: 30.4, display: 'orbit'},
  {t: 31.6, P: 20},
];
export const DURATION = 35;
export const BEATS = [...new Set(SCRIPT.map((e) => e.t))];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'Soft limb', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));
export const WALK_T = 1.5; // s, one pump and release

// ------------------------------------------------------------ the script's state at film time t
const lastOf = (key, t) => SCRIPT.filter((e) => e[key] !== undefined && e.t <= t);
export const displayAt = (t) => {
  const out = Object.fromEntries(DISPLAY.map((k) => [k, 0]));
  for (const e of SCRIPT) if (e.display && e.t <= t) out[e.display] = out[e.display] ? 0 : 1;
  return out;
};
const lastFlip = (key, t) => SCRIPT.filter((e) => e.display === key && e.t <= t).pop()?.t ?? -9;
export const easedDisplay = (key, t, dur = 0.7) => {
  const on = displayAt(t)[key];
  const k = ss(lastFlip(key, t), lastFlip(key, t) + dur, t);
  return on ? k : 1 - k;
};
export const designAt = (t) => lastOf('design', t).pop()?.design ?? 'trilobite';
export const tiltedAt = (t) => lastOf('tilted', t).pop()?.tilted ?? true;
export const walkAt = (t) => lastOf('walk', t).pop()?.walk ?? false;
export const viewAt = (t) => lastOf('view', t).pop()?.view ?? 'rig';
/** the set pressure: each change is a pump stroke of 0.8 s */
const setP = (t) => {
  const ev = lastOf('P', t);
  if (!ev.length) return 0;
  const cur = ev[ev.length - 1];
  const prev = ev.length > 1 ? ev[ev.length - 2].P : cur.P;
  return prev + (cur.P - prev) * ss(cur.t, cur.t + 0.8, t);
};
/** the walking cycle: pump and release, 0 to 20 kPa in 1.5 s */
export const walkP = (t0, t) => (P_MAX / 2) * (1 - Math.cos((2 * Math.PI * (t - t0)) / WALK_T));
const walkW = (t) => {
  const on = SCRIPT.filter((e) => e.walk === true && e.t <= t).pop();
  const off = SCRIPT.filter((e) => e.walk === false && e.t <= t).pop();
  if (!on) return {w: 0, t0: 0};
  const k = off && off.t > on.t ? 1 - ss(off.t, off.t + 0.6, t) : ss(on.t, on.t + 0.6, t);
  return {w: k, t0: on.t};
};
export const pressureAt = (t) => {
  const W = walkW(t);
  return setP(t) * (1 - W.w) + walkP(W.t0, t) * W.w;
};
/** the limb switch eases over 0.6 s (the old limb shrinks back to rest, the new one grows) */
export const showAt = (t) => {
  const ev = lastOf('design', t);
  const cur = ev.length ? ev[ev.length - 1] : {t: -9, design: 'trilobite'};
  return {trilobite: cur.design === 'trilobite' ? 1 : 0, manta: cur.design === 'manta' ? 1 : 0};
};
/** the tilt eases too: 0 straight, 1 tilted */
export const tiltAt = (t) => {
  const ev = lastOf('tilted', t);
  const cur = ev[ev.length - 1];
  const prev = ev.length > 1 ? ev[ev.length - 2].tilted : cur.tilted;
  const k = ss(cur.t, cur.t + 0.6, t);
  return (prev ? 1 : 0) + ((cur.tilted ? 1 : 0) - (prev ? 1 : 0)) * k;
};

// ------------------------------------------------------------ the rig's state from the pressure
/** P (kPa), dP (kPa/s), design key, tilt 0..1, glass 0..1, show {trilobite, manta} */
export function rigState(P, dP, design, tilt, glass, show) {
  const d = DESIGNS[design];
  const bend = (k, tl) => bendAt(DESIGNS[k], P, false) * (1 + (GAIN - 1) * tl);
  const phi = {trilobite: bend('trilobite', tilt), manta: bend('manta', tilt)};
  const tilted = tilt > 0.5;
  const bendDeg = phi[design] * R2D;
  return {
    P,
    phi,
    swell: swellAt(P),
    tilted,
    stroke: strokeAt(d, P),
    water: waterAt(d, P),
    flow: clamp(Math.abs(dP) / 30, 0, 1),
    glass,
    show,
    design,
    bendDeg,
    bendOtherDeg: bendAt(d, P, !tilted) * R2D,
    tip: tipMove(d.L, phi[design]),
  };
}
export const filmRigAt = (t, glass) => {
  const P = pressureAt(t);
  const dP = (pressureAt(t + 0.01) - pressureAt(t - 0.01)) / 0.02;
  return rigState(P, dP, designAt(t), tiltAt(t), glass, showAt(t));
};

// ------------------------------------------------------------ views (world, target in metres, angles in degrees)
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const VIEW_FN = {
  rig: (u) => ({at: [-0.045, 0.1, 0], az: 14 + 1.0 * u, el: 16, d: 0.8, sx: 0, sy: -16}),
  close: (u) => ({at: [-0.012, 0.1, 0.0], az: 8 + 0.8 * u, el: 14, d: 0.36, sx: 70, sy: -14}),
  robot: (u) => ({at: [0.34, 0.05, 0.02], az: 38 + 1.6 * u, el: 30, d: 0.6, sx: 0, sy: -14}),
};
const CAMS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
export const blend = (a, b, k) => {
  const o = {at: mix(a.at, b.at, k)};
  for (const key of ['el', 'd', 'sx', 'sy']) o[key] = a[key] + (b[key] - a[key]) * k;
  const daz = ((((b.az - a.az) % 360) + 540) % 360) - 180;
  o.az = a.az + daz * k;
  return o;
};
export const camAt = (t, orbit = 0) => {
  let i = 0;
  while (i < CAMS.length - 1 && CAMS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[CAMS[i][1]](t - CAMS[i][0]);
  let o = cur;
  if (i > 0) {
    const k = ss(CAMS[i][0], CAMS[i][0] + 1.6, t);
    if (k < 1) o = blend(VIEW_FN[CAMS[i - 1][1]](t - CAMS[i - 1][0]), cur, k);
  }
  if (orbit > 0) o = {...o, az: o.az + 12 * Math.max(0, t - lastFlip('orbit', t)) * orbit};
  return o;
};
export const toCam = (c) => ({tx: c.at[0], ty: c.at[1], tz: c.at[2], az: c.az * D2R, el: c.el * D2R, d: c.d, sx: c.sx, sy: c.sy});

// ------------------------------------------------------------ the operator's pointer
const REST = [[820, 430], [700, 380], [900, 520], [760, 600]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.view) out.push({t: e.t, spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    if (e.design) out.push({t: e.t + (e.view ? 0.45 : 0), spot: ui.spots[e.design]});
    if (e.tilted !== undefined) out.push({t: e.t, spot: ui.spots[e.tilted ? 'tilted' : 'straight']});
    if (e.walk !== undefined) out.push({t: e.t, spot: ui.spots.walk});
    if (e.P !== undefined) out.push({t: e.t, spot: ui.knobSpot(e.P)});
    return out;
  });
  const WPS = [[0, 900, 560]];
  EV.forEach((e, i) => {
    WPS.push([e.t - 0.16, ...e.spot], [e.t + 0.22, ...e.spot]);
    WPS.push([e.t + 1.4, ...REST[i % REST.length]]);
  });
  WPS.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WPS.length - 2 && t > WPS[i + 1][0]) i++;
    const [t0, x0, y0] = WPS[i];
    const [t1, x1, y1] = WPS[i + 1];
    const k = ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.09) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the tags drawn over the scene
/** labels with leaders on the pump, the tube, a chamber and the tip; kept in the free middle of the console */
export function makeTags(st, a, labels, glass, view) {
  const out = [];
  if (labels < 0.02 || view === 'robot') return out;
  const add = (pt, text, c, o, dx, dy, size) => {
    const p = st.project(pt);
    if (!p || o < 0.02) return;
    out.push({line: p, at: [clamp(p[0] + dx, 360, 1080), clamp(p[1] + dy, 112, 740)], text, c, o, size});
  };
  const R = st.H;
  const limb = R.limbs[a.design];
  const d = DESIGNS[a.design];
  limb.root.updateMatrixWorld(true);
  const M = new st.Matrix4();
  const at = (s, y) => new st.V3(0, y, 0).applyMatrix4(limb.frameAt(s, a.phi[a.design], M)).applyMatrix4(limb.root.matrixWorld);
  if (view !== 'close') {
    add(R.outlet.clone(), `bellows pump, servo driven`, '#1f2430', labels, -170, -70);
    add(R.inlet.clone(), `water in, 3 mm inlet`, '#2B44C8', labels, -40, -90);
  }
  add(at(d.L * 0.5, 0.016), glass > 0.3 ? `water swells each chamber` : `${a.tilted ? 'walls tilted 30°' : 'straight walls'}`, glass > 0.3 ? '#2B44C8' : '#1f2430', labels, 30, -70);
  add(at(d.L, -0.002), `tip moves ${(a.tip * 1000).toFixed(1)} mm`, '#2B44C8', labels, 50, 40);
  return out;
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createRigStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    window.ST = st;
    return {
      resize,
      render(t) {
        const disp = displayAt(t);
        const glass = easedDisplay('glass', t);
        const labels = easedDisplay('labels', t);
        const a = filmRigAt(t, glass);
        st.frame(a, toCam(camAt(t, disp.orbit)));
        ui.update({
          ...a,
          walk: walkAt(t),
          view: viewAt(t),
          display: disp,
          tags: makeTags(st, a, labels, glass, viewAt(t)),
          cursor: cfg.nocursor ? {x: -99, y: -99, press: false, ring: 0, ringX: 0, ringY: 0} : cursorAt(t),
        });
        return {};
      },
    };
  };
}
export const run = () => runSim(DEFAULTS, makeFilm());
