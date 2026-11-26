// Fig 1 · The ramp. A bench model of the inverted half loop from the Roadster's first live demo, with the course's
// track sizes (R 6 m, 4 m of wall, 6 m of ceiling). The car is driven by the re-derived model in model.mjs: the
// wheel load the track must supply is m v² / R plus the fan suction plus the part of gravity across the track. Set
// the fans with the pointer; under about 1 mg the car drops off the ceiling. Run: node ramp.mjs [--light]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as k from "/home/claude/anatomy/kit/iso-kit.mjs";
import * as G from "/home/claude/anatomy/kit/lathe.mjs";
import * as M from "./model.mjs";
import { CAR_RUNTIME, EXTRA_CSS, HERE, pageKit, U } from "./shared.mjs";

const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 640, HEIGHT = 380;
const RH = 2; // rail height: the running surface sits this far above the rail's base
const RAIL = [9.2, 12.2]; // |y| of each rail
const PLATE = { x: -372, y: -58, w: 496, d: 140, r: 10 };
const PLATE_H = 10, FOOT_H = 6;
const SP = 14; // the support spine runs this far outside the running surface
const POSTS = [-62, -8]; // back posts, x
const BACK_Y = -44;
const TOP = M.CEIL * U + RH + SP + 4; // top of the spine on the ceiling
const BEAM_Z = TOP;
const GAUGE = { load: [-150, 50], fans: [-80, 50] };
const DIAL_R = 17, DIAL_Z = 4, DIAL_H = 7, DIAL_TOP = DIAL_Z + DIAL_H;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [POSTS[0], BACK_Y, BEAM_Z + 4], [M.R * U + SP + 4, 0, TOP], [0, 0, TOP + 4]],
  WIDTH,
  HEIGHT,
  { pad: 16, azimuth: 104, elevation: 24 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style = {}) => k.solidSvg(paths, { tone: "mid", ...style });
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const W = (p) => [p[0] * U, p[1] * U]; // track (x, z) metres to units

// a frame whose axis is world y, with u = world x and v = world z: prisms in it are x–z outlines extruded across y
const FY = (y0 = 0) => G.frameOf([0, y0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const across = (poly, y0, y1) => G.prismOf(FY(), poly, y0, y1, P);
const trackPt = (s, off = 0) => {
  const t = M.trackAt(s);
  const p = W(t.p);
  return [p[0] + t.n[0] * off, p[1] + RH + t.n[1] * off];
};
const sampleS = (s0, s1, n) => Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n);
const L1 = M.LIN, L2 = L1 + (Math.PI / 2) * M.R, L3 = L2 + M.LV, L4 = L3 + (Math.PI / 2) * M.R, L5 = M.TRACK_END;
// track pieces: [s0, s1, segments]
const PIECES = [[L1, L2, 18], [L2, L3, 1], [L3, L4, 18], [L4, L5, 1]];
const segList = () => PIECES.flatMap(([a, b, n]) => sampleS(a, b, n).slice(0, -1).map((s, i, arr) => [s, i + 1 < arr.length ? arr[i + 1] : b]));

// ------------------------------------------------------------------ the bench
function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
    out.push(S(k.cylinder(x, y, 9, -PLATE_H - FOOT_H, 2, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H + 2, FOOT_H - 2, P, 28)));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6)));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 12);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.6, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  // a metre rule along the front edge, 0.5 m minor ticks
  const strip = { x: PLATE.x + 20, y: PLATE.y + PLATE.d - 16, w: 440, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 5, strip.x + strip.w - 5, 5, 2, strip.y + 0.8, 0.6, [2.4, 4.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2.5, strip.y + 4, 0.6]), at([strip.x + strip.w - 2.5, strip.y + 4, 0.6])], { size: 0.45 }));
  // the landing mat, where the planned run comes down, and the start plate
  const mat = { x: -340, y: -7.5, w: 74, d: 15, r: 2 };
  out.push(S(k.slabOf(mat, 0, 0.8, P, 3, 0.4), { tone: "lo" }));
  for (let x = mat.x + 8; x < mat.x + mat.w - 4; x += 8) out.push(L(k.lineOnTop([x, mat.y + 2], [x, mat.y + mat.d - 2], 0.8, P), { tone: "faint" }));
  const start = { x: M.X0 * U - 3, y: -7.5, w: 6, d: 15, r: 1 };
  out.push(S(k.slabOf(start, 0, 0.6, P, 2), { tone: "lo" }));
  return out.join("");
}

