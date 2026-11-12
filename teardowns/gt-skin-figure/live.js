
// Live layer for Fig 13. Runs after the kit (iso, slabOf, solidSvg, pathOf …) and walk.mjs (walk, slope).
const D = __DATA__;
const P = D.P;
const stage = document.querySelector(".sk-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const NS = "http://www.w3.org/2000/svg";
const f2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const S = { gamma: 0.4, eta: 0, mu: 0, steps: 8, order: "before" };
let M = { P: new Array(17).fill(0), n: 0, v: 0, surv: 1 };
let barH = new Array(17).fill(0), flash = new Array(17).fill(0);

// ── model
function model() {
  const w = walk({ steps: S.steps, gamma: S.gamma, eta: S.eta, mu: S.mu, order: S.order, L: 9 });
  const p = w.P[S.steps];
  M.P = Array.from({ length: 17 }, (_, i) => p[i + 1]); // L = 9: index 1 .. 17 are positions -8 .. 8
  M.n = w.n[S.steps];
  M.surv = w.norm[S.steps];
  M.perStep = Math.pow(Math.max(M.surv, 1e-12), 1 / S.steps);
}
let longT = 0;
function longRun() {
  clearTimeout(longT);
  longT = setTimeout(() => {
    const w = walk({ steps: 40, gamma: S.gamma, eta: S.eta, mu: S.mu, order: S.order });
    M.v = slope(w.n, 30, 40);
    numbers();
  }, 120);
}
// plate settings (degrees) for the loss and damping, from the paper's Methods
const deg = (r) => (r * 180) / Math.PI;
function settings(which) {
  const g = S.gamma, m = S.mu;
  if (!m || which === 0) {
    if (S.order === "before" && m) return { hm: deg(Math.asin(Math.sqrt((1 - g) * (1 - m)))) / 2, low: 45, b: 45 };
    return { hm: deg(Math.asin(Math.sqrt(1 - g))) / 2, low: 45, b: 45 };
  }
  return S.order === "before" ? { hm: deg(Math.asin(Math.sqrt(m))) / 2, low: 0, b: 0 } : { hm: deg(Math.asin(Math.sqrt(m * (1 - g)))) / 2, low: 0, b: 0 };
}
let plates = settings(0), shown = { ...plates };

// ── drawing helpers
const at = (p) => iso(p, P);
function axisD(x, z, r, a) {
  const t = (a * Math.PI) / 180;
  return pathOf([at([x, -r * Math.cos(t), z - r * Math.sin(t)]), at([x, r * Math.cos(t), z + r * Math.sin(t)])]);
}
const axisEl = { hm: $('[data-axis="hm"]', svg), low: $('[data-axis="low"]', svg), b: $('[data-axis="b"]', svg) };
const hdIn = $('[data-hd="in"]', svg), hdOut = $('[data-hd="out"]', svg);
const dump = $("[data-dump]", svg);
const barsG = $('[data-part="bars"]', svg);
const order = D.chan.map((y, i) => i).sort((a, b) => depthOf([D.bar.x, D.chan[a], 0], P) - depthOf([D.bar.x, D.chan[b], 0], P));
function drawBars() {
  let out = "";
  for (const i of order) {
    const h = barH[i];
    const plan = { x: D.bar.x, y: D.chan[i] - D.bar.d / 2, w: D.bar.w, d: D.bar.d, r: 0.4 };
    const lit = flash[i] > 0.02;
    out += solidSvg(slabOf(plan, D.apdTop, Math.max(0.5, h), P, 2, h > 2 ? 0.3 : 0), { tone: h > 0.6 ? "hi" : "lo", lit: h > 0.6, className: lit ? "sk-hit" : "" });
  }
  barsG.innerHTML = out;
}
const fanEls = $$("[data-fan]", svg);
function drawFan() {
  const mx = Math.max(...M.P, 1e-9);
  fanEls.forEach((el) => {
    const i = +el.getAttribute("data-fan");
    el.style.opacity = (0.06 + 0.8 * Math.sqrt(M.P[i] / mx)).toFixed(3);
  });
}
const beamEls = $$("[data-gap]", svg);
function drawBeam() {
  // after the displacers the upper lane carries the vertical light; its brightness follows the loss
  beamEls.forEach((el) => {
    const g = D.gaps[+el.getAttribute("data-gap")];
    const upper = g.z > D.ZB + 1;
    el.style.opacity = upper ? (0.35 + 0.6 * Math.sqrt(1 - S.gamma)).toFixed(3) : "1";
  });
}

// ── photons: each one walks the bench once (standing for all t steps) and lands in a channel drawn from the model
const slotG = $$("[data-ph]", svg).reduce((m, el) => ((m[+el.getAttribute("data-ph")] = el), m), {});
const fanG = $$("[data-phf]", svg).reduce((m, el) => ((m[+el.getAttribute("data-phf")] = el), m), {});
const X0 = D.stations[0].near, X1 = D.stations[D.stations.length - 1].near;
const BD2 = D.stations.find((s) => s.name === "bd2"), HD = D.stations.find((s) => s.name === "hd"), TWIN = D.stations.find((s) => s.name === "twin");
const photons = [];
const SPEED = 240;
function pick() {
  let r = Math.random(), acc = 0;
  for (let i = 0; i < 17; i++) { acc += M.P[i]; if (r <= acc) return i; }
  return M.P.indexOf(Math.max(...M.P));
}
function spawn() {
  const lost = Math.random() > M.perStep;
  photons.push({ x: X0, up: lost || Math.random() < 0.5, lost, ch: pick(), fan: -1, s: 0, el: null, hd: false, tw: false });
}
function place(ph) {
  let host = null, p = null;
  if (ph.fan < 0) {
    const g = D.gaps.find((g) => ph.x >= g.x0 - 0.01 && ph.x <= g.x1 + 0.01 && (g.z > D.ZB + 1) === (ph.up && ph.x > D.stations.find((s) => s.name === "bd1").near - 0.01 && ph.x < BD2.far + 0.01));
    if (g) { host = slotG[D.gaps.indexOf(g)]; p = [ph.x, 0, g.z]; }
  } else {
    const f = D.fans[ph.fan];
    host = fanG[ph.fan];
    p = [f.p0[0] + (f.p1[0] - f.p0[0]) * ph.s, f.p0[1] + (f.p1[1] - f.p0[1]) * ph.s, f.p0[2]];
  }
  if (!host) { if (ph.el) ph.el.remove(), (ph.el = null); return; }
  if (!ph.el || ph.el.parentNode !== host) {
    if (ph.el) ph.el.remove();
    ph.el = document.createElementNS(NS, "circle");
    ph.el.setAttribute("class", "sk-photon");
    ph.el.setAttribute("r", "1.9");
    host.appendChild(ph.el);
  }
  const q = at(p);
  ph.el.setAttribute("cx", f2(q[0]));
  ph.el.setAttribute("cy", f2(q[1]));
}
function stepPhotons(dt) {
  for (const ph of photons) {
    if (ph.fan < 0) {
      const before = ph.x;
      ph.x += SPEED * dt;
      if (before < HD.far && ph.x >= HD.far - 6) {
        if (!ph.hd) { ph.hd = true; const on = Math.random() < S.eta / 2; hdIn.style.display = on ? "" : "none"; hdOut.style.display = on ? "none" : ""; }
      }
      if (!ph.tw && ph.x >= TWIN.far - 8) { ph.tw = true; if (S.mu > 0) plates = settings(Math.random() < 0.5 ? 0 : 1); }
      if (ph.lost && ph.x >= BD2.far) { ph.done = true; dumpFlash = 1; continue; }
      if (ph.x >= X1) { ph.fan = ph.ch; ph.s = 0; }
    } else {
      const f = D.fans[ph.fan];
      ph.s += (SPEED * dt) / Math.hypot(f.p1[0] - f.p0[0], f.p1[1] - f.p0[1]);
      if (ph.s >= 1) { ph.done = true; flash[ph.ch] = 1; continue; }
    }
    place(ph);
  }
  for (let i = photons.length - 1; i >= 0; i--) if (photons[i].done) { if (photons[i].el) photons[i].el.remove(); photons.splice(i, 1); }
}
let dumpFlash = 0;

// ── controls
const ins = Object.fromEntries($$("[data-in]").map((el) => [el.getAttribute("data-in"), el]));
const outs = Object.fromEntries($$("[data-out]").map((el) => [el.getAttribute("data-out"), el]));
const nums = Object.fromEntries($$("[data-num]").map((el) => [el.getAttribute("data-num"), el]));
const orderBtns = $$("[data-order]");
const tourBtn = $("[data-tour]");
function syncInputs() {
  for (const key of ["gamma", "eta", "mu", "steps"]) {
    if (+ins[key].value !== S[key]) ins[key].value = String(S[key]);
    outs[key].textContent = key === "steps" ? String(S.steps) : S[key].toFixed(key === "gamma" ? 3 : 2).replace(/0$/, key === "gamma" ? "" : "0");
  }
  orderBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-order") === S.order)));
  tourBtn.setAttribute("aria-pressed", String(touring));
}
function numbers() {
  nums.n.textContent = (M.n >= 0 ? "+" : "−") + Math.abs(M.n).toFixed(2);
  nums.v.textContent = Math.abs(M.v) < 0.005 ? "0.00" : (M.v >= 0 ? "+" : "−") + Math.abs(M.v).toFixed(2);
  const s = M.surv * 100;
  nums.s.textContent = s >= 10 ? s.toFixed(0) + "%" : s >= 1 ? s.toFixed(1) + "%" : s.toFixed(2) + "%";
  const text = `γ ${S.gamma.toFixed(S.gamma === 0.854 ? 3 : 2)} · η ${S.eta.toFixed(2)} · μ ${S.mu.toFixed(2)} ${S.mu ? S.order : ""} · drift ${nums.v.textContent}`.replace(/\s+·/g, " ·");
  if (readout.textContent !== text) readout.textContent = text;
}
function apply() {
  model();
  plates = settings(0);
  drawFan();
  drawBeam();
  syncInputs();
  numbers();
  longRun();
  if (still.matches) { barH = M.P.map((p) => D.barMax * Math.min(1, p / 0.5)); drawBars(); drawPlates(true); }
  run();
}
function drawPlates(snap) {
  for (const key of ["hm", "low", "b"]) {
    const want = plates[key];
    shown[key] = snap ? want : shown[key];
    const d = D[key];
    axisEl[key].setAttribute("d", axisD(d.x, d.z, d.r, shown[key]));
  }
}

const TOUR = [
  { gamma: 0.4, eta: 0, mu: 0 }, { gamma: 0.4, eta: 1, mu: 0 },
  { gamma: 0.854, eta: 0, mu: 0 }, { gamma: 0.854, eta: 1, mu: 0 },
  { gamma: 0.93, eta: 0, mu: 0 }, { gamma: 0.93, eta: 1, mu: 0 },
  { gamma: 0.4, eta: 0, mu: 1, order: "before" }, { gamma: 0.93, eta: 0, mu: 1, order: "before" },
  { gamma: 0.4, eta: 0, mu: 1, order: "after" }, { gamma: 0.93, eta: 0, mu: 1, order: "after" },
];
let touring = !still.matches, tourAt = 0, tourClock = 0, idle = 0;
function takeOver() { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; tourClock = 5.4; syncInputs(); run(); }, 25000); }
function preset(p) { Object.assign(S, { steps: 8, order: "before" }, p); apply(); }

