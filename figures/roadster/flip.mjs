// Fig 2 · The kickflip. A bench model of the second live demo: the car takes a kicker, rolls once about its long axis
// on its four vertical thrusters while it clears five parked cars, and lands. The flight comes from the re-derived
// model in model.mjs (Lecture 15 Newton–Euler, course parameters): roll torque b (T1 + T4 − T2 − T3) follows a
// minimum jerk roll of 360° in 1.8 s, the collective pushes only while the nozzles point mostly down, and a last burn
// brakes the landing. Run: node flip.mjs [--light]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as k from "/home/claude/anatomy/kit/iso-kit.mjs";
import * as G from "/home/claude/anatomy/kit/lathe.mjs";
import * as M from "./model.mjs";
import { CAR_RUNTIME, EXTRA_CSS, HERE, pageKit, U } from "./shared.mjs";

const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 660, HEIGHT = 262;
const FLIGHT = M.kickflip();
const LAND = FLIGHT.findIndex((r) => r[4] > 6.28 && r[3] <= M.RIDE + 0.001);
const T_END_ABS = FLIGHT[LAND][0] + 0.7;
const T0 = FLIGHT.find((r) => r[1] >= -4)[0];
const ROWS = FLIGHT.filter((r) => r[0] >= T0 - 1e-9 && r[0] <= T_END_ABS + 0.02).map((r) => [+(r[0] - T0).toFixed(3), ...r.slice(1)]);
const T_LAUNCH = ROWS.find((r) => r[1] >= M.KICK.x1)[0];
const T_LANDR = FLIGHT[LAND][0] - T0;
const T_END = T_END_ABS - T0;
const PLATE = { x: -90, y: -64, w: 690, d: 150, r: 10 };
const PLATE_H = 10, FOOT_H = 6;
const ROLL = [-30, 50], BARS = [548, 46], DIAL_R = 15, DIAL_Z = 4, DIAL_H = 6, DIAL_TOP = DIAL_Z + DIAL_H;
const BAR = { w: 7, gap: 3, h: 24 };
const VAN = { body: [[-24, -2.5], [24, -2.5], [24.6, 4], [22, 19], [-24, 19.5], [-24.6, 0]], cab: null, half: 10.5, wheelX: [-17, 17] };

