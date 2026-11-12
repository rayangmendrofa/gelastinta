// Fig: a bench diffusion rig for one 2 mm voxel of brain (Talk 12, Learning brain).
// Built with the anatomy kit (MIT): set ANATOMY to the kit folder (default /home/claude/anatomy-ref).
//   node teardowns/gt-brain-figure/build.mjs            -> src/static/teardowns/learning-brain.html
//   node teardowns/gt-brain-figure/build.mjs --out x.html
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REGIONS, TIMES, SCAN, TASK, DIAL_TURN, MAGNIFY } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..", "..");
const KITDIR = process.env.ANATOMY || "/home/claude/anatomy-ref";
const k = await import(pathToFileURL(join(KITDIR, "kit", "iso-kit.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(KITDIR, "scripts", "inline-kit.mjs")).href);
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(SITE, "src", "static", "teardowns", "learning-brain.html");

const WIDTH = 640;
const HEIGHT = 320;
const AZ = 52;

// ── world plan (units ~ 1 px) ─────────────────────────────────────────────
const PLATE = { x: -196, y: -84, w: 392, d: 176, r: 9 };
const PLATE_H = 12, FOOT_H = 5;

const PLINTH = { x: -78, y: -40, w: 156, d: 76, r: 4 };
const PLINTH_H = 8;
const COIL_X = 60, COIL_T = 9, COIL_Y0 = -32, COIL_D = 62, COIL_Z0 = PLINTH_H, COIL_H = 62;
const STAGE = [0, -2];
const CUBE = 30, CUBE_Z = PLINTH_H + 14, CUBE_TOP = CUBE_Z + CUBE;
const BRIDGE = { x: -COIL_X - COIL_T / 2, y: COIL_Y0, w: COIL_X * 2 + COIL_T, d: 7, r: 1.2 };
const BRIDGE_Z = COIL_Z0 + COIL_H;

const KEYPAD = { x: -184, y: 24, w: 66, d: 40, r: 3 };
const KEYPAD_H = 7;
const KEY_W = 11, KEY_D = 20, KEY_GAP = 3.6, KEY_H = 4.2;
const KEY_X0 = KEYPAD.x + 7;
const KEY_Y = KEYPAD.y + 12;

const RAIL_Y = [56, 68], RAIL_FROM = -30, RAIL_TO = 150;
const STOPS = [0, 60, 120];
const CAR = { x: -13, y: 51, w: 26, d: 22, r: 2.5 };
const CAR_Z = 3, CAR_TOP = 9;
const STRIP = { x: -22, y: 77, w: 164, d: 7, r: 1 };

const BAR = { x: 92, y: -70, w: 98, d: 10, r: 2 };   // the SANDI dial bar
const BAR_Z = 30, BAR_H = 6;
const DIALS = [
  { at: [66, -63], r: 13 },                           // MD, on its own post
  { at: [104, -65], r: 11.5 }, { at: [141, -65], r: 11.5 }, { at: [178, -65], r: 11.5 },
];
const DIAL_Z = 40, DIAL_H = 7;
const MD_POST_Z = 24;

const KNOB = [168, 34];
const KNOB_ANG = [-66, -22, 22, 66].map((d) => (d * Math.PI) / 180);
const LABEL = { x: -176, y: 70, w: 54, d: 20, r: 1.6 };

const fitPoints = [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, BRIDGE_Z + 6], [-COIL_X, COIL_Y0, BRIDGE_Z + 6], [COIL_X, COIL_Y0 + COIL_D, BRIDGE_Z], ...DIALS.map((d) => [d.at[0], d.at[1], DIAL_Z + DIAL_H + 2])];
const P = k.fitProjection(fitPoints, WIDTH, HEIGHT, { pad: 16, azimuth: AZ });

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const flat = (pts) => k.pathOf(pts.map(at));
const closed = (pts) => k.pathOf(pts.map(at), true);

// a rounded rectangle drawn on a vertical face x = const, in (y, z)
function faceRect(x, y0, y1, z0, z1, r, steps = 4) {
  const pts = [];
  const corner = (cy, cz, a0) => { for (let i = 0; i <= steps; i++) { const a = a0 + (i / steps) * (Math.PI / 2); pts.push([x, cy + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  corner(y1 - r, z1 - r, 0); corner(y0 + r, z1 - r, Math.PI / 2); corner(y0 + r, z0 + r, Math.PI); corner(y1 - r, z0 + r, Math.PI * 1.5);
  return closed(pts);
}
// a rounded rectangle on a vertical face y = const, in (x, z)
function faceRectY(y, x0, x1, z0, z1, r, steps = 4) {
  const pts = [];
  const corner = (cx, cz, a0) => { for (let i = 0; i <= steps; i++) { const a = a0 + (i / steps) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); } };
  corner(x1 - r, z1 - r, 0); corner(x0 + r, z1 - r, Math.PI / 2); corner(x0 + r, z0 + r, Math.PI); corner(x1 - r, z0 + r, Math.PI * 1.5);
  return closed(pts);
}

// ── base ──────────────────────────────────────────────────────────────────
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 7.5, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.8, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  const groove = k.sideSeam(PLATE, -PLATE_H + 4, P, 8);
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(groove, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  return out.join("");
}

function labelPlate() {
  const out = [];
  out.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([LABEL.x + 5, LABEL.y + 7.5], 0.8, P, "x"), "300 mT/m", { size: 4.2, tone: "mid" }));
  const rules = [[LABEL.x + 5, LABEL.x + 44], [LABEL.x + 5, LABEL.x + 34]];
  rules.forEach(([a, b], i) => out.push(L(k.lineOnTop([a, LABEL.y + 12 + i * 3.6], [b, LABEL.y + 12 + i * 3.6], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([LABEL.x + LABEL.w - 3.4, LABEL.y + 3.4, 0.8]), at([LABEL.x + LABEL.w - 3.4, LABEL.y + LABEL.d - 3.4, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ── the gradient set: plinth, two planar coils, bridge, stage and the voxel ──
function plinth() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PLINTH, 4), 0, 0.1, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(PLINTH, 0, PLINTH_H, P, 4, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLINTH, 4), PLINTH_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(PLINTH, 5).map(([x, y]) => at([x, y, PLINTH_H])), { size: 0.45 }));
  return out.join("");
}

// the scan lamps: eight shells (seven b values plus the b = 0 images) on the plinth front
const LAMP_X = (i) => -42 + i * 12;
const LAMP_Y = PLINTH.y + PLINTH.d;
function lamps() {
  const out = [];
  for (let i = 0; i < 8; i++) out.push(L(k.sideRing([LAMP_X(i), LAMP_Y, PLINTH_H / 2], 1.6, "y", P, 14), { tone: "lo" }));
  return out.join("");
}

function coil(x0, inner) {
  // one planar gradient coil: a former standing on two feet, windings on its faces, a terminal block
  const out = [];
  const plan = { x: x0, y: COIL_Y0, w: COIL_T, d: COIL_D, r: 1.2 };
  for (const fy of [COIL_Y0 + 6, COIL_Y0 + COIL_D - 16]) {
    const foot = { x: x0 - 5, y: fy, w: COIL_T + 10, d: 10, r: 1 };
    out.push(S(k.slabOf(foot, COIL_Z0, 4, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([foot.x + 2.4, foot.y + 5, COIL_Z0 + 4]), at([foot.x + foot.w - 2.4, foot.y + 5, COIL_Z0 + 4])], { size: 0.45 }));
  }
  const xf = x0 + COIL_T;     // the +x face is the one facing the viewer
  const wind = [];
  for (let i = 0; i < 5; i++) wind.push(faceRect(xf, COIL_Y0 + 5 + i * 3.4, COIL_Y0 + COIL_D - 5 - i * 3.4, COIL_Z0 + 6 + i * 3.4, COIL_Z0 + COIL_H - 5 - i * 3.4, 6 - i * 0.8));
  const seam = k.sideSeam(plan, COIL_Z0 + COIL_H - 2.4, P, 3);
  out.push(S(k.slabOf(plan, COIL_Z0 + 2, COIL_H - 2, P, 3, 0.6), { tone: inner ? "mid" : "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(`<g data-part="wind-${inner ? "a" : "b"}">${L(wind.join(""), { tone: "lo" })}</g>`);
  // front edge windings (the +y face shows the coil's turns as a stack of lines ending on the face edges)
  const yf = COIL_Y0 + COIL_D;
  const turns = [];
  for (let i = 0; i < 5; i++) turns.push(faceRectY(yf, x0 + 1.6, xf - 1.6, COIL_Z0 + 6 + i * 3.4, COIL_Z0 + COIL_H - 5 - i * 3.4, 0.8, 2));
  out.push(L(turns.join(""), { tone: "faint" }));
  // terminal block on the outer face
  if (!inner) {
    const tb = { x: xf, y: COIL_Y0 + 8, w: 5, d: 12, r: 1 };
    out.push(S(k.slabOf(tb, COIL_Z0 + 8, 8, P, 3, 0.4), { tone: "mid" }));
    out.push(D([at([tb.x + 2.5, tb.y + 3.5, COIL_Z0 + 16]), at([tb.x + 2.5, tb.y + 8.5, COIL_Z0 + 16])], { size: 0.5 }));
  }
  return out.join("");
}

function bridge() {
  const out = [];
  out.push(S(k.slabOf(BRIDGE, BRIDGE_Z, 6, P, 3, 0.6), { tone: "mid" }));
  out.push(D([-COIL_X + 4, -20, 20, COIL_X + 1].map((x) => at([x, BRIDGE.y + 3.5, BRIDGE_Z + 6])), { size: 0.45 }));
  // a cable clamp on the bridge
  const clamp = { x: -8, y: BRIDGE.y - 1, w: 16, d: 9, r: 1.2 };
  out.push(S(k.slabOf(clamp, BRIDGE_Z + 6, 3, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([clamp.x + 3, clamp.y + 4.5, BRIDGE_Z + 9]), at([clamp.x + clamp.w - 3, clamp.y + 4.5, BRIDGE_Z + 9])], { size: 0.45 }));
  return out.join("");
}

function stage() {
  const [x, y] = STAGE;
  const out = [];
  out.push(S(k.cylinder(x, y, 15, PLINTH_H, 2.2, P, 48, 0.5), { tone: "mid" }));
  const t = k.radialTicks(x, y, 14.4, 36, 9, PLINTH_H + 2.2, [1, 2.2], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 6, PLINTH_H + 2.2, CUBE_Z - PLINTH_H - 4.6, P, 28), { tone: "mid", crease: "none" }));
  out.push(L(k.sideArc(x, y, 6, PLINTH_H + 6, P, 16), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 9, CUBE_Z - 2.4, 2.4, P, 36, 0.4), { tone: "mid" }));
  return out.join("");
}

const CUBE_PLAN = { x: STAGE[0] - CUBE / 2, y: STAGE[1] - CUBE / 2, w: CUBE, d: CUBE, r: 1 };
function voxel() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CUBE_PLAN, 2), CUBE_Z, 0.1, P)}" style="filter:blur(3px);opacity:.25"/>`];
  const seam = k.sideSeam(CUBE_PLAN, CUBE_Z + CUBE * 0.5, P, 3);
  out.push(S(k.slabOf(CUBE_PLAN, CUBE_Z, CUBE, P, 3, 0.8), { tone: "hi", lit: true, crease: "lo", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(CUBE_PLAN, 2.4), CUBE_TOP, P, 3), { tone: "faint" }));
  return out.join("");
}
// the cartoon on the voxel's top face: 3 x 3 cell bodies, 12 possible links between them
const CELL = 8.6;
const CELLS = [];
for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) CELLS.push([STAGE[0] + i * CELL, STAGE[1] + j * CELL]);
const LINKS = [[0, 1], [4, 5], [6, 7], [1, 4], [3, 4], [7, 8], [2, 5], [0, 3], [5, 8], [3, 6], [4, 7], [1, 2]];

// ── keypad: four keys for the four fingers of the left hand (1 = little finger, 4 = index) ──
const keyPlan = (i) => ({ x: KEY_X0 + i * (KEY_W + KEY_GAP), y: KEY_Y, w: KEY_W, d: KEY_D, r: 1.2 });
function keypad() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(KEYPAD, 3), 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(KEYPAD, 0, KEYPAD_H, P, 4, 0.8), { tone: "mid" }));
  const well = { x: KEY_X0 - 2.4, y: KEY_Y - 2.4, w: 4 * KEY_W + 3 * KEY_GAP + 4.8, d: KEY_D + 4.8, r: 2 };
  out.push(L(k.planOutline(well, KEYPAD_H, P, 4), { tone: "lo" }));
  out.push(D([at([KEYPAD.x + 4, KEYPAD.y + 4, KEYPAD_H]), at([KEYPAD.x + KEYPAD.w - 4, KEYPAD.y + 4, KEYPAD_H])], { size: 0.45 }));
  // status lamp seat
  out.push(L(k.ring(KEYPAD.x + KEYPAD.w - 8, KEYPAD.y + 5.5, 2.4, KEYPAD_H, P, 16), { tone: "lo" }));
  return out.join("");
}
function key(i) {
  const plan = keyPlan(i);
  const out = [];
  out.push(S(k.slabOf(plan, KEYPAD_H, KEY_H, P, 3, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), KEYPAD_H + KEY_H, P, 3), { tone: "faint" }));
  // one to four dots: the finger number, as on a tactile key
  const n = i + 1;
  const dots = [];
  for (let d = 0; d < n; d++) dots.push(at([plan.x + plan.w / 2, plan.y + 5 + d * 3.2, KEYPAD_H + KEY_H]));
  out.push(D(dots, { size: 0.55, tone: "hi" }));
  return out.join("");
}

