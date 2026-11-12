// live layer for the bench rig (inlined after the kit; P, REGIONS, TIMES, TASK, DIALS, DIAL_TOP, TURN, MAG, STOPS, KNOB, KNOB_ANG, KNOB_TOP, CELL come first)
const root = document.querySelector(".bl-root");
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $p = (n) => svg.querySelector('[data-part="' + n + '"]');
const needles = DIALS.map((_, i) => $p("needle-" + i));
const keys = [0, 1, 2, 3].map((i) => $p("key-" + i));
const carriageEl = $p("carriage"), knobEl = $p("knob"), lamp = $p("lamp"), ampLamp = $p("amplamp"), waterEl = $p("water");
const shells = Array.from($p("shells").querySelectorAll("circle"));
const glows = Array.from(svg.querySelectorAll("[data-glow]"));
const somaEls = Array.from(svg.querySelectorAll("[data-soma]"));
const newEls = Array.from(svg.querySelectorAll(".bl-new"));
const readout = root.querySelector("[data-readout]");
const encEl = root.querySelector('[data-v="enc"]');
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const needleAt = (d, turn) => { const a = turn * Math.PI * 2, x = d.at[0], y = d.at[1]; return lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (d.r - 3.6), y - Math.cos(a) * (d.r - 3.6)], DIAL_TOP, P); };
const pointerAt = (a) => lineOnTop([KNOB[0] + Math.sin(a) * 1.3, KNOB[1] - Math.cos(a) * 1.3], [KNOB[0] + Math.sin(a) * 6.4, KNOB[1] - Math.cos(a) * 6.4], KNOB_TOP, P);
const f3 = (v) => v.toFixed(3), sgn = (v, n) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(n);

// ── water: a toy random walk in the cut away voxel ───────────────────────
let seed = 12345;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const segDist = (p, n) => { const d = sub(n.p1, n.p0), L2 = dot(d, d), t = clamp(dot(sub(p, n.p0), d) / L2, 0, 1); return len(sub(p, [n.p0[0] + d[0] * t, n.p0[1] + d[1] * t, n.p0[2] + d[2] * t])); };
const [BX0, BX1, BY0, BY1, BZ0, BZ1] = CELL.box;
const freeOK = (p) => p[0] > BX0 + 0.8 && p[0] < BX1 - 0.4 && p[1] > BY0 + 0.8 && p[1] < BY1 - 0.4 && p[2] > BZ0 + 0.8 && p[2] < BZ1 - 0.8 &&
  CELL.soma.every((s) => len(sub(p, s.c)) > s.r * somaScale + 0.7) && CELL.neurites.every((n) => segDist(p, n) > n.r + 0.6);