const apex = Math.max(...ROWS.map((r) => r[3]));
const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [200, 0, apex * U + 14], [PLATE.x + PLATE.w, 0, 30]],
  WIDTH,
  HEIGHT,
  { pad: 10, azimuth: 100, elevation: 24 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style = {}) => k.solidSvg(paths, { tone: "mid", ...style });
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const FY = () => G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);

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
  // the road: an inlaid strip with edge lines and a start plate
  const road = { x: PLATE.x + 16, y: -24, w: PLATE.w - 32, d: 48, r: 3 };
  out.push(S(k.slabOf(road, 0, 0.6, P, 4, 0.4), { tone: "lo" }));
  for (const y of [-20, 20]) out.push(L(k.lineOnTop([road.x, y], [road.x + road.w, y], 0.6, P), { tone: "faint" }));
  const start = { x: -42, y: -20, w: 5, d: 40, r: 1 };
  out.push(S(k.slabOf(start, 0.6, 0.5, P, 2), { tone: "mid" }));
  // landing mat
  const mat = { x: 430, y: -21, w: 100, d: 42, r: 2 };
  out.push(S(k.slabOf(mat, 0.6, 0.8, P, 3, 0.4), { tone: "lo" }));
  for (let x = mat.x + 8; x < mat.x + mat.w - 4; x += 8) out.push(L(k.lineOnTop([x, mat.y], [x, mat.y + mat.d], 1.4, P), { tone: "faint" }));
  // metre rule along the front edge
  const strip = { x: PLATE.x + 24, y: PLATE.y + PLATE.d - 16, w: PLATE.w - 48, d: 8, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 6, strip.x + strip.w - 6, 10, 5, strip.y + 0.8, 0.6, [2.4, 4.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 3, strip.y + 4, 0.6]), at([strip.x + strip.w - 3, strip.y + 4, 0.6])], { size: 0.45 }));
  return out.join("");
}
function kicker() {
  const { x0, x1, h } = M.KICK;
  const tri = [[x0 * U, 0.6], [x1 * U, 0.6], [x1 * U, h * U + 0.6]];
  const out = [S(G.prismOf(FY(), tri, -15, 15, P))];
  // a lip plate on the top edge and the cross ribs underneath
  out.push(S(G.prismOf(FY(), [[x1 * U - 1.2, h * U - 1], [x1 * U, h * U - 1], [x1 * U, h * U + 1.2], [x1 * U - 1.2, h * U + 0.8]], -15.5, 15.5, P), { tone: "hi" }));
  out.push(D([-11, 0, 11].map((y) => at([x1 * U - 0.6, y, h * U + 1])), { size: 0.45 }));
  return out.join("");
}
// the dotted path of the car's centre, from the kicker lip to the landing
const trail = () => {
  const pts = ROWS.filter((r) => r[0] >= T_LAUNCH && r[0] <= T_LANDR).map((r) => at([r[1] * U, r[2] * U, r[3] * U]));
  return k.wireSvg(pts[0], pts[pts.length - 1], { via: pts.slice(1, -1), dotted: true, tone: "faint", size: 1 });
};
const ARC0 = 0, ARC = 2 * Math.PI;
function instruments() {
  const out = [];
  const [x, y] = ROLL;
  const plinth = { x: x - 21, y: y - 19, w: 42, d: 38, r: 4 };
  out.push(`<path class="iso-halo" d="${k.haloOf(plinth, 0, 4, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(plinth, 0, DIAL_Z, P, 5, 0.6)));
  out.push(D(k.corners(plinth, 4).map(([a, b]) => at([a, b, DIAL_Z])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const t = k.radialTicks(x, y, DIAL_R - 3, 36, 9, DIAL_TOP, [1.1, 2.4], P, ARC0, ARC);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP, P, 16), { tone: "mid" }));
  // the thrust meter: a block with four slots, one bar per thruster
  const [bx, by] = BARS;
  const block = { x: bx - 4, y: by - 9, w: 4 * BAR.w + 3 * BAR.gap + 8, d: 18, r: 2 };
  out.push(S(k.slabOf(block, 0, 3, P, 3, 0.5)));
  out.push(D([at([block.x + 2, block.y + 2, 3]), at([block.x + block.w - 2, block.y + 2, 3])], { size: 0.45 }));
  // a back plate with the 1 mg line: the course lets each thruster push up to the car's weight
  const back = { x: block.x, y: by - 9, w: block.w, d: 2, r: 0.4 };
  out.push(S(k.slabOf(back, 3, BAR.h + 2, P, 2, 0.3)));
  out.push(L(k.segment([block.x + 1, by - 7, 3 + BAR.h], [block.x + block.w - 1, by - 7, 3 + BAR.h], P), { tone: "red" }));
  return out.join("");
}
const barSvg = (i, f) => {
  const [bx, by] = BARS;
  const x = bx + i * (BAR.w + BAR.gap);
  const h = Math.max(0.4, Math.min(1.05, f) * BAR.h);
  return k.solidSvg(k.slabOf({ x, y: by - 4, w: BAR.w, d: 8, r: 1 }, 3, h, P, 2, 0.3), { tone: f > 0.02 ? "hi" : "lo", lit: f > 0.02 });
};
const needleAt = ([x, y], a, z, r) => k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * r, y - Math.cos(a) * r], z, P);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A long bench with a road, a kicker ramp and five parked cars in a row. A small car drives up the kicker, rolls once about its long axis in the air while clearing the parked cars, and lands on a mat at the far end. A dial reads the roll angle and four bars show how hard each of the four downward thrusters pushes.",
  body: [
    bench(),
    `<g data-part="parked"></g>`,
    kicker(),
    trail(),
    `<g data-part="car"></g>`,
    instruments(),
    `<g data-part="bars"></g>`,
    `<path data-part="roll-needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(ROLL, 0, DIAL_TOP + 0.2, DIAL_R - 4)}" style="stroke-width:1.1"/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
${CAR_RUNTIME}
const U = ${U}, TMAX = ${M.TMAX}, M = ${M.M}, GRAV = ${M.GRAV};
const ROWS = ${JSON.stringify(ROWS)};
const PARKED = ${JSON.stringify(M.PARKED)};
const VAN = ${JSON.stringify(VAN)};
const ROLL = ${JSON.stringify(ROLL)}, BARS = ${JSON.stringify(BARS)}, BAR = ${JSON.stringify(BAR)}, DIAL_TOP = ${DIAL_TOP}, DIAL_R = ${DIAL_R};
const T_END = ${T_END}, T_LAUNCH = ${T_LAUNCH}, T_LAND = ${T_LANDR};
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};
const barSvg = ${barSvg.toString().replace(/k\.solidSvg/g, "solidSvg").replace(/k\.slabOf/g, "slabOf")};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const carG = svg.querySelector('[data-part="car"]');
const parkedG = svg.querySelector('[data-part="parked"]');
const barsG = svg.querySelector('[data-part="bars"]');
const rollN = svg.querySelector('[data-part="roll-needle"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const flat = [1, 0, 0], side = [0, 1, 0], up = [0, 0, 1];
parkedG.innerHTML = PARKED.map((p) => carSvg([p.x * U, 0, ${M.RIDE} * U], flat, side, up, { lit: false, tone: "lo", shape: p.h > 2 ? VAN : null })).join("");
const sample = (t) => {
  const x = clamp(t / 0.02, 0, ROWS.length - 1), i = Math.min(ROWS.length - 2, Math.floor(x)), f = x - i;
  return ROWS[i].map((v, j) => v + (ROWS[i + 1][j] - v) * f);
};
let t = 0, target = 0, touring = true, idle = 0, frame = 0, last = 0, visible = false, hold = 0;
function draw() {
  const r = sample(t);
  const [, x, y, z, ph, pitch] = r;
  const T = r.slice(6, 10);
  const ex = [Math.cos(pitch), 0, Math.sin(pitch)], ey0 = [0, 1, 0], ez0 = [-Math.sin(pitch), 0, Math.cos(pitch)];
  const ey = add3(mul3(ey0, Math.cos(ph)), mul3(ez0, Math.sin(ph)));
  const ez = add3(mul3(ey0, -Math.sin(ph)), mul3(ez0, Math.cos(ph)));
  carG.innerHTML = carSvg([x * U, y * U, z * U], ex, ey, ez, { T, Tmax: TMAX });
  barsG.innerHTML = T.map((q, i) => barSvg(i, q / TMAX)).join("");
  rollN.setAttribute("d", needleAt(ROLL, ph, DIAL_TOP + 0.2, DIAL_R - 4));
  const sum = T.reduce((a, b) => a + b, 0) / (M * GRAV);
  const phase = t < T_LAUNCH ? "run up" : t < T_LAND ? "in the air" : "landed";
  const text = "t " + t.toFixed(2) + " s · roll " + Math.round((ph * 180) / Math.PI) + "° · thrust " + sum.toFixed(2) + " mg · " + phase;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) {
    if (t >= T_END) { hold += dt; if (hold > 1.2) { hold = 0; t = 0; } }
    else t = Math.min(T_END, t + dt * 0.75);
  } else {
    t += (target - t) * (1 - Math.exp(-dt / 0.12));
    if ((idle += dt) > 6) touring = true;
  }
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
const scrub = (v) => { touring = false; idle = 0; target = clamp(v, 0, T_END); if (still.matches) { t = target; draw(); } run(); };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (e) => { const b = svg.getBoundingClientRect(); scrub(clamp(((e.clientX - b.left) / b.width - 0.08) / 0.84, 0, 1) * T_END); });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowUp") scrub(target + 0.1);
  else if (e.key === "ArrowLeft" || e.key === "ArrowDown") scrub(target - 0.1);
  else if (e.key === "Home") scrub(0);
  else if (e.key === "End") scrub(T_END);
  else return;
  e.preventDefault();
});
if (still.matches) t = (T_LAUNCH + T_LAND) / 2 - 0.25;
draw();
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "The kickflip",
  hint: "Move across to scrub the flight",
  readout: "t 0.00 s",
  keys: [
    { mark: "lit", label: "The car, and the thrusters that are firing" },
    { mark: "red", label: "Each thruster's limit in the course model, the car's weight" },
    { mark: "dotted", label: "Path of the car's centre" },
  ],
  caption:
    "The model leaves the kicker at 16 m/s, rolls 360° in 1.8 s and clears the tallest parked car by about 0.6 m. Thrust only helps lift while the nozzles point mostly down, so for half the roll the car is simply falling. The sideways push during the roll moves it about 1.8 m off the centre line, which a real controller would trim. Derived again for GelasTinta from the Lecture 15 notes with the course's parameters, which let each thruster push as hard as the car weighs. A 200 L cold gas tank gives far less.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Flight time. Arrow keys step through the flight." aria-valuemin="0" aria-valuemax="${T_END.toFixed(2)}" aria-valuenow="0">${svg}</div>`,
});
const html = k.pageHtml({ title: "The kickflip · Fig 2", theme, body, script: pageKit() + live, width: 700 }).replace("</style>", EXTRA_CSS + "</style>");
const out = join(HERE, theme === "light" ? "flip-light.html" : "flip.html");
writeFileSync(out, html);
console.log("wrote", out, (html.length / 1024).toFixed(0), "KB", "launch", T_LAUNCH, "land", T_LANDR, "end", T_END, "gap", FLIGHT.minGap.toFixed(2));