// ── timeline: a carriage on rails that stops at baseline, 30 min and 24 h ──
function rails() {
  const out = [];
  for (const y of RAIL_Y) {
    out.push(S(k.slabOf({ x: RAIL_FROM, y: y - 2.5, w: RAIL_TO - RAIL_FROM, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
    out.push(D([RAIL_FROM + 5, RAIL_TO - 5].map((x) => at([x, y, 3])), { size: 0.4 }));
  }
  for (const x of [RAIL_FROM - 5, RAIL_TO]) {
    out.push(S(k.slabOf({ x, y: RAIL_Y[0] - 6, w: 5, d: RAIL_Y[1] - RAIL_Y[0] + 12, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2.5, RAIL_Y[0] - 2, 7]), at([x + 2.5, RAIL_Y[1] + 2, 7])], { size: 0.45 }));
  }
  out.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 6, 10, STRIP.y + 0.6, 0.6, [2, 4.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // detent notches: a small seat at each stop on the strip's far edge
  for (const x of STOPS) out.push(L(k.ring(x, STRIP.y + 5.4, 0.9, 0.6, P, 10), { tone: "mid" }));
  return out.join("");
}
function carriage() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CAR, 3), CAR_Z, 0.1, P)}" style="filter:blur(3px)"/>`];
  for (const [bx, by] of [[CAR.x + 1, RAIL_Y[0] - 3.5], [CAR.x + CAR.w - 7, RAIL_Y[0] - 3.5], [CAR.x + 1, RAIL_Y[1] - 3.5], [CAR.x + CAR.w - 7, RAIL_Y[1] - 3.5]]) {
    out.push(S(k.slabOf({ x: bx, y: by, w: 6, d: 7, r: 1 }, 1.5, 3, P, 2), { tone: "lo" }));
  }
  out.push(S(k.slabOf(CAR, CAR_Z, CAR_TOP - CAR_Z, P, 4, 0.6), { tone: "mid" }));
  out.push(D([-8, 0, 8].map((x) => at([x, CAR.y + CAR.d - 2.4, CAR_TOP])), { size: 0.4, tone: "lo" }));
  // pointer nose over the strip
  out.push(S(k.slabOf({ x: -2.2, y: CAR.y + CAR.d - 1, w: 4.4, d: 6.2, r: 0.8 }, CAR_Z + 2, 2.4, P, 2), { tone: "hi", crease: "lo" }));
  out.push(L(k.lineOnTop([0, CAR.y + CAR.d - 1], [0, CAR.y + CAR.d + 5.2], CAR_Z + 4.4, P), { tone: "hi" }));
  // knurled thumb wheel on top
  out.push(S(k.cylinder(-6, CAR.y + 9, 3.4, CAR_TOP, 4, P, 22), { tone: "mid" }));
  out.push(L(k.knurl(-6, CAR.y + 9, 3.4, CAR_TOP, CAR_TOP + 4, 20, P), { tone: "lo" }));
  return out.join("");
}

