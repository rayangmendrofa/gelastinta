// BISTABLE ORIGAMI ROBOT, the tour: the robot sits open, the labels come on, a small oscillating field nudges it
// and it crawls (seen end on), a cargo ball is set on its tray, time slows ten times and one big pulse snaps it shut
// over the energy hill, a nudge now rolls the closed robot, a pulse the other way pops it open, the camera pulls back
// to the coil rig under the platform, then orbits. render(t) is a pure function of t: the robot's state is simulated
// once at load from the script and read back from tables.
import {runSim} from '../kit/runtime.js';
import {createConsole, DISPLAY} from './console.js';
import {createStage} from './stage.js';
import {crawlSpeed, D2R, isClosed, newState, P, requestPulse, stepSim} from './kin.js';

export const SCRIPT = [
  {t: 0, view: 'hero', f: 2, nudge: false},
  {t: 2.4, display: 'labels'},
  {t: 4.2, nudge: true},
  {t: 6.0, view: 'end'},
  {t: 9.6, view: 'hero'},
  {t: 11.0, nudge: false},
  {t: 12.0, display: 'cargo'},
  {t: 13.4, view: 'end'},
  {t: 14.0, slow: true},
  {t: 14.8, pulse: true},
  {t: 17.4, slow: false},
  {t: 18.0, view: 'hero'},
  {t: 18.6, nudge: true},
  {t: 24.0, nudge: false},
  {t: 25.0, pulse: true},
  {t: 27.0, view: 'rig'},
  {t: 32.0, view: 'hero'},
  {t: 32.6, display: 'orbit'},
];
export const DURATION = 38;
export const BEATS = [...new Set(SCRIPT.map((e) => e.t))];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'Bistable origami robot', subtitle: ''}, director: {enabled: false}, watermark: ''};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));

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
export const nudgeAt = (t) => lastOf('nudge', t).pop()?.nudge ?? false;
export const fAt = (t) => lastOf('f', t).pop()?.f ?? 2;
/** the time scale: 1, or 0.1 in slow motion, eased over 0.5 s */
export const slowAt = (t) => {
  const ev = lastOf('slow', t);
  if (!ev.length) return 1;
  const cur = ev[ev.length - 1];
  const prev = ev.length > 1 ? ev[ev.length - 2].slow : false;
  const a = prev ? 0.1 : 1;
  const b = cur.slow ? 0.1 : 1;
  return a + (b - a) * ss(cur.t, cur.t + 0.5, t);
};

// ------------------------------------------------------------ the robot simulated once over the film
const DT = 1 / 240;
const NT = Math.ceil((DURATION + 1) / DT) + 2;
const TAB = {th: new Float64Array(NT), dist: new Float64Array(NT), roll: new Float64Array(NT), field: new Float64Array(NT), tau: new Float64Array(NT), snaps: new Int16Array(NT), flags: new Uint8Array(NT), dir: new Int8Array(NT)};
{
  const s = newState();
  const pulses = SCRIPT.filter((e) => e.pulse).map((e) => e.t);
  let pi = 0;
  let rollU = 0;
  for (let i = 0; i < NT; i++) {
    const tm = i * DT;
    while (pi < pulses.length && pulses[pi] <= tm) {
      requestPulse(s);
      pi++;
    }
    if (i > 0) {
      const r0 = s.roll;
      stepSim(s, DT * slowAt(tm - DT / 2), {nudge: nudgeAt(tm), f: fAt(tm)});
      let d = s.roll - r0;
      if (d < -Math.PI) d += 2 * Math.PI;
      rollU += d;
    }
    TAB.th[i] = s.th;
    TAB.dist[i] = s.dist;
    TAB.roll[i] = rollU;
    TAB.field[i] = s.field;
    TAB.tau[i] = s.tauM;
    TAB.snaps[i] = s.snaps;
    TAB.flags[i] = (s.pulse ? 1 : 0) | (s.queued ? 2 : 0) | (s.rolling ? 4 : 0);
    TAB.dir[i] = s.pulse ? s.pulse.dir : s.queued;
  }
}
const tab = (arr, t) => {
  const x = clamp(t / DT, 0, NT - 1.001);
  const i = Math.floor(x);
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
};
const pick = (arr, t) => arr[clamp(Math.round(t / DT), 0, NT - 1)];
/** the robot's state at film time t, in the same shape the live page builds */
export const simAt = (t) => ({
  th: tab(TAB.th, t),
  dist: tab(TAB.dist, t),
  roll: tab(TAB.roll, t),
  field: pick(TAB.field, t),
  tauM: pick(TAB.tau, t),
  snaps: pick(TAB.snaps, t),
  pulsing: !!(pick(TAB.flags, t) & 1),
  waiting: !!(pick(TAB.flags, t) & 2),
  pulseDir: pick(TAB.dir, t),
});

/** everything the stage and the console need, from the simulated state */
export function robotState(sm, {f, nudge, slow, cargo}) {
  const closed = isClosed(sm.th);
  // the hinge glows while it is crossing the hill
  const snapping = sm.pulsing || (sm.th > 0.12 && sm.th < 1.3 && Math.abs(sm.tauM) > 0.3);
  return {
    ...sm,
    snap: snapping ? 1 : 0,
    snapping,
    f,
    nudge,
    slow,
    cargo,
    closed,
    crawl: crawlSpeed(f),
  };
}

