// HAIR CLIP FISH, the tour: the fish beats its tail at 1 Hz, the operator turns the labels on, looks down at the clip
// and slows time ten times to watch it climb the hill and snap, looks inside the head, then turns the tail beat up to
// the lake test's 3 Hz, tries the snap in air, pushes to 5 Hz where the snap can no longer settle, and orbits.
// render(t) is a pure function of t: the beat phase and the distance swum are integrated once at load.
import {runSim} from '../kit/runtime.js';
import {createConsole, DISPLAY} from './console.js';
import {createFishStage} from './stage.js';
import {ampShare, blOf, clipAt, D2R, P, speedOf, tailOf} from './kin.js';

export const SCRIPT = [
  {t: 0, view: 'hero', f: 1, medium: 'water'},
  {t: 2.6, display: 'labels'},
  {t: 4.6, view: 'clip'},
  {t: 6.4, slow: true},
  {t: 12.4, slow: false},
  {t: 13.6, display: 'glass', view: 'head'},
  {t: 17.0, display: 'glass', view: 'top'},
  {t: 18.0, f: 3},
  {t: 21.6, medium: 'air'},
  {t: 24.0, medium: 'water'},
  {t: 25.6, f: 5},
  {t: 28.8, f: 3},
  {t: 30.2, view: 'hero'},
  {t: 30.9, display: 'orbit'},
];
export const DURATION = 36;
export const BEATS = [...new Set(SCRIPT.map((e) => e.t))];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'Hair clip fish', subtitle: ''}, director: {enabled: false}, watermark: ''};
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
export const mediumAt = (t) => lastOf('medium', t).pop()?.medium ?? 'water';
const slowOn = (t) => lastOf('slow', t).pop()?.slow ?? false;
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
/** the tail beat frequency, eased over 1 s when the script changes it */
export const fAt = (t) => {
  const ev = lastOf('f', t);
  const cur = ev[ev.length - 1];
  const prev = ev.length > 1 ? ev[ev.length - 2].f : cur.f;
  return prev + (cur.f - prev) * ss(cur.t, cur.t + 1, t);
};
export const tauOf = (medium) => (medium === 'air' ? P.snapAir : P.snapWater);
// the beat phase and the distance swum, tabulated once
const DT = 1 / 240;
const NT = Math.ceil((DURATION + 1) / DT) + 2;
const BEAT = new Float64Array(NT);
const DIST = new Float64Array(NT);
for (let i = 1; i < NT; i++) {
  const tm = (i - 0.5) * DT;
  const sl = slowAt(tm);
  BEAT[i] = BEAT[i - 1] + fAt(tm) * sl * DT;
  DIST[i] = DIST[i - 1] + speedOf(fAt(tm)) * sl * DT;
}
const tab = (arr, t) => {
  const x = clamp(t / DT, 0, NT - 1.001);
  const i = Math.floor(x);
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
};
export const beatAt = (t) => tab(BEAT, t);
export const distAt = (t) => tab(DIST, t);

// ------------------------------------------------------------ the fish's state from the beat phase
/**
 * B: beat phase (beats), f (Hz), tau: snap time (s), slow: time scale, glass 0..1
 * returns everything the stage and the console need
 */
export function fishState(B, f, tau, slow, glass, dist) {
  const c = clipAt(B, f, tau);
  const lag = (s) => B - f * P.wave * s; // the snap reaches the tail a little later
  // the body angle at s (0 the back of the head, 1 the fin's root): the rear bends most, as in carangiform fish
  const phi = (s) => {
    const x = clipAt(lag(s), f, tau).x;
    return tailOf(x) * D2R * Math.pow(s, 1.5) * 0.92;
  };
  const tipX = clipAt(lag(1), f, tau).x;
  const psi = tailOf(tipX);
  // the tail's swing rate (degrees per real second)
  const db = 0.002;
  const psiRate = ((tailOf(clipAt(lag(1) + db, f, tau).x) - tailOf(clipAt(lag(1) - db, f, tau).x)) / (2 * db)) * f;
  const snap = c.phase === 'snap' ? 1 : c.phase === 'settle' ? clamp(1 - (c.u - c.uTip) * 2, 0, 1) * 0.6 : 0;
  // the servo turns the clip's centre over the loading part of each half beat, then waits
  const servo = c.s * 28 * D2R * Math.cos(Math.PI * Math.min(1, c.u / c.uTip));
  return {
    phi,
    x: c.x,
    phase: c.phase,
    snap,
    drive: c.phase === 'load' ? 1 : 0,
    servo,
    glass,
    dist,
    psi,
    psiRate,
    f,
    tau,
    slow,
    speed: speedOf(f),
    bl: blOf(f),
    share: ampShare(f),
  };
}
/** the tail angle over the last real second (64 points), for the chart */
export const tailHistory = (beatAtT, t, f, tau, n = 64) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const tt = t - 1 + i / (n - 1);
    out.push(tt < 0 ? 0 : tailOf(clipAt(beatAtT(tt) - f * P.wave, f, tau).x));
  }
  return out;
};