// ── dials: MD on its own post (the single number DTI gives), three SANDI dials on one bar ──
function dialBody({ at: [x, y], r }) {
  const out = [];
  const top = DIAL_Z + DIAL_H;
  out.push(S(k.cylinder(x, y, r, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, r, top - 2.6, top, 72, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, r, top - 2.6, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, r - 2, top, P, 64), { tone: "lo" }));
  const t = k.radialTicks(x, y, r - 2.6, 40, 5, top, [1.1, 2.4], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([x, y - (r - 2.6)], [x, y - (r - 6.4)], top, P), { tone: "hi" }));
  out.push(L(k.ring(x, y, 1.4, top, P, 16), { tone: "mid" }));
  return out.join("");
}
function dialBar() {
  const out = [];
  for (const px of [BAR.x + 10, BAR.x + BAR.w - 10]) {
    out.push(S(k.cylinder(px, BAR.y + 5, 6, 0, 2.2, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(px, BAR.y + 5, 2.6, 2.2, BAR_Z - 2.2, P, 20), { tone: "mid", crease: "none" }));
    out.push(L(k.sideArc(px, BAR.y + 5, 2.6, 12, P, 14), { tone: "faint" }));
  }
  out.push(S(k.slabOf(BAR, BAR_Z, BAR_H, P, 3, 0.6), { tone: "mid" }));
  for (const d of DIALS.slice(1)) {
    out.push(S(k.cylinder(d.at[0], d.at[1], 3.2, BAR_Z + BAR_H, DIAL_Z - BAR_Z - BAR_H, P, 20), { tone: "mid", crease: "none" }));
  }
  out.push(D([BAR.x + 3, BAR.x + BAR.w - 3].map((x) => at([x, BAR.y + 5, BAR_Z + BAR_H])), { size: 0.45 }));
  return out.join("");
}
function mdPost() {
  const [x, y] = DIALS[0].at;
  const out = [];
  out.push(S(k.cylinder(x, y, 8, 0, 2.4, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 3, 2.4, DIAL_Z - 2.4, P, 20), { tone: "mid", crease: "none" }));
  out.push(L(k.sideArc(x, y, 3, MD_POST_Z, P, 14), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 4.2, MD_POST_Z - 2, 4, P, 20), { tone: "mid" }));
  return out.join("");
}