// ------------------------------------------------------------------ the rails, ties and the support spine
const railFloor = (side) => {
  const [a, b] = side > 0 ? RAIL : [-RAIL[1], -RAIL[0]];
  const x0 = PLATE.x + 10, x1 = 0;
  return S(k.slabOf({ x: x0, y: a, w: x1 - x0 + 1, d: b - a, r: 0.4 }, 0, RH, P, 2, 0.3));
};
function rail(side) {
  const [a, b] = side > 0 ? RAIL : [-RAIL[1], -RAIL[0]];
  const segs = segList();
  const items = segs.map(([s0, s1]) => {
    const p0 = trackPt(s0), p1 = trackPt(s1), q1 = trackPt(s1, RH), q0 = trackPt(s0, RH);
    const mid = trackPt((s0 + s1) / 2, 1);
    return { depth: k.depthOf([mid[0], (a + b) / 2, mid[1]], P), svg: S(across([p0, p1, q1, q0], a, b)) };
  });
  items.sort((u, v) => u.depth - v.depth);
  // screws on the rail's inner face, one per piece of straight
  return railFloor(side) + items.map((i) => i.svg).join("");
}
function ties() {
  const back = [], front = [];
  for (let s = L1 + 0.8; s < L5 - 0.3; s += 1.6) {
    const t = M.trackAt(s);
    const c = trackPt(s, RH);
    const w = 0.7;
    const tx = t.t[0] * w, tz = t.t[1] * w;
    const o0 = [c[0] - tx, c[1] - tz], o1 = [c[0] + tx, c[1] + tz];
    const poly = [o0, o1, [o1[0] + t.n[0] * 1.6, o1[1] + t.n[1] * 1.6], [o0[0] + t.n[0] * 1.6, o0[1] + t.n[1] * 1.6]];
    const svg = S(across(poly, -RAIL[1] - 1, RAIL[1] + 1), { tone: "lo" });
    // a strut from the middle of the tie out to the spine
    const sOut = trackPt(s, RH + 1.6), sEnd = trackPt(s, SP - 2);
    const strut = S(across([[sOut[0] - tx * 0.4, sOut[1] - tz * 0.4], [sOut[0] + tx * 0.4, sOut[1] + tz * 0.4], [sEnd[0] + tx * 0.4, sEnd[1] + tz * 0.4], [sEnd[0] - tx * 0.4, sEnd[1] - tz * 0.4]], -1.2, 1.2));
    const item = { svg: strut + svg, depth: k.depthOf([c[0], 0, c[1]], P) };
    (t.n[1] > 0.15 ? front : back).push(item);
  }
  const ord = (list) => list.sort((u, v) => u.depth - v.depth).map((i) => i.svg).join("");
  return { back: ord(back), front: ord(front) };
}
function spine() {
  const segs = segList().filter(([s0]) => s0 >= L2 - 1e-6);
  const items = segs.map(([s0, s1]) => {
    const p0 = trackPt(s0, SP - 2), p1 = trackPt(s1, SP - 2), q1 = trackPt(s1, SP + 2), q0 = trackPt(s0, SP + 2);
    return { depth: k.depthOf([(p0[0] + p1[0]) / 2, 0, (p0[1] + p1[1]) / 2], P), svg: S(across([p0, p1, q1, q0], -3, 3)) };
  });
  // the wall spine runs down to the bench on a foot plate
  const x = M.R * U + SP;
  const foot = { x: x - 7, y: -9, w: 14, d: 18, r: 1.5 };
  const base = S(k.slabOf(foot, 0, 2, P, 3, 0.4)) + D(k.corners(foot, 3).map(([a, b]) => at([a, b, 2])), { size: 0.45 });
  const column = S(across([[x - 2, 2], [x + 2, 2], [x + 2, (M.R) * U + RH], [x - 2, (M.R) * U + RH]], -3, 3));
  items.sort((u, v) => u.depth - v.depth);
  return base + column + items.map((i) => i.svg).join("");
}
// lower curve: short posts from the bench to the ties under the curve
function lowerPosts() {
  const out = [];
  for (const ang of [0.5, 0.95]) {
    const s = L1 + ang * M.R;
    const c = trackPt(s, RH + 1.6);
    const foot = { x: c[0] - 4, y: -5, w: 8, d: 10, r: 1 };
    out.push(S(k.slabOf(foot, 0, 1.6, P, 2, 0.3)));
    out.push(S(k.slabOf({ x: c[0] - 1.6, y: -1.6, w: 3.2, d: 3.2, r: 0.6 }, 1.6, c[1] - 1.6, P, 2)));
  }
  return out.join("");
}
// the back frame that hangs the ceiling: two posts, a top rail and cross beams over to the spine
function backFrame() {
  const out = [];
  for (const x of POSTS) {
    const foot = { x: x - 8, y: BACK_Y - 8, w: 16, d: 16, r: 2 };
    out.push(S(k.slabOf(foot, 0, 2.4, P, 3, 0.4)));
    out.push(D(k.corners(foot, 3).map(([a, b]) => at([a, b, 2.4])), { size: 0.45 }));
    out.push(S(k.slabOf({ x: x - 3, y: BACK_Y - 3, w: 6, d: 6, r: 0.8 }, 2.4, BEAM_Z - 2.4, P, 2, 0.4)));
  }
  out.push(S(k.slabOf({ x: POSTS[0] - 4, y: BACK_Y - 3.5, w: POSTS[1] - POSTS[0] + 8, d: 7, r: 1 }, BEAM_Z, 5, P, 2, 0.5)));
  // a diagonal brace between the posts, drawn as a thin bar in the frame's plane
  const brace = G.prismOf(G.frameOf([0, BACK_Y, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]), [[POSTS[0] + 3, 20], [POSTS[0] + 3, 26], [POSTS[1] - 3, BEAM_Z - 14], [POSTS[1] - 3, BEAM_Z - 20]], -1.4, 1.4, P);
  out.push(S(brace, { tone: "lo" }));
  for (const x of POSTS) {
    out.push(S(k.slabOf({ x: x - 2.5, y: BACK_Y, w: 5, d: -BACK_Y + 3, r: 0.6 }, BEAM_Z, 4, P, 2, 0.4)));
    out.push(D([at([x, BACK_Y + 2, BEAM_Z + 4]), at([x, 1, BEAM_Z + 4])], { size: 0.45 }));
  }
  return out.join("");
}

