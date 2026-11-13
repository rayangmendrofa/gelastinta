// Fig 13: the photonic quantum walk of Wang, Xiao, Longhi and Xue (Nature Communications 2026,
// doi:10.1038/s41467-026-78483-z) drawn as an optical bench with the anatomy kit.
// An original drawing: the layout follows the order of optics the paper's text and Methods list,
// not its Fig. 1 (CC BY NC ND), and every number on the card comes from ../gt-skin-shared/walk.mjs.
//
//   node teardowns/gt-skin-figure/build.mjs            light page -> src/static/teardowns/skin-effect.html
//   node teardowns/gt-skin-figure/build.mjs --dark     dark page beside this script (for checks)
//   node teardowns/gt-skin-figure/build.mjs --audit    also runs the kit's geometry audit
//
// The kit lives outside the repo: set ANATOMY_KIT (default /home/claude/anatomy-ref).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = process.env.ANATOMY_KIT || "/home/claude/anatomy-ref";
const k = await import(pathToFileURL(join(KIT, "kit/iso-kit.mjs")).href);
const G = await import(pathToFileURL(join(KIT, "kit/lathe.mjs")).href);
const A = await import(pathToFileURL(join(KIT, "kit/audit.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(KIT, "scripts/inline-kit.mjs")).href);

const DARK = process.argv.includes("--dark");
const THEME = DARK ? "dark" : "light";

const W = 760;
const H = 470;
const ZB = 34; // beam height above the breadboard
const PLATE = { x: -352, y: -76, w: 650, d: 152, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const STEP = { x: -172, y: -20, w: 302, d: 40, r: 3 }; // raised plate carrying one step of the walk
const STEP_H = 3;
const APD = { x: 262, y: -68, w: 24, d: 136, r: 2.5 }; // detector bank
const APD_H = 44;
const PITCH = 7.6; // spacing of the 17 detector channels (walk positions -8 .. 8)
const BAR_MAX = 64;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [APD.x, APD.y, APD_H + BAR_MAX], [APD.x + APD.w, APD.y + APD.d, APD_H + BAR_MAX], [-330, 0, 52]],
  W,
  H,
  { pad: 14, azimuth: 38, elevation: 30 },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const f2 = (v) => Math.round(v * 100) / 100;
const XF = (x, y = 0, z = ZB) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "bench", ...rest });
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.6, steps = 3, bevel = 0.4, extra = "", inner = "", bias = 0, attrs } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
function post(name, x, y, z0, z1, { r = 2.1, collar = true, bias = 0 } = {}) {
  if (collar) {
    const c = record(A.cylinder(x, y, r + 1.6, z0, 2.4, { name: name + ".collar" }));
    put(name + ".collar", [x, y, z0 + 1.2], S(k.cylinder(x, y, r + 1.6, z0, 2.4, P, 24, 0.3), { tone: "lo" }), [c]);
    z0 += 2.4;
  }
  const shape = record(A.cylinder(x, y, r, z0, z1 - z0, { name }));
  put(name, [x, y, (z0 + z1) / 2], S(k.cylinder(x, y, r, z0, z1 - z0, P, 20), { tone: "mid", crease: "none", inner: Ln(k.sideArc(x, y, r, z0 + (z1 - z0) * 0.55, P, 12), { tone: "faint" }) }), [shape], { bias });
}
// A round mount whose axis is the beam: a ring with a flush glass plate and a fast axis mark.
const RO = 9;
const RI = 6.6;
function ringMount(name, x, { z0 = STEP_H, angle = null, plate = "lo", live = null, rOut = RO, rIn = RI } = {}) {
  const F = XF(x);
  post(name + ".post", x, 0, z0, ZB - rOut);
  const ring = record(A.ring(F, -2, 2, rIn, rOut, { name: name + ".ring" }));
  const glass = record(A.disc(F, -1.8, 1.8, rIn, { name: name + ".glass" }));
  let mark = "";
  if (angle !== null || live) {
    const d = axisMark(x + 2, 0, ZB, rIn + 1.1, angle ?? 0);
    mark = `<path class="iso-line sk-axis" data-tone="hi" ${live ? `data-axis="${live}"` : ""} d="${d}"/>`;
  }
  // one item: the glass sits inside the ring's bore, so they are painted together, glass last
  const rings = Ln(G.circleOf(F, 2, rIn + 1.1, P), { tone: "faint" });
  put(name + ".ring", [x, 0, ZB], S(G.ringBand(-2, 2, rIn, rOut, F, P, { steps: 56, bevel: 0.25 }), { tone: "mid", inner: rings }) + Dots(G.dotsOf(F, 2, rIn + 1.1, 6, P, { phase: 0.4, all: true }), { size: 0.4, tone: "lo" }) + S(G.disc(-1.8, 1.8, rIn, F, P, { steps: 48 }), { tone: plate, crease: "none" }) + mark + spot(x + 1.8, 0, ZB), [ring, glass]);
  return { far: x - 1.8, near: x + 1.8 };
}
// fast axis of a wave plate: a line across the plate face at angle a (degrees from the horizontal)
function axisMark(x, y, z, r, a) {
  const t = (a * Math.PI) / 180;
  return k.pathOf([at([x, y - r * Math.cos(t), z - r * Math.sin(t)]), at([x, y + r * Math.cos(t), z + r * Math.sin(t)])]);
}
// where the beam leaves a glass face: a small bright spot
const spot = (x, y, z) => `<circle class="sk-spot" cx="${f2(at([x, y, z])[0])}" cy="${f2(at([x, y, z])[1])}" r="1.15"/>`;