// ── region selector: a knob with four detents ──
function knobBase() {
  const [x, y] = KNOB;
  const out = [];
  out.push(S(k.cylinder(x, y, 14, 0, 2.6, P, 48, 0.6), { tone: "mid" }));
  const z = 2.6;
  const ticks = KNOB_ANG.map((a) => k.lineOnTop([x + Math.sin(a) * 9.2, y - Math.cos(a) * 9.2], [x + Math.sin(a) * 13.2, y - Math.cos(a) * 13.2], z, P)).join("");
  out.push(L(k.ring(x, y, 9.2, z, P, 40), { tone: "lo" }), L(ticks, { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 7, z, 6.5, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(x, y, 7, z + 1.5, z + 6.5, 40, P), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, 7, z + 1.5, P, 24), { tone: "faint" }));
  out.push(L(k.ring(x, y, 1.3, z + 6.5, P, 14), { tone: "mid" }));
  return out.join("");
}
const KNOB_TOP = 9.1;
const knobPointer = (angle) => k.lineOnTop([KNOB[0] + Math.sin(angle) * 1.3, KNOB[1] - Math.cos(angle) * 1.3], [KNOB[0] + Math.sin(angle) * 6.2, KNOB[1] - Math.cos(angle) * 6.2], KNOB_TOP, P);

// ── wires (connectors with terminal dots that land on parts) ──
function wires() {
  const out = [];
  // coil terminal block -> dial bar post foot, along the plate
  const tb = [COIL_X + COIL_T + 5, COIL_Y0 + 14, COIL_Z0 + 12];
  out.push(k.wireSvg(at(tb), at([BAR.x + 10 - 6, BAR.y + 5, 1.1]), { via: [at([COIL_X + COIL_T + 12, COIL_Y0 + 14, COIL_Z0 + 12]), at([COIL_X + COIL_T + 12, COIL_Y0 + 14, 0.3]), at([BAR.x + 2, COIL_Y0 + 14, 0.3]), at([BAR.x + 2, BAR.y + 5, 0.3])], tone: "lo", size: 1 }));
  // keypad -> plinth: the training trigger
  out.push(k.wireSvg(at([KEYPAD.x + KEYPAD.w, KEYPAD.y + 30, 3.5]), at([PLINTH.x, PLINTH.y + 60, 4]), { via: [at([KEYPAD.x + KEYPAD.w + 10, KEYPAD.y + 30, 0.3]), at([PLINTH.x - 10, PLINTH.y + 60, 0.3])], tone: "lo", size: 1 }));
  return out.join("");
}