document.addEventListener("input", (e) => {
  const key = e.target && e.target.getAttribute && e.target.getAttribute("data-in");
  if (!key) return;
  S[key] = key === "steps" ? Math.round(+e.target.value) : +e.target.value;
  takeOver();
  apply();
}, true);
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest ? e.target.closest("button") : null;
  if (!b) return;
  if (b.hasAttribute("data-order")) { S.order = b.getAttribute("data-order"); takeOver(); apply(); }
  else if (b.hasAttribute("data-preset")) { S.gamma = [0.4, 0.854, 0.93][+b.getAttribute("data-preset")]; takeOver(); apply(); }
  else if (b.hasAttribute("data-tour")) { touring = !touring; if (touring) { clearTimeout(idle); tourClock = 5.4; } syncInputs(); run(); }
}, true);
stage.addEventListener("keydown", (e) => {
  const map = { ArrowRight: ["gamma", 0.05], ArrowLeft: ["gamma", -0.05], ArrowUp: ["eta", 0.1], ArrowDown: ["eta", -0.1] };
  const m = map[e.key];
  if (!m) return;
  e.preventDefault();
  S[m[0]] = Math.round(clamp(S[m[0]] + m[1], 0, 1) * 1000) / 1000;
  takeOver();
  apply();
});

// ── loop
let frame = 0, last = 0, visible = false, spawnClock = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (touring) {
    tourClock += dt;
    if (tourClock > 5.5) { tourClock = 0; preset(TOUR[tourAt]); tourAt = (tourAt + 1) % TOUR.length; }
  }
  spawnClock += dt;
  while (spawnClock > 0.2) { spawnClock -= 0.2; if (photons.length < 16) spawn(); }
  stepPhotons(dt);
  let moving = false;
  for (let i = 0; i < 17; i++) {
    const want = D.barMax * Math.min(1, M.P[i] / 0.5);
    const nh = barH[i] + (want - barH[i]) * (1 - Math.exp(-dt / 0.35));
    if (Math.abs(nh - barH[i]) > 0.01) moving = true;
    barH[i] = Math.abs(want - nh) < 0.02 ? want : nh;
    if (flash[i] > 0) { flash[i] = Math.max(0, flash[i] - dt / 0.25); moving = true; }
  }
  drawBars();
  for (const key of ["hm", "low", "b"]) shown[key] += (plates[key] - shown[key]) * (1 - Math.exp(-dt / 0.12));
  drawPlates(false);
  if (dump) { dumpFlash = Math.max(0, dumpFlash - dt / 0.3); dump.style.setProperty("--flash", dumpFlash.toFixed(2)); }
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } }
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "80px 0px" }).observe(stage);
preset(TOUR[0]);
tourAt = 1;
if (still.matches) { touring = false; syncInputs(); }
drawBars();