const back = [];
const front = [];

// ── Base: breadboard on four feet, tapped hole grid, groove, corner screws, ruler and label plate
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
const GROOVE = k.insetPlan(PLATE, 6);
back.push(Ln(k.planOutline(GROOVE, 0, P), { tone: "lo" }));
{
  const holes = [];
  for (let x = PLATE.x + 18; x <= PLATE.x + PLATE.w - 18; x += 12.5) for (let y = PLATE.y + 16; y <= PLATE.y + PLATE.d - 26; y += 12.5) holes.push(at([x, y, 0]));
  back.push(Dots(holes, { size: 0.42, tone: "lo" }));
}
const screws = k.corners(PLATE, 11);
back.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
const STRIP = { x: PLATE.x + 24, y: PLATE.y + PLATE.d - 15, w: 380, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
{
  const t = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 5, 5, STRIP.y, 0.6, [1.8, 3.4], P);
  back.push(Ln(t.minor, { tone: "lo" }), Ln(t.major, { tone: "mid" }));
  back.push(Dots([at([STRIP.x + 2, STRIP.y + 3, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3, 0.6])], { size: 0.45 }));
}
const LABEL = { x: 150, y: PLATE.y + PLATE.d - 30, w: 40, d: 14, r: 1.2 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.5), 0.8, P, 3), { tone: "faint" }));
back.push(Ln([26, 18, 22].map((w, i) => k.lineOnTop([LABEL.x + 4, LABEL.y + 3.6 + i * 3.2], [LABEL.x + 4 + w, LABEL.y + 3.6 + i * 3.2], 0.8, P)).join(""), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + 36.6, LABEL.y + 3, 0.8]), at([LABEL.x + 36.6, LABEL.y + 11, 0.8])], { size: 0.45 }));

// ── The raised plate that carries one step of the walk, with its one engraved label
box("stand.step", [STEP.x, STEP.y, 0], [STEP.x + STEP.w, STEP.y + STEP.d, STEP_H], { tone: "lo" }, {
  r: STEP.r,
  steps: 4,
  bevel: 0.5,
  extra:
    Dots(k.corners(STEP, 4).map(([x, y]) => at([x, y, STEP_H])), { size: 0.5 }) +
    k.faceTextSvg(k.topMatrix([STEP.x + STEP.w - 30, STEP.y + STEP.d - 5], STEP_H, P, "x"), "STEP × 8", { size: 3.2, tone: "lo" }),
});

// stations along the beam, in the order the paper lists them; far/near are where the beam meets each one
const ST = [];