// ── assemble ─────────────────────────────────────────────────────────────
const START = 0;
const needle = (d, turn) => {
  const a = turn * Math.PI * 2, [x, y] = d.at, top = DIAL_Z + DIAL_H + 0.2;
  return k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (d.r - 3.6), y - Math.cos(a) * (d.r - 3.6)], top, P);
};
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A bench diffusion rig built around one 2 millimetre cube of brain. Two flat gradient coils stand either side of the cube, a four key pad on the left plays the finger sequence, a carriage on rails sets the scan time (before learning, 30 minutes after, 24 hours after), a knob picks the brain region, and four dial gauges read the change from baseline: mean diffusivity on its own post, and the soma, neurite and extracellular fractions on a shared bar.",
  body: [
    plate(),
    labelPlate(),
    wires(),
    dialBar(),
    mdPost(),
    `<g data-part="dials">${DIALS.map(dialBody).join("")}</g>`,
    DIALS.map((d, i) => `<path data-part="needle-${i}" class="iso-line" data-tone="lit" data-free="start" d="${needle(d, 0)}" style="stroke-width:1.1"/>`).join(""),
    keypad(),
    [0, 1, 2, 3].map((i) => `<g data-part="key-${i}">${key(i)}</g>`).join(""),
    `<circle data-part="lamp" cx="${at([KEYPAD.x + KEYPAD.w - 8, KEYPAD.y + 5.5, KEYPAD_H])[0].toFixed(1)}" cy="${at([KEYPAD.x + KEYPAD.w - 8, KEYPAD.y + 5.5, KEYPAD_H])[1].toFixed(1)}" r="1.5" class="bl-lamp"/>`,
    plinth(),
    lamps(),
    `<g data-part="shells">${Array.from({ length: 8 }, (_, i) => { const [cx, cy] = at([LAMP_X(i), LAMP_Y, PLINTH_H / 2]); return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.2" class="bl-shell"/>`; }).join("")}</g>`,
    coil(-COIL_X - COIL_T / 2, true),
    stage(),
    voxel(),
    `<g data-part="cells"></g>`,
    coil(COIL_X - COIL_T / 2, false),
    bridge(),
    rails(),
    `<g data-part="carriage" transform="${k.translateAlong(P, [STOPS[START], 0, 0])}">${carriage()}</g>`,
    knobBase(),
    `<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" d="${knobPointer(KNOB_ANG[0])}" style="stroke-width:1"/>`,
  ],
});

