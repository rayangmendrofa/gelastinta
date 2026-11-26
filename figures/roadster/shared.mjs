// Shared pieces for the two Roadster figures: the anatomy kit and its lathe module inlined for the page, and the
// flying car drawn from kit prisms and discs in any pose (the page calls carSvg every frame). World units are 0.1 m.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ANAT = "/home/claude/anatomy";
const strip = (file) => readFileSync(join(ANAT, "kit", file), "utf8").replace(/^export /gm, "");
const LATHE_API = ["frameOf", "frameAlong", "prismOf", "disc", "ringBand", "sphereOf", "lathe", "solidOf", "circleOf", "arcOf"];
/** the kit, then lathe.mjs in its own scope (three helper names clash with the kit's), exposed as G */
export function pageKit() {
  const lathe = strip("lathe.mjs").replace(/^import .*$/m, "");
  return `${strip("iso-kit.mjs")}\nconst G = (() => {\n${lathe}\nreturn { ${LATHE_API.join(", ")} };\n})();\n`;
}

export const U = 10; // units per metre
// the car, in body axes (x forward, y left, z up), units. The side profile is extruded across the width.
export const CAR = {
  body: [[-22, -2.5], [22, -2.5], [22.6, 1.2], [12, 4.4], [-16, 5], [-22.6, 2]],
  cab: [[-10, 4.6], [8.5, 4.6], [1.5, 9.2], [-7, 9.2]],
  half: 9.2,
  cabHalf: 7.2,
  wheelX: [-15.5, 15.5],
  wheelZ: -2,
  wheelR: 3.5,
  wheelY: [9.2, 11.6],
  fans: [[-7, -4.4], [-7, 4.4], [4, -4.4], [4, 4.4]],
  fanR: 3,
  nozzles: [[13.5, 8.2], [13.5, -8.2], [-13.5, -8.2], [-13.5, 8.2]], // thruster 1..4: front left, front right, rear right, rear left
  nozR: 1.1,
};

/** page code: carSvg(o, ex, ey, ez, { T, Tmax, fans, lit, tone }) draws the car at o with body axes ex, ey, ez */
export const CAR_RUNTIME = `
const CAR = ${JSON.stringify(CAR)};
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const towardEye = (() => { const c = cameraOf(P); return [c.cosA * c.cosE, c.sinA * c.cosE, c.sinE]; })();
function plumeSvg(a, dir, len, w0, w1) {
  const b = add3(a, mul3(dir, len));
  const sa = iso(a, P), sb = iso(b, P);
  const dx = sb[0] - sa[0], dy = sb[1] - sa[1], n = Math.hypot(dx, dy) || 1;
  const px = -dy / n, py = dx / n, k = cameraOf(P).k;
  const pts = [[sa[0] + px * w0 * k, sa[1] + py * w0 * k], [sb[0] + px * w1 * k, sb[1] + py * w1 * k], [sb[0] - px * w1 * k, sb[1] - py * w1 * k], [sa[0] - px * w0 * k, sa[1] - py * w0 * k]];
  return '<path class="rd-plume" d="M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z"/>';
}
function carSvg(o, ex, ey, ez, { T = [0, 0, 0, 0], Tmax = 1, fans = 0, lit = true, tone = "hi", shape = null } = {}) {
  const C = shape ? { ...CAR, ...shape } : CAR;
  const at = (x, y, z) => add3(o, add3(mul3(ex, x), add3(mul3(ey, y), mul3(ez, z))));
  const Fb = (org) => G.frameOf(org, ey, ex, ez);
  const S = (paths, t, l) => solidSvg(paths, { tone: t, lit: l, crease: "faint" });
  const nearY = dot3(ey, towardEye) >= 0 ? 1 : -1;
  const topSeen = dot3(ez, towardEye) >= 0;
  const wheel = (x, side) => {
    const y0 = side * CAR.wheelY[0], y1 = side * CAR.wheelY[1];
    const c = at(x, 0, CAR.wheelZ);
    const F = G.frameOf(c, mul3(ey, side), ex, ez);
    const out = S(G.disc(Math.abs(y0), Math.abs(y1), CAR.wheelR, F, P, { steps: 40 }), "lo", false);
    return out + S(G.disc(Math.abs(y1), Math.abs(y1) + 0.3, 1.8, F, P, { steps: 24 }), "mid", false);
  };
  const wheels = (side) => C.wheelX.map((x) => wheel(x, side)).join("");
  const belly = () => {
    let s = "";
    const down = mul3(ez, -1);
    CAR.fans.forEach(([x, y]) => {
      const F = G.frameOf(at(x, y, -2.5), down, ex, ey);
      s += S(G.disc(0, 0.5, CAR.fanR, F, P, { steps: 32 }), "mid", false);
      s += S(G.disc(0.5, 0.8, 1.1, F, P, { steps: 16 }), fans > 0.05 ? "hi" : "lo", false);
    });
    CAR.nozzles.forEach(([x, y], i) => {
      const F = G.frameOf(at(x, y, -2.5), down, ex, ey);
      s += S(G.disc(0, 1.2, CAR.nozR, F, P, { steps: 20 }), T[i] > 1 ? "hi" : "mid", false);
    });
    return s;
  };
  const plumes = () => CAR.nozzles.map(([x, y], i) => (T[i] > 1 ? plumeSvg(at(x, y, -3.7), mul3(ez, -1), 4 + 26 * Math.min(1, T[i] / Tmax), 0.9, 2.2 + 3 * Math.min(1, T[i] / Tmax)) : "")).join("");
  const body = S(G.prismOf(Fb(o), C.body, -C.half, C.half, P), tone, lit);
  const cab = C.cab ? S(G.prismOf(Fb(o), C.cab, -C.cabHalf, C.cabHalf, P), "mid", false) : "";
  const plumesBehind = dot3(mul3(ez, -1), towardEye) < 0;
  let s = "";
  if (plumesBehind) s += plumes();
  s += wheels(-nearY);
  s += topSeen ? body + cab : cab + body;
  if (!topSeen) s += belly();
  s += wheels(nearY);
  if (!plumesBehind) s += plumes();
  return s;
}
`;

export const EXTRA_CSS = `
.rd-plume{fill:var(--anatomy-blue);opacity:.28;stroke:none}
.rd-note{font:11px/1.5 var(--anatomy-mono);color:var(--anatomy-muted)}
.iso-stage{outline:none;touch-action:pan-y}
`;
export const HERE = dirname(fileURLToPath(import.meta.url));