// ------------------------------------------------------------ views (world, metres, degrees)
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const VIEW_FN = {
  hero: (u) => ({at: [0.0, 0.122, 0.0], az: 24 + 1.2 * u, el: 24, d: 0.62, sx: 0, sy: -18}),
  top: (u) => ({at: [0.0, 0.13, 0.0], az: 0 + 0.8 * u, el: 80, d: 0.6, sx: 0, sy: -14}),
  clip: (u) => ({at: [-0.035, 0.13, 0.0], az: 14 + 1.0 * u, el: 50, d: 0.4, sx: 0, sy: -16}),
  head: (u) => ({at: [0.045, 0.128, 0.0], az: 38 + 1.0 * u, el: 22, d: 0.36, sx: 0, sy: -16}),
};
const CAMS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
export const viewAt = (t) => CAMS.filter(([a]) => a <= t).pop()[1];
export const blend = (a, b, k) => {
  const o = {at: mix(a.at, b.at, k)};
  for (const key of ['el', 'd', 'sx', 'sy']) o[key] = a[key] + (b[key] - a[key]) * k;
  const daz = ((((b.az - a.az) % 360) + 540) % 360) - 180;
  o.az = a.az + daz * k;
  const swing = Math.min(1, Math.abs(daz) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 0.08 * swing - o.d) * Math.sin(Math.PI * k);
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

// ------------------------------------------------------------ the operator's pointer
const REST = [[820, 430], [700, 380], [900, 520], [760, 600]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.view) out.push({t: e.t + (e.display ? 0.45 : 0), spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    if (e.slow !== undefined) out.push({t: e.t, spot: ui.spots.slow});
    if (e.medium) out.push({t: e.t, spot: ui.spots.medium});
    if (e.f !== undefined) out.push({t: e.t, spot: ui.knobSpot(e.f)});
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
const clampXY = (p) => [clamp(p[0], 360, 1080), clamp(p[1], 112, 740)];
export function makeTags(st, a, labels, glass) {
  const out = [];
  if (labels < 0.02) return out;
  const add = (pt, text, c, o, dx, dy, size) => {
    const p = st.project(pt);
    if (!p || o < 0.02) return;
    out.push({line: p, at: clampXY([p[0] + dx, p[1] + dy]), text, c, o, size});
  };
  const F = st.F;
  const w = (v) => v.clone().applyMatrix4(F.fish.matrixWorld);
  F.fish.updateMatrixWorld(true);
  const m = F.mid;
  const n = m.length - 1;
  add(w(m[Math.round(n * 0.45)]).add(new st.V3(0, 0.009, 0)), a.phase === 'snap' ? 'the clip snaps' : 'the hair clip, PETG 0.762 mm', a.phase === 'snap' ? '#B05C4B' : '#252413', labels, 30, -70);
  add(w(m[n]), 'rivet, then the tail fin', '#252413', labels * (1 - 0.7 * glass), -170, 60);
  if (glass > 0.3) {
    add(F.horn.getWorldPosition(new st.V3()), 'servo turns the clip centre', '#B05C4B', labels * glass, 40, -60);
    add(new st.V3(0.062, 0.13 - 0.008, 0.008), '7.4 V battery', '#252413', labels * glass, 70, 50);
  } else add(new st.V3(0.09, 0.14, 0.012), 'printed head', '#252413', labels, 60, -50);
  return out;
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createFishStage({canvas});
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
        const f = fAt(t);
        const tau = tauOf(mediumAt(t));
        const a = fishState(beatAt(t), f, tau, slowAt(t), glass, distAt(t));
        st.frame(a, toCam(camAt(t, disp.orbit)));
        ui.update({
          ...a,
          tailHist: tailHistory(beatAt, t, f, tau),
          medium: mediumAt(t),
          paused: false,
          tags: makeTags(st, a, easedDisplay('labels', t), glass),
          view: viewAt(t),
          display: disp,
          cursor: cfg.nocursor ? {x: -99, y: -99, press: false, ring: 0, ringX: 0, ringY: 0} : cursorAt(t),
        });
        void slowOn;
        return {};
      },
    };
  };
}
export const run = () => runSim(DEFAULTS, makeFilm());