// ── live ─────────────────────────────────────────────────────────────────
const live = `
const P = ${JSON.stringify(P)};
const REGIONS = ${JSON.stringify(REGIONS)};
const TIMES = ${JSON.stringify(TIMES)};
const TASK = ${JSON.stringify(TASK)};
const DIALS = ${JSON.stringify(DIALS)};
const DIAL_TOP = ${DIAL_Z + DIAL_H + 0.2};
const TURN = ${JSON.stringify(DIAL_TURN)};
const MAG = ${MAGNIFY};
const STOPS = ${JSON.stringify(STOPS)};
const KNOB = ${JSON.stringify(KNOB)}, KNOB_ANG = ${JSON.stringify(KNOB_ANG)}, KNOB_TOP = ${KNOB_TOP};
const CELLS = ${JSON.stringify(CELLS)}, LINKS = ${JSON.stringify(LINKS)}, CUBE_TOP = ${CUBE_TOP + 0.05};
const root = document.querySelector(".bl-root");
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $p = (n) => svg.querySelector('[data-part="' + n + '"]');
const needles = DIALS.map((_, i) => $p("needle-" + i));
const keys = [0, 1, 2, 3].map((i) => $p("key-" + i));
const carriageEl = $p("carriage"), knobEl = $p("knob"), cellsEl = $p("cells"), lamp = $p("lamp");
const shells = Array.from($p("shells").querySelectorAll("circle"));
const readout = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const needleAt = (d, turn) => { const a = turn * Math.PI * 2, x = d.at[0], y = d.at[1]; return lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (d.r - 3.6), y - Math.cos(a) * (d.r - 3.6)], DIAL_TOP, P); };
const pointerAt = (a) => lineOnTop([KNOB[0] + Math.sin(a) * 1.3, KNOB[1] - Math.cos(a) * 1.3], [KNOB[0] + Math.sin(a) * 6.2, KNOB[1] - Math.cos(a) * 6.2], KNOB_TOP, P);
const f3 = (v) => v.toFixed(3), sgn = (v, n) => (v >= 0 ? "+" : "\\u2212") + Math.abs(v).toFixed(n);

// the cartoon on the voxel's top: cell bodies (rings) and the links between them (lines that end on the rings)
const NS = "http://www.w3.org/2000/svg";
const rings = CELLS.map(() => { const p = document.createElementNS(NS, "path"); p.setAttribute("class", "iso-line"); p.setAttribute("data-tone", "hi"); cellsEl.appendChild(p); return p; });
const links = LINKS.map(() => { const p = document.createElementNS(NS, "path"); p.setAttribute("class", "iso-line"); p.setAttribute("data-tone", "mid"); cellsEl.appendChild(p); return p; });

// state
const S = {
  region: 0, knob: KNOB_ANG[0],
  stop: 0, x: STOPS[0], target: STOPS[0],
  scanned: 0,           // the time point whose scan the dials show
  scan: -1, scanT: 0,   // a scan in progress: which stop, how far (s)
  train: -1,            // seconds into a training session, or -1
  dial: [0, 0, 0, 0], rate: [0, 0, 0, 0],
};
const SCAN_S = 1.6, BLOCK_S = 0.42, TRAIN_S = TASK.blocks * BLOCK_S;
const valuesOf = (r, t) => {
  const R = REGIONS[r];
  return [100 * (R.md[t] - R.md[0]) / R.md[0], R.soma[t] - R.soma[0], R.neurite[t] - R.neurite[0], R.extra[t] - R.extra[0]];
};
const turnsOf = (v) => [v[0] / TURN.mdPercent, v[1] / TURN.fraction, v[2] / TURN.fraction, v[3] / TURN.fraction];

let frame = 0, last = 0, visible = false, touring = !still.matches, clock = 0, idle = 0;

function drawCells() {
  const R = REGIONS[S.region];
  const t = turnsOf([0, 0, 0, 0]);
  // dial values back to fractions
  const dS = S.dial[1] * TURN.fraction, dN = S.dial[2] * TURN.fraction;
  const rS = 1.7 * clamp(1 + MAG * dS / R.soma[0], 0.5, 1.9);
  const count = 6 * (1 + MAG * dN / R.neurite[0]);
  CELLS.forEach((c, i) => rings[i].setAttribute("d", ring(c[0], c[1], rS, CUBE_TOP, P, 18)));
  LINKS.forEach((l, i) => {
    const a = CELLS[l[0]], b = CELLS[l[1]];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    links[i].setAttribute("d", lineOnTop([a[0] + ux * rS, a[1] + uy * rS], [b[0] - ux * rS, b[1] - uy * rS], CUBE_TOP, P));
    links[i].setAttribute("opacity", clamp(count - i, 0, 1).toFixed(2));
  });
}

function phaseText() {
  const R = REGIONS[S.region];
  if (S.train >= 0) { const b = Math.min(TASK.blocks, Math.floor(S.train / BLOCK_S) + 1); return "training \\u00b7 block " + b + " of " + TASK.blocks; }
  if (S.scan >= 0) return "scanning \\u00b7 " + TIMES[S.scan];
  const v = valuesOf(S.region, S.scanned);
  if (S.scanned === 0) return R.short + " \\u00b7 baseline";
  return R.short + " \\u00b7 " + TIMES[S.scanned] + " \\u00b7 soma " + sgn(v[1], 3) + " \\u00b7 neurite " + sgn(v[2], 3);
}

function panel() {
  const R = REGIONS[S.region], t = S.scanned, v = valuesOf(S.region, t);
  const set = (k, txt) => { const el = root.querySelector('[data-v="' + k + '"]'); if (el && el.textContent !== txt) el.textContent = txt; };
  set("region", R.name); set("time", t === 0 ? "Before learning" : TIMES[t] + " after learning");
  set("md", R.md[t].toFixed(2)); set("mdd", t ? sgn(v[0], 1) + " %" : "0");
  set("soma", f3(R.soma[t])); set("somad", t ? sgn(v[1], 3) : "0");
  set("neurite", f3(R.neurite[t])); set("neurited", t ? sgn(v[2], 3) : "0");
  set("extra", f3(R.extra[t])); set("extrad", t ? sgn(v[3], 3) : "0");
  ["md", "soma", "neurite", "extra"].forEach((k) => set(k + "s", R.sig[k]));
  set("story", R.story);
  root.querySelectorAll("[data-region]").forEach((b) => { const on = +b.dataset.region === S.region; b.setAttribute("aria-pressed", on ? "true" : "false"); });
  root.querySelectorAll("[data-time]").forEach((b) => { const on = +b.dataset.time === S.stop; b.setAttribute("aria-pressed", on ? "true" : "false"); });
  const tb = root.querySelector("[data-train]"); if (tb) tb.setAttribute("aria-pressed", S.train >= 0 ? "true" : "false");
  stage.setAttribute("aria-valuetext", R.name + ", " + (t === 0 ? "before learning" : TIMES[t] + " after learning"));
}

function draw() {
  carriageEl.setAttribute("transform", translateAlong(P, [S.x, 0, 0]));
  knobEl.setAttribute("d", pointerAt(S.knob));
  needles.forEach((n, i) => n.setAttribute("d", needleAt(DIALS[i], S.dial[i])));
  // keys: during training, the sequence 4 1 3 2 4 plays once per block
  let down = -1;
  if (S.train >= 0) {
    const inBlock = S.train % BLOCK_S, step = Math.floor(inBlock / (BLOCK_S * 0.66 / 5));
    if (step < 5) down = TASK.sequence[step] - 1;
  }
  keys.forEach((el, i) => el.setAttribute("transform", i === down ? translateAlong(P, [0, 0, -1.6]) : ""));
  lamp.setAttribute("data-on", S.train >= 0 ? "1" : "0");
  shells.forEach((c, i) => {
    let o = 0;
    if (S.scan >= 0) { const head = S.scanT / SCAN_S * 9; o = clamp(1 - Math.abs(head - i - 0.5) / 1.6, 0, 1); }
    c.setAttribute("opacity", o.toFixed(2));
  });
  drawCells();
  const text = phaseText();
  if (readout.textContent !== text) readout.textContent = text;
}

function startScan(stop) { S.scan = stop; S.scanT = 0; if (still.matches) finishScan(); }
function finishScan() { S.scanned = S.scan; S.scan = -1; panel(); }

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; tour(); } else { idle += dt; if (idle > 6 && !calm) { touring = true; clock = 0; tourIndex = -1; } }
  // knob and carriage ease to their targets
  const kt = KNOB_ANG[S.region];
  S.knob = calm ? kt : S.knob + (kt - S.knob) * (1 - Math.exp(-dt / 0.18));
  if (Math.abs(kt - S.knob) < 1e-3) S.knob = kt;
  const before = S.x;
  S.x = calm ? S.target : S.x + (S.target - S.x) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(S.target - S.x) < 0.05) S.x = S.target;
  if (before !== S.target && S.x === S.target) startScan(S.stop);
  if (S.train >= 0) { S.train += dt; if (S.train >= TRAIN_S) { S.train = -1; panel(); } }
  if (S.scan >= 0) { S.scanT += dt; if (S.scanT >= SCAN_S) finishScan(); }
  // dials: a damped spring toward the scanned values
  const goal = turnsOf(valuesOf(S.region, S.scanned));
  let moving = false;
  for (let i = 0; i < 4; i++) {
    if (calm) { S.dial[i] = goal[i]; S.rate[i] = 0; continue; }
    for (let s = 0; s < 4; s++) { S.rate[i] += ((goal[i] - S.dial[i]) * 90 - S.rate[i] * 15) * dt / 4; S.dial[i] += S.rate[i] * dt / 4; }
    if (Math.abs(goal[i] - S.dial[i]) < 5e-5 && Math.abs(S.rate[i]) < 5e-4) { S.dial[i] = goal[i]; S.rate[i] = 0; } else moving = true;
  }
  draw();
  const busy = touring || moving || S.train >= 0 || S.scan >= 0 || S.x !== S.target || S.knob !== KNOB_ANG[S.region];
  frame = visible && (busy || !calm) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };

// controls
function setRegion(r) { S.region = (r + 4) % 4; S.scanned = S.stop; S.scan = -1; panel(); run(); }
function setTime(t) { t = clamp(t, 0, 2); if (t === S.stop && S.x === S.target) { startScan(t); run(); return; } S.stop = t; S.target = STOPS[t]; S.scan = -1; panel(); run(); }
function train() { S.stop = 0; S.target = STOPS[0]; S.scanned = 0; S.scan = -1; S.train = still.matches ? -1 : 0; panel(); run(); }
function hand() { touring = false; idle = 0; }

// the idle tour: for each region, baseline, a training session, then the 30 min and 24 h scans
let tourIndex = -1, tourAt = 0;
const STEPS = [];
for (let r = 0; r < 4; r++) {
  const order = [3, 2, 1, 0][r];
  STEPS.push({ r: order, t: 0, hold: 2.2 }, { r: order, train: true, hold: TRAIN_S + 0.6 }, { r: order, t: 1, hold: 3.6 }, { r: order, t: 2, hold: 3.8 });
}
function tour() {
  if (tourIndex < 0 || clock - tourAt >= STEPS[tourIndex].hold) {
    tourIndex = (tourIndex + 1) % STEPS.length; tourAt = clock;
    const s = STEPS[tourIndex];
    if (s.r !== S.region) { S.region = s.r; S.scanned = S.stop; }
    if (s.train) train(); else setTime(s.t);
    panel();
  }
}

root.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  hand();
  if (b.dataset.region != null) setRegion(+b.dataset.region);
  else if (b.dataset.time != null) setTime(+b.dataset.time);
  else if (b.hasAttribute("data-train")) train();
});
stage.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const box = svg.getBoundingClientRect();
  const fx = (e.clientX - box.left) / box.width, fy = (e.clientY - box.top) / box.height;
  if (fy > 0.68 && fx > 0.42 && fx < 0.82) { hand(); const t = clamp(Math.round((fx - 0.47) / 0.3 * 2), 0, 2); if (t !== S.stop) setTime(t); }
});
stage.addEventListener("keydown", (e) => {
  let used = true;
  if (e.key === "ArrowRight") setTime(S.stop + 1);
  else if (e.key === "ArrowLeft") setTime(S.stop - 1);
  else if (e.key === "ArrowUp") setRegion(S.region + 1);
  else if (e.key === "ArrowDown") setRegion(S.region - 1);
  else if (e.key === "Home") setTime(0);
  else if (e.key === "End") setTime(2);
  else if (e.key === "Enter" || e.key === " ") train();
  else if (e.key >= "1" && e.key <= "4") setRegion(+e.key - 1);
  else used = false;
  if (used) { e.preventDefault(); hand(); }
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
// a fixed pose for stills: ?pose=region,time  (for the poster)
const q = new URLSearchParams(location.search).get("pose");
if (q) { const [r, t] = q.split(",").map(Number); touring = false; S.region = r; S.stop = t; S.x = S.target = STOPS[t]; S.scanned = t; S.knob = KNOB_ANG[r]; S.dial = turnsOf(valuesOf(r, t)); idle = -1e9; }
panel(); draw();
`;

