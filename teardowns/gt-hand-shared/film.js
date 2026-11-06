// PROSTHETIC HAND, the tour: the wearer flexes and relaxes, the operator isolates the index finger and turns the labels
// on, looks inside the palm through a glass cover, switches the EMG filter off to show the shake the report found,
// then tries the pinch grip and pointing, turns the wrist and orbits. render(t) is a pure function of t: every servo
// angle is integrated once at load from the script.
import {runSim} from '../kit/runtime.js';
import {createConsole, DISPLAY, ISO} from './console.js';
import {createHandStage} from './stage.js';
import {commandAt, currentOf, DIGITS, emgRaw, MODES, P, servoStep, tendonOf, thetaOf, tipOf, tipSpeed} from './kin.js';

export const SCRIPT = [
  {t: 0, view: 'hero', flex: 0, mode: 'power'},
  {t: 1.6, flex: 1},
  {t: 3.6, flex: 0},
  {t: 5.2, iso: 2},
  {t: 6.4, flex: 0.5},
  {t: 8.2, flex: 1},
  {t: 9.8, display: 'labels'},
  {t: 10.8, flex: 0.2},
  {t: 12.4, iso: 0, view: 'palm'},
  {t: 13.1, display: 'glass'},
  {t: 14.6, flex: 0.85},
  {t: 16.4, filter: false},
  {t: 17.2, flex: 0.55},
  {t: 20.2, filter: true},
  {t: 21.6, display: 'glass', view: 'hero'},
  {t: 22.6, mode: 'pinch'},
  {t: 23.4, flex: 1},
  {t: 25.4, mode: 'point'},
  {t: 27.2, wrist: 180},
  {t: 29.4, wrist: 0},
  {t: 30.8, mode: 'power'},
  {t: 31.4, flex: 0},
  {t: 32.2, display: 'orbit'},
  {t: 33.0, flex: 1},
  {t: 35.2, flex: 0.15},
];
export const DURATION = 38;
export const BEATS = [...new Set(SCRIPT.map((e) => e.t))];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'Prosthetic hand', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
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
export const isoAt = (t) => {
  const ev = lastOf('iso', t);
  const cur = ev.length ? ev[ev.length - 1] : null;
  return {cur: cur ? cur.iso : 0, prev: ev.length > 1 ? ev[ev.length - 2].iso : 0, t0: cur ? cur.t : -9};
};
export const modeAt = (t) => lastOf('mode', t).pop()?.mode ?? 'power';
export const filterAt = (t) => lastOf('filter', t).pop()?.filter ?? true;
export const wristGoalAt = (t) => lastOf('wrist', t).pop()?.wrist ?? 0;
/** the wearer's flex: each change is a muscle ramp of 0.35 s */
export const flexAt = (t) => {
  const ev = lastOf('flex', t);
  if (!ev.length) return 0;
  const cur = ev[ev.length - 1];
  const prev = ev.length > 1 ? ev[ev.length - 2].flex : cur.flex;
  return prev + (cur.flex - prev) * ss(cur.t, cur.t + 0.35, t);
};
/** what each digit's servo is told: the command times the grip's share for that digit, as degrees */
export const targetsOf = (cmd, mode) => MODES[mode].gain.map((g) => g * cmd * P.phiMax);

// the servos chase their targets at 400 degrees per second, integrated once for the whole film
const DT = 1 / 240;
const NT = Math.ceil((DURATION + 1) / DT) + 2;
const PHI = DIGITS.map(() => new Float32Array(NT));
const WR = new Float32Array(NT);
const CMD = new Float32Array(NT);
{
  const phi = DIGITS.map(() => 0);
  let w = 0;
  for (let n = 0; n < NT; n++) {
    const t = n * DT;
    const cmd = commandAt(flexAt, t, filterAt(t));
    CMD[n] = cmd;
    const tg = targetsOf(cmd, modeAt(t));
    for (let i = 0; i < phi.length; i++) {
      phi[i] = servoStep(phi[i], tg[i], n ? DT : 0);
      PHI[i][n] = phi[i];
    }
    w = servoStep(w, wristGoalAt(t), n ? DT : 0, P.wristSpeed);
    WR[n] = w;
  }
}
const at = (arr, t) => {
  const x = clamp(t / DT, 0, NT - 1.001);
  const i = Math.floor(x);
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
};
const rate = (arr, t) => (at(arr, t + 0.01) - at(arr, t - 0.01)) / 0.02;