// ── Source: pump housing with a crystal (BBO) and a filter, then the polarising cube
{
  const x0 = -338, x1 = -288;
  box("src.housing", [x0, -17, 0], [x1, 17, 50], { tone: "mid" }, {
    r: 2.5,
    steps: 4,
    bevel: 1,
    inner: Ln(k.sideSeam({ x: x0, y: -17, w: x1 - x0, d: 34, r: 2.5 }, 8, P, 4), { tone: "faint" }),
    extra:
      [0, 1, 2, 3].map((i) => Ln(k.planOutline({ x: x0 + 8 + i * 6, y: -11, w: 2.6, d: 16, r: 1.2 }, 50, P, 3), { tone: "lo" })).join("") +
      Ln(k.planOutline({ x: x0 + 34, y: -11, w: 11, d: 22, r: 1 }, 50, P, 3), { tone: "faint" }) +
      Ln([7, 5].map((w, i) => k.lineOnTop([x0 + 36, -7 + i * 4], [x0 + 36 + w, -7 + i * 4], 50, P)).join(""), { tone: "lo", free: true }) +
      Dots([at([x0 + 3, -14, 50]), at([x0 + 3, 14, 50]), at([x1 - 3, -14, 50]), at([x1 - 3, 14, 50])], { size: 0.5 }),
  });
  // output aperture on the near face
  const F = XF(x1);
  const ap = record(A.ring(F, 0, 2.2, 3, 6, { name: "src.aperture" }));
  put("src.aperture", [x1 + 1.1, 0, ZB], S(G.ringBand(0, 2.2, 3, 6, F, P, { steps: 40, bevel: 0.2 }), { tone: "hi" }), [ap], { bias: 0.1 });
  // key switch on top
  const kn = record(A.cylinder(x0 + 22, 8, 3.2, 50, 3.4, { name: "src.key" }));
  put("src.key", [x0 + 22, 8, 51.7], S(k.cylinder(x0 + 22, 8, 3.2, 50, 3.4, P, 24, 0.3), { tone: "mid" }) + Ln(k.knurl(x0 + 22, 8, 3.2, 50, 53.4, 22, P), { tone: "lo" }) + Ln(k.lineOnTop([x0 + 20, 8], [x0 + 24.6, 8], 53.4, P), { tone: "hi" }), [kn]);
  ST.push({ name: "source", far: null, near: x1 });
}
{
  const x = -268;
  post("bbo.post", x, 0, 0, ZB - 6.5);
  box("bbo.table", [x - 5, -5, ZB - 6.5], [x + 5, 5, ZB - 4], { tone: "mid" }, { r: 1, bevel: 0.3 });
  box("bbo.crystal", [x - 3, -3, ZB - 4], [x + 3, 3, ZB + 3.6], { tone: "hi" }, { r: 0.3, steps: 2, bevel: 0.3, extra: spot(x + 3, 0, ZB) });
  ST.push({ name: "bbo", far: x - 3, near: x + 3 });
}
ST.push({ name: "filter", ...ringMount("filter", -248, { z0: 0, plate: "lo" }) });
function cube(name, x, z0) {
  post(name + ".post", x, 0, z0, ZB - 9);
  box(name + ".table", [x - 8, -8, ZB - 9], [x + 8, 8, ZB - 6], { tone: "mid" }, { r: 1.2, bevel: 0.4, extra: Dots(k.corners({ x: x - 8, y: -8, w: 16, d: 16, r: 1 }, 2).map(([a, b]) => at([a, b, ZB - 6])), { size: 0.4 }) });
  box(name, [x - 6, -6, ZB - 6], [x + 6, 6, ZB + 6], { tone: "hi" }, { r: 0.3, steps: 2, bevel: 0.35, extra: Ln(k.lineOnTop([x - 6, -6], [x + 6, 6], ZB + 6, P), { tone: "lo" }) + spot(x + 6, 0, ZB) });
  return { far: x - 6, near: x + 6 };
}
ST.push({ name: "pbs1", ...cube("pbs1", -226, 0) });
ST.push({ name: "hwp.prep", ...ringMount("hwp.prep", -205, { z0: 0, angle: 22.5 }) });
ST.push({ name: "qwp.prep", ...ringMount("qwp.prep", -186, { z0: 0, angle: 45 }) });

