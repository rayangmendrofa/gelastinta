// Fig 1 (Talk 12, Learning brain): a bench diffusion rig built round one 2 mm voxel of brain, cut away.
// Anatomy kit (MIT): set ANATOMY to the kit folder (default /home/claude/anatomy-ref).
//   node teardowns/gt-brain-figure/build.mjs            -> src/static/teardowns/learning-brain.html
//   node teardowns/gt-brain-figure/build.mjs --audit    -> also runs the kit's geometry audit
//   node teardowns/gt-brain-figure/build.mjs --out x.html [--light]
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REGIONS, TIMES, TASK, DIAL_TURN, MAGNIFY } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..", "..");
const KITDIR = process.env.ANATOMY || "/home/claude/anatomy-ref";
const imp = (p) => import(pathToFileURL(join(KITDIR, p)).href);
const k = await imp("kit/iso-kit.mjs");
const G = await imp("kit/lathe.mjs");
const A = await imp("kit/audit.mjs");
const { tubePieces, tubeSvg } = await imp("kit/tube.mjs");
const { kitScript } = await imp("scripts/inline-kit.mjs");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(SITE, "src", "static", "teardowns", "learning-brain.html");
const THEME = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 680, HEIGHT = 390, AZ = 52;

// ── world plan (units ~ 1 px) ─────────────────────────────────────────────
const PLATE = { x: -222, y: -96, w: 444, d: 192, r: 9 };
const PLATE_H = 12, FOOT_H = 5;
const AMP = { x: -206, y: -88, w: 64, d: 46, r: 2.4 }, AMP_H = 46;
const AMP_XF = AMP.x + AMP.w, AMP_YF = AMP.y + AMP.d;            // faces toward the viewer
const PLINTH = { x: -102, y: -48, w: 204, d: 92, r: 4 }, PLINTH_H = 8;
const COIL_X = 80, COIL_T = 9, COIL_Y0 = -38, COIL_D = 74, COIL_Z0 = PLINTH_H, COIL_H = 74;
const COIL_TOP = COIL_Z0 + COIL_H;
const BRIDGE = { x: -COIL_X - 10, y: COIL_Y0, w: COIL_X * 2 + 20, d: 9, r: 1.4 }, BRIDGE_H = 6;
const BRIDGE_TOP = COIL_TOP + BRIDGE_H;
const CONN_Y = -9;                                             // coil top connectors
const STAGE = [0, 0];
const CUBE = 50, CUBE_Z = 24, WALL = 1.8;                        // the voxel cage
const CZ0 = CUBE_Z + WALL, CZ1 = CUBE_Z + CUBE;                  // inside, floor top to rim
const H = CUBE / 2;

const KEYPAD = { x: -208, y: 26, w: 70, d: 44, r: 3 }, KEYPAD_H = 7;
const KEY_W = 12, KEY_D = 22, KEY_GAP = 3.4, KEY_H = 4.2;
const KEY_X0 = KEYPAD.x + 7, KEY_Y = KEYPAD.y + 13;
const RAIL_Y = [66, 78], RAIL_FROM = -36, RAIL_TO = 150;
const STOPS = [0, 60, 120];
const CAR = { x: -14, y: 61, w: 28, d: 22, r: 2.5 }, CAR_Z = 3, CAR_TOP = 9;
const STRIP = { x: -28, y: 86, w: 172, d: 7, r: 1 };
const BAR = { x: 114, y: -80, w: 100, d: 10, r: 2 }, BAR_Z = 30, BAR_H = 6;
const DIALS = [{ at: [104, -60], r: 13 }, { at: [130, -75], r: 11.5 }, { at: [164, -75], r: 11.5 }, { at: [198, -75], r: 11.5 }];
const DIAL_Z = 40, DIAL_H = 7, DIAL_TOP = DIAL_Z + DIAL_H;
const KNOB = [190, 40];
const KNOB_ANG = [-66, -22, 22, 66].map((d) => (d * Math.PI) / 180);
const KNOB_TOP = 2.6 + 7;
const LABEL = { x: -126, y: 80, w: 56, d: 14, r: 1.6 };

const fitPoints = [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, COIL_Y0, BRIDGE_TOP + 8], [-COIL_X, COIL_Y0, BRIDGE_TOP + 8], [AMP.x, AMP.y, AMP_H + 26]];
const P = k.fitProjection(fitPoints, WIDTH, HEIGHT, { pad: 14, azimuth: AZ });
const V = G.viewOf(P), KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);