// ------------------------------------------------------------------ the two instruments on the front of the bench
const ARC0 = -0.75 * Math.PI, ARC = 1.5 * Math.PI; // 270 degrees, from lower left round to lower right
const loadAngle = (mg) => ARC0 + ((Math.max(-1, Math.min(5, mg)) + 1) / 6) * ARC;
const fanAngle = (mg) => ARC0 + (Math.max(0, Math.min(1.5, mg)) / 1.5) * ARC;
const arcOnTop = ([cx, cy], r, a0, a1, z) => {
  const n = 24, pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.sin(a) * r, cy - Math.cos(a) * r]);
  }
  return k.onTop(pts, z, P);
};
function instrument([x, y], kind) {
  const out = [];
  const plinth = { x: x - 24, y: y - 22, w: 48, d: 44, r: 4 };
  out.push(`<path class="iso-halo" d="${k.haloOf(plinth, 0, 4, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(plinth, 0, DIAL_Z, P, 5, 0.6)));
  out.push(D(k.corners(plinth, 4).map(([a, b]) => at([a, b, DIAL_Z])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_Z + 2.5, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  if (kind === "load") {
    const t = k.radialTicks(x, y, DIAL_R - 3, 24, 4, DIAL_TOP, [1.2, 2.6], P, ARC0, ARC);
    out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
    // the red sector: below zero load the tyres are not touching the track
    out.push(L(arcOnTop([x, y], DIAL_R - 3.6, loadAngle(-1), loadAngle(0), DIAL_TOP), { tone: "red" }));
    out.push(L(arcOnTop([x, y], DIAL_R - 3.6, loadAngle(0), loadAngle(5), DIAL_TOP), { tone: "faint" }));
  } else {
    const t = k.radialTicks(x, y, DIAL_R - 3, 15, 5, DIAL_TOP, [1.2, 2.6], P, ARC0, ARC);
    out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
    out.push(L(arcOnTop([x, y], DIAL_R - 3.6, fanAngle(0), fanAngle(1), DIAL_TOP), { tone: "faint" }));
    out.push(L(arcOnTop([x, y], DIAL_R - 3.6, fanAngle(1), fanAngle(1.5), DIAL_TOP), { tone: "green" }));
    // a knurled knob in the middle turns with the setting
    out.push(S(k.cylinder(x, y, 6, DIAL_TOP, 4, P, 32), { tone: "mid" }));
    out.push(L(k.knurl(x, y, 6, DIAL_TOP, DIAL_TOP + 4, 30, P), { tone: "lo" }));
  }
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP + (kind === "fans" ? 4 : 0), P, 16), { tone: "mid" }));
  return out.join("");
}
const needleAt = ([x, y], a, z, r) => k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * r, y - Math.cos(a) * r], z, P);

// ------------------------------------------------------------------ assemble
const T = ties();
const st0 = M.rampStart();
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A bench model of an inverted half loop: a flat run, a quarter circle up to a vertical wall, a second quarter circle onto a ceiling that runs back over the start. A small car with four suction fans under its floor drives round it. One dial reads the fans' suction, the other the load on the tyres, which falls below zero when the fans are too weak to hold the car on the ceiling.",
  body: [
    bench(),
    backFrame(),
    rail(-1),
    lowerPosts(),
    spine(),
    T.back,
    `<g data-part="car"></g>`,
    rail(1),
    T.front,
    instrument(GAUGE.load, "load"),
    instrument(GAUGE.fans, "fans"),
    `<path data-part="load-needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(GAUGE.load, loadAngle(1), DIAL_TOP + 0.2, DIAL_R - 4)}" style="stroke-width:1.1"/>`,
    `<path data-part="fan-needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(GAUGE.fans, fanAngle(1.3), DIAL_TOP + 4.2, DIAL_R - 4)}" style="stroke-width:1.1"/>`,
  ],
});

const modelSrc = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
const P = ${JSON.stringify(P)};
${modelSrc}
${CAR_RUNTIME}
const U = ${U}, RH = ${RH}, DIAL_TOP = ${DIAL_TOP}, DIAL_R = ${DIAL_R};
const GAUGE = ${JSON.stringify(GAUGE)};
const ARC0 = ${ARC0}, ARC = ${ARC};
const loadAngle = ${loadAngle.toString()};
const fanAngle = ${fanAngle.toString()};
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const carG = svg.querySelector('[data-part="car"]');
const loadN = svg.querySelector('[data-part="load-needle"]');
const fanN = svg.querySelector('[data-part="fan-needle"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TOUR = [1.3, 0.9];
let fan = 1.3, fanShown = 1.3, tourIdx = 0, touring = true, idle = 0, hold = 0, loadShown = 1;
let st = rampStart();
let frame = 0, last = 0, visible = false;
const where = (s) => (s.mode === "air" ? (s.fell ? "dropped off" : "half roll, braking") : s.mode === "done" ? (s.fell ? "fell" : "landed") : s.s < LIN ? "run up" : s.s < LIN + Math.PI * R / 2 ? "into the loop" : s.s < LIN + Math.PI * R / 2 + LV ? "on the wall" : s.s < LIN + Math.PI * R + LV ? "over the top" : "on the ceiling");
function pose(s) {
  const th = s.th, ph = s.phi || 0;
  const ex = [Math.cos(th), 0, Math.sin(th)], ey0 = [0, 1, 0], ez0 = [-Math.sin(th), 0, Math.cos(th)];
  const ey = add3(mul3(ey0, Math.cos(ph)), mul3(ez0, Math.sin(ph)));
  const ez = add3(mul3(ey0, -Math.sin(ph)), mul3(ez0, Math.cos(ph)));
  return { o: [s.x * U, 0, s.z * U + RH], ex, ey, ez };
}
function draw() {
  const p = pose(st);
  carG.innerHTML = carSvg(p.o, p.ex, p.ey, p.ez, { T: st.T, Tmax: TMAX, fans: st.mode === "track" ? fan : 0 });
  const W = st.mode === "track" ? st.W / (M * GRAV) : 0;
  loadShown += (W - loadShown) * 0.25;
  fanShown += (fan - fanShown) * 0.25;
  loadN.setAttribute("d", needleAt(GAUGE.load, loadAngle(loadShown), DIAL_TOP + 0.2, DIAL_R - 4));
  fanN.setAttribute("d", needleAt(GAUGE.fans, fanAngle(fanShown), DIAL_TOP + 4.2, DIAL_R - 4));
  const thrust = st.T.reduce((a, b) => a + b, 0) / (M * GRAV);
  const text = "fans " + fan.toFixed(2) + " mg · " + (st.mode === "track" ? "tyre load " + W.toFixed(2) + " mg" : thrust > 0.01 ? "thrust " + thrust.toFixed(2) + " mg" : "no contact") + " · " + where(st);
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (st.mode === "done") {
    hold += dt;
    if (hold > 1.6) {
      hold = 0;
      st = rampStart();
      if (touring) { tourIdx = (tourIdx + 1) % TOUR.length; fan = TOUR[tourIdx]; }
    }
  } else {
    const n = 8;
    for (let i = 0; i < n; i++) rampStep(st, fan * M * GRAV, dt / n);
  }
  if (!touring && (idle += dt) > 8) touring = true;
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
const setFan = (v) => { touring = false; idle = 0; fan = Math.round(clamp(v, 0, 1.5) * 20) / 20; run(); if (still.matches) draw(); };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (e) => { const b = svg.getBoundingClientRect(); setFan(clamp(((e.clientX - b.left) / b.width - 0.1) / 0.8, 0, 1) * 1.5); });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowUp") setFan(fan + 0.1);
  else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setFan(fan - 0.1);
  else if (e.key === " " || e.key === "Enter") { st = rampStart(); hold = 0; }
  else return;
  e.preventDefault();
});
if (still.matches) {
  // one still: the car on the ceiling with the fans at 1.3 mg
  while (st.mode === "track" && st.s < LIN + Math.PI * R + LV + 2) rampStep(st, 1.3 * M * GRAV, 0.005);
}
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "The ramp",
  hint: "Move across to set the fans",
  readout: "fans 1.30 mg",
  keys: [
    { mark: "lit", label: "The car, driven by the model" },
    { mark: "green", label: "Fan setting that holds the car on the ceiling" },
    { mark: "red", label: "Tyre load below zero, where the car leaves the track" },
  ],
  caption:
    "Track sizes follow the course model, a 6 m radius, 4 m of wall and 6 m of ceiling. Tyre load is m v²/R plus the fan suction plus the part of gravity pushing the car onto the track. With the fans at 1.3 times the car's weight it stays on the ceiling with a little to spare, drops off the end, half rolls on its thrusters and brakes for the landing. Below 1 mg it falls off where the ceiling starts. Derived again for GelasTinta from the Lecture 15 notes. These are not Tesla's numbers.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Fan suction in multiples of the car's weight. Arrow keys change it, space restarts the run." aria-valuemin="0" aria-valuemax="1.5" aria-valuenow="1.3">${svg}</div>`,
});
const html = k.pageHtml({ title: "The ramp · Fig 1", theme, body, script: pageKit() + live, width: 680 }).replace("</style>", EXTRA_CSS + "</style>");
const out = join(HERE, theme === "light" ? "ramp-light.html" : "ramp.html");
writeFileSync(out, html);
console.log("wrote", out, (html.length / 1024).toFixed(0), "KB");