const NS = "http://www.w3.org/2000/svg";
const mols = [];
function addMol(kind, p, extra) {
  const g = document.createElementNS(NS, "g");
  const spin = document.createElementNS(NS, "path"); spin.setAttribute("class", "bl-spin " + kind);
  const dotEl = document.createElementNS(NS, "circle"); dotEl.setAttribute("class", "bl-mol " + kind); dotEl.setAttribute("r", "0.95");
  g.appendChild(spin); g.appendChild(dotEl); waterEl.appendChild(g);
  mols.push(Object.assign({ kind, p, phase: 0, x1: 0, spin, dot: dotEl }, extra));
}
let somaScale = 1;
CELL.soma.forEach((s, i) => { for (let j = 0; j < 5; j++) { let q; do { q = [s.c[0] + (rnd() * 2 - 1) * s.r, s.c[1] + (rnd() * 2 - 1) * s.r, s.c[2] + (rnd() * 2 - 1) * s.r]; } while (len(sub(q, s.c)) > s.r - 1.2); addMol("s", q, { soma: i }); } });
CELL.neurites.forEach((n, i) => { if (n.extra) return; for (let j = 0; j < 3; j++) addMol("n", null, { nt: 0.2 + 0.6 * rnd(), neurite: i }); });
for (let j = 0; j < 30; j++) { let q; do { q = [BX0 + rnd() * (BX1 - BX0), BY0 + rnd() * (BY1 - BY0), BZ0 + rnd() * (BZ1 - BZ0)]; } while (!freeOK(q)); addMol("e", q, {}); }
const neuritePoint = (m) => { const n = CELL.neurites[m.neurite]; return [n.p0[0] + (n.p1[0] - n.p0[0]) * m.nt, n.p0[1] + (n.p1[1] - n.p0[1]) * m.nt, n.p0[2] + (n.p1[2] - n.p0[2]) * m.nt]; };
const SIG = 6.5;                                   // toy diffusion: step std = SIG·√dt world units
function walk(dt) {
  const s = SIG * Math.sqrt(dt);
  for (const m of mols) {
    if (m.kind === "n") { const n = CELL.neurites[m.neurite], L = len(sub(n.p1, n.p0)); m.nt = clamp(m.nt + (gauss() * s) / L, 0.04, 0.96); continue; }
    const q = [m.p[0] + gauss() * s, m.p[1] + gauss() * s, m.p[2] + gauss() * s];
    if (m.kind === "s") { const c = CELL.soma[m.soma]; if (len(sub(q, c.c)) < c.r - 1) m.p = q; }
    else if (freeOK(q)) m.p = q;
  }
}
const posOf = (m) => { if (m.kind === "n") return neuritePoint(m); if (m.kind === "s") { const c = CELL.soma[m.soma].c; return [c[0] + (m.p[0] - c[0]) * somaScale, c[1] + (m.p[1] - c[1]) * somaScale, c[2] + (m.p[2] - c[2]) * somaScale]; } return m.p; };
const KX = (2 * Math.PI) / 30;                     // phase per unit of x at full pulse (toy scale)
const CYCLE = 5.2, T1 = [0.7, 1.2], T2 = [3.3, 3.8];
const STEPS = [
  [0, "Water wanders: trapped in cell bodies, guided along branches, hindered in between."],
  [T1[0], "Gradient pulse 1: each molecule’s arrow turns by an amount set by where it sits along the coils."],
  [T1[1], "The wait (24 ms in the real scan, slowed right down): molecules keep wandering, arrows keep their twist."],
  [T2[0], "Gradient pulse 2 turns every arrow back by where the molecule is now."],
  [T2[1], "Molecules that barely moved line up again (signal kept); wanderers stay scrambled (signal lost). Cell bodies trap water, so theirs line up best."],
];
function encode(ct) {
  const p1 = smooth(T1[0], T1[1], ct), p2 = smooth(T2[0], T2[1], ct);
  for (const m of mols) {
    const x = posOf(m)[0];
    if (ct < T1[0]) m.phase *= 0.9;
    else if (ct <= T1[1]) { m.x1 = x; m.phase = KX * x * p1; }
    else if (ct < T2[0]) m.phase = KX * m.x1;
    else if (ct <= T2[1]) { m.x2 = x; m.phase = KX * (m.x1 - x * p2); }
  }
  return Math.max(Math.sin(Math.PI * clamp((ct - T1[0]) / (T1[1] - T1[0]), 0, 1)), Math.sin(Math.PI * clamp((ct - T2[0]) / (T2[1] - T2[0]), 0, 1)));
}
function drawWater() {
  for (const m of mols) {
    const [sx, sy] = iso(posOf(m), P);
    m.dot.setAttribute("cx", sx.toFixed(1)); m.dot.setAttribute("cy", sy.toFixed(1));
    const a = m.phase;
    m.spin.setAttribute("d", "M" + sx.toFixed(1) + " " + sy.toFixed(1) + "l" + (Math.sin(a) * 3.4).toFixed(2) + " " + (-Math.cos(a) * 3.4).toFixed(2));
  }
}

// ── state ────────────────────────────────────────────────────────────────
const S = { region: 0, knob: KNOB_ANG[0], stop: 0, x: STOPS[0], target: STOPS[0], scanned: 0, scan: -1, scanT: 0, train: -1, dial: [0, 0, 0, 0], rate: [0, 0, 0, 0], ct: 0, step: -1 };
const SCAN_S = 1.6, BLOCK_S = 0.42, TRAIN_S = TASK.blocks * BLOCK_S;
const valuesOf = (r, t) => { const R = REGIONS[r]; return [100 * (R.md[t] - R.md[0]) / R.md[0], R.soma[t] - R.soma[0], R.neurite[t] - R.neurite[0], R.extra[t] - R.extra[0]]; };
const turnsOf = (v) => [v[0] / TURN.mdPercent, v[1] / TURN.fraction, v[2] / TURN.fraction, v[3] / TURN.fraction];
let frame = 0, last = 0, visible = false, touring = !still.matches, clock = 0, idle = 0, frozen = false;