const R = A.recorder(P);
const record = R.solid;
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "rig", ...rest });
function box(name, plan, z, h, style = {}, { steps = 3, bevel = 0.5, extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.slab(plan, z, h, { name, owner }, steps));
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function cyl(name, cx, cy, r, z, h, style = {}, { steps = 32, bevel = 0, extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.cylinder(cx, cy, r, z, h, { name, owner }));
  put(name, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
// a rounded rectangle on a vertical face: x = const (in y, z) or y = const (in x, z)
function faceRect(axis, c, u0, u1, z0, z1, r, steps = 4) {
  const pts = [];
  const pt = (u, z) => (axis === "x" ? [c, u, z] : [u, c, z]);
  const corner = (cu, cz, a0) => { for (let i = 0; i <= steps; i++) { const a = a0 + (i / steps) * (Math.PI / 2); pts.push(pt(cu + Math.cos(a) * r, cz + Math.sin(a) * r)); } };
  corner(u1 - r, z1 - r, 0); corner(u0 + r, z1 - r, Math.PI / 2); corner(u0 + r, z0 + r, Math.PI); corner(u1 - r, z0 + r, Math.PI * 1.5);
  return path3(pts, true);
}

// ── back layer: the plate (recorded as ground) ───────────────────────────
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
  back.push(S(k.cylinder(x, y, 7.5, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.8, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H + 4, P, 8), { tone: "faint" }) }));
back.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const screws = k.corners(PLATE, 11);
back.push(L(screws.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(""), { tone: "lo" }));
back.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
// rail ruler and the label plate lie flat on the plate
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
{
  const t = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 3, 20, STRIP.y + 0.6, 0.6, [1.6, 4.6], P);
  const m = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 15, 4, STRIP.y + 0.6, 0.6, [2.8, 4.6], P);
  back.push(L(t.minor, { tone: "lo" }), L(m.minor, { tone: "mid" }), L(t.major, { tone: "hi" }));
  for (const x of STOPS) back.push(L(k.ring(x, STRIP.y + 5.6, 0.9, 0.6, P, 10), { tone: "hi" }));
  back.push(D([at([STRIP.x + 2, STRIP.y + 3.5, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3.5, 0.6])], { size: 0.45 }));
}
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
back.push(L(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 5, LABEL.y + 6.6], 0.8, P, "x"), "SANDI · 300 mT/m", { size: 3.6, tone: "mid" }));
[[LABEL.x + 5, LABEL.x + 44], [LABEL.x + 5, LABEL.x + 32]].forEach(([a, b], i) => back.push(L(k.lineOnTop([a, LABEL.y + 9.2 + i * 2.6], [b, LABEL.y + 9.2 + i * 2.6], 0.8, P), { tone: "lo", free: true })));
back.push(D([at([LABEL.x + LABEL.w - 3.4, LABEL.y + 3.4, 0.8]), at([LABEL.x + LABEL.w - 3.4, LABEL.y + LABEL.d - 3.4, 0.8])], { size: 0.45 }));

// ── gradient amplifier: a cabinet with vents, a label plate, handles and two output connectors ──
{
  const vents = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) vents.push(faceRect("y", AMP_YF, AMP.x + 8 + i * 8.4, AMP.x + 13 + i * 8.4, 8 + row * 6, 12 + row * 6, 1.2, 2));
  const xvents = [];
  for (let i = 0; i < 5; i++) xvents.push(faceRect("x", AMP_XF, AMP.y + 6 + i * 7, AMP.y + 11 + i * 7, 26, 40, 1.2, 2));
  const seam = k.sideSeam(AMP, 4, P, 3) + k.sideSeam(AMP, AMP_H - 4, P, 3);
  box("amp", AMP, 0, AMP_H, { tone: "mid" }, { bevel: 0.8, inner: L(seam, { tone: "faint" }), extra: L(vents.join(""), { tone: "lo" }) + L(xvents.join(""), { tone: "lo" }) });
  // front label plate: a thin plate on the +y face with rule lines and four screws
  const lp = { x: AMP.x + 8, y: AMP_YF, w: 34, d: 0.8, r: 0.3 };
  box("amp.label", lp, 28, 13, { tone: "lo" }, { steps: 2, bevel: 0, bias: 0.05, extra:
    L(path3([[lp.x + 3, AMP_YF + 0.8, 37.5], [lp.x + 28, AMP_YF + 0.8, 37.5]]) + path3([[lp.x + 3, AMP_YF + 0.8, 34.5], [lp.x + 22, AMP_YF + 0.8, 34.5]]) + path3([[lp.x + 3, AMP_YF + 0.8, 31.5], [lp.x + 25, AMP_YF + 0.8, 31.5]]), { tone: "mid", free: true }) +
    D([[lp.x + 1.4, 39.6], [lp.x + 32.6, 39.6], [lp.x + 1.4, 29.4], [lp.x + 32.6, 29.4]].map(([x, z]) => at([x, AMP_YF + 0.8, z])), { size: 0.45 }) });
  // status lamp housing on the front
  box("amp.lamp", { x: AMP.x + 49, y: AMP_YF, w: 6, d: 1.2, r: 0.4 }, 30, 6, { tone: "lo" }, { steps: 2, bevel: 0 });
  // carry handles on top: two posts and a bar each
  for (const hx of [AMP.x + 8, AMP.x + AMP.w - 12]) {
    box(`amp.handle${hx}.a`, { x: hx, y: AMP.y + 6, w: 4, d: 3, r: 0.6 }, AMP_H, 5, {}, { steps: 2 });
    box(`amp.handle${hx}.b`, { x: hx, y: AMP.y + AMP.d - 9, w: 4, d: 3, r: 0.6 }, AMP_H, 5, {}, { steps: 2 });
    box(`amp.handle${hx}.bar`, { x: hx, y: AMP.y + 6, w: 4, d: AMP.d - 12, r: 0.8 }, AMP_H + 5, 2.4, { tone: "hi" }, { steps: 2 });
  }
  D(k.corners(AMP, 3).map(([x, y]) => at([x, y, AMP_H])), { size: 0.5 });
}
const AMP_OUT = [[AMP.x + 26, AMP.y + 18], [AMP.x + 38, AMP.y + 18]];
for (const [i, [x, y]] of AMP_OUT.entries()) {
  cyl(`amp.port${i}`, x, y, 4.2, AMP_H, 2, {}, { steps: 24, bevel: 0.3, extra: L(k.ring(x, y, 3, AMP_H + 2, P, 18), { tone: "lo" }) });
  cyl(`amp.shell${i}`, x, y, 2.8, AMP_H + 2, 6, { tone: "hi" }, { steps: 20, extra: L(k.knurl(x, y, 2.8, AMP_H + 3, AMP_H + 7.4, 16, P), { tone: "lo" }) });
}