// ------------------------------------------------------------ the hand's state
const isoGhost = (n) => DIGITS.map((_, i) => (n > 0 && i !== n - 1 ? 1 : 0));
/**
 * phi[5], dphi[5] (deg, deg/s), wrist (deg), wristRate, iso {cur, prev, k}, glass 0..1
 */
export function handState(phi, dphi, wrist, wristRate, iso, glass) {
  const accent = dphi.map((v) => clamp(Math.abs(v) / 120, 0, 1));
  const lerpA = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const ghost = lerpA(isoGhost(iso.prev), isoGhost(iso.cur), iso.k);
  const tendon = phi.map(tendonOf);
  const theta = tendon.map(thetaOf);
  // the finger the panels follow: the isolated one, else the index
  const focus = iso.cur ? iso.cur - 1 : 1;
  const L = DIGITS[focus].L;
  const w = (dphi[focus] * P.hornR) / (3 * P.rho); // joint rate (deg/s) from the servo rate
  return {
    phi,
    dphi,
    wrist,
    wristMoving: Math.abs(wristRate) > 5,
    accent,
    ghost,
    glass,
    tendon,
    theta,
    focus,
    tip: tipOf(L, theta[focus]),
    tipV: tipSpeed(L, theta[focus], w),
    amps: currentOf(dphi.concat([wristRate])),
  };
}
/** the signal chart: the last 3 s of raw EMG and of the command */
export function histories(flexFn, filtFn, t, n = 64) {
  const raw = [];
  const cmd = [];
  for (let i = 0; i < n; i++) {
    const tt = t - 3 + (3 * i) / (n - 1);
    if (tt < 0) {
      raw.push(0);
      cmd.push(0);
      continue;
    }
    raw.push(emgRaw(flexFn(tt), tt) / 1.6);
    cmd.push(commandAt(flexFn, tt, filtFn(tt)));
  }
  return {raw, cmd};
}
export const filmHandAt = (t, iso, glass) => {
  const phi = PHI.map((a) => at(a, t));
  const dphi = PHI.map((a) => rate(a, t));
  return handState(phi, dphi, at(WR, t), rate(WR, t), iso, glass);
};
export const filmCmdAt = (t) => at(CMD, t);