// ------------------------------------------------------------ views (world, metres, degrees)
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const VIEW_FN = {
  hero: (u) => ({at: [0.0, 0.0035, 0.0], az: 38 + 0.8 * u, el: 26, d: 0.082, sx: 0, sy: -16}),
  end: (u) => ({at: [0.0, 0.0035, 0.0], az: 90 + 0.3 * u, el: 9, d: 0.066, sx: 0, sy: -14}),
  top: (u) => ({at: [0.0, 0.002, 0.0], az: 20 + 0.6 * u, el: 78, d: 0.08, sx: 0, sy: -12}),
  rig: (u) => ({at: [0.0, -0.045, 0.0], az: 30 + 1.2 * u, el: 18, d: 0.78, sx: 0, sy: -10}),
};
const CAMS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
export const viewAt = (t) => CAMS.filter(([a]) => a <= t).pop()[1];
export const blend = (a, b, k) => {
  const o = {at: mix(a.at, b.at, k)};
  for (const key of ['el', 'sx', 'sy']) o[key] = a[key] + (b[key] - a[key]) * k;
  o.d = Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k);
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
  if (orbit > 0) o = {...o, az: o.az + 14 * Math.max(0, t - lastFlip('orbit', t)) * orbit};
  return o;
};
export const toCam = (c) => ({tx: c.at[0], ty: c.at[1], tz: c.at[2], az: c.az * D2R, el: c.el * D2R, d: c.d, sx: c.sx, sy: c.sy});
/** how see through the platform is: clear once the camera pulls back to the rig */
export const xrayOf = (d) => clamp((d - 0.12) / 0.2, 0, 1);

// ------------------------------------------------------------ the operator's pointer
const REST = [[820, 640], [700, 600], [900, 620], [760, 660]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.view) out.push({t: e.t + (e.display ? 0.45 : 0), spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    if (e.slow !== undefined) out.push({t: e.t, spot: ui.spots.slow});
    if (e.nudge !== undefined) out.push({t: e.t, spot: ui.spots.nudge});
    if (e.pulse) out.push({t: e.t, spot: ui.spots.pulse});
    return out;
  });
  EV.sort((a, b) => a.t - b.t);
  const WPS = [[0, 900, 600]];
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
const clampXY = (p) => [clamp(p[0], 360, 1080), clamp(p[1], 112, 740)];
export function makeTags(st, a, labels, xray) {
  const out = [];
  if (labels < 0.02) return out;
  const add = (pt, text, c, o, dx, dy) => {
    const p = st.project(pt);
    if (!p || o < 0.02) return;
    out.push({line: p, at: clampXY([p[0] + dx, p[1] + dy]), text, c, o});
  };
  const R = st.R;
  R.root.updateMatrixWorld(true);
  const wp = (obj, v = [0, 0, 0]) => obj.localToWorld(new st.V3(...v));
  const near = labels * (1 - xray);
  if (near > 0.02) {
    add(wp(R.hinge, [-0.0085, 0, 0]), a.snapping ? 'the hinge snaps across' : 'central hinge · 0.1 mm silicone', a.snapping ? '#B8381E' : '#171C2C', near, -150, 70);
    add(wp(R.magnets[0], [0, 0.0015, 0]), 'magnet · N35, ø1.5 × 3 mm', '#B8381E', near, 60, -70);
    add(wp(R.halves[1].outer, [-0.004, 0, -0.002]), 'printed PLA panel', '#171C2C', near, -170, -40);
    if (a.cargo > 0.5) add(wp(R.ball, [0, 0.002, 0]), 'cargo · 4 mm ball', '#3D639A', near, 80, -110);
  }
  if (labels * xray > 0.02) {
    add(wp(R.coils[0], [0, 0.03, 0]), 'coils 1 to 3', '#B8381E', labels * xray, 70, -40);
    add(wp(R.em, [0, 0.026, 0]), 'electromagnet 4', '#B8381E', labels * xray, -200, -60);
    add(new st.V3(0.19, -0.092, 0.12), 'slider rails, X and Y', '#171C2C', labels * xray, 40, 40);
    add(new st.V3(0, 0.002, 0), 'the robot', '#171C2C', labels * xray, 60, -90);
  }
  return out;
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    window.ST = st;
    return {
      resize,
      render(t) {
        const disp = displayAt(t);
        const cam = camAt(t, disp.orbit);
        const xray = xrayOf(cam.d);
        const a = robotState(simAt(t), {f: fAt(t), nudge: nudgeAt(t), slow: slowAt(t), cargo: easedDisplay('cargo', t, 0.5)});
        st.frame({...a, xray, time: t}, toCam(cam));
        ui.update({
          ...a,
          paused: false,
          tags: makeTags(st, a, easedDisplay('labels', t), xray),
          view: viewAt(t),
          display: disp,
          cursor: cfg.nocursor ? {x: -99, y: -99, press: false, ring: 0, ringX: 0, ringY: 0} : cursorAt(t),
        });
        return {};
      },
    };
  };
}
export const run = () => runSim(DEFAULTS, makeFilm());