// ── plinth, coils, bridge ────────────────────────────────────────────────
const LAMP_X = (i) => -44 + i * 12.5, LAMP_Y = PLINTH.y + PLINTH.d;
box("plinth", PLINTH, 0, PLINTH_H, {}, { steps: 4, bevel: 0.8, extra: L(k.planOutline(k.insetPlan(PLINTH, 4), PLINTH_H, P, 4), { tone: "faint" }) + D(k.corners(PLINTH, 5).map(([x, y]) => at([x, y, PLINTH_H])), { size: 0.45 }) + L(Array.from({ length: 8 }, (_, i) => k.sideRing([LAMP_X(i), LAMP_Y, PLINTH_H / 2], 1.7, "y", P, 14)).join(""), { tone: "lo" }) });

function coil(side) {
  const x0 = side * COIL_X - COIL_T / 2, xf = x0 + COIL_T;
  const plan = { x: x0, y: COIL_Y0, w: COIL_T, d: COIL_D, r: 1.4 };
  const wind = [];
  for (let i = 0; i < 7; i++) wind.push(faceRect("x", xf, COIL_Y0 + 5 + i * 2.8, COIL_Y0 + COIL_D - 5 - i * 2.8, COIL_Z0 + 6 + i * 2.8, COIL_TOP - 6 - i * 2.8, 6 - i * 0.7));
  const yf = COIL_Y0 + COIL_D;
  const turns = [];
  for (let i = 0; i < 7; i++) turns.push(faceRect("y", yf, x0 + 1.4, xf - 1.4, COIL_Z0 + 6 + i * 2.8, COIL_TOP - 6 - i * 2.8, 0.6, 2));
  const seam = k.sideSeam(plan, COIL_TOP - 2.4, P, 3) + k.sideSeam(plan, COIL_Z0 + 2.4, P, 3);
  box(`coil${side}`, plan, COIL_Z0, COIL_H, {}, { bevel: 0.6, inner: L(seam, { tone: "faint" }),
    extra: `<g class="bl-wind" data-part="wind${side}">${L(wind.join(""), { tone: "lo" })}</g><g class="bl-glow" data-glow>${L(wind.join(""), { tone: "lit" })}</g>` + L(turns.join(""), { tone: "faint" }) });
  // clamps at the foot on both sides of the former, bolted to the plinth
  for (const fy of [COIL_Y0 + 6, COIL_Y0 + COIL_D - 16]) for (const [cx, w] of [[x0 - 6, 6], [xf, 6]]) {
    box(`coil${side}.clamp${fy}${cx}`, { x: cx, y: fy, w, d: 10, r: 0.8 }, PLINTH_H, 4, {}, { steps: 2, bevel: 0.3, extra: D([at([cx + w / 2, fy + 2.5, PLINTH_H + 4]), at([cx + w / 2, fy + 7.5, PLINTH_H + 4])], { size: 0.45 }) });
  }
  // a label plate on the outer face of the right coil, its top connector
  cyl(`coil${side}.port`, side * COIL_X, CONN_Y, 3.6, COIL_TOP, 1.6, {}, { steps: 22, bevel: 0.3 });
  cyl(`coil${side}.shell`, side * COIL_X, CONN_Y, 2.6, COIL_TOP + 1.6, 4.4, { tone: "hi" }, { steps: 20, extra: L(k.knurl(side * COIL_X, CONN_Y, 2.6, COIL_TOP + 2.4, COIL_TOP + 5.6, 14, P), { tone: "lo" }) });
}
coil(-1);
coil(1);
box("bridge", BRIDGE, COIL_TOP, BRIDGE_H, {}, { bevel: 0.6, extra: D([-COIL_X - 6, -36, 36, COIL_X + 6].map((x) => at([x, BRIDGE.y + 4.5, BRIDGE_TOP])), { size: 0.45 }) });