// ── Dephasing: a flip mount that swings a half wave plate (HD, at 0°) into the beam, or up out of it
{
  const x = -154;
  post("hd.side", x, 13, STEP_H, ZB + 12, { r: 2.1 });
  box("hd.arm", [x - 3, -3, ZB + 12], [x + 3, 15.5, ZB + 15], { tone: "mid" }, { r: 1, bevel: 0.3, extra: Dots([at([x, 13, ZB + 15])], { size: 0.45 }) });
  // hinge barrel along y under the arm, and the swinging holder in both poses
  const HF = G.frameOf([x, -3, ZB + 10.6], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const hinge = record(A.disc(HF, 0, 6, 1.4, { name: "hd.hinge" }));
  put("hd.hinge", [x, 0, ZB + 10.6], S(G.disc(0, 6, 1.4, HF, P, { steps: 20 }), { tone: "mid" }), [hinge], { bias: 0.02 });
  const F = XF(x);
  const ringIn = record(A.ring(F, -1.6, 1.6, 5.6, 7.6, { name: "hd.ring" }));
  const stem = { x: x - 1.2, y: -2, w: 2.4, d: 4, r: 0.6 };
  const stemIn = S(k.slabOf(stem, ZB + 7.6, 1.6, P, 2), { tone: "mid", crease: "none" });
  const inSvg = S(G.ringBand(-1.6, 1.6, 5.6, 7.6, F, P, { steps: 48, bevel: 0.2 }), { tone: "mid" }) + S(G.disc(-1.4, 1.4, 5.6, F, P, { steps: 40 }), { tone: "lo", crease: "none" }) + `<path class="iso-line sk-axis" data-tone="hi" d="${axisMark(x + 1.4, 0, ZB, 4.6, 0)}"/>`;
  // flipped: the holder lies flat behind the hinge (it swings about y, away from the viewer)
  const cx = x - 9, cz = ZB + 10.6;
  const outSvg = S(k.cylinder(cx, 0, 7.6, cz - 1.6, 3.2, P, 40, 0.2), { tone: "mid" }) + S(k.cylinder(cx, 0, 5.6, cz + 1.4, 0.2, P, 36), { tone: "lo", crease: "none" }) + Ln(k.lineOnTop([cx - 4.6, 0], [cx + 4.6, 0], cz + 1.6, P), { tone: "hi" });
  const glassIn = record(A.disc(F, -1.4, 1.4, 5.6, { name: "hd.glass" }));
  const stemShape = record(A.slab(stem, ZB + 7.6, 1.6, { name: "hd.stem" }, 2));
  const outShape = record(A.cylinder(cx, 0, 7.6, cz - 1.6, 3.2, { name: "hd.flipped" }));
  put("hd.holder", [x, 0, ZB + 3], `<g data-hd="in" style="display:none">${stemIn}${inSvg}${spot(x + 1.6, 0, ZB)}</g><g data-hd="out">${outSvg}<path class="sk-beam" d="${k.pathOf([at([x - 1.4, 0, ZB]), at([x + 1.4, 0, ZB])])}"/></g>`, [ringIn, glassIn, stemShape, outShape], { bias: 0.04 });
  ST.push({ name: "hd", far: x - 1.4, near: x + 1.4, flip: true });
}

// ── The loss: beam displacer, a twin plate holder (HM in the upper path, a fixed 45° plate in the lower), beam displacer, dump
const DISP = 8; // the displacers move vertical polarisation into the upper path
function displacer(name, x) {
  post(name + ".post", x, 0, STEP_H, ZB - 10);
  box(name + ".table", [x - 14, -9, ZB - 10], [x + 14, 9, ZB - 7], { tone: "mid" }, { r: 1.4, bevel: 0.4, extra: Dots([at([x - 11, -6, ZB - 7]), at([x + 11, -6, ZB - 7]), at([x - 11, 6, ZB - 7]), at([x + 11, 6, ZB - 7])], { size: 0.4 }) });
  box(name, [x - 12, -6, ZB - 7], [x + 12, 6, ZB + DISP + 6], { tone: "hi" }, { r: 0.4, steps: 2, bevel: 0.4, inner: Ln(k.sideSeam({ x: x - 12, y: -6, w: 24, d: 12, r: 0.4 }, ZB + DISP + 2.5, P, 2), { tone: "faint" }) });
  return { far: x - 12, near: x + 12 };
}
ST.push({ name: "bd1", ...displacer("bd1", -122), split: true });
{
  const x = -92;
  post("twin.post", x, 0, STEP_H, ZB - 9);
  box("twin.plate", [x - 1.5, -9, ZB - 9], [x + 1.5, 9, ZB + DISP + 9], { tone: "mid" }, { r: 0.5, steps: 2, bevel: 0.3, extra: Dots([at([x + 1.5, -7, ZB - 7]), at([x + 1.5, 7, ZB - 7]), at([x + 1.5, -7, ZB + DISP + 7]), at([x + 1.5, 7, ZB + DISP + 7])], { size: 0.45 }) });
  for (const [z, live, name] of [[ZB + DISP, "hm", "twin.hm"], [ZB, "low", "twin.low"]]) {
    const F = XF(x, 0, z);
    const ring = record(A.ring(F, 1.5, 2.6, 3.6, 4.4, { name: name + ".bezel" }));
    const glass = record(A.disc(F, 1.5, 2.4, 3.6, { name }));
    put(name, [x + 2, 0, z], S(G.ringBand(1.5, 2.6, 3.6, 4.4, F, P, { steps: 32 }), { tone: "hi" }) + S(G.disc(1.5, 2.4, 3.6, F, P, { steps: 32 }), { tone: "lo", crease: "none" }) + `<path class="iso-line sk-axis" data-tone="hi" data-axis="${live}" d="${axisMark(x + 2.4, 0, z, 3, 45)}"/>` + spot(x + 2.4, 0, z), [ring, glass], { bias: 0.1 });
  }
  ST.push({ name: "twin", far: x - 1.5, near: x + 2.4, two: true });
}
ST.push({ name: "bd2", ...displacer("bd2", -62), merge: true });
box("bd2.dump", [-50, -5, ZB + 4], [-42, 5, ZB + 13], { tone: "lo" }, {
  r: 0.6,
  bevel: 0.3,
  attrs: ' data-dump=""',
  extra: Ln([0, 1, 2].map((i) => k.planOutline({ x: -48.6 + i * 2.2, y: -3.6, w: 1.2, d: 7.2, r: 0.5 }, ZB + 13, P, 2)).join(""), { tone: "mid" }),
});
ST.push({ name: "hwp.b", ...ringMount("hwp.b", -30, { angle: 45, live: "b" }) });

// ── Coin C(θ): two half wave plates at 0° and θ/2.  Shift S: QWP, q plate, QWP, HWP.
ST.push({ name: "coin.0", ...ringMount("coin.0", -8, { angle: 0 }) });
ST.push({ name: "coin.t", ...ringMount("coin.t", 12, { angle: 22.5 }) });
ST.push({ name: "shift.q1", ...ringMount("shift.q1", 34, { angle: 135 }) });
{
  // the q plate: a liquid crystal cell whose optic axis swirls round the centre (charge q = 1/2)
  const x = 56;
  const r = ringMount("qplate", x, { plate: "lo", rOut: RO + 1, rIn: RI + 0.4 });
  const F = XF(x);
  const swirl = [];
  for (let i = 0; i < 12; i++) {
    const phi = (i / 12) * Math.PI * 2;
    const dir = phi / 2; // q = 1/2: the axis turns half as fast as you go round
    const c = G.pointOf(F, 1.85, 4, phi);
    const d = [0, Math.cos(dir) * 1.3, Math.sin(dir) * 1.3];
    swirl.push(k.pathOf([at(G.sub3(c, d)), at(G.add3(c, d))]));
  }
  front.push(`<g data-after="qplate.glass">${Ln(swirl.join(""), { tone: "mid", free: true })}</g>`);
  ST.push({ name: "qplate", ...r });
}
ST.push({ name: "shift.q2", ...ringMount("shift.q2", 78, { angle: 135 }) });
ST.push({ name: "shift.h", ...ringMount("shift.h", 100, { angle: 0 }) });

// ── Detection: polarisation analysis, spatial light modulator, mode sorter, then the detector bank
ST.push({ name: "hwp.an", ...ringMount("hwp.an", 146, { z0: 0, angle: 0 }) });
ST.push({ name: "pbs2", ...cube("pbs2", 168, 0) });
{
  const x = 192;
  post("slm.post", x, 0, 0, ZB - 13);
  box("slm.panel", [x - 2, -15, ZB - 13], [x + 2, 15, ZB + 13], { tone: "mid" }, {
    r: 0.6,
    steps: 2,
    bevel: 0.4,
    extra: Ln(k.pathOf([at([x + 2, -11, ZB - 9]), at([x + 2, 11, ZB - 9]), at([x + 2, 11, ZB + 9]), at([x + 2, -11, ZB + 9])], true), { tone: "lo" }) + spot(x + 2, 0, ZB),
  });
  box("slm.driver", [x - 4, -6, ZB + 13], [x + 4, 6, ZB + 18], { tone: "lo" }, { r: 0.8, bevel: 0.3, extra: Dots([at([x - 2, -3, ZB + 18]), at([x - 2, 3, ZB + 18])], { size: 0.4 }) });
  ST.push({ name: "slm", far: x - 2, near: x + 2 });
}
const SORT = { x0: 206, x1: 224 };
{
  box("sorter.table", [SORT.x0 - 2, -12, 0], [SORT.x1 + 2, 12, ZB - 10], { tone: "lo" }, { r: 1.5, bevel: 0.5 });
  box("sorter", [SORT.x0, -10, ZB - 10], [SORT.x1, 10, ZB + 10], { tone: "mid" }, {
    r: 1.2,
    steps: 3,
    bevel: 0.5,
    inner: Ln(k.sideSeam({ x: SORT.x0, y: -10, w: SORT.x1 - SORT.x0, d: 20, r: 1.2 }, ZB + 6, P, 3), { tone: "faint" }),
    extra: Dots(k.corners({ x: SORT.x0, y: -10, w: SORT.x1 - SORT.x0, d: 20, r: 1 }, 2.5).map(([a, b]) => at([a, b, ZB + 10])), { size: 0.45 }),
  });
  // exit window: the sorter turns each OAM value into its own spot along a line
  box("sorter.window", [SORT.x1, -11, ZB - 2.6], [SORT.x1 + 1.6, 11, ZB + 2.6], { tone: "hi" }, { r: 0.4, steps: 2, bevel: 0.2 });
  ST.push({ name: "sorter", far: SORT.x0, near: SORT.x1 + 1.6 });
}
// detector bank: one housing, 17 windows facing the sorter, a ruler strip and the count columns on top
const chanY = (n) => -n * PITCH; // walk position +n (the drift direction) sits toward screen right
box("apd.housing", [APD.x, APD.y, 0], [APD.x + APD.w, APD.y + APD.d, APD_H], { tone: "mid" }, {
  r: APD.r,
  steps: 4,
  bevel: 0.8,
  inner: Ln(k.sideSeam(APD, 10, P, 4), { tone: "faint" }),
  extra:
    Dots(Array.from({ length: 17 }, (_, i) => at([APD.x + APD.w, chanY(i - 8), 30])), { size: 0.55, tone: "hi" }) +
    Ln(k.pathOf([at([APD.x + APD.w, APD.y + 6, 25]), at([APD.x + APD.w, APD.y + APD.d - 6, 25]), at([APD.x + APD.w, APD.y + APD.d - 6, 35]), at([APD.x + APD.w, APD.y + 6, 35])], true), { tone: "lo" }) +
    Dots([at([APD.x + 3, APD.y + 3, APD_H]), at([APD.x + APD.w - 3, APD.y + 3, APD_H]), at([APD.x + 3, APD.y + APD.d - 3, APD_H]), at([APD.x + APD.w - 3, APD.y + APD.d - 3, APD_H])], { size: 0.5 }),
});
{
  const strip = { x: APD.x + APD.w - 6, y: APD.y + 4, w: 4.5, d: APD.d - 8, r: 0.8 };
  const t = k.topTicks(chanY(8), chanY(-8), PITCH, 4, strip.x + 4.5, APD_H + 0.5, [1.4, 2.8], P, "y");
  const sh = record(A.slab(strip, APD_H, 0.5, { name: "apd.strip" }, 2));
  put("apd.strip", [strip.x + 2, 0, APD_H + 0.25], S(k.slabOf(strip, APD_H, 0.5, P, 2), { tone: "lo", crease: "none" }) + Ln(t.minor, { tone: "lo" }) + Ln(t.major, { tone: "mid" }), [sh], { bias: 0.05 });
}
const BAR = { x: APD.x + 4, w: 12, d: 4.8 };

// ── The beam between optics: one recorded line per gap, each with a slot for the photons in flight
const gaps = [];
for (let i = 0; i + 1 < ST.length; i++) {
  const a = ST[i], b = ST[i + 1];
  const lanes = a.split || a.name === "twin" ? [ZB, ZB + DISP] : [ZB];
  lanes.forEach((z, lane) => {
    const p0 = [a.near, 0, z], p1 = [b.far, 0, z];
    const name = `beam.${i}.${lane}`;
    R.route(name, [p0, p1], 0.45, { limp: true, piece: "bench" });
    put(name, [(a.near + b.far) / 2, 0, z], `<path class="sk-beam" data-gap="${gaps.length}" d="${k.pathOf([at(p0), at(p1)])}"/><g data-ph="${gaps.length}"></g>`, [A.tube([p0, p1], 0.45, { name, limp: true })], { bias: 0.02 });
    gaps.push({ i, lane, x0: a.near, x1: b.far, z });
  });
}
// the fan from the sorter to the 17 windows
const fans = [];
for (let n = -8; n <= 8; n++) {
  const p0 = [SORT.x1 + 1.6, -n * 1.3, ZB], p1 = [APD.x, chanY(n), ZB];
  const name = `fan.${n + 8}`;
  R.route(name, [p0, p1], 0.3, { limp: true, piece: "bench", rims: [0, 0] });
  put(name, G.lerp3(p0, p1, 0.5), `<path class="sk-fan" data-fan="${n + 8}" d="${k.pathOf([at(p0), at(p1)])}"/><g data-phf="${n + 8}"></g>`, [A.tube([p0, p1], 0.3, { name, limp: true })], { bias: 0.02 });
  fans.push({ n, p0, p1 });
}

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const after = new Map(front.map((svg) => [svg.match(/data-after="([^"]+)"/)[1], svg]));
const groups = R.items.map((item) => `<g class="it" data-name="${item.name}"${item.attrs ?? ""}>${item.svg}</g>${after.get(item.name) ?? ""}${item.name === "apd.strip" ? '<g data-part="bars"></g>' : ""}`);

const svg = k.figureSvg({
  width: W,
  height: H,
  label:
    "An optical bench for a photonic quantum walk. From left: a photon source, a crystal and filter, a polarising cube and two wave plates that set the starting polarisation. Then, on a raised plate, one step of the walk: a flip mount that swings a wave plate in and out of the beam to scramble the phase, two beam displacers with a plate in the upper path that throws away part of one polarisation (the loss), a dump for the lost light, two wave plates for the coin and a q plate between quarter wave plates for the step. Then polarisation analysis, a spatial light modulator, a mode sorter and a bank of 17 detectors whose count columns pile up toward one end.",
  body: [...back, `<g class="sk-bench">${groups.join("")}</g>`],
});

const DATA = {
  P,
  ZB,
  DISP,
  gaps,
  fans: fans.map((f) => ({ n: f.n, p0: f.p0, p1: f.p1 })),
  stations: ST.map((s) => ({ name: s.name, far: s.far, near: s.near })),
  hm: { x: -92 + 2.4, z: ZB + DISP, r: 3 },
  low: { x: -92 + 2.4, z: ZB, r: 3 },
  b: { x: -30 + 2, z: ZB, r: RI + 1.1 },
  bar: BAR,
  chan: Array.from({ length: 17 }, (_, i) => chanY(i - 8)),
  apdTop: APD_H,
  barMax: BAR_MAX,
};

const walkSrc = readFileSync(join(HERE, "..", "gt-skin-shared", "walk.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "skin.css"), "utf8");

const controls = `<div class="sk-ctl" role="group" aria-label="Settings of the walk">
<label class="sk-row"><span>Loss bias γ</span><input type="range" min="0" max="1" step="0.001" data-in="gamma" aria-label="Loss strength gamma"><b data-out="gamma">0.40</b></label>
<label class="sk-row"><span>Dephasing η</span><input type="range" min="0" max="1" step="0.01" data-in="eta" aria-label="Dephasing strength eta"><b data-out="eta">0.00</b></label>
<label class="sk-row"><span>Damping μ</span><input type="range" min="0" max="1" step="0.01" data-in="mu" aria-label="Amplitude damping strength mu"><b data-out="mu">0.00</b></label>
<label class="sk-row"><span>Steps t</span><input type="range" min="1" max="8" step="1" data-in="steps" aria-label="Number of steps"><b data-out="steps">8</b></label>
<div class="sk-row sk-btns"><span>Damping goes</span><button type="button" data-order="before" aria-pressed="true">before the loss</button><button type="button" data-order="after" aria-pressed="false">after the loss</button></div>
<div class="sk-row sk-btns"><span>Paper settings</span><button type="button" data-preset="0">γ 0.4</button><button type="button" data-preset="1">γ 0.854</button><button type="button" data-preset="2">γ 0.93</button><button type="button" data-tour aria-pressed="true">Tour</button></div>
</div>
<div class="sk-nums" aria-live="polite"><div><span>Centre of mass after t steps</span><b data-num="n">0</b></div><div><span>Drift per step, long run</span><b data-num="v">0</b></div><div><span>Photons left after t steps</span><b data-num="s">0</b></div></div>`;

const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 13",
    title: "A quantum walk on a bench",
    hint: "Move the sliders, or let it tour the paper's settings",
    readout: "γ 0.40 · η 0.00 · drift 0.71",
    keys: [
      { mark: "lit", label: "Count columns show the share of surviving photons at each position" },
      { mark: "blue", label: "Beam and photons in flight" },
      { mark: "raised", label: "One step of the walk, which the experiment repeats 8 times" },
    ],
    caption:
      "My drawing of the kind of bench the paper describes, not its setup to scale. Photons start at position 0 with polarisation (H + iV)/√2. Each step, a beam displacer pair and the plate HM throw away a share γ of the vertical light (the loss), two half wave plates turn the polarisation by θ = π/4 (the coin), and a q plate moves the photon one place left or right depending on its polarisation (the shift). The flip mount applies dephasing η by sometimes adding a half wave plate at 0°. For amplitude damping μ the same plates alternate between two settings. The columns show the share of surviving photons at each position after t steps, from my own density matrix model of the paper's equations. Drift values match the paper's Eq. 1 to 3 and its fits (0.71 and 0.25 at γ = 0.4, both about 0.75 at γ = 0.854, 0.78 and 0.87 at γ = 0.93). The real experiment reads one position at a time with the modulator and a single detector. The bank of 17 is drawn for clarity.",
    body: `<div class="iso-stage sk-stage" tabindex="0" role="group" aria-label="Optical bench for the quantum walk. Use the sliders under the drawing to change the loss, the dephasing, the damping and the number of steps.">${svg}</div>${controls}`,
  });

const page = k.pageHtml({ title: "A quantum walk on a bench · GelasTinta", theme: THEME, body, script: kitScript() + walkSrc + LIVE, width: 980 })
  .replace("<head>", '<head><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml">');
const out = DARK ? join(HERE, "skin-effect-dark.html") : join(HERE, "..", "..", "src", "static", "teardowns", "skin-effect.html");
writeFileSync(out, page);
console.log("wrote", out, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`);
A.auditOrExit(R, P, {});