const btn = (attr, label) => `<button type="button" ${attr} aria-pressed="false">${label}</button>`;
const side = `
<div class="bl-side">
  <div class="bl-group"><span class="bl-k">Brain region</span><div class="bl-btns">${REGIONS.map((r, i) => btn(`data-region="${i}"`, r.short === "M1" ? "Motor cortex (M1)" : r.short === "PPC" ? "Parietal (PPC)" : r.name)).join("")}</div></div>
  <div class="bl-group"><span class="bl-k">Scan</span><div class="bl-btns bl-row">${TIMES.map((t, i) => btn(`data-time="${i}"`, i === 0 ? "Before" : t)).join("")}</div><button type="button" class="bl-train" data-train aria-pressed="false">▶ Train: 15 blocks</button></div>
  <table class="bl-tab" aria-live="polite">
    <caption><span data-v="region">Hippocampus</span> · <span data-v="time">Before learning</span></caption>
    <thead><tr><th scope="col">Dial</th><th scope="col">Value</th><th scope="col">Change</th><th scope="col">Paper</th></tr></thead>
    <tbody>
      <tr><th scope="row">MD (×10⁻⁴)</th><td data-v="md"></td><td data-v="mdd"></td><td data-v="mds"></td></tr>
      <tr><th scope="row">Soma</th><td data-v="soma"></td><td data-v="somad"></td><td data-v="somas"></td></tr>
      <tr><th scope="row">Neurite</th><td data-v="neurite"></td><td data-v="neurited"></td><td data-v="neurites"></td></tr>
      <tr><th scope="row">Extracellular</th><td data-v="extra"></td><td data-v="extrad"></td><td data-v="extras"></td></tr>
    </tbody>
  </table>
  <p class="bl-story" data-v="story"></p>
</div>`;