// ── the harness: two gradient cables from the amplifier, across the bridge, into the coils ──
const CABLE_R = 1.35;
function cable(name, points, r, { tone = "mid", bias = 0.05, touch = [], bundle, rings, bend = BEND } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.8), 12, { P, tube: r });
  R.route(name, route, r, { limp: true, touch, bundle, piece: "rig" });
  tubePieces(route, r, P, { maxLength: 14, spacing: Math.max(0.6, Math.min(1.6, r)), ...(rings ? { rings } : {}) }).forEach((piece, i) =>
    put(`${name}:${i}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias, route: name, chunk: i }));
  return route;
}
const shellTop = AMP_H + 8;
const CY = [BRIDGE.y + 2.8, BRIDGE.y + 6.2];
const lift = BRIDGE_TOP + CABLE_R;
const harnessTouch = ["bridge", "clamp*", "amp.shell*", "coil*.shell"];
const RISE = +(process.env.RISE || 26), APEX = +(process.env.APEX || 30), BEND = +(process.env.BEND || 12), AX = +(process.env.AX || -COIL_X - 36);
const routeTo = (port, side, lane) => [[port[0], port[1], shellTop], [port[0], port[1], shellTop + RISE], [port[0] + 14, port[1] + 3, shellTop + RISE + 14], [AX, lane, lift + APEX], [+(process.env.LAND || -COIL_X - 26), lane, lift], [side * COIL_X - 14, lane, lift], [side * COIL_X, CONN_Y, lift + 4], [side * COIL_X, CONN_Y, COIL_TOP + 6]];
cable("cable.left", routeTo(AMP_OUT[0], -1, CY[1]), CABLE_R, { touch: harnessTouch, bundle: "harness", rings: { every: 1.6, tone: "lo" } });
cable("cable.right", routeTo(AMP_OUT[1], 1, CY[0]), CABLE_R, { touch: harnessTouch, bundle: "harness", rings: { every: 1.6, tone: "lo" } });
for (const cx of [-40, 0, 40]) {
  box(`clamp${cx}`, { x: cx - 2.4, y: BRIDGE.y + 0.6, w: 4.8, d: BRIDGE.d - 1.2, r: 0.8 }, BRIDGE_TOP + 2 * CABLE_R + 0.3, 1.6, {}, { steps: 2, bias: 0.3, extra: D([at([cx, BRIDGE.y + 1.6, BRIDGE_TOP + 2 * CABLE_R + 1.9]), at([cx, BRIDGE.y + BRIDGE.d - 1.6, BRIDGE_TOP + 2 * CABLE_R + 1.9])], { size: 0.45 }) });
  for (const yy of [BRIDGE.y + 0.6, BRIDGE.y + BRIDGE.d - 1.6]) box(`clamp${cx}.leg${yy}`, { x: cx - 2.4, y: yy, w: 4.8, d: 1, r: 0.3 }, BRIDGE_TOP, 2 * CABLE_R + 0.3, {}, { steps: 2, bevel: 0 });
}

// ── the stage and the voxel, cut away ────────────────────────────────────
cyl("stage.plate", STAGE[0], STAGE[1], 16, PLINTH_H, 2.2, {}, { steps: 56, bevel: 0.5, extra: (() => { const t = k.radialTicks(0, 0, 15.4, 36, 9, PLINTH_H + 2.2, [1, 2.2], P); return L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" }); })() });
cyl("stage.post", 0, 0, 6.5, PLINTH_H + 2.2, CUBE_Z - PLINTH_H - 2.2 - 2.4, {}, { steps: 28, extra: L(k.sideArc(0, 0, 6.5, PLINTH_H + 7, P, 16), { tone: "faint" }) });
cyl("stage.head", 0, 0, 10, CUBE_Z - 2.4, 2.4, {}, { steps: 36, bevel: 0.4 });
const CAGE = { x: -H, y: -H, w: CUBE, d: CUBE, r: 0.8 };
box("cage.floor", CAGE, CUBE_Z, WALL, { tone: "hi", lit: true }, { steps: 2, bevel: 0.3, extra: `<path class="bl-ecs" d="${k.slabOf(k.insetPlan(CAGE, WALL), CUBE_Z, WALL, P, 2).top}"/>` });
box("cage.wallx", { x: -H, y: -H + WALL, w: WALL, d: CUBE - WALL, r: 0.3 }, CZ0, CUBE - WALL, { tone: "hi", lit: true }, { steps: 2, bevel: 0.3, extra: `<path class="bl-ecs" d="${path3([[-H + WALL, -H + WALL, CZ0], [-H + WALL, H, CZ0], [-H + WALL, H, CZ1], [-H + WALL, -H + WALL, CZ1]], true)}"/>` });
box("cage.wally", { x: -H, y: -H, w: CUBE, d: WALL, r: 0.3 }, CZ0, CUBE - WALL, { tone: "hi", lit: true }, { steps: 2, bevel: 0.3, extra: `<path class="bl-ecs" d="${path3([[-H + WALL, -H + WALL, CZ0], [H, -H + WALL, CZ0], [H, -H + WALL, CZ1], [-H + WALL, -H + WALL, CZ1]], true)}"/>` });
// cells: soma spheres and neurite cylinders, all owned by "cell" (they meet by design)
const SC = CUBE / 36, ZC = (z) => CZ0 + (z - 25.6) * SC;
const SOMA = [{ c: [-6 * SC, -6 * SC, ZC(33.5)], r: 5.8 * SC }, { c: [7 * SC, 4 * SC, ZC(45)], r: 5 * SC }, { c: [-7 * SC, 8 * SC, ZC(47)], r: 4.4 * SC }, { c: [8 * SC, -8 * SC, ZC(31)], r: 4.2 * SC }];
const somaSurf = (i, toward) => { const s = SOMA[i]; const d = G.unit3(G.sub3(toward, s.c)); return G.add3(s.c, G.mul3(d, s.r - 0.6)); };
const NEURITES = [
  { a: [0, 1], r: 1.3 }, { a: [0, "x"], r: 1.2 }, { a: [1, "y"], r: 1.1 }, { a: [2, 0], r: 1.1 },
  { a: [3, "y"], r: 1.0 }, { a: [2, "z"], r: 1.0 }, { a: [3, 1], r: 0.9, extra: true }, { a: [2, 1], r: 0.9, extra: true }, { a: [3, "z"], r: 0.9, extra: true },
];
const wallPoint = (i, wall) => { const c = SOMA[i].c; return wall === "x" ? [-H + WALL, c[1] + 2 * SC, c[2] + SC] : wall === "y" ? [c[0] - SC, -H + WALL, c[2] + 2 * SC] : [c[0] + 1.5 * SC, c[1] + 1.5 * SC, CZ0]; };
const NSEG = NEURITES.map((n0) => {
  const n = { ...n0, r: n0.r * SC };
  const i = n.a[0], j = n.a[1];
  let p0, p1;
  if (typeof j === "number") { p0 = somaSurf(i, SOMA[j].c); p1 = somaSurf(j, SOMA[i].c); }
  else { p1 = wallPoint(i, j); p0 = somaSurf(i, p1); }
  return { ...n, p0, p1 };
});
NSEG.forEach((n, idx) => {
  const len = G.len3(G.sub3(n.p1, n.p0));
  const F = G.frameAlong(n.p0, G.unit3(G.sub3(n.p1, n.p0)));
  const shape = record(A.disc(F, 0, len, n.r, { name: `neurite${idx}`, owner: "cell" }));
  put(`neurite${idx}`, G.lerp3(n.p0, n.p1, 0.5), `<g class="bl-neurite${n.extra ? " bl-new" : ""}" data-neurite="${idx}">${S(G.disc(0, len, n.r, F, P, { steps: 18 }), { tone: "mid" })}</g>`, [shape], { bias: 0.02 });
});
SOMA.forEach((s, i) => {
  const shape = record(A.ball(s.c, s.r, { name: `soma${i}`, owner: "cell" }));
  const [sx, sy] = at(s.c);
  put(`soma${i}`, s.c, `<g class="bl-soma" data-soma="${i}" data-cx="${sx.toFixed(2)}" data-cy="${sy.toFixed(2)}">${S(G.sphereOf(s.c, s.r, P, { steps: 40 }), { tone: "hi" })}${L(k.ring(s.c[0], s.c[1], s.r * 0.32, s.c[2] + s.r * 0.05, P, 16), { tone: "mid" })}</g>`, [shape], { bias: 0.05 });
});
// front cage: three corner posts and two rim bars (the near octant is open)
box("cage.post", { x: H - WALL, y: H - WALL, w: WALL, d: WALL, r: 0.2 }, CZ0, CZ1 - WALL - CZ0, { tone: "hi", lit: true }, { steps: 1, bevel: 0 });
box("cage.rimx", { x: -H + WALL, y: H - WALL, w: CUBE - WALL, d: WALL, r: 0.2 }, CZ1 - WALL, WALL, { tone: "hi", lit: true }, { steps: 1, bevel: 0 });
box("cage.rimy", { x: H - WALL, y: -H + WALL, w: WALL, d: CUBE - 2 * WALL, r: 0.2 }, CZ1 - WALL, WALL, { tone: "hi", lit: true }, { steps: 1, bevel: 0 });
// the scale bar engraved on the floor's front edge: the voxel is 2 mm
box("cage.ruler", { x: -H + 3, y: H + 0.01, w: CUBE - 6, d: 0.01, r: 0 }, CUBE_Z + 0.3, 1, { tone: "lo" }, { steps: 1, bevel: 0, extra: L(Array.from({ length: 11 }, (_, i) => path3([[-H + 3 + i * (CUBE - 6) / 10, H + 0.02, CUBE_Z + 0.3], [-H + 3 + i * (CUBE - 6) / 10, H + 0.02, CUBE_Z + (i % 5 ? 0.8 : 1.3)]])).join(""), { tone: "hi" }) });

// ── keypad with legends (1 little finger … 4 index) ───────────────────────
box("keypad", KEYPAD, 0, KEYPAD_H, {}, { steps: 4, bevel: 0.8, extra:
  L(k.planOutline({ x: KEY_X0 - 2.4, y: KEY_Y - 2.4, w: 4 * KEY_W + 3 * KEY_GAP + 4.8, d: KEY_D + 4.8, r: 2 }, KEYPAD_H, P, 4), { tone: "lo" }) +
  D([at([KEYPAD.x + 4, KEYPAD.y + 4, KEYPAD_H]), at([KEYPAD.x + KEYPAD.w - 4, KEYPAD.y + 4, KEYPAD_H]), at([KEYPAD.x + 4, KEYPAD.y + KEYPAD.d - 4, KEYPAD_H]), at([KEYPAD.x + KEYPAD.w - 4, KEYPAD.y + KEYPAD.d - 4, KEYPAD_H])], { size: 0.45 }) +
  L(k.ring(KEYPAD.x + KEYPAD.w - 9, KEYPAD.y + 6, 2.4, KEYPAD_H, P, 16), { tone: "lo" }) });
const keyPlan = (i) => ({ x: KEY_X0 + i * (KEY_W + KEY_GAP), y: KEY_Y, w: KEY_W, d: KEY_D, r: 1.4 });
for (let i = 0; i < 4; i++) {
  const plan = keyPlan(i), top = KEYPAD_H + KEY_H;
  const shape = record(A.slab(plan, KEYPAD_H, KEY_H, { name: `key${i}` }, 3));
  put(`key${i}`, [plan.x + plan.w / 2, plan.y + plan.d / 2, KEYPAD_H + 2], `<g data-part="key-${i}">${S(k.slabOf(plan, KEYPAD_H, KEY_H, P, 3, 0.6), { tone: "hi", crease: "lo" })}${L(k.planOutline(k.insetPlan(plan, 2), top, P, 3), { tone: "faint" })}${k.faceTextSvg(k.topMatrix([plan.x + plan.w / 2 - 2.2, plan.y + 9], top, P, "x"), String(i + 1), { size: 7, tone: "hi" })}</g>`, [shape]);
}

// ── timeline rail and carriage ───────────────────────────────────────────
for (const y of RAIL_Y) box(`rail${y}`, { x: RAIL_FROM, y: y - 2.5, w: RAIL_TO - RAIL_FROM, d: 5, r: 1 }, 0, 3, {}, { bevel: 0.4, extra: D([RAIL_FROM + 5, RAIL_TO - 5].map((x) => at([x, y, 3])), { size: 0.4 }) });
for (const x of [RAIL_FROM - 5, RAIL_TO]) box(`stop${x}`, { x, y: RAIL_Y[0] - 6, w: 5, d: RAIL_Y[1] - RAIL_Y[0] + 12, r: 1.2 }, 0, 7, {}, { bevel: 0.5, extra: D([at([x + 2.5, RAIL_Y[0] - 2, 7]), at([x + 2.5, RAIL_Y[1] + 2, 7])], { size: 0.45 }) });
{
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CAR, 3), CAR_Z, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(CAR, CAR_Z, CAR_TOP - CAR_Z, P, 4, 0.6), { tone: "mid" }));
  out.push(D([-9, 0, 9].map((x) => at([x, CAR.y + CAR.d - 2.4, CAR_TOP])), { size: 0.4, tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(CAR, 2.6), CAR_TOP, P, 3), { tone: "faint" }));
  out.push(S(k.slabOf({ x: -2.2, y: CAR.y + CAR.d, w: 4.4, d: 6.2, r: 0.8 }, CAR_Z + 2, 2.4, P, 2), { tone: "hi", crease: "lo" }));
  out.push(L(k.lineOnTop([0, CAR.y + CAR.d], [0, CAR.y + CAR.d + 6.2], CAR_Z + 4.4, P), { tone: "lit" }));
  out.push(S(k.cylinder(-6, CAR.y + 9, 3.6, CAR_TOP, 4, P, 22), { tone: "mid" }));
  out.push(L(k.knurl(-6, CAR.y + 9, 3.6, CAR_TOP, CAR_TOP + 4, 22, P), { tone: "lo" }));
  out.push(L(k.ring(-6, CAR.y + 9, 1, CAR_TOP + 4, P, 12), { tone: "mid" }));
  const shapes = [record(A.slab(CAR, CAR_Z, CAR_TOP - CAR_Z, { name: "carriage" }, 4)), record(A.cylinder(-6, CAR.y + 9, 3.6, CAR_TOP, 4, { name: "carriage.wheel" })), record(A.slab({ x: -2.2, y: CAR.y + CAR.d, w: 4.4, d: 6.2, r: 0.8 }, CAR_Z + 2, 2.4, { name: "carriage.nose" }, 2))];
  put("carriage", [0, CAR.y + CAR.d / 2, CAR_Z + 3], `<g data-part="carriage">${out.join("")}</g>`, shapes, { bias: 0.5 });
}

// ── dials: MD alone on its post, the three SANDI fractions on one bar ────
function dialFace(d) {
  const [x, y] = d.at, r = d.r, out = [];
  out.push(S(k.cylinder(x, y, r, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, r, DIAL_TOP - 2.6, DIAL_TOP, 72, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, r, DIAL_TOP - 2.6, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, r - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const t = k.radialTicks(x, y, r - 2.6, 40, 5, DIAL_TOP, [1.1, 2.4], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([x, y - (r - 2.6)], [x, y - (r - 6.2)], DIAL_TOP, P), { tone: "hi" }));
  out.push(L(k.ring(x, y, 1.4, DIAL_TOP, P, 16), { tone: "mid" }));
  return out.join("");
}
for (const px of [BAR.x + 8, BAR.x + BAR.w - 8]) {
  cyl(`bar.foot${px}`, px, BAR.y + 5, 6, 0, 2.2, { tone: "lo" }, { steps: 24 });
  cyl(`bar.post${px}`, px, BAR.y + 5, 2.6, 2.2, BAR_Z - 2.2, {}, { steps: 20, extra: L(k.sideArc(px, BAR.y + 5, 2.6, 12, P, 14), { tone: "faint" }) });
}
box("bar", BAR, BAR_Z, BAR_H, {}, { bevel: 0.6, extra: D([BAR.x + 3, BAR.x + BAR.w - 3].map((x) => at([x, BAR.y + 5, BAR_Z + BAR_H])), { size: 0.45 }) });
DIALS.forEach((d, i) => {
  const [x, y] = d.at;
  if (i === 0) {
    cyl("md.foot", x, y, 8, 0, 2.4, { tone: "lo" }, { steps: 28 });
    cyl("md.post", x, y, 3, 2.4, DIAL_Z - 2.4, {}, { steps: 20, extra: L(k.sideArc(x, y, 3, 14, P, 14), { tone: "faint" }) });
  } else cyl(`dial${i}.stem`, x, y, 3.2, BAR_Z + BAR_H, DIAL_Z - BAR_Z - BAR_H, {}, { steps: 20 });
  const shape = record(A.cylinder(x, y, d.r, DIAL_Z, DIAL_H, { name: `dial${i}` }));
  put(`dial${i}`, [x, y, DIAL_Z + 3], dialFace(d), [shape], { bias: 0.1 });
});

// ── region knob ──────────────────────────────────────────────────────────
{
  const [x, y] = KNOB;
  const ticks = KNOB_ANG.map((a) => k.lineOnTop([x + Math.sin(a) * 9.6, y - Math.cos(a) * 9.6], [x + Math.sin(a) * 13.6, y - Math.cos(a) * 13.6], 2.6, P)).join("");
  cyl("knob.base", x, y, 14.4, 0, 2.6, {}, { steps: 52, bevel: 0.6, extra: L(k.ring(x, y, 9.6, 2.6, P, 40), { tone: "lo" }) + L(ticks, { tone: "hi" }) });
  cyl("knob", x, y, 7, 2.6, 7, {}, { steps: 36, bevel: 0.4, extra: L(k.knurl(x, y, 7, 4, 9.6, 44, P), { tone: "lo" }) + L(k.sideArc(x, y, 7, 4, P, 24), { tone: "faint" }) + L(k.ring(x, y, 1.3, KNOB_TOP, P, 14), { tone: "mid" }) });
}

// ── settle the painter's order, then place the live layers in their slots ──
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const idx = (name) => R.items.findIndex((it) => it.name === name);
const lastCell = Math.max(...R.items.map((it, i) => (/^(soma|neurite)\d/.test(it.name) ? i : -1)));
const needleAt = (d, turn) => {
  const a = turn * Math.PI * 2, [x, y] = d.at, top = DIAL_TOP + 0.2;
  return k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (d.r - 3.6), y - Math.cos(a) * (d.r - 3.6)], top, P);
};
const knobPointer = (a) => k.lineOnTop([KNOB[0] + Math.sin(a) * 1.3, KNOB[1] - Math.cos(a) * 1.3], [KNOB[0] + Math.sin(a) * 6.4, KNOB[1] - Math.cos(a) * 6.4], KNOB_TOP, P);
const slots = new Map();
const add = (i, s) => slots.set(i, (slots.get(i) || "") + s);
add(lastCell, `<g data-part="water"></g>`);
DIALS.forEach((d, i) => add(idx(`dial${i}`), `<path data-part="needle-${i}" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(d, 0)}" style="stroke-width:1.1"/>`));
add(idx("knob"), `<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" d="${knobPointer(KNOB_ANG[0])}" style="stroke-width:1"/>`);
add(idx("keypad"), (() => { const [cx, cy] = at([KEYPAD.x + KEYPAD.w - 9, KEYPAD.y + 6, KEYPAD_H]); return `<circle data-part="lamp" class="bl-lamp" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.5"/>`; })());
add(idx("amp.lamp"), (() => { const [cx, cy] = at([AMP.x + 52, AMP_YF + 1.22, 33]); return `<circle data-part="amplamp" class="bl-lamp" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.3"/>`; })());
add(idx("plinth"), `<g data-part="shells">${Array.from({ length: 8 }, (_, i) => { const [cx, cy] = at([LAMP_X(i), LAMP_Y, PLINTH_H / 2]); return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.25" class="bl-shell" opacity="0"/>`; }).join("")}</g>`);
const items = R.items.map((it, i) => `<g data-it="${it.name}">${it.svg}</g>${slots.get(i) || ""}`);
const solids = R.items.length;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A bench diffusion rig built round one 2 millimetre cube of brain, shown cut away. Inside the open cube are cell bodies drawn as spheres, cell branches as rods, and the space between, with water molecules wandering through them. Two flat gradient coils stand either side, fed by a cable harness from a gradient amplifier at the back. A four key pad plays the finger task, a carriage on a ruled rail sets the scan time (before learning, 30 minutes after, 24 hours after), a knurled knob picks the brain region, and four dial gauges read the change from baseline: mean diffusivity on its own post, then the soma, neurite and extracellular fractions on a shared bar.",
  body: [...back, items.join("")],
});

// ── live ─────────────────────────────────────────────────────────────────
const CELL = { soma: SOMA, neurites: NSEG.map((n) => ({ p0: n.p0, p1: n.p1, r: n.r, extra: !!n.extra })), box: [-H + WALL, H, -H + WALL, H, CZ0, CZ1] };
const live = `
const P = ${JSON.stringify(P)};
const REGIONS = ${JSON.stringify(REGIONS)};
const TIMES = ${JSON.stringify(TIMES)};
const TASK = ${JSON.stringify(TASK)};
const DIALS = ${JSON.stringify(DIALS)};
const DIAL_TOP = ${DIAL_TOP + 0.2};
const TURN = ${JSON.stringify(DIAL_TURN)};
const MAG = ${MAGNIFY};
const STOPS = ${JSON.stringify(STOPS)};
const KNOB = ${JSON.stringify(KNOB)}, KNOB_ANG = ${JSON.stringify(KNOB_ANG)}, KNOB_TOP = ${KNOB_TOP};
const CELL = ${JSON.stringify(CELL)};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;