// ------------------------------------------------------------ views (world, target in metres, angles in degrees)
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const VIEW_FN = {
  hero: (u) => ({at: [0.012, 0.262, 0.01], az: -26 + 1.2 * u, el: 12, d: 0.66, sx: 0, sy: -18}),
  side: (u) => ({at: [0.0, 0.275, 0.02], az: 92 + 1.0 * u, el: 8, d: 0.55, sx: 0, sy: -18}),
  palm: (u) => ({at: [-0.004, 0.25, 0.01], az: -8 + 1.0 * u, el: 8, d: 0.52, sx: 0, sy: -14}),
};
// a view on one digit: from its outer side, looking at its middle joint
const DIGIT_VIEW = {1: [-48, 12, 0.44], 2: [-74, 8, 0.46], 3: [-80, 8, 0.48], 4: [76, 8, 0.46], 5: [72, 8, 0.44]};
export const digitView = (n, pt, u) => {
  const [az, el, d] = DIGIT_VIEW[n];
  return {at: mix([0, 0.28, 0.015], pt, 0.5), az: az + 1.0 * u, el, d, sx: 0, sy: -16};
};
const CAMS = (() => {
  const out = [];
  let view = 'hero';
  for (const e of SCRIPT) {
    if (e.view) view = e.view;
    if (e.iso !== undefined) out.push([e.t, e.iso ? `d${e.iso}` : view]);
    else if (e.view) out.push([e.t, view]);
  }
  return out;
})();
export const viewAt = (t) => {
  let v = 'hero';
  for (const e of SCRIPT) if (e.view && e.t <= t) v = e.view;
  return v;
};
export const blend = (a, b, k) => {
  const o = {at: mix(a.at, b.at, k)};
  for (const key of ['el', 'd', 'sx', 'sy']) o[key] = a[key] + (b[key] - a[key]) * k;
  const daz = ((((b.az - a.az) % 360) + 540) % 360) - 180;
  o.az = a.az + daz * k;
  const swing = Math.min(1, Math.abs(daz) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 0.08 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
};
const camOf = (key, u, pt) => (key[0] === 'd' ? digitView(Number(key.slice(1)), pt(Number(key.slice(1))), u) : VIEW_FN[key](u));
export const camAt = (t, pt, orbit = 0) => {
  let i = 0;
  while (i < CAMS.length - 1 && CAMS[i + 1][0] <= t) i++;
  const cur = camOf(CAMS[i][1], t - CAMS[i][0], pt);
  let o = cur;
  if (i > 0) {
    const k = ss(CAMS[i][0], CAMS[i][0] + 1.6, t);
    if (k < 1) o = blend(camOf(CAMS[i - 1][1], t - CAMS[i - 1][0], pt), cur, k);
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
    if (e.iso !== undefined) out.push({t: e.t, spot: ui.spots[ISO[e.iso]]});
    if (e.view) out.push({t: e.t + (e.iso !== undefined || e.display ? 0.45 : 0), spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    if (e.mode) out.push({t: e.t, spot: ui.spots[e.mode]});
    if (e.filter !== undefined) out.push({t: e.t, spot: ui.spots.filter});
    if (e.wrist !== undefined) out.push({t: e.t, spot: ui.spots.wrist});
    if (e.flex !== undefined) out.push({t: e.t, spot: ui.knobSpot(e.flex)});
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
const SUBH = (n) => `<sub style="font-size:.72em">${n}</sub>`;
/** labels with leaders: the horn and the tendon (glass), the joints of the focus finger (isolated), always short */
export function makeTags(st, a, labels, glass, isoN, isoK) {
  const out = [];
  if (labels < 0.02 && isoK < 0.02) return out;
  const P2 = (p) => st.project(p);
  const add = (pt, text, c, o, dx, dy, size) => {
    const p = P2(pt);
    if (!p || o < 0.02) return;
    // keep every label inside the free middle of the console (clear of the side panels and the bottom bar)
    out.push({line: p, at: [clamp(p[0] + dx, 360, 1080), clamp(p[1] + dy, 112, 740)], text, c, o, dx: 4, size});
  };
  const f = a.focus;
  if (labels > 0.02) {
    if (glass > 0.3) {
      const horn = st.H.servos[f].horn.getWorldPosition(new st.V3());
      add(horn, `servo horn, r = 7 mm`, '#2B44C8', labels * glass, 70, 40);
      const horn2 = st.H.servos[0].horn.getWorldPosition(new st.V3());
      add(horn2, `thumb servo`, '#1f2430', labels * glass, -150, 46);
    }
    add(st.point(f, 1), `joint frame, ρ = 5 mm`, '#1f2430', labels * (1 - 0.6 * glass), 60, -30);
    add(st.point(f, 0), `tendon over the frames`, '#2B44C8', labels * (1 - glass), 70, 34);
  }
  if (isoN > 0 && isoK > 0.02) {
    const names = ['MCP', 'PIP', 'DIP'];
    const n = DIGITS[isoN - 1].L.length;
    for (let k = 0; k < n; k++) add(st.point(isoN - 1, k), `${isoN === 1 ? ['MCP', 'IP'][k] : names[k]} θ${SUBH(k + 1)} = ${a.theta[isoN - 1].toFixed(0)}°`, '#1f2430', isoK, -150, -8 - 10 * k, 12);
    add(st.point(isoN - 1, n), `P${SUBH(3)}`, '#2B44C8', isoK, 40, -20, 13);
  }
  return out;
}

export function consoleState(a, extra) {
  return {...a, target: extra.target, ...extra};
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createHandStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    window.ST = st;
    const pt = (n) => st.point(n - 1, 1).toArray();
    return {
      resize,
      render(t) {
        const I = isoAt(t);
        const isoK = ss(I.t0, I.t0 + 0.8, t);
        const disp = displayAt(t);
        const glass = easedDisplay('glass', t);
        const labels = easedDisplay('labels', t);
        const a = filmHandAt(t, {cur: I.cur, prev: I.prev, k: isoK}, glass);
        st.frame(a, toCam(camAt(t, pt, disp.orbit)));
        const H = histories(flexAt, filterAt, t);
        const shownIso = I.cur || (isoK < 1 ? I.prev : 0);
        const tagK = I.cur ? ss(I.t0 + 0.9, I.t0 + 1.5, t) : 1 - isoK;
        ui.update(consoleState(a, {
          target: targetsOf(filmCmdAt(t), modeAt(t)),
          cmd: filmCmdAt(t),
          flex: flexAt(t),
          rawHist: H.raw,
          cmdHist: H.cmd,
          filtered: filterAt(t),
          mode: modeAt(t),
          wristGoal: wristGoalAt(t),
          tags: makeTags(st, a, labels, glass, shownIso, tagK),
          view: viewAt(t),
          display: disp,
          iso: I.cur,
          cursor: cfg.nocursor ? {x: -99, y: -99, press: false, ring: 0, ringX: 0, ringY: 0} : cursorAt(t),
        }));
        return {};
      },
    };
  };
}
export const run = () => runSim(DEFAULTS, makeFilm());