const plate1 = k.plateHtml({
  fig: "Fig 1",
  title: "One voxel, three compartments",
  hint: "Pick a region, train, scan",
  readout: "hippocampus · baseline",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Diffusion rig. Left and right arrows change the scan time, up and down change the brain region, Enter runs a training session." aria-valuemin="0" aria-valuemax="2" aria-valuenow="0">${svg}</div>`,
});
const caption = `<p class="bl-cap">My own drawing of an imaginary bench instrument, built on the paper’s numbers. The real scan is a whole head in the 3T Connectome scanner (300 mT/m gradients, 2 mm voxels, 7 b values from 200 to 8,000 s/mm² plus b = 0 images). Dials, left to right at the back: MD on its own post (one full turn = 10 % change), then soma, neurite and extracellular fractions (one full turn = 0.04 of the signal). Values are group means read off Fig 3 of Griffa et al., PLOS Biology 24(6): e3003861 (2026), CC BY 4.0, so the third decimal is approximate. The cells drawn on the cube are a cartoon, with their changes magnified ten times. The real training took about 15 to 20 minutes; here a block lasts under half a second.</p>`;

const CSS = `
html,body{height:100%}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.bl-root{box-sizing:border-box;min-height:100%;padding:14px;display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:14px;align-items:start;align-content:start;max-width:1180px;margin:0 auto}
.bl-root *{box-sizing:border-box}
.bl-root .iso-figure{margin:0}
.bl-root .iso-plate{padding:40px 14px 38px}
.bl-root .iso-plate-corners{inset:14px 16px}
.iso-stage{outline:none;touch-action:pan-y}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.bl-side{display:flex;flex-direction:column;gap:12px}
.bl-group{display:flex;flex-direction:column;gap:6px}
.bl-k{font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted)}
.bl-btns{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.bl-btns.bl-row{grid-template-columns:repeat(3,1fr)}
.bl-root button{min-height:34px;padding:4px 8px;border:1px solid var(--anatomy-mid);background:var(--anatomy-card);color:var(--anatomy-strong);font:12px/1.2 var(--anatomy-mono);cursor:pointer;border-radius:0;text-align:center}
.bl-root button:hover{border-color:var(--anatomy-strong)}
.bl-root button[aria-pressed="true"]{background:var(--anatomy-strong);border-color:var(--anatomy-strong);color:var(--anatomy-card)}
.bl-root button:focus-visible{outline:2px solid var(--anatomy-strong);outline-offset:2px}
.bl-train{width:100%}
.bl-tab{width:100%;border-collapse:collapse;font:12px/1.35 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.bl-tab caption{text-align:left;font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--anatomy-muted);padding-bottom:4px}
.bl-tab th,.bl-tab td{padding:4px 4px;border-top:1px solid var(--anatomy-faint);text-align:right;font-weight:400}
.bl-tab th[scope="row"],.bl-tab thead th:first-child{text-align:left}
.bl-tab thead th{color:var(--anatomy-muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase;border-top:0}
.bl-tab td:last-child{color:var(--anatomy-muted);font-size:10.5px;white-space:nowrap}
.bl-story{margin:0;font-size:13px;line-height:1.5;color:var(--anatomy-strong)}
.bl-cap{grid-column:1 / -1;margin:0;font-size:12px;line-height:1.55;color:var(--anatomy-muted);max-width:110ch}
.bl-lamp{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:.6;transition:fill .2s}
.bl-lamp[data-on="1"]{fill:var(--anatomy-lit)}
.bl-shell{fill:var(--anatomy-lit);stroke:none}
@media (max-width:760px){.bl-root{grid-template-columns:minmax(0,1fr);padding:10px}.bl-btns{grid-template-columns:1fr 1fr}.bl-root .iso-plate{padding:34px 4px 40px}}
@media (max-height:600px) and (min-width:761px){.bl-root{padding:8px;gap:10px}.bl-cap{display:none}.bl-story{font-size:12px}.bl-root .iso-plate{padding:30px 10px 30px}.bl-root .iso-plate-corners{inset:10px 12px}}
`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>One voxel, three compartments · GelasTinta</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${k.ISO_CSS}${CSS}</style></head>
<body class="iso" data-theme="light"><main class="bl-root">${plate1}${side}${caption}</main>
<script type="module">${(kitScript() + live).replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

writeFileSync(OUT, page);
console.log("wrote", OUT, (page.length / 1024).toFixed(0) + " KB");
