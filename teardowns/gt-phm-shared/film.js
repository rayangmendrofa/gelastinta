// THE HAIL MARY tour: the ship cruises under thrust, the operator turns the labels on and looks inside the crew
// compartment (down is the engines, 1.5 g), runs UNSPOOL (engines off, the cables pay out to 104 m), steps back for the
// whole spin plane, runs FLIP (the compartment turns over on its hinges), runs SPIN (the pair spins up to the book's
// 20.71 degrees per second: 1.04 g in the lab), rides along inside, pushes the spin rate up and back, then orbits.
// render(t) is a pure function of t: the sequence, the spin angle and the distance flown are tabulated once at load.
import {runSim} from '../kit/runtime.js';
import {createConsole, DISPLAY} from './console.js';
import {createShipStage} from './stage.js';
import {clamp, D2R, P, R2D, seqState, STAGES} from './kin.js';

export const SCRIPT = [
  {t: 0, view: 'ship', seq: 'cruise', w: P.wBook},
  {t: 2.4, display: 'labels'},
  {t: 4.4, display: 'glass', view: 'inside'},
  {t: 7.8, seq: 'unspool'},
  {t: 8.3, view: 'spools'},
  {t: 10.6, view: 'whole', display: 'paths'},
  {t: 13.4, seq: 'flip', view: 'ship'},
  {t: 17.2, seq: 'spin', view: 'whole'},
  {t: 21.8, view: 'inside'},
  {t: 25.0, w: 28},
  {t: 27.6, w: P.wBook},
  {t: 29.4, view: 'whole', display: 'orbit'},
];
export const DURATION = 35;
export const BEATS = [...new Set(SCRIPT.map((e) => e.t))];
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'Hail Mary', subtitle: ''}, director: {enabled: false}, watermark: ''};
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));
/** where each stage button sends the sequence */
export const TARGET = {cruise: 0, unspool: 2, flip: 3, spin: 4};
export const SEQ_RATE = 1 / 2.3; // sequence units per second (sped up to watch)

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
/** the sequence s: each stage event moves it to its target at SEQ_RATE */
export const seqAt = (t) => {
  let s = 0;
  for (const e of SCRIPT) {
    if (e.seq === undefined || e.t > t) continue;
    const tgt = TARGET[e.seq];
    const dur = Math.max(0.01, Math.abs(tgt - s) / SEQ_RATE);
    const k = clamp((t - e.t) / dur, 0, 1);
    s = s + (tgt - s) * k;
  }
  return s;
};
export const stageKeyAt = (t) => lastOf('seq', t).pop()?.seq ?? 'cruise';
/** the spin rate the sequence is heading for, eased over 1.6 s */
export const wAt = (t) => {
  const ev = lastOf('w', t);
  const cur = ev[ev.length - 1];
  const prev = ev.length > 1 ? ev[ev.length - 2].w : cur.w;
  return prev + (cur.w - prev) * ss(cur.t, cur.t + 1.6, t);
};
// the spin angle and the distance flown, tabulated once
const DT = 1 / 240;
const NT = Math.ceil((DURATION + 1) / DT) + 2;
const TH = new Float64Array(NT);
const TRAV = new Float64Array(NT);
export const CRUISE_V = 38; // m/s the specks stream past at full thrust (drawn, not the ship's real speed)
for (let i = 1; i < NT; i++) {
  const tm = (i - 0.5) * DT;
  const a = seqState(seqAt(tm), wAt(tm));
  TH[i] = TH[i - 1] + a.w * D2R * DT;
  TRAV[i] = TRAV[i - 1] + CRUISE_V * a.thrust * DT;
}
const tab = (arr, t) => {
  const x = clamp(t / DT, 0, NT - 1.001);
  const i = Math.floor(x);
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
};
export const thetaAt = (t) => tab(TH, t);
export const travelAt = (t) => tab(TRAV, t);

// ------------------------------------------------------------ the ship's state
export const THETA0 = -20 * D2R; // the ship's heading at the start
export function shipState(s, wTarget, theta, glass, paths, travel) {
  const a = seqState(s, wTarget);
  const gDown = a.thrust * P.gThrust + (1 - a.thrust) * (a.flip > 90 ? a.gCrew : 0);
  return {
    ...a,
    wTarget,
    theta: THETA0 + theta,
    glass,
    paths,
    travel,
    specks: a.thrust,
    gDown,
    spool: (a.d - P.docked) / (2 * Math.PI * 0.75),
  };
}