function drawCells() {
  const R = REGIONS[S.region];
  const dS = S.dial[1] * TURN.fraction, dN = S.dial[2] * TURN.fraction;
  somaScale = clamp(1 + MAG * dS / R.soma[0], 1, 1.45);
  somaEls.forEach((el) => { const cx = +el.dataset.cx, cy = +el.dataset.cy, s = somaScale.toFixed(3); el.setAttribute("transform", "translate(" + cx + " " + cy + ") scale(" + s + ") translate(" + -cx + " " + -cy + ")"); });
  const count = 3 * MAG * dN / R.neurite[0];
  newEls.forEach((el, i) => { el.style.opacity = clamp(count - i, 0, 1).toFixed(2); });
}
function phaseText() {
  const R = REGIONS[S.region];
  if (S.train >= 0) return "training · block " + Math.min(TASK.blocks, Math.floor(S.train / BLOCK_S) + 1) + " of " + TASK.blocks;
  if (S.scan >= 0) return "scanning · " + TIMES[S.scan];
  const v = valuesOf(S.region, S.scanned);
  if (S.scanned === 0) return R.short + " · baseline";
  return R.short + " · " + TIMES[S.scanned] + " · soma " + sgn(v[1], 3) + " · neurite " + sgn(v[2], 3);
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
  root.querySelectorAll("[data-region]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.region === S.region ? "true" : "false"));
  root.querySelectorAll("[data-time]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.time === S.stop ? "true" : "false"));
  const tb = root.querySelector("[data-train]"); if (tb) tb.setAttribute("aria-pressed", S.train >= 0 ? "true" : "false");
  stage.setAttribute("aria-valuetext", R.name + ", " + (t === 0 ? "before learning" : TIMES[t] + " after learning"));
}
function draw(pulse) {
  carriageEl.setAttribute("transform", translateAlong(P, [S.x, 0, 0]));
  knobEl.setAttribute("d", pointerAt(S.knob));
  needles.forEach((n, i) => n.setAttribute("d", needleAt(DIALS[i], S.dial[i])));
  let down = -1;
  if (S.train >= 0) { const inBlock = S.train % BLOCK_S, step = Math.floor(inBlock / (BLOCK_S * 0.66 / 5)); if (step < 5) down = TASK.sequence[step] - 1; }
  keys.forEach((el, i) => el.setAttribute("transform", i === down ? translateAlong(P, [0, 0, -1.6]) : ""));
  lamp.setAttribute("data-on", S.train >= 0 ? "1" : "0");
  ampLamp.setAttribute("data-on", pulse > 0.05 ? "1" : "0");
  glows.forEach((g) => (g.style.opacity = pulse.toFixed(2)));
  shells.forEach((c, i) => {
    let o = 0;
    if (S.scan >= 0) { const head = S.scanT / SCAN_S * 9; o = clamp(1 - Math.abs(head - i - 0.5) / 1.6, 0, 1); }
    else o = S.scanned > 0 && i === (S.region * 2 + S.scanned) % 8 ? pulse * 0.6 : 0;
    c.setAttribute("opacity", o.toFixed(2));
  });
  drawCells();
  drawWater();
  const text = phaseText();
  if (readout.textContent !== text) readout.textContent = text;
}
function startScan(stop) { S.scan = stop; S.scanT = 0; if (still.matches) finishScan(); }
function finishScan() { S.scanned = S.scan; S.scan = -1; panel(); }
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches || frozen;
  if (!calm) {
    if (touring) { clock += dt; tour(); } else { idle += dt; if (idle > 8) { touring = true; clock = 0; tourIndex = -1; } }
  }
  const kt = KNOB_ANG[S.region];
  S.knob = calm ? kt : S.knob + (kt - S.knob) * (1 - Math.exp(-dt / 0.18));
  if (Math.abs(kt - S.knob) < 1e-3) S.knob = kt;
  const before = S.x;
  S.x = calm ? S.target : S.x + (S.target - S.x) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(S.target - S.x) < 0.05) S.x = S.target;
  if (before !== S.target && S.x === S.target) startScan(S.stop);
  if (S.train >= 0) { S.train += dt; if (S.train >= TRAIN_S) { S.train = -1; panel(); } }
  if (S.scan >= 0) { S.scanT += dt; if (S.scanT >= SCAN_S) finishScan(); }
  const goal = turnsOf(valuesOf(S.region, S.scanned));
  for (let i = 0; i < 4; i++) {
    if (calm) { S.dial[i] = goal[i]; S.rate[i] = 0; continue; }
    for (let s = 0; s < 4; s++) { S.rate[i] += ((goal[i] - S.dial[i]) * 90 - S.rate[i] * 15) * dt / 4; S.dial[i] += S.rate[i] * dt / 4; }
    if (Math.abs(goal[i] - S.dial[i]) < 5e-5 && Math.abs(S.rate[i]) < 5e-4) { S.dial[i] = goal[i]; S.rate[i] = 0; }
  }
  let pulse = 0;
  if (!calm) { S.ct = (S.ct + dt) % CYCLE; walk(dt); pulse = encode(S.ct); narrate(); }
  draw(pulse);
  frame = visible && !calm ? requestAnimationFrame(tick) : 0;
}
function narrate() { let k = 0; STEPS.forEach((s, i) => { if (S.ct >= s[0]) k = i; }); if (k !== S.step) { S.step = k; if (encEl) encEl.textContent = STEPS[k][1]; } }
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function settleStill(ct) {   // reduced motion and stills: replay one encoding cycle offline, then hold
  S.ct = 0;
  for (let t = 0; t < ct; t += 1 / 30) { walk(1 / 30); S.ct = t; encode(t); }
  S.ct = ct; encode(ct); narrate();
}
function setRegion(r) { S.region = (r + 4) % 4; S.scanned = S.stop; S.scan = -1; panel(); run(); if (still.matches) draw(0); }
function setTime(t) { t = clamp(t, 0, 2); if (t === S.stop && S.x === S.target) { startScan(t); run(); if (still.matches) draw(0); return; } S.stop = t; S.target = STOPS[t]; S.scan = -1; panel(); run(); if (still.matches) { S.x = S.target; startScan(t); draw(0); } }
function train() { S.stop = 0; S.target = STOPS[0]; S.scanned = 0; S.scan = -1; S.train = still.matches ? -1 : 0; panel(); run(); if (still.matches) { S.x = S.target; draw(0); } }
function hand() { touring = false; idle = 0; }
let tourIndex = -1, tourAt = 0;
const TOUR = [];
for (let r = 0; r < 4; r++) { const o = [2, 3, 0, 1][r]; TOUR.push({ r: o, t: 0, hold: 5.2 }, { r: o, train: true, hold: TRAIN_S + 0.6 }, { r: o, t: 1, hold: 5.2 }, { r: o, t: 2, hold: 5.6 }); }
function tour() {
  if (tourIndex < 0 || clock - tourAt >= TOUR[tourIndex].hold) {
    tourIndex = (tourIndex + 1) % TOUR.length; tourAt = clock;
    const s = TOUR[tourIndex];
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
const q = new URLSearchParams(location.search).get("pose");
if (q) { const [r, t, ct] = q.split(",").map(Number); touring = false; frozen = true; S.region = r; S.stop = t; S.x = S.target = STOPS[t]; S.scanned = t; S.knob = KNOB_ANG[r]; S.dial = turnsOf(valuesOf(r, t)); drawCells(); settleStill(ct >= 0 ? ct : 4.6); }
else if (still.matches) { touring = false; S.scanned = 0; drawCells(); settleStill(4.6); }
panel(); draw(q ? (S.ct > T2[0] && S.ct < T2[1] ? 1 : 0) : 0);