const plate1 = k.plateHtml({
  fig: "Fig 1",
  title: "One voxel, three compartments",
  hint: "Pick a region, train, scan",
  readout: "hippocampus · baseline",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Diffusion rig. Left and right arrows change the scan time, up and down change the brain region, Enter runs a training session." aria-valuemin="0" aria-valuemax="2" aria-valuenow="0">${svg}</div>`,
});
const btn = (attr, label) => `<button type="button" ${attr} aria-pressed="false">${label}</button>`;
const side = `
<div class="bl-side">
  <div class="bl-group"><span class="bl-k">Brain region</span><div class="bl-btns">${REGIONS.map((r, i) => btn(`data-region="${i}"`, r.short === "M1" ? "Motor cortex (M1)" : r.short === "PPC" ? "Parietal (PPC)" : r.name)).join("")}</div></div>
  <div class="bl-group"><span class="bl-k">Scan</span><div class="bl-btns bl-row">${TIMES.map((t, i) => btn(`data-time="${i}"`, i === 0 ? "Before" : t)).join("")}</div><button type="button" class="bl-train" data-train aria-pressed="false">▶ Train: 15 blocks</button></div>
  <div class="bl-enc"><span class="bl-k">In the cube</span><p data-v="enc">Water wanders: trapped in cell bodies, guided along branches, hindered in between.</p><div class="bl-key"><span><i class="s"></i>soma</span><span><i class="n"></i>neurite</span><span><i class="e"></i>extracellular</span></div></div>
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
const caption = `<p class="bl-cap">My own drawing of an imaginary bench instrument, built on the paper’s numbers. The real scan is a whole head in the 3T Connectome scanner (300 mT/m gradients, 2 mm voxels, 7 b values from 200 to 8,000 s/mm² plus b = 0 images, 8 ms pulses 24 ms apart). In the cube, each water molecule carries a little arrow: the first gradient pulse turns it by an amount set by where the molecule is along the coils, the second turns it back by where it is now. Molecules that stayed put end up pointing the same way (signal kept); molecules that wandered do not (signal lost). The walk is a toy simulation, slowed right down, and the cells are a cartoon whose changes are magnified ten times. Dials: MD on its own post (one full turn = 10 % change), then soma, neurite and extracellular fractions (one full turn = 0.04 of the signal). Values are group means read off Fig 3 of Griffa et al., PLOS Biology 24(6): e3003861 (2026), CC BY 4.0, so the third decimal is approximate. The real training took about 15 to 20 minutes; here a block lasts under half a second.</p>`;

const CSS = `
.iso[data-theme="dark"]{
  --anatomy-page:#15131F;--anatomy-card:#1D1B2E;--anatomy-text:#B6BFC1;--anatomy-strong:#F1F0F6;--anatomy-muted:#8C89A6;
  --anatomy-paper:#1D1B2E;--anatomy-face:#2A2840;--anatomy-top:#2C2A41;
  --anatomy-shade-0:#191726;--anatomy-shade-1:#1E1C2E;--anatomy-shade-2:#232135;--anatomy-shade-3:#28263B;
  --anatomy-lit-top:#3A3552;--anatomy-lit-shade:#302C46;
  --anatomy-hi:#E4E2EE;--anatomy-mid:#8F8BAA;--anatomy-lo:#57536F;--anatomy-faint:#3B3853;--anatomy-lit:#F7A6B4;
  --anatomy-halo:#06050B;--anatomy-halo-opacity:.85;--anatomy-dot:#E4E2EE;
  --soma:#F37F94;--neurite:#9C97DC;--ecs:#B6BFC1;--pulse:#F37F94;
}
.iso[data-theme="light"]{--soma:#E25C77;--neurite:#66629C;--ecs:#8A9497;--pulse:#D9436A}
html,body{height:100%}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.bl-root{box-sizing:border-box;min-height:100%;padding:14px;display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:14px;align-items:start;align-content:start;max-width:1220px;margin:0 auto}
.bl-root *{box-sizing:border-box}
.bl-root .iso-figure{margin:0}
.bl-root .iso-plate{padding:40px 10px 38px}
.bl-root .iso-plate-corners{inset:14px 16px}
.iso-stage{outline:none;touch-action:pan-y}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.bl-soma .iso-fill{fill:var(--soma);fill-opacity:.16}
.bl-soma .iso-shade,.bl-soma .iso-top{fill:var(--soma)!important;stroke:none!important;fill-opacity:.12}
.bl-soma .iso-shade[data-shade="0"]{fill-opacity:.26}.bl-soma .iso-shade[data-shade="1"]{fill-opacity:.2}
.bl-soma .iso-edge,.bl-soma .iso-crease{stroke:var(--soma)}
.bl-soma .iso-line{stroke:var(--soma);opacity:.6}
.bl-neurite .iso-fill{fill:var(--neurite);fill-opacity:.2}
.bl-neurite .iso-shade,.bl-neurite .iso-top{fill:var(--neurite);fill-opacity:.18}
.bl-neurite .iso-edge,.bl-neurite .iso-crease{stroke:var(--neurite)}
.bl-new{opacity:0;transition:opacity .6s}
.bl-ecs{fill:var(--ecs);fill-opacity:.07;stroke:none}
.bl-glow{opacity:0}
.bl-glow .iso-line{stroke:var(--pulse);stroke-width:1.1}
.bl-root .iso-svg .bl-mol{stroke:none}
.bl-mol.s{fill:var(--soma)}.bl-mol.n{fill:var(--neurite)}.bl-mol.e{fill:var(--ecs)}
.bl-spin{fill:none;stroke-width:.7;stroke-linecap:round}
.bl-spin.s{stroke:var(--soma)}.bl-spin.n{stroke:var(--neurite)}.bl-spin.e{stroke:var(--ecs)}
.bl-lamp{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:.6;transition:fill .2s}
.bl-lamp[data-on="1"]{fill:var(--pulse)}
.bl-shell{fill:var(--pulse);stroke:none}
.bl-side{display:flex;flex-direction:column;gap:12px}
.bl-group{display:flex;flex-direction:column;gap:6px}
.bl-k{font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted)}
.bl-btns{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.bl-btns.bl-row{grid-template-columns:repeat(3,1fr)}
.bl-root button{min-height:34px;padding:4px 8px;border:1px solid var(--anatomy-lo);background:var(--anatomy-card);color:var(--anatomy-strong);font:12px/1.2 var(--anatomy-mono);cursor:pointer;border-radius:0;text-align:center}
.bl-root button:hover{border-color:var(--anatomy-strong)}
.bl-root button[aria-pressed="true"]{background:var(--soma);border-color:var(--soma);color:#1D1B2E}
.bl-root button:focus-visible{outline:2px solid var(--anatomy-strong);outline-offset:2px}
.bl-train{width:100%}
.bl-enc{border-left:2px solid var(--soma);padding:2px 0 2px 10px;display:flex;flex-direction:column;gap:4px}
.bl-enc p{margin:0;font-size:12.5px;line-height:1.45;color:var(--anatomy-strong);min-height:3.6em}
.bl-key{display:flex;gap:12px;font:11px var(--anatomy-mono);color:var(--anatomy-muted)}
.bl-key i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:0}
.bl-key i.s{background:var(--soma)}.bl-key i.n{background:var(--neurite)}.bl-key i.e{background:var(--ecs)}
.bl-tab{width:100%;border-collapse:collapse;font:12px/1.35 var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.bl-tab caption{text-align:left;font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--anatomy-muted);padding-bottom:4px}
.bl-tab th,.bl-tab td{padding:4px 4px;border-top:1px solid var(--anatomy-faint);text-align:right;font-weight:400}
.bl-tab th[scope="row"],.bl-tab thead th:first-child{text-align:left}
.bl-tab thead th{color:var(--anatomy-muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase;border-top:0}
.bl-tab td:last-child{color:var(--anatomy-muted);font-size:10.5px;white-space:nowrap}
.bl-story{margin:0;font-size:13px;line-height:1.5;color:var(--anatomy-strong)}
.bl-cap{grid-column:1 / -1;margin:0;font-size:12px;line-height:1.55;color:var(--anatomy-muted);max-width:120ch}
@media (max-width:760px){.bl-root{grid-template-columns:minmax(0,1fr);padding:10px}.bl-root .iso-plate{padding:34px 2px 40px}}
@media (max-height:600px) and (min-width:761px){.bl-root{padding:8px;gap:10px}.bl-cap{display:none}.bl-story{display:none}.bl-root .iso-plate{padding:30px 6px 30px}.bl-root .iso-plate-corners{inset:10px 12px}}
`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>One voxel, three compartments · GelasTinta</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${k.ISO_CSS}${CSS}</style></head>
<body class="iso" data-theme="${THEME}"><main class="bl-root">${plate1}${side}${caption}</main>
<script type="module">${(kitScript() + live).replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

writeFileSync(OUT, page);
console.log("wrote", OUT, (page.length / 1024).toFixed(0) + " KB", solids + " items", R.routes.length + " cables", "scale " + KS.toFixed(3));
A.auditOrExit(R, P, { crowd: [["cable.right", "bridge"], ["cable.left", "bridge"]] });