// ------------------------------------------------------------ views (world metres, degrees); they follow the ship
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const arr = (v) => [v.x, v.y, v.z];
const head = (a) => -a.theta * R2D; // the azimuth that looks broadside at the ship
export const VIEW_FN = {
  // the docked ship whole; once the halves part, the crew compartment (to watch it turn over)
  ship: (u, a, p) => {
    const k = clamp((a.d - P.docked) / 24, 0, 1);
    const at = mix(mix(arr(p.crewHub), arr(p.rearHub), 0.5), arr(p.crewMid), k);
    return {at: at.map((v, i) => (i === 1 ? v + 1 : v)), az: head(a) + 34 - 22 * k + 0.6 * u, el: 20 - 6 * k, d: 92 - 34 * k, sx: 0, sy: -20};
  },
  inside: (u, a, p) => ({at: arr(p.lab), az: head(a) + 20 + 0.5 * u, el: 40, d: 30, sx: 0, sy: -18}),
  spools: (u, a, p) => ({at: arr(p.rearHub).map((v, i) => (i === 1 ? v + 0.5 : v)), az: head(a) + 38 + 0.6 * u, el: 34, d: 46, sx: 0, sy: -18}),
  whole: (u, a) => ({at: [0, 0, 0], az: 26 + 0.8 * u, el: 50, d: 330, sx: 0, sy: -30}),
};
const CAMS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
export const viewAt = (t) => CAMS.filter(([x]) => x <= t).pop()[1];
export const blend = (a, b, k) => {
  const o = {at: mix(a.at, b.at, k)};
  for (const key of ['el', 'sx', 'sy']) o[key] = a[key] + (b[key] - a[key]) * k;
  // distances blend in log space: 30 m to 300 m should not crawl
  o.d = Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k);
  const daz = ((((b.az - a.az) % 360) + 540) % 360) - 180;
  o.az = a.az + daz * k;
  return o;
};
export const camAt = (t, a, p, orbit = 0) => {
  let i = 0;
  while (i < CAMS.length - 1 && CAMS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[CAMS[i][1]](t - CAMS[i][0], a, p);
  let o = cur;
  if (i > 0) {
    const k = ss(CAMS[i][0], CAMS[i][0] + 1.8, t);
    if (k < 1) o = blend(VIEW_FN[CAMS[i - 1][1]](t - CAMS[i - 1][0], a, p), cur, k);
  }
  if (orbit > 0) o = {...o, az: o.az + 9 * Math.max(0, t - lastFlip('orbit', t)) * orbit};
  return o;
};
export const toCam = (c) => ({tx: c.at[0], ty: c.at[1], tz: c.at[2], az: c.az * D2R, el: c.el * D2R, d: c.d, sx: c.sx, sy: c.sy});

// ------------------------------------------------------------ the operator's pointer
const REST = [[820, 430], [700, 380], [900, 520], [760, 600]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.view) out.push({t: e.t + (e.display || e.seq ? 0.45 : 0), spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    if (e.seq) out.push({t: e.t, spot: ui.spots[e.seq]});
    if (e.w !== undefined) out.push({t: e.t, spot: ui.knobSpot(e.w)});
    return out;
  });
  const WPS = [[0, 900, 560]];
  EV.forEach((e, i) => {
    WPS.push([e.t - 0.16, ...e.spot], [e.t + 0.22, ...e.spot]);
    WPS.push([e.t + 1.4, ...REST[i % REST.length]]);
  });
  WPS.sort((x, y) => x[0] - y[0]);
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

// ------------------------------------------------------------ tags over the scene
const clampXY = (q) => [clamp(q[0], 360, 1080), clamp(q[1], 112, 740)];
export function makeTags(st, a, p, labels, glass, view) {
  const out = [];
  if (labels < 0.02) return out;
  const add = (pt, text, c, o, dx, dy) => {
    const q = st.project(pt);
    if (!q || o < 0.02 || q[0] < 330 || q[0] > 1240 || q[1] < 100 || q[1] > 760) return;
    out.push({line: q, at: clampXY([q[0] + dx, q[1] + dy]), text, c, o});
  };
  const far = view === 'whole';
  add(p.nose, far ? 'crew compartment' : 'crew compartment: control room, lab, dormitory', '#29120F', labels, 40, -60);
  if (!far) add(p.hinge, 'hinge (one each side)', '#29120F', labels * (a.stage >= 1 ? 1 : 0.6), 50, 50);
  add(p.drives, far ? 'rear half' : 'spin drives', '#29120F', labels, -150, 56);
  if (!far) add(p.tanks, 'Astrophage fuel tanks', '#29120F', labels, -40, -64);
  if (a.d > 6) add(p.cableMid, `Zylon cables · ${a.d.toFixed(0)} m`, '#1F33A0', labels, 30, -46);
  if (a.paths > 0.3 && far) add(p.com, 'centre of mass', '#1F33A0', labels * a.paths, -170, 54);
  if (glass > 0.3 && !far) add(p.arrow, a.gDown < 0.02 ? 'weightless' : `“down” ${a.gDown.toFixed(2)} g`, '#D9452B', labels * glass, 40, 50);
  return out;
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createShipStage({canvas});
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
        const a = shipState(seqAt(t), wAt(t), thetaAt(t), glass, easedDisplay('paths', t), travelAt(t));
        st.S.update(a);
        const p = st.S.points();
        st.frame(a, toCam(camAt(t, a, p, disp.orbit)));
        ui.update({
          ...a,
          paused: false,
          tags: makeTags(st, a, st.S.points(), easedDisplay('labels', t), glass, viewAt(t)),
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
export {STAGES};
