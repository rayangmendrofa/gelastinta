// GH-1 farm page: one scrolling farm world drawn in code (original pixel art), the equipment opens its own
// panel, and a web worker runs the real PLC program for every greenhouse.
"use strict";
const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const fx = (v, d = 1) => v == null || isNaN(v) ? "--" : Number(v).toFixed(d);
const num = v => Math.round(v).toLocaleString("en");
const cv = $("farm");
let g = cv.getContext("2d");
let mtab = "boosts", ttab = "crops";
let S = null, META = null, speed = 20, armed = null, dragging = null, VW = 320;
let sel = {h: 0, z: 0}, hoverSpot = null, pop = null;
const cam = {x: 0, tx: 0};
const robotX = [120, 120, 120], floaters = [], anims = [];
const worker = new Worker("worker.js");
const send = m => worker.postMessage(m);
const LOT = 320, LOTS = 3;

// ---------------------------------------------------------------- drawing helpers
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const mix = (a, b, t) => {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const hash = n => { n = Math.sin(n * 12.9898) * 43758.5453; return n - Math.floor(n); };
const text = (s, x, y, c = "#e8ecef", size = 6) => { g.fillStyle = c; g.font = `${size}px monospace`; g.fillText(s, x, y); };
const BED_Y = [56, 86, 116, 146], BED_X0 = 86, BED_X1 = 292, PATH_Y = 172;
const LEAF = {tomato: "#3e8f3a", chili: "#2f7a34", cucumber: "#3a9a42", melon: "#5aa54a", strawberry: "#3d8f45",
              lettuce: "#93d354", kangkung: "#3fae5a"};
const FLOWER = {tomato: "#f5d442", chili: "#f4f4f0", cucumber: "#f5d442", melon: "#f5d442", strawberry: "#f4f4f0"};
const has = u => S.farm.upgrades.includes(u);

const SKY = {clear: ["#3f7fc8", "#a6d6f2"], cloudy: ["#6f8396", "#c2ccd4"], rain: ["#465462", "#7f8c98"], storm: ["#262e38", "#545e68"]};
let flash = 0;
function daylight() {                  // 0 at night, 1 in full day; twilight ramps
  const m = S.clock_min;
  return m < 330 || m > 1110 ? 0 : Math.min(1, Math.min(m - 330, 1110 - m) / 60);
}
function sky(t, cx) {
  const m = S.clock_min, wx = S.weather, look = wx.look, day = m >= 360 && m <= 1080;
  const k = day ? Math.sin(Math.PI * (m - 360) / 720) : 0, dl = daylight();
  const tw = dl > 0 && dl < 1 ? 1 - Math.abs(dl - 0.5) * 2 : day && k < 0.3 ? 1 - k / 0.3 : 0;   // golden hour
  let [top, hor] = SKY[look] || SKY.clear;
  top = mix("#060a1c", top, dl); hor = mix("#1b2550", hor, dl);
  hor = mix(hor, "#f0915a", tw * 0.8); top = mix(top, "#6a4f8f", tw * 0.4);
  if (S.farm.today.heat && day) hor = mix(hor, "#f6c27a", 0.4);
  for (let y = 0; y < 40; y++) R(0, y, VW, 1, mix(top, hor, (y / 40) ** 1.4));
  if (look === "storm" && hash(Math.floor(t / 90)) > 0.975) flash = 1;
  if (day) {                                                        // sun with a soft glow
    const x = 10 + (VW - 20) * (m - 360) / 720, y = 32 - 26 * k, heat = S.farm.today.heat;
    if (look === "clear" || look === "cloudy") {
      g.globalAlpha = 0.18; disc(x, y, heat ? 11 : 8, heat ? "#ffb347" : "#fff3b0"); g.globalAlpha = 0.3; disc(x, y, heat ? 7 : 5, "#fff3b0"); g.globalAlpha = 1;
      disc(x, y, heat ? 4 : 3, heat ? "#ffcf5a" : "#ffe98a");
    }
  } else {                                                          // a crescent moon, twinkling stars
    const x = 20 + (VW - 40) * (((m + 1440 - 1080) % 1440) / 720);
    disc(x, 11, 3, "#eef0f8"); disc(x + 2, 10, 3, top);
    for (let i = 0; i < VW / 9; i++) if (hash(i + Math.floor(t / 600 + i) * 0.13) > 0.15) R(hash(i) * VW, hash(i + 50) * 32, 1, 1, hash(i + 7) > 0.8 ? "#ffffff" : "#9aa6d8");
  }
  const n = Math.round(({clear: 2, cloudy: 6, rain: 8, storm: 10}[look] || 2) * VW / 320);   // puffy clouds, lit from above
  for (let i = 0; i < n; i++) {
    const w = 18 + hash(i + 3) * 22, x = ((hash(i) * (VW + 80) - cx * 0.15 + t * (4 + wx.wind) / 5000) % (VW + 80) + VW + 80) % (VW + 80) - 50, y = 3 + hash(i + 9) * 18;
    const base = look === "clear" ? "#f4f7fa" : look === "cloudy" ? "#dfe5ea" : look === "rain" ? "#8d98a2" : "#5c6670";
    const lit = mix(base, "#ffffff", 0.4 * dl), shade = mix(base, "#1b2550", 0.35);
    g.globalAlpha = look === "clear" ? 0.75 : 0.95;
    R(x, y + 3, w, 4, shade); R(x + 2, y, w - 4, 5, base); R(x + w * 0.25, y - 3, w * 0.4, 4, base); R(x + w * 0.3, y - 3, w * 0.3, 1, lit); R(x + 3, y, w - 8, 1, lit);
    g.globalAlpha = 1;
  }
  if (day && look === "clear") for (let i = 0; i < 3; i++) {       // birds far away
    const bx = ((t / 60 + i * 37 + hash(i) * 200) % (VW + 40)) - 20, by = 10 + i * 4 + Math.sin(t / 400 + i) * 2, up = Math.floor(t / 180 + i) % 2;
    R(bx - 1, by - up, 1, 1, "#2a3340"); R(bx, by, 1, 1, "#2a3340"); R(bx + 1, by - up, 1, 1, "#2a3340");
  }
  hills(t, cx, top, hor, dl);
  R(0, 40, VW, 160, mix("#24402a", "#4e7a3a", 0.35 + 0.65 * dl));
}
function hills(t, cx, top, hor, dl) {  // two parallax ridges and coconut palms on the horizon
  const far = mix(mix(hor, "#3f6a5a", 0.45), "#0e1730", 1 - dl), near = mix("#2f5a36", "#0b1422", (1 - dl) * 0.8);
  for (let x = 0; x < VW; x++) {
    const a = x + cx * 0.2, b = x + cx * 0.45;
    const h1 = 7 + 4 * Math.sin(a / 41) + 3 * Math.sin(a / 17 + 1), h2 = 4 + 3 * Math.sin(b / 29 + 2) + 1.5 * Math.sin(b / 9);
    R(x, 40 - h1, 1, h1, far); R(x, 40 - h2, 1, h2, near);
  }
  for (let i = -1; i < VW / 70 + 2; i++) {
    const base = Math.floor(cx * 0.45 / 70) + i, x = base * 70 + hash(base) * 40 - cx * 0.45, hgt = 10 + hash(base + 5) * 6;
    if (hash(base + 11) < 0.35) continue;
    const sway = Math.sin(t / 900 + base) * S.weather.wind / 8;
    for (let k = 0; k < hgt; k++) R(x + (k / hgt) ** 2 * 2 + sway * k / hgt, 40 - k, 1, 1, near);
    const tx = x + 2 + sway, ty = 40 - hgt;
    for (const [dx, dy] of [[-4, 1], [-3, 0], [-2, -1], [2, -1], [3, 0], [4, 1], [-1, -2], [1, -2]]) R(tx + dx, ty + dy, 2, 1, near);
  }
}
function disc(x, y, r, c) {
  for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); R(x - w, y + dy, 2 * w + 1, 1, c); }
}

function rain(t, cx) {
  if (!S.weather.rain) return;
  const storm = S.weather.look === "storm", slant = storm ? 0.14 : 0.05;
  g.globalAlpha = 0.6;
  for (let i = 0; i < (storm ? 130 : 80) * VW / 320; i++) {
    const x = (hash(i) * (VW + 20) + t * slant) % (VW + 20) - 10, y = (hash(i + 20) * 200 + t * 0.3) % 200;
    R(x, y, 1, storm ? 4 : 3, "#c4dcf2");
  }
  g.globalAlpha = 1;
  if (Math.random() < 0.9) for (let k = 0; k < 3; k++)            // splashes on the ground
    parts.push({x: cx + Math.random() * VW, y: 42 + Math.random() * 156, vx: 0, vy: -0.25, life: 10, max: 10, c: "#d8e8f6", gr: 0.05, w: 2});
}

function grass(lot, t) {               // mottled turf, tufts that bend with the wind, wildflowers
  const wind = Math.min(2, S.weather.wind / 6);
  for (let i = 0; i < 26; i++) { const x = hash(i + lot * 77) * LOT, y = 42 + hash(i + 3 + lot * 77) * 152; R(x, y, 14 + hash(i) * 20, 6 + hash(i + 1) * 8, "#46703a"); }
  for (let i = 0; i < 150; i++) {
    const x = hash(i + 3 + lot * 500) * LOT, y = 40 + hash(i + 7 + lot * 500) * 158, bend = Math.round(Math.sin(t / 500 + x / 13) * wind);
    R(x, y, 1, 2, "#5d8a45"); R(x + bend, y - 1, 1, 1, "#78a85a");
  }
  for (let i = 0; i < 18; i++) R(hash(i + lot * 31) * LOT, 44 + hash(i + 9 + lot * 31) * 150, 1, 1, ["#f2c14e", "#f1ecd8", "#e88fb0"][i % 3]);
  if (lot > 0) for (let y = 44; y < 196; y += 8) { R(0, y, 2, 5, "#8a6a3a"); R(0, y + 2, 2, 1, "#a8865a"); }   // fence between lots
}

function windsock(t, h) {
  const w = Math.min(1, S.weather.wind / 15);
  R(56, 22, 1, 18, "#cfd3d6");
  for (let i = 0; i < 4; i++) {
    const len = 2 + 2 * w, y = 22 + i * 0.4 + (1 - w) * i * 1.4 + Math.sin(t / 150 + i) * w;
    R(57 + i * len, y, len + 0.5, 2, i % 2 ? "#f2f2f2" : "#e35a2c");
  }
  R(53, 30, 3, 3, "#5d6672");                                   // wind and rain sensor box
  if (h.field.wires.includes("wind") || h.field.wires.includes("rain")) brokenWire(t, 54, 33);
}
function brokenWire(t, x, y) {       // a cut cable swinging, with a spark now and then
  const sw = Math.round(Math.sin(t / 300) * 2);
  R(x, y, 1, 3, "#1d232a"); R(x + sw, y + 3, 1, 3, "#1d232a");
  if (Math.floor(t / 120) % 7 === 0) { R(x + sw - 1, y + 6, 3, 1, "#ffe27a"); R(x + sw, y + 5, 1, 3, "#ffe27a"); }
}

function plantSprite(x, cy, z, i) {
  const crop = z.crop, m = z.maturity / 100, hp = z.health / 100, seed = hash(i * 7.3 + cy * 3.1);
  if (z.stage === "dead") { R(x - 2, cy - 1, 5, 3, "#6b4a2a"); return; }
  const leaf = mix(LEAF[crop], "#a08a3c", Math.min(1, (1 - hp) * 0.9));
  const dark = mix(leaf, "#0f2a12", 0.35);
  const s = Math.max(1, Math.round(1 + m * 5 + (seed - 0.5)));
  if (z.stage === "seedling") { R(x, cy - 1, 1, 3, leaf); R(x - 1, cy - 1, 1, 1, leaf); R(x + 1, cy - 2, 1, 1, leaf); return; }
  if (crop === "lettuce" || crop === "kangkung") {
    R(x - s, cy - s + 1, 2 * s + 1, 2 * s - 1, dark);
    R(x - s + 1, cy - s, 2 * s - 1, 2 * s + 1, dark);
    R(x - s + 1, cy - s + 1, 2 * s - 1, 2 * s - 1, leaf);
    if (crop === "lettuce") R(x - 1, cy - 1, 3, 3, mix(leaf, "#e9f7c4", 0.5));
    else { R(x - s, cy, 2 * s + 1, 1, dark); R(x, cy - s, 1, 2 * s + 1, dark); }
    return;
  }
  const wide = crop === "melon" ? 2 : 1, low = crop === "strawberry" ? 0.6 : 1;
  const rw = Math.round(s * wide), rh = Math.max(1, Math.round(s * low));
  const light = mix(leaf, "#e9f7c4", 0.35);
  for (let k = 0; k < 4 + 3 * rw; k++) {                  // a bush of small two-tone leaves
    const lx = x + (hash(seed * 13 + k) - 0.5) * 2 * rw, ly = cy + (hash(seed * 17 + k) - 0.5) * 2 * rh;
    R(lx - 1, ly - 1, 3, 3, dark); R(lx - 1, ly - 1, 2, 2, leaf); R(lx - 1, ly - 1, 1, 1, light);
  }
  if (z.stage === "flowering") for (let k = 0; k < 3; k++) R(x - rw + 1 + hash(seed + k) * 2 * rw, cy - rh + 1 + hash(seed + k + 4) * 2 * rh, 1, 1, FLOWER[crop]);
  if (z.stage === "ripe") {
    const col = META.crops[crop].colour;
    if (crop === "melon") { R(x - 2, cy - 1, 4, 3, col); R(x - 1, cy - 2, 2, 5, col); }
    else if (crop === "cucumber") for (let k = 0; k < 3; k++) R(x - rw + 1 + hash(seed + k) * 2 * rw, cy - 1 + k, 3, 1, "#1e5d22");
    else for (let k = 0; k < 4; k++) R(x - rw + 1 + hash(seed + k) * (2 * rw - 1), cy - rh + 1 + hash(seed + k + 4) * (2 * rh - 1), crop === "chili" ? 1 : 2, crop === "chili" ? 2 : 1, col);
  }
}

const animOf = (kind, h, z) => anims.find(a => a.kind === kind && a.h === h && (z === undefined || a.z === z));
const prog = (a, t) => Math.min(1, (t - a.t0) / a.dur);

function greenhouse(t, h, hi) {
  const p = h.plc, fd = h.field, cool = has("cool");
  const m = S.clock_min, sunX = (m - 360) / 720, dl = daylight();     // a shadow that follows the sun
  if (dl > 0.2) { g.globalAlpha = 0.28 * dl; R(sunX < 0.5 ? 308 : 62, 46, 8, 148, "#13241a"); R(74, 192, 236, 5, "#13241a"); g.globalAlpha = 1; }
  R(70, 42, 238, 150, PAINT[S.farm.style.paint]);                  // frame in the farm's paint
  if (has("film")) R(70, 42, 238, 1, "#ffffff");                    // the clear film catches the light
  R(72, 44, 234, 146, "#36414a");
  if (cool) {                                                       // pad wall: wet blue, dry tan
    const wet = fd.pad_dry ? 0 : fd.pad_wet;
    R(73, 52, 3, 130, mix("#c9b48a", "#5aa9e6", wet));
    for (let y = 54; y < 180; y += 4) R(73, y, 3, 1, fd.pad_dry ? "#8a6a3a" : mix("#b39c70", "#7fc0ee", wet));
  }
  R(78, 44, 224, 5, "#9aa6b0");                                     // ridge vent opens with its real position
  R(80, 45, 220 * fd.vent / 100, 3, "#1a2026");
  if (fd.vent_stuck) {                                              // motor runs, vent does not move
    R(298, 41, 6, 6, "#5d6672");
    if (Math.floor(t / 90) % 2) { R(303, 39, 2, 2, "#ffe27a"); R(305, 42, 2, 1, "#ff9a3c"); R(301, 38, 1, 2, "#ffe27a"); }
  }
  for (let i = 0; i < 4; i++) {
    const y = BED_Y[i], z = h.zones[i];
    const on = sel.h === hi && sel.z === i, hov = hoverSpot && hoverSpot.type === "bed" && hoverSpot.h === hi && hoverSpot.z === i;
    R(BED_X0 - 2, y - 1, BED_X1 - BED_X0 + 4, 20, on ? "#f2d06b" : hov ? "#8b93c9" : "#2b3238");
    R(78, y + 5, 6, 8, "#1d232a"); text(String(i + 1), 79, y + 11);
    const a = animOf("bed", hi, i);
    if (z.locked && !a) { lockedBed(y, i, hi); continue; }
    const dry = Math.min(1, z.deficit / 160);
    R(BED_X0, y, BED_X1 - BED_X0, 18, mix("#5b3b26", "#9a7b55", dry));
    for (let k = 0; k < 20; k++) R(BED_X0 + hash(k + i * 40) * (BED_X1 - BED_X0), y + hash(k + 3 + i * 40) * 18, 1, 1, "#6e4a31");
    if (a) { tilling(t, y, i, prog(a, t)); continue; }
    R(BED_X0, y + 9, BED_X1 - BED_X0, 1, "#8a949c");                 // drip line
    const drops = Math.round(14 * Math.min(1.4, fd.drip[i] / 1250));
    for (let k = 0; k < drops; k++) {                               // water runs along the line and drips into the soil
      const dx = BED_X0 + ((k * 15 + t * 0.03) % (BED_X1 - BED_X0)), fall = (t / 250 + k * 0.37) % 1;
      R(dx, y + 9, 2, 1, "#7fd0ff"); R(BED_X0 + 6 + k * 14.5, y + 10 + fall * 4, 1, 1, "#9fdcff");
    }
    if (fd.leak[i] || puddles[hi * 4 + i]) puddle(t, y, hi * 4 + i, fd.leak[i], fd.leaking[i]);
    const air = fd.fans.some(Boolean) || fd.vent > 40 ? 1 : 0;        // leaves move in the air flow
    if (z.crop) for (let k = 0; k < 9; k++) {
      const px = BED_X0 + 11 + k * 23, sw = air && z.stage !== "dead" ? Math.round(Math.sin(t / 520 + k * 1.7 + i)) : 0;
      plantSprite(px + sw, y + 9, z, k);
      if (z.stage === "ripe" && hash(k + i * 9 + Math.floor(t / 300)) > 0.93) { R(px + sw, y + 3, 1, 1, "#ffffff"); R(px + sw - 1, y + 4, 3, 1, "#fff6c0"); }
    }
    if (z.pest) pests(t, y, i);
  }
  if (has("fog") && fd.fog) {
    g.globalAlpha = 0.35;
    for (let k = 0; k < 60; k++) R(80 + (hash(k) * 220 + t * 0.01) % 220, 50 + (hash(k + 9) * 120 + Math.sin(t / 500 + k) * 3), 2, 2, "#f4f8fb");
    g.globalAlpha = 1;
  }
  if (cool) [0, 1, 2].forEach(j => {                                // exhaust fans
    const y = 70 + j * 40, on = fd.fans[j], trip = fd.fan_trip[j];
    R(302, y - 5, 6, 11, trip ? "#8a2a22" : "#5b646c");
    const a = on ? Math.floor(t / 60) % 2 : 0;
    R(303, y - 3 + a, 4, 1, "#d7dde2"); R(304 + a, y - 4, 1, 9, "#d7dde2");
    if (trip && Math.floor(t / 400) % 2) R(302, y - 9, 6, 2, "#e0574b");
    if (on) for (let k = 0; k < 4; k++) R(90 + ((k * 55 + t * 0.06) % 200), y + 2, 6, 1, "#7fd0ff80");
  });
  path();
  if (has("robot")) {
    const target = sel.h === hi ? BED_X0 + 40 + sel.z * 40 : BED_X0 + 100 + Math.sin(t / 3000 + hi) * 80;
    robotX[hi] += Math.sign(target - robotX[hi]) * Math.min(Math.abs(target - robotX[hi]), 0.6);
    robot(robotX[hi], PATH_Y + 2, t);
  }
  if (has("net") && fd.net > 3) {                                   // shade net (dither over the house)
    g.globalAlpha = 0.38 * fd.net / 100;
    for (let y = 44; y < 190; y += 2) for (let x = 72 + (y % 4); x < 306; x += 4) R(x, y, 2, 1, "#0d1014");
    g.globalAlpha = 1;
  } else if (has("net")) R(72, 42, 234, 2, "#3a4a3a");             // net rolled up on the ridge
  if (S.farm.boosts.lamp != null) for (let i = 0; i < 4; i++) if (!h.zones[i].locked) {   // grow lamps over each bed
    R(BED_X0 + 4, BED_Y[i] - 3, BED_X1 - BED_X0 - 8, 1, "#c58be0");
    g.globalAlpha = 0.12 + 0.04 * Math.sin(t / 300); R(BED_X0, BED_Y[i] - 2, BED_X1 - BED_X0, 20, "#e070ff"); g.globalAlpha = 1;
  }
  if (p.rh > 92) { g.globalAlpha = 0.18; for (let k = 0; k < 70; k++) R(72 + hash(k) * 234, 44 + hash(k + 4) * 146, 1, 1, "#ffffff"); g.globalAlpha = 1; }   // condensation
  const gl = (t / 7000) % 1;                                        // a glint sweeping across the glass
  if (gl < 0.35) { g.globalAlpha = 0.13; for (let k = 0; k < 150; k += 2) R(70 + gl / 0.35 * 300 - k * 0.6 - 40, 44 + k, 8, 2, "#ffffff"); g.globalAlpha = 1; }
  if (fd.wires.includes("temp")) brokenWire(t, 190, 60);           // the air temperature sensor in the house
  R(188, 56, 5, 4, "#e8ecef");
}

const PAINT = {white: "#c3c9ce", green: "#4f9a62", red: "#b5402f", blue: "#4a86c8"};
function path() {
  const st = S.farm.style.path;
  if (st === "brick") {
    R(84, PATH_Y - 3, 212, 14, "#7a3a2a");
    for (let y = 0; y < 14; y += 3) for (let x = (y % 6 ? 0 : 4); x < 212; x += 8) R(84 + x, PATH_Y - 3 + y, 7, 2, "#a8553a");
  } else if (st === "planks") {
    R(84, PATH_Y - 3, 212, 14, "#8a6a3a");
    for (let x = 0; x < 212; x += 6) R(84 + x, PATH_Y - 3, 1, 14, "#6b4f2a");
  } else R(84, PATH_Y - 3, 212, 14, "#7b8288");
}
function decor(t, hi) {                // cosmetics outside the greenhouse
  const d = S.farm.style.decor, m = S.clock_min, night = m >= 18 * 60 + 30 || m < 6 * 60;
  if (d.includes("decor:flowers")) for (let x = 72; x < 306; x += 5) {
    R(x, 194, 1, 3, "#3e8f3a"); R(x - 1, 193, 3, 2, ["#f2c14e", "#e0574b", "#c58be0", "#f1ecd8"][(x / 5 + hi) % 4 | 0]);
  }
  if (d.includes("decor:scarecrow")) {
    const x = 54, y = 158, sw = Math.round(Math.sin(t / 700) * 1);
    R(x, y, 1, 30, "#7a5530"); R(x - 7, y + 6, 15, 1, "#7a5530");
    R(x - 3, y - 6, 7, 6, "#e8d9a8"); R(x - 4, y - 7, 9, 2, "#c9a36a"); R(x - 1, y - 4, 1, 1, "#1d232a"); R(x + 1, y - 4, 1, 1, "#1d232a");
    R(x - 3 + sw, y + 1, 7, 9, "#b5402f"); R(x - 7 + sw, y + 5, 4, 2, "#e8d9a8"); R(x + 4 + sw, y + 5, 4, 2, "#e8d9a8");
  }
  if (d.includes("decor:flag")) {
    R(72, 18, 1, 24, "#cfd3d6");
    for (let i = 0; i < 6; i++) R(73 + i * 2, 18 + Math.round(Math.sin(t / 200 + i) * S.weather.wind / 12), 2, 6, i < 3 ? "#f2c14e" : "#3ab0a5");
  }
  if (d.includes("decor:lanterns")) for (const x of [66, 312]) {
    R(x, 176, 1, 18, "#5d6672"); R(x - 1, 173, 3, 4, night ? "#ffe27a" : "#9aa5af");
    if (night) { g.globalAlpha = 0.25; R(x - 6, 168, 13, 14, "#ffe27a"); g.globalAlpha = 1; }
  }
}

function pests(t, y, i) {             // bugs crawling over an infested bed
  for (let b = 0; b < 14; b++) {
    const dir = b % 2 ? 1 : -1, x = BED_X0 + ((hash(b + i * 20) * 206 + dir * t * 0.006) % 206 + 206) % 206;
    R(x, y + 3 + hash(b + 3 + i * 20) * 12 + Math.round(Math.sin(t / 200 + b)), 1, 1, b % 3 ? "#1d232a" : "#c8d84a");
  }
  if (Math.floor(t / 400) % 2) { R(BED_X1 - 8, y + 1, 7, 7, "#8a2a22"); R(BED_X1 - 6, y + 3, 3, 3, "#1d232a"); R(BED_X1 - 7, y + 2, 1, 1, "#1d232a"); R(BED_X1 - 3, y + 2, 1, 1, "#1d232a"); }
}
const flocks = [];
function birdsDraw(t, cx) {            // a flock flies in, pecks, and leaves (or turns back at the scarecrow)
  for (let f = flocks.length - 1; f >= 0; f--) {
    const fl = flocks[f], a = (t - fl.t0) / 1000;
    if (a > 7) { flocks.splice(f, 1); continue; }
    const tx = fl.h * LOT + BED_X0 + 60 + fl.z * 30 - cx, ty = BED_Y[fl.z] + 4, sx = fl.h * LOT - 40 - cx, sy = 8;
    for (let b = 0; b < 6; b++) {
      let x, y, peck = false;
      const ox = (b % 3) * 14 + hash(b) * 6, oy = Math.floor(b / 3) * 5;
      if (fl.scared) {
        const q = Math.min(1, a / 2.5), back = Math.max(0, a - 2.5) / 2;
        x = sx + (tx - 120 - sx) * q + ox - back * 60; y = sy + (ty - 20 - sy) * q * (1 - back) - back * 30 + oy;
      } else if (a < 1.5) { x = sx + (tx - sx) * a / 1.5 + ox; y = sy + (ty - sy) * a / 1.5 + oy; }
      else if (a < 5) { x = tx + ox; y = ty + oy - (Math.floor(t / 150 + b) % 3 === 0 ? 1 : 0); peck = true; }
      else { const q = (a - 5) / 2; x = tx + ox + q * 140; y = ty + oy - q * 60; }
      const up = !peck && Math.floor(t / 120 + b) % 2;
      R(x - 1, y - up, 1, 1, "#3a3028"); R(x, y, 2, 1, "#3a3028"); R(x + 2, y - up, 1, 1, "#3a3028");
      if (peck) R(x + 2, y + 1, 1, 1, "#f2a03a");
    }
  }
}
const parts = [];
function burst(x, y, colors, n = 26) {  // harvest: produce and leaves pop out of the bed
  for (let i = 0; i < n; i++) parts.push({x: x + (Math.random() - 0.5) * 120, y, vx: (Math.random() - 0.5) * 1.2, vy: -1 - Math.random() * 1.6,
    life: 50 + Math.random() * 30, max: 80, c: colors[i % colors.length], gr: 0.06, w: 2});
}
function partsDraw(cx) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx; q.y += q.vy; q.vy += q.gr; q.life--;
    if (q.life <= 0) { parts.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, q.life / 15); R(q.x - cx, q.y, q.w || 1, 1, q.c); g.globalAlpha = 1;
  }
  if (parts.length > 600) parts.splice(0, parts.length - 600);
}
function critters(t, lot) {           // butterflies by day, fireflies at night (drawn in the light pass)
  if (daylight() < 0.5 || S.weather.rain) return;
  for (let b = 0; b < 3; b++) {
    const x = 20 + (hash(b + lot * 9) * 280 + t / 90 * (b % 2 ? 1 : -1)) % 290, y = 150 + hash(b + 4 + lot) * 40 + Math.sin(t / 300 + b) * 5;
    if (x > 66 && x < 312 && y < 193) continue;
    const up = Math.floor(t / 130 + b) % 2;
    R(Math.abs(x) - 1, y - up, 1, 1, ["#f2c14e", "#e88fb0", "#9fd0f0"][b]); R(Math.abs(x) + 1, y - up, 1, 1, ["#f2c14e", "#e88fb0", "#9fd0f0"][b]); R(Math.abs(x), y, 1, 1, "#1d232a");
  }
}

const YARD = 110;
function yard(t) {                     // the yard left of GH-1: road, market stall, the buyer's truck
  for (let i = 0; i < 60; i++) R(hash(i + 900) * YARD, 40 + hash(i + 901) * 158, 1, 2, "#5d8a45");
  R(0, 160, YARD, 26, "#8a7350"); for (let x = 0; x < YARD; x += 6) R(x, 172, 3, 1, "#a8916a");
  R(14, 96, 3, 50, "#7a5530"); R(66, 96, 3, 50, "#7a5530");                                     // stall
  for (let x = 0; x < 64; x += 8) R(10 + x, 88, 8, 10, (x / 8) % 2 ? "#f1ecd8" : "#c8403a");
  for (let x = 0; x < 64; x += 8) R(10 + x + 2, 98, 4, 2, (x / 8) % 2 ? "#f1ecd8" : "#c8403a");
  R(12, 128, 60, 16, "#7a5530"); R(12, 126, 60, 2, "#a8865a");
  for (let k = 0; k < 7; k++) { R(16 + k * 8, 120, 6, 6, "#8a5a2b"); R(17 + k * 8, 119, 4, 2, ["#d8432f", "#7cc242", "#e6b43c", "#4fb06a", "#e0405e", "#b5201c", "#3f8f3a"][k]); }
  text("MARKET", 23, 112, "#f2c14e", 7);
  const o = S.farm.order, tr = truck.t0 ? (t - truck.t0) / 2500 : 1;
  let x = null;
  if (o) x = truck.mode === "in" ? -60 + Math.min(1, tr) * 82 : 22;
  else if (truck.mode === "out" && tr < 1) x = 22 + tr * 160;
  if (x !== null) {
    const bob = Math.round(Math.sin(t / 120)) * (tr < 1 ? 1 : 0);
    R(x, 152 + bob, 46, 22, "#3ab0a5"); R(x + 46, 160 + bob, 14, 14, "#2b8f86"); R(x + 49, 162 + bob, 8, 6, "#bfe3ff");
    R(x + 2, 154 + bob, 42, 2, "#5fd0c4"); text("FRESH", x + 8, 166 + bob, "#f1ecd8", 7);
    for (const wx of [x + 8, x + 44]) { R(wx, 173, 8, 6, "#1d232a"); R(wx + 3, 175, 2, 2, "#9aa5af"); }
    if (tr < 1) for (let k = 0; k < 3; k++) { g.globalAlpha = 0.4; R(x - 4 - k * 5, 172 - k, 3, 2, "#c9b48a"); g.globalAlpha = 1; }
    if (o && tr >= 1) {                                             // the order board
      R(70, 120, 34, 26, "#7a5530"); R(72, 122, 30, 22, "#e8d9a8");
      text(shortName(o.crop).slice(0, 8), 74, 130, "#2a1c00", 6);
      text(`${num(o.got)}/${num(o.kg)}`, 74, 137, "#8a2a22", 6); text(`kg`, 74, 143, "#5b3b26", 5);
      R(72, 140, 30 * Math.min(1, o.got / o.kg), 2, "#6cc37a");
    }
  }
}
const truck = {mode: "in", t0: 0};

function lighting(t, cx) {             // night falls over the farm; lamps, lanterns and fireflies glow
  const dl = daylight(), look = S.weather.look;
  const dark = (1 - dl) * 0.58 + (look === "storm" ? 0.16 : look === "rain" ? 0.08 : 0) * dl;
  if (dark > 0.02) { g.fillStyle = `rgba(6,10,36,${dark})`; g.fillRect(0, 0, VW, 200); }
  if (flash > 0) {                                                  // lightning: a bolt and a white flash
    g.fillStyle = `rgba(235,240,255,${flash * 0.55})`; g.fillRect(0, 0, VW, 200);
    let x = (hash(Math.floor(t / 300)) * VW) | 0, y = 0;
    while (y < 40) { const nx = x + Math.round((hash(x + y) - 0.5) * 8); R(Math.min(x, nx), y, Math.abs(nx - x) + 1, 1, "#ffffff"); x = nx; R(x, y, 1, 4, "#ffffff"); y += 4; }
    flash = Math.max(0, flash - 0.08);
  }
  if (dl > 0.7) return;
  g.globalCompositeOperation = "lighter";
  const glow = (x, y, r, c, a) => { g.globalAlpha = a; disc(x, y, r, c); g.globalAlpha = a * 0.6; disc(x, y, Math.round(r * 0.5), c); };
  for (let i = 0; i < LOTS; i++) {
    const ox = i * LOT - cx;
    if (ox > VW || ox + LOT < 0 || i >= S.houses.length) continue;
    const h = S.houses[i];
    glow(ox + 48, 125, 4, h.plc.alarms.some(a => a.active) ? "#ff5040" : "#40ff70", 0.25);
    if (S.farm.style.decor.includes("decor:lanterns")) for (const x of [66, 312]) glow(ox + x, 175, 10, "#ffcf6a", 0.22);
    if (S.farm.boosts.lamp != null) glow(ox + 190, 110, 60, "#a040ff", 0.08);
    for (let f = 0; f < 8; f++) {
      const fx2 = ox + (hash(f + i * 13) * 320 + Math.sin(t / 900 + f) * 14), fy = 60 + hash(f + 5 + i * 13) * 130 + Math.cos(t / 700 + f) * 8;
      if (Math.sin(t / 250 + f * 3) > 0.3 && (fx2 - ox < 68 || fx2 - ox > 310 || fy > 193)) glow(fx2, fy, 2, "#d8ff60", 0.5);
    }
  }
  if (cx < 0 && S.farm.order) glow(-cx - YARD + 80, 160, 6, "#fff2b0", 0.25);
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
}

const puddles = {};
function puddle(t, y, key, broken, growing) {
  puddles[key] = Math.max(broken ? 0.3 : 0, Math.min(1, (puddles[key] || 0) + (growing ? 0.004 : -0.001)));
  const w = 10 + 50 * puddles[key];
  g.globalAlpha = 0.75; R(250 - w / 2, y + 12, w, 5, "#3d84c4"); R(252 - w / 3, y + 13, w / 2, 2, "#7fc0ee"); g.globalAlpha = 1;
  if (growing && Math.floor(t / 150) % 2) R(262, y + 6, 1, 4, "#7fd0ff");
}

function lockedBed(y, i, hi) {          // unbuilt plot: grass, survey stakes, padlock and price
  R(BED_X0, y, BED_X1 - BED_X0, 18, "#46703a");
  for (let k = 0; k < 26; k++) R(BED_X0 + hash(k + i * 40) * (BED_X1 - BED_X0), y + 2 + hash(k + 3 + i * 40) * 14, 1, 2, "#5d8a45");
  for (let x = BED_X0 + 3; x < BED_X1 - 3; x += 10) R(x, y + 9, 5, 1, "#e8d9a8");
  const cx = (BED_X0 + BED_X1) / 2, item = S.farm.shop.find(it => it.id === `bed:${hi}:${i}`);
  R(cx - 30, y + 3, 60, 12, "#1d232a");
  R(cx - 26, y + 7, 7, 6, "#f2c14e"); R(cx - 25, y + 4, 5, 1, "#c3c9ce"); R(cx - 25, y + 4, 1, 3, "#c3c9ce"); R(cx - 21, y + 4, 1, 3, "#c3c9ce");
  R(cx - 23, y + 9, 1, 2, "#1d232a");
  text(item ? `${item.cost}` : "later", cx - 15, y + 12, item ? "#f2c14e" : "#9aa0c4", 7);
}

function tilling(t, y, i, p) {          // a new bed: soil rolls out over the grass, then the drip line
  const w = (BED_X1 - BED_X0) * Math.min(1, p / 0.7);
  R(BED_X0 + w, y, BED_X1 - BED_X0 - w, 18, "#46703a");
  if (p < 0.7) { R(BED_X0 + w - 3, y - 2, 4, 22, "#c3c9ce"); sparkle(t, BED_X0 + w, y + 9, 1); }
  else R(BED_X0, y + 9, (BED_X1 - BED_X0) * (p - 0.7) / 0.3, 1, "#8a949c");
}

function sparkle(t, x, y, n = 3) {
  for (let k = 0; k < n * 4; k++) {
    const a = hash(k * 3.3 + Math.floor(t / 80)), r = 3 + 8 * hash(k + Math.floor(t / 80));
    R(x + Math.cos(a * 6.28) * r, y + Math.sin(a * 6.28) * r, 1, 1, k % 2 ? "#ffe27a" : "#ffffff");
  }
}

function robot(x, y, t) {
  const b = Math.round(Math.sin(t / 180));
  R(x - 4, y - 6 + b, 9, 6, "#3ab0a5"); R(x - 3, y - 9 + b, 7, 4, "#2b8f86");
  R(x + 1, y - 8 + b, 2, 2, "#f6f2b0"); R(x, y - 11 + b, 1, 2, "#cfd3d6"); R(x - 1, y - 12 + b, 3, 1, "#e35a2c");
  R(x - 4, y, 3, 2, "#1d232a"); R(x + 2, y, 3, 2, "#1d232a");
}

function waterSide(t, h, hi) {
  const p = h.plc, fd = h.field, flow = fd.pump && !fd.blocked;
  R(6, 58, 26, 44, "#c3c9ce"); R(8, 60, 22, 40, "#1d232a");          // tank T-201
  const lv = 40 * p.level / 100; R(8, 100 - lv, 22, lv, "#3d84c4");
  for (let x = 0; x < 22; x++) R(8 + x, 100 - lv + Math.round(Math.sin(t / 300 + x / 3) * 0.6), 1, 1, "#7fc0ee");   // a rippling surface
  R(9, 61, 2, 38, "#ffffff22");
  text("T201", 8, 55);
  const pipe = (x, y, w, hh) => R(x, y, w, hh, "#8a949c");
  pipe(18, 102, 2, 8); pipe(18, 108, 50, 2); pipe(66, 63, 2, 103);
  for (const y of BED_Y) pipe(66, y + 9, BED_X0 - 66, 1);
  if (flow) for (let k = 0; k < 8; k++) R(20 + ((k * 7 + t * 0.03) % 46), 108, 2, 2, "#7fd0ff");
  const a = fd.pump ? Math.floor(t / 70) % 2 : 0;                   // pump P-201
  R(36, 104, 9, 9, fd.pump_trip ? "#8a2a22" : fd.pump ? "#e8ecef" : "#5b646c"); R(39 + a, 106, 3 - a, 5, "#1d232a");
  if (fd.pump_trip) for (let k = 0; k < 3; k++) {                   // smoke from the tripped motor
    const s = ((t / 900 + k / 3) % 1);
    g.globalAlpha = 1 - s; R(39 + Math.sin(s * 6 + k) * 2, 102 - s * 14, 3, 3, "#9aa5af"); g.globalAlpha = 1;
  }
  R(47, 99, 5, 5, "#e8ecef"); R(49, 101, 1, 1, "#1d232a");          // pressure gauge
  const needle = fd.blocked ? 2 : fd.pump ? 1 : 0;
  R([48, 49, 50][needle], [101, 100, 101][needle], 1, 1, fd.blocked ? "#e0574b" : "#1d232a");
  if (fd.burst) { g.globalAlpha = 0.7; R(46, 110, 22, 4, "#3d84c4"); R(50, 111, 12, 1, "#7fc0ee"); g.globalAlpha = 1; }   // wet patch
  if (fd.spray) for (let k = 0; k < 10; k++) {                      // burst pipe: a fountain
    const s = (t / 500 + k / 10) % 1, dir = k % 2 ? 1 : -1;
    R(56 + dir * s * 10, 106 - 16 * s + 22 * s * s, 1, 2, "#7fd0ff");
  }
  if (fd.passing) for (let k = 0; k < 4; k++) R(40, 64 + ((k * 9 + t * 0.02) % 40), 1, 2, "#7fd0ff");
  R(40, 62, 1, 44, "#8a949c80");
  const jug = (x, c, v) => { R(x, 120, 8, 12, "#c3c9ce"); R(x + 1, 121, 6, 10, "#1d232a"); R(x + 1, 131 - 10 * v, 6, 10 * v, c); };
  jug(6, "#6cc37a", fd.jugs[0]); jug(16, "#b07ad8", fd.jugs[1]); jug(26, "#e8963c", fd.jugs[2]);
  text("A  B ac", 7, 139, "#e8ecef", 5);
  const alarm = h.plc.alarms.some(x => x.active);                   // PLC cabinet
  R(40, 120, 18, 26, "#9aa5af"); R(41, 121, 16, 24, "#5d6672"); R(43, 124, 12, 7, "#1d232a");
  R(44, 125, 2, 1, "#6cc37a"); R(47, 125, 2, 1, alarm && Math.floor(t / 300) % 2 ? "#e0574b" : "#3a2222");
  R(43, 134, 12, 1, "#9aa5af"); R(43, 137, 12, 1, "#9aa5af"); text("PLC", 43, 143, "#e8ecef", 5);
  if (has("solar")) { R(63, 28, 1, 14, "#cfd3d6"); R(61, 26, 5, 2, "#e8ecef"); R(62, 25, 3, 1, "#bfe3ff"); }
  if (hi === 0 && has("cold")) {                                     // cold room
    R(4, 152, 34, 34, "#e8ecef"); R(4, 150, 34, 3, "#9aa5af"); R(16, 166, 10, 20, "#5aa9e6");
    R(20, 158, 3, 3, "#bfe3ff"); R(21, 157, 1, 5, "#bfe3ff"); R(19, 159, 5, 1, "#bfe3ff");
  }
}

function forSale(t, i) {               // a lot you can buy: survey stakes and a sign
  for (let x = 70; x < 308; x += 12) { R(x, 42, 4, 1, "#e8d9a8"); R(x, 191, 4, 1, "#e8d9a8"); }
  for (let y = 42; y < 192; y += 12) { R(70, y, 1, 4, "#e8d9a8"); R(307, y, 1, 4, "#e8d9a8"); }
  const next = i === S.houses.length, it = S.farm.shop.find(x => x.id === `house:${i}`);
  const hov = hoverSpot && hoverSpot.type === "lot" && hoverSpot.h === i;
  R(160, 100, 3, 40, "#7a5530"); R(176, 100, 3, 40, "#7a5530");
  R(140, 84, 60, 34, hov ? "#c9a36a" : "#a8865a"); R(142, 86, 56, 30, "#e8d9a8");
  text(next ? "FOR SALE" : "LATER", 146, 95, "#5b3b26", 7);
  text(META.house_names[i], 155, 104, "#2a1c00", 7);
  if (next && it) text(`${num(it.cost)} LV${it.level}`, 145, 113, "#8a2a22", 6);
  else text(`build ${META.house_names[i - 1]}`, 146, 113, "#5b3b26", 6);
}

function construction(t, i, p) {       // a new greenhouse: slab, posts, ridge, cover
  forSale(t, i);
  R(140, 84, 60, 60, "#4e7a3a");
  for (let k = 0; k < 30; k++) R(hash(k + i * 500 + 3) * LOT, 140 + hash(k + i * 500 + 7) * 50, 1, 2, "#5d8a45");
  const k1 = Math.min(1, p / 0.2), k2 = Math.max(0, Math.min(1, (p - 0.2) / 0.4)), k3 = Math.max(0, Math.min(1, (p - 0.6) / 0.25));
  R(72, 44, 234 * k1, 146, "#36414a");
  for (let c = 0; c < 9; c++) {
    const x = 70 + c * 29.5, hh = 150 * Math.max(0, Math.min(1, k2 * 1.4 - c * 0.05));
    R(x, 192 - hh, 3, hh, "#d7dde2");
  }
  R(70, 42, 238 * k3, 4, "#d7dde2");
  if (p > 0.85) { g.globalAlpha = (p - 0.85) / 0.15; R(70, 42, 238, 150, "#c3c9ce"); R(72, 44, 234, 146, "#36414a"); g.globalAlpha = 1; }
  for (let k = 0; k < 8; k++) { const s = (t / 700 + k / 8) % 1; g.globalAlpha = 0.6 * (1 - s); R(80 + hash(k) * 220, 188 - s * 20, 4, 3, "#c9b48a"); }
  g.globalAlpha = 1;
  sparkle(t, 70 + 238 * Math.max(k1, k3), 120, 2);
  R(120, 172, 80, 12, "#1d232a"); text("BUILDING " + Math.round(p * 100) + "%", 126, 181, "#f2c14e", 7);
}

const UP_SPOT = {solar: [56, 20, 14, 24], net: [70, 38, 238, 10], film: [70, 38, 238, 154], cool: [70, 50, 240, 135],
                 fog: [80, 48, 220, 60], robot: [84, 160, 212, 20], cold: [2, 146, 40, 42]};
function upgradeWork(t, a, p, hi) {    // scaffolding and sparks where the new hardware goes
  if (a.up === "cold" && hi !== 0) return;
  const [x, y, w, hh] = UP_SPOT[a.up];
  g.globalAlpha = 1 - Math.max(0, p - 0.8) / 0.2;
  for (let k = 0; k < w; k += 6) { R(x + k, y, 3, 1, "#f2c14e"); R(x + k, y + hh, 3, 1, "#f2c14e"); }
  for (let k = 0; k < hh; k += 6) { R(x, y + k, 1, 3, "#f2c14e"); R(x + w, y + k, 1, 3, "#f2c14e"); }
  sparkle(t, x + w * ((t / 900) % 1), y + hh / 2, 2);
  g.globalAlpha = 1;
  if (p > 0.8) sparkle(t, x + w / 2, y + hh / 2, 5);
}

const SPOT_BUBBLE = {feed: [24, 47], water: [41, 92], plc: [53, 114], climate: [190, 33]};
function alerts(h) {
  const fd = h.field;
  return {water: fd.pump_trip || fd.burst || fd.blocked || fd.passing, feed: fd.jugs.some(j => j < 0.05),
          climate: fd.vent_stuck || fd.fan_trip.some(Boolean) || fd.pad_dry || fd.wires.length > 0,
          plc: h.plc.alarms.some(a => a.active), ...waiting(h)};
}
function waiting(h) {                  // found faults not repaired yet light up their equipment
  const out = {}, hi = S.houses.indexOf(h);
  for (const r of S.farm.repairs) if (r.house === hi) out[groupOf(r.fault) === "beds" ? "water" : groupOf(r.fault)] = true;
  return out;
}
const groupOf = f => Object.keys(META.groups).find(k => META.groups[k].includes(f));
function bubbles(t, h, hi) {           // clickable equipment: a small gear, or a red "!" when it looks wrong
  const al = alerts(h);
  for (const [k, [x, y]] of Object.entries(SPOT_BUBBLE)) {
    const hov = hoverSpot && hoverSpot.type === k && hoverSpot.h === hi, bad = al[k];
    if (bad && Math.floor(t / 350) % 2 === 0) { R(x - 5, y - 5, 11, 11, "#070914"); R(x - 4, y - 4, 9, 9, "#e0574b"); R(x, y - 3, 1, 4, "#fff"); R(x, y + 2, 1, 1, "#fff"); }
    else if (bad || hov) { R(x - 5, y - 5, 11, 11, "#070914"); R(x - 4, y - 4, 9, 9, bad ? "#8a2a22" : "#f2c14e"); gear(x, y, bad ? "#fff" : "#2a1c00"); }
    else { g.globalAlpha = 0.7; R(x - 4, y - 4, 9, 9, "#1c2140"); gear(x, y, "#9aa0c4"); g.globalAlpha = 1; }
    if (hov) { const lab = SPOT_NAME[k]; R(x - 2, y + 7, lab.length * 4 + 4, 8, "#070914"); text(lab, x, y + 13, "#f2c14e", 6); }
  }
}
function gear(x, y, c) { R(x - 2, y - 2, 5, 5, c); R(x - 1, y - 3, 3, 7, c); R(x - 3, y - 1, 7, 3, c); R(x - 1, y - 1, 3, 3, "#1c2140"); R(x, y, 1, 1, c); }
const SPOT_NAME = {feed: "Feed tank", water: "Pump", plc: "PLC", climate: "Climate"};

function drawLot(t, i) {
  grass(i, t);
  const ha = animOf("house", i);
  if (i >= S.houses.length || (ha && prog(ha, t) < 1)) {
    if (ha) construction(t, i, prog(ha, t)); else forSale(t, i);
    return;
  }
  const h = S.houses[i];
  windsock(t, h); waterSide(t, h, i); greenhouse(t, h, i); decor(t, i); critters(t, i);
  for (const a of anims) if (a.kind === "up") upgradeWork(t, a, prog(a, t), i);
  bubbles(t, h, i);
  if (S.farm.trouble && S.farm.trouble.house === i && Math.floor(t / 500) % 2) {
    R(72, 186, 60, 9, "#8a2a22"); text(S.farm.trouble.kind === "roadblock" ? "ROADBLOCK" : "PROBLEM", 75, 193, "#fff", 6);
  }
}

function floatersDraw(t, cx) {
  g.font = "8px 'Pixelify Sans', monospace";
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i], a = (t - f.t0) / 1600;
    if (a > 1) { floaters.splice(i, 1); continue; }
    const y = f.y - 22 * a;
    g.fillStyle = "#070914"; g.fillText(f.text, f.x - cx + 1, y + 1);
    g.fillStyle = "#f2c14e"; g.fillText(f.text, f.x - cx, y);
  }
}

const clampCam = x => Math.max(-YARD, Math.min(LOT * LOTS - VW, x));
function camTo(i) { cam.tx = clampCam(i * LOT + LOT / 2 - VW / 2 + 30); }
function frame(t) {
  if (S && META) {
    if (!drag) cam.x += (cam.tx - cam.x) * 0.12;
    const shake = S.weather.look === "storm" && S.weather.wind > 15 && hash(Math.floor(t / 60)) > 0.8 ? 1 : 0;
    const cx = Math.round(cam.x) + shake;
    sky(t, cx);
    if (cx < 0) { g.save(); g.translate(-YARD - cx, 0); yard(t); g.restore(); }
    for (let i = 0; i < LOTS; i++) {
      const ox = i * LOT - cx;
      if (ox > VW || ox + LOT < 0) continue;
      g.save(); g.translate(ox, 0); drawLot(t, i); g.restore();
    }
    birdsDraw(t, cx); partsDraw(cx); rain(t, cx); lighting(t, cx); floatersDraw(t, cx);
    for (let i = anims.length - 1; i >= 0; i--) if (prog(anims[i], t) >= 1) anims.splice(i, 1);
    $("camL").disabled = cam.tx <= -YARD; $("camR").disabled = cam.tx >= LOT * LOTS - VW;
  }
  guideFrame(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// whole-pixel scaling keeps the art crisp; a wide screen shows more of the farm instead of bigger pixels
function fit() {
  const st = getComputedStyle(cv.parentElement);
  const avail = cv.parentElement.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
  const k = avail >= 640 ? 2 : avail / 320;
  VW = Math.max(320, Math.min(LOT * LOTS, Math.floor(avail / k)));
  if (cv.width !== VW) { cv.width = VW; g.imageSmoothingEnabled = false; }
  cv.style.width = VW * k + "px"; cv.style.height = 200 * k + "px";
  cam.tx = clampCam(cam.tx); cam.x = clampCam(cam.x);
}
addEventListener("resize", fit); fit();

// ---------------------------------------------------------------- looking around and clicking
function toWorld(e) {
  const r = cv.getBoundingClientRect();
  return {x: (e.clientX - r.left) * VW / r.width + Math.round(cam.x), y: (e.clientY - r.top) * 200 / r.height};
}
function spotAt({x, y}) {
  if (S && x < 0 && x >= -YARD) {                                 // the yard: the stall and the buyer's truck
    const yx = x + YARD;
    if (yx >= 8 && yx < 76 && y >= 84 && y < 146) return {type: "market", h: 0};
    if (S.farm.order && y >= 116 && y < 186) return {type: "order", h: 0};
    return null;
  }
  const i = Math.floor(x / LOT), lx = x - i * LOT;
  if (!S || i < 0 || i >= LOTS) return null;
  if (i >= S.houses.length || animOf("house", i)) return {type: "lot", h: i};
  if (lx >= BED_X0 - 10 && lx <= BED_X1 + 4) {
    const z = BED_Y.findIndex(b => y >= b - 4 && y <= b + 22);
    if (z >= 0) return {type: "bed", h: i, z};
  }
  if (lx >= 2 && lx < 36 && y >= 44 && y < 142) return {type: "feed", h: i};
  if (lx >= 36 && lx < 68 && y >= 88 && y < 118) return {type: "water", h: i};
  if (lx >= 38 && lx < 62 && y >= 108 && y < 148) return {type: "plc", h: i};
  if (i === 0 && has("cold") && lx < 40 && y >= 148) return {type: "farm", h: i};
  if ((lx >= 70 && lx < 310 && y >= 26 && y < 52) || (lx >= 44 && lx < 74 && y >= 14 && y < 44) ||
      (lx >= 296 && lx < 312 && y >= 52 && y < 125)) return {type: "climate", h: i};
  return null;
}
let drag = null;
cv.addEventListener("pointerdown", e => { drag = {x: e.clientX, cam: cam.x, moved: false}; });
cv.addEventListener("pointermove", e => {
  hoverSpot = spotAt(toWorld(e));
  cv.style.cursor = hoverSpot ? "pointer" : drag ? "grabbing" : "grab";
  if (!drag) return;
  const dx = (e.clientX - drag.x) * VW / cv.getBoundingClientRect().width;
  if (Math.abs(dx) > 4 && !drag.moved) { drag.moved = true; cv.setPointerCapture(e.pointerId); }
  if (drag.moved) cam.x = cam.tx = clampCam(drag.cam - dx);
});
cv.addEventListener("pointerup", e => { if (drag && !drag.moved) clickAt(spotAt(toWorld(e))); drag = null; });
cv.addEventListener("pointercancel", () => { drag = null; });
cv.addEventListener("pointerleave", () => { hoverSpot = null; });
cv.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") { cam.tx = clampCam(cam.tx + (e.key === "ArrowLeft" ? -80 : 80)); e.preventDefault(); }
});
$("camL").onclick = () => { cam.tx = clampCam(cam.tx - LOT / 2); };
$("camR").onclick = () => { cam.tx = clampCam(cam.tx + LOT / 2); };

function clickAt(s) {
  if (!s) return;
  if (s.type === "bed") {
    sel = {h: s.h, z: s.z};
    const z = S.houses[s.h].zones[s.z];
    if (!z.locked && z.stage === "ripe") { send({cmd: "harvest", house: s.h, zone: s.z}); return; }
    if (!z.locked && armed && (!z.crop || z.stage === "dead")) { plantArmed(s.h, s.z); return; }
  }
  openPop(s.type, s.h, s.z);
}
function plantArmed(h, z) { send({cmd: "plant", house: h, zone: z, crop: armed.crop, variant: armed.variant}); }

// ---------------------------------------------------------------- pixel icons (8x8, drawn here)
const PAL = {y: "#ffd94a", o: "#f39c2c", w: "#f1ecd8", g: "#9aa5af", d: "#5d6672", b: "#5aa9e6", r: "#e0574b", n: "#8a5a2b",
             l: "#6cc37a", k: "#1d232a", p: "#c58be0"};
const ICON = {
  sun: ["y..y..y.", ".yyyyy..", ".yoooy..", "yyoooyyy", ".yoooy..", ".yyyyy..", "y..y..y.", "........"],
  cloud: ["........", "..www...", ".wwwwww.", "wwwwwwww", "wwwwwwww", ".gggggg.", "........", "........"],
  rain: ["..ggg...", ".gggggg.", "gggggggg", ".gggggg.", "..b..b..", ".b..b..b", "b..b..b.", "........"],
  storm: ["..ddd...", ".dddddd.", "dddddddd", ".ddyddd.", "...yy...", "..yy....", "...y....", "........"],
  pause: ["........", ".ww..ww.", ".ww..ww.", ".ww..ww.", ".ww..ww.", ".ww..ww.", ".ww..ww.", "........"],
  play: ["..w.....", "..ww....", "..www...", "..wwww..", "..www...", "..ww....", "..w.....", "........"],
  ff: ["........", ".w...w..", ".ww..ww.", ".wwwwwww", ".ww..ww.", ".w...w..", "........", "........"],
  fff: ["........", "w..w..w.", "ww.ww.ww", "wwwwwwww", "ww.ww.ww", "w..w..w.", "........", "........"],
  max: ["....yy..", "...yy...", "..yy....", ".yyyyyy.", "....yy..", "...yy...", "..yy....", ".y......"],
  moon: ["..www...", ".ww.....", "ww......", "ww......", "ww......", ".ww.....", "..www...", "........"],
  basket: ["...r.r..", "..rrrrr.", "nnnnnnnn", ".nwnwnn.", ".nnnnnn.", "..nnnn..", "........", "........"],
  coin: ["..oooo..", ".oyyyyo.", "oyywyyyo", "oywyyyyo", "oyyyyyyo", "oyyyyyyo", ".oyyyyo.", "..oooo.."],
  cup: ["o.yyyy.o", "oyyyyyyo", "o.yyyy.o", "..yyyy..", "...yy...", "...yy...", "..oooo..", "........"],
  lock: ["..gggg..", ".g....g.", ".g....g.", "yyyyyyyy", "yyyoyyyy", "yyyoyyyy", "yyyyyyyy", "........"],
  house: ["...ww...", "..wwww..", ".wwwwww.", "wwwwwwww", ".wbwwbw.", ".wbwwbw.", ".wwwwww.", "........"],
  book: [".nnnnnn.", "nwwwwwwn", "nwkkkwwn", "nwwwwwwn", "nwkkkkwn", "nwwwwwwn", ".nnnnnn.", "........"],
  bag: ["..nn....", ".n..n...", "nnnnnnn.", "nyyyyyn.", "nyonyyn.", "nyyyyyn.", "nnnnnnn.", "........"],
  tea: ["........", "w.www...", ".wnnnw..", ".wllnww.", ".wnnnw.w", ".wnnnww.", "..www...", "........"],
  lamp: ["..yyy...", ".yyyyy..", ".yyyyy..", "..yyy...", "..ggg...", "..ddd...", "........", "........"],
  bees: ["...ww...", "..wwww..", ".kyykyy.", "yykyykyy", ".kyykyy.", "..yyyy..", "........", "........"],
  market: ["rrrrrrrr", "wwwwwwww", "rrrrrrrr", ".g....g.", ".g.ll.g.", ".g.ll.g.", ".gggggg.", "........"],
  wrench: ["......gg", ".....g.g", "....ggg.", "...ggg..", "..ggg...", ".ggg....", "gg......", "g......."],
  multimeter: ["dddddddd", "dwwwwwwd", "dwkkkwwd", "dwwwwwwd", "dddddddd", "drd..dkd", "dddddddd", "........"],
  ladder: ["n....n..", "nnnnnn..", "n....n..", "nnnnnn..", "n....n..", "nnnnnn..", "n....n..", "........"],
  net: ["kgkgkgkg", "gkgkgkgk", "kgkgkgkg", "gkgkgkgk", "kgkgkgkg", "gkgkgkgk", "........", "........"],
  film: ["wwwwwwww", "wbbwbbbw", "wbwbbbbw", "wbbbbbbw", "wbbbbwbw", "wwwwwwww", "........", "........"],
  cool: ["..www...", "...w....", "w..w..w.", "wwwkwww.", "w..w..w.", "...w....", "..www...", "........"],
  robot: ["...r....", "...g....", ".gggggg.", ".gwggwg.", ".gggggg.", ".g.gg.g.", "..g..g..", "........"],
  cold: ["...b....", ".b.b.b..", "..bbb...", "bbbwbbb.", "..bbb...", ".b.b.b..", "...b....", "........"],
  tree: ["...ll...", "..llll..", ".llllll.", "..llll..", ".llllll.", "...nn...", "...nn...", "........"],
  check: ["........", ".......l", "......ll", "l....ll.", "ll..ll..", ".llll...", "..ll....", "........"],
};
function iconURL(name) {
  const c = document.createElement("canvas"); c.width = c.height = 8;
  const x = c.getContext("2d");
  ICON[name].forEach((row, j) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); } }));
  return c.toDataURL();
}
const ICO = {};
const icoSrc = name => ICO[name] || (ICO[name] = iconURL(name));
const ico = name => `<img src="${icoSrc(name)}" alt="">`;

function drawInto(canvas, fn) {     // reuse the farm sprites on a small canvas
  const old = g; g = canvas.getContext("2d"); g.imageSmoothingEnabled = false; fn(); g = old;
}
function cropIcon(canvas, crop) {
  drawInto(canvas, () => { R(0, 0, 16, 16, "#5b3b26"); plantSprite(8, 8, {crop, maturity: 100, health: 100, stage: "ripe"}, 3); });
}
function drawLogo() {
  drawInto($("logo"), () => {
    R(0, 0, 16, 16, "#0f1222"); R(1, 5, 14, 10, "#d7dde2"); R(2, 6, 12, 8, "#36414a");
    R(3, 3, 10, 2, "#d7dde2"); R(5, 1, 6, 2, "#d7dde2");
    R(3, 11, 10, 2, "#5b3b26"); R(5, 8, 3, 3, "#6cc37a"); R(9, 8, 3, 3, "#3e8f3a"); R(6, 9, 1, 1, "#e0574b");
  });
}

// ---------------------------------------------------------------- the farmer guide (GelasTinta character pack)
const FARMER = {};
const outfit = () => (S && S.farm.style.outfit) || "farmer";
const farmerSheet = n => { const k = outfit() + "/" + n; return FARMER[k] || (FARMER[k] = Object.assign(new Image(), {src: `img/${k}.png`})); };
const fctx = $("farmer").getContext("2d");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const say = {queue: [], cur: null, t0: 0, shown: -1};
let mood = "wave_hat";
function guide(textLine, m = "happy", urgent = false) {
  if (urgent) { say.queue.unshift({text: textLine, m}); nextLine(); $("guide").classList.remove("min"); $("sayHide").textContent = "Hide"; return; }
  if (say.queue.length > 3) say.queue.splice(0, say.queue.length - 3);      // tips go stale; keep the newest
  say.queue.push({text: textLine, m});
  if (!say.cur) nextLine();
  else $("sayNext").hidden = false;
}
function nextLine() {
  const n = say.queue.shift();
  if (n) { say.cur = n; mood = n.m; say.t0 = performance.now(); say.shown = -1; }
  $("sayNext").hidden = !say.queue.length;
}
function guideFrame(t) {
  const sheet = farmerSheet(mood);
  if (sheet.complete && sheet.naturalWidth) {
    const f = still ? 0 : Math.floor(t / 150) % Math.max(1, Math.floor(sheet.naturalWidth / 76));
    fctx.clearRect(0, 0, 56, 54);
    fctx.drawImage(sheet, f * 76 + 12, 0, 56, 54, 0, 0, 56, 54);
  }
  if (say.cur) {
    const n = still ? say.cur.text.length : Math.min(say.cur.text.length, Math.floor((t - say.t0) / 22));
    if (n !== say.shown) { say.shown = n; $("sayText").textContent = say.cur.text.slice(0, n); }
  }
}
$("sayNext").onclick = () => {
  if (say.cur && say.shown < say.cur.text.length) say.t0 = -1e9;           // finish typing first
  else nextLine();
};
$("sayHide").onclick = () => {
  const min = $("guide").classList.toggle("min");
  $("sayHide").textContent = min ? "Show farmer" : "Hide";
};

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private window */ } },
};
let tut = +(store.get("gh1-tut2") || 0);
const tipsSeen = new Set(), alarmsSeen = new Set();
const cropName = c => META.crops[c].name;
const shortName = c => c === "kangkung" ? "Kangkung" : cropName(c).split(" ")[0];
const upTitle = id => META.upgrades.find(u => u.id === id).title;
function tutorial(s) {
  const f = s.farm, h0 = s.houses[0];
  const step = (cond, line, m) => { if (cond) { guide(line, m); store.set("gh1-tut2", ++tut); } };
  if (tut === 0) step(true, "Hi, welcome to my farm! A real PLC program, greenhouse.st, runs this greenhouse: the same one that passes the factory tests. It's a bare house for now. Let's grow it.", "wave_hat");
  else if (tut === 1) step(true, "Bed 1 has kangkung, a water spinach that loves the heat. Pick the kangkung seed below, then click bed 2 to plant it.", "happy");
  else if (tut === 2) step(h0.zones[1].crop, "Nice! The PLC waters and feeds the beds by itself. Click the tank, the pump, the roof or the grey PLC cabinet to look inside and change its settings. Fast-forward to make the day go quicker.", "thinking");
  else if (tut === 3) step(s.houses.some(h => h.zones.some(z => z.stage === "ripe")), "Something is ripe! Click that bed to harvest it.", "starstruck");
  else if (tut === 4) step(f.harvests > 0, "Coins! Open the farm book (top right) to buy upgrades. This house has no shade, no cooling and waters on a timer. A sun sensor is a cheap start.", "proud_basket");
  else if (tut === 5) step(f.upgrades.length > 0 || f.beds[0] > 2, "Every upgrade switches on a function the PLC already has. Things will break now and then: look for a red ! or anything odd and diagnose it on that equipment's panel. Fixing it takes the right tools and parts, so keep the market in mind.", "laugh");
}
function tips(s) {
  const once = (key, cond, line, m) => { if (cond && !tipsSeen.has(key)) { tipsSeen.add(key); guide(line, m); } };
  const m = s.clock_min, night = m >= 19 * 60 || m < 5 * 60 + 30;
  once("night", night && speed !== 0, "It's dark, and nothing grows at night. The moon button skips to the next morning, or grow lamps keep the crops going.", "sleepy");
  once("storm", s.weather.look === "storm", "Storm! In high wind the PLC closes the vents to protect the roof. Watch how hot it gets inside.", "nervous");
  s.houses.forEach((h, hi) => {
    h.zones.forEach((z, i) => {
      if (z.stress.heat !== undefined && z.stress.heat < 0.5)
        once("heat" + z.crop, true, `Too hot for the ${cropName(z.crop).toLowerCase()} in ${META.house_names[hi]} bed ${i + 1}! ` +
          (has("cool") ? "Lower the cooling set point on the climate panel." : "Pad-and-fan cooling would help, or grow something that likes heat."), "wipe_sweat");
      if (z.stress.water !== undefined && z.stress.water < 0.5)
        once("water", true, `The crops in ${META.house_names[hi]} are thirsty. ` +
          (has("solar") ? "Check the pump panel: is water getting through?" : "A timer can't follow the sun: light-sum watering would."), "wipe_sweat");
    });
    for (const a of h.plc.alarms) {
      const key = hi + a.tag;
      if (a.active && !alarmsSeen.has(key)) { alarmsSeen.add(key); guide(`${META.house_names[hi]} alarm ${a.tag}: ${a.text}. The PLC cabinet panel has the details.`, "shocked"); }
      if (!a.active) alarmsSeen.delete(key);
    }
  });
}
function onEvent(ev) {
  const hn = i => META.house_names[i];
  if (ev.type === "achievement") {
    const a = META.achievements.find(x => x.id === ev.id);
    toast(`Achievement: ${a.title} · +${META.ach_bonus} coins`);
    guide(`Achievement unlocked: ${a.title}! ${a.desc} Here's ${META.ach_bonus} coins.`, "proud");
  } else if (ev.type === "level") {
    guide(`Level ${ev.level}! New branches of the crop and upgrade trees may be open now.`, "starstruck");
  } else if (ev.type === "unlock") {
    toast(`New seed: ${ev.crops.map(cropName).join(", ")}`);
    guide(`New seed unlocked: ${ev.crops.map(cropName).join(" and ")}! The tree button at the top shows what comes after it.`, "starstruck");
  } else if (ev.type === "roadblock") {
    guide(`Wait! ${ev.why} Look around ${hn(ev.house)}, open the equipment that looks wrong and diagnose it. ${ev.title} gets built when you find it.`, "nervous", true);
    camTo(ev.house); closePop();
  } else if (ev.type === "problem") {
    guide(`Something's not right in ${hn(ev.house)}. Look around: anything odd? Open the equipment and diagnose it. +${META.problem_reward} coins if you're right.`, "nervous", true);
    camTo(ev.house);
  } else if (ev.type === "practice") guide(`Practice: I've hidden a fault in ${hn(ev.house)}. Find it.`, "determined");
  else if (ev.type.endsWith("_solved")) {
    guide(`Right, it's ${ev.fault}! Now it needs fixing` + (ev.needs.length ? `: we still need ${ev.needs.map(nameOf).join(" and ")} from the market. ` : `, and we have what it takes. `) +
      `Repair it on the same panel${ev.type === "problem_solved" ? ` for +${META.problem_reward} coins` : ""}, or hire the technician.`, ev.needs.length ? "thinking" : "determined", true);
  } else if (ev.type === "repaired") {
    guide(ev.hired ? "The technician fixed it. Next time, have the tools ready!" :
      `Fixed it with our own tools!${ev.kind === "problem" ? ` +${META.problem_reward} coins.` : ""}${ev.kind === "roadblock" ? " Now we can build." : ""}`, ev.hired ? "happy" : "proud_basket", true);
  } else if (ev.type.endsWith("_failed")) {
    guide(`Not quite: it was ${ev.fault}.${ev.type === "problem_failed" ? ` The technician fixed it for ${META.callout_fee} coins.` : ""} The PLC cabinet panel explains what gave it away.` +
      (ev.type === "roadblock_failed" ? ` Try building ${ev.title} again.` : ""), "confused", true);
  } else if (ev.type === "built") {
    const t0 = performance.now();
    if (ev.item.startsWith("house")) {
      anims.push({kind: "house", h: ev.house, t0, dur: 6000}); camTo(ev.house); closePop();
      guide(`${ev.title} is going up! It runs its own copy of the same PLC program: not one line changed. That's how a farm scales.`, "starstruck", true);
    } else if (ev.item.startsWith("bed")) {
      anims.push({kind: "bed", h: ev.house, z: ev.zone, t0, dur: 2500}); camTo(ev.house);
      guide(`${ev.title} is ready. Plant it!`, "happy");
    } else {
      const up = ev.item.slice(3);
      anims.push({kind: "up", up, t0, dur: 3000});
      guide(`${ev.title} installed${S.houses.length > 1 ? " in every greenhouse" : ""}! ` + (META.upgrades.find(u => u.id === up).parks.length
        ? "The PLC had this function all along: its set point was parked until the hardware was there." : ""), "proud");
    }
    toast(`Built: ${ev.title}`);
  } else if (ev.type === "new_day") {
    const wxText = {clear: "clear skies", cloudy: "a cloudy day", rain: "showers this afternoon", storm: "a storm this afternoon"}[ev.weather];
    guide(`Good morning, day ${ev.day}! Forecast: ${wxText}${ev.heat ? ", and a heatwave: watch the temperature" : ""}. ` +
      `Market: ${cropName(ev.hot)} sells high today${ev.glut ? `, ${cropName(ev.glut).toLowerCase()} is cheap` : ""}.` +
      (ev.order ? ` A buyer's truck is in the yard: ${num(ev.order.kg)} kg of ${cropName(ev.order.crop).toLowerCase()} in ${ev.order.due - ev.day + 1} days for a ${num(ev.order.bonus)}-coin bonus.` : ""),
      ev.heat ? "wipe_sweat" : ev.weather === "storm" ? "nervous" : "wave_hat");
    if (ev.order) { truck.mode = "in"; truck.t0 = performance.now(); }
  } else if (ev.type === "order_done") {
    truck.mode = "out"; truck.t0 = performance.now();
    toast(`Order delivered · +${num(ev.bonus)} coins`); guide(`Order filled: ${num(ev.kg)} kg of ${cropName(ev.crop).toLowerCase()}! The buyer paid a ${num(ev.bonus)}-coin bonus.`, "laugh");
  } else if (ev.type === "order_failed") {
    truck.mode = "out"; truck.t0 = performance.now();
    guide(`The buyer gave up on the ${cropName(ev.crop).toLowerCase()} order. There'll be others.`, "sad");
  } else if (ev.type === "pest") {
    guide(`Bugs on the ${cropName(ev.crop).toLowerCase()} in ${hn(ev.house)} bed ${ev.zone + 1}! They eat health until you spray neem oil from the bed's panel.`, "shocked");
    camTo(ev.house);
  } else if (ev.type === "sprayed") toast("Sprayed: the bugs are gone");
  else if (ev.type === "birds") {
    flocks.push({h: ev.house, z: ev.zone, t0: performance.now()});
    guide(`Birds are pecking the ripe ${cropName(ev.crop).toLowerCase()}! A scarecrow from the market keeps them off.`, "nervous");
  } else if (ev.type === "birds_scared") {
    flocks.push({h: ev.house, z: ev.zone, t0: performance.now(), scared: true});
    once1("scared", "Ha! The scarecrow sent the birds packing.", "laugh");
  } else if (ev.type === "auto_harvest" && ev.kg > 0) {
    burst(ev.house * LOT + 190, BED_Y[ev.zone] + 8, [META.crops[ev.crop].colour, LEAF[ev.crop], "#f2c14e"]);
    floaters.push({text: `+${ev.coins}`, x: ev.house * LOT + 170, y: BED_Y[ev.zone] + 6, t0: performance.now()});
    once1("robot", "The harvest robot picked a ripe bed for you.", "happy");
  } else if (ev.type === "used") toast(`${META.items.find(i => i.id === ev.item).title}!`);
  else if (ev.type === "boost_end") toast(`${META.items.find(i => i.id === ev.item).title} wore off`);
  else if (ev.type === "lost") guide("Oh no, we lost a crop. Its health ran out. Clear the bed and try a crop that suits the house.", "crying");
}
const nameOf = id => (META.tools.find(x => x.id === id) || META.parts.find(x => x.id === id)).title;
function once1(key, line, m) { if (!tipsSeen.has(key)) { tipsSeen.add(key); guide(line, m); } }

// ---------------------------------------------------------------- panels (open by clicking the equipment)
const kv = (l, k, cls = "") => `<div class="${cls}"><span>${l}</span><b data-k="${k}"></b></div>`;
function toast(msg) {
  const d = document.createElement("div"); d.textContent = msg; $("toast").appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
function openPop(type, h = 0, z = 0) { pop = {type, h, z}; $("pop").hidden = false; $("pop").dataset.key = ""; renderPop(); }
function closePop() { pop = null; $("pop").hidden = true; }

function spRow(h, name, label) {
  const house = S.houses[h], m = META.setpoints.find(s => s.name === name);
  if (house.parked.includes(name)) {
    const up = META.upgrades.find(u => u.parks.includes(name));
    return `<div class="parked">${esc(label)}: not installed. ${ico("lock")} ${esc(up.title)} in the farm book.</div>`;
  }
  return `<label>${esc(label)}<b data-k="sp:${name}"></b>
    <input type="range" data-sp="${name}" data-h="${h}" min="${m.lo}" max="${m.hi}" step="${1 / m.scale}" aria-label="${esc(label)}"></label>`;
}
function diag(h, group) {
  const tr = S.farm.trouble;
  if (!tr || tr.house !== h) return {html: "", key: ""};
  const c = S.houses[h].challenge, kind = {roadblock: "ROADBLOCK", problem: "PROBLEM", practice: "PRACTICE"}[tr.kind];
  let html = `<div class="diag"><h3>${kind} IN ${META.house_names[h]}</h3>`;
  if (tr.kind === "roadblock") html += `<div class="note">${esc(tr.title)} gets built when you find it.</div>`;
  html += `<div class="note">Is it this equipment? Inspect, compare the readings, then name the fault.</div>
    <div class="row"><button class="btn sm" data-act="inspect" ${c.hints ? "disabled" : ""}>Inspect on site</button></div>`;
  if (c.truth) html += `<div class="result small">Reference meters: ${fx(c.truth.t_in)} °C · EC ${fx(c.truth.ec, 2)} · pH ${fx(c.truth.ph, 2)} · ${fx(c.truth.flow, 0)} L/h · vent ${fx(c.truth.vent, 0)} %
      ${Object.entries(c.field).map(([k, ok]) => `<div>${ok ? "✔" : "<b style='color:var(--red)'>✘</b>"} ${esc(k)}</div>`).join("")}</div>`;
  const opts = (group ? META.groups[group] : META.faults.map(f => f.id)).map(id => `<option value="${id}">${esc(FT[id].title)}</option>`).join("");
  html += `<div class="row"><select id="dpick" aria-label="Your diagnosis"><option value="">What's wrong?</option>${opts}</select>
    <button class="btn sm go" data-act="answer">Diagnose</button></div>
    <div class="row"><button class="btn sm bad" data-act="quit">${tr.kind === "problem" ? `Call the technician (−${META.callout_fee})` : "Give up"}</button></div></div>`;
  return {html, key: JSON.stringify([tr, c.hints])};
}
let FT = {};
const need = (id, have) => `<span class="badge ${have ? "ok" : "bad"}">${have ? "✔" : "✘"} ${esc(nameOf(id))}</span>`;
function needsList(tools, parts) {
  const f = S.farm;
  return tools.map(t => need(t, f.tools.includes(t))).join("") + parts.map(x => need(x, f.parts[x] > 0) + (f.parts[x] > 1 ? `<span class="small">×${f.parts[x]}</span> ` : "")).join("");
}
function repairs(h, group) {
  const list = S.farm.repairs.filter(r => r.house === h && (!group || [].concat(group).includes(groupOf(r.fault))));
  const html = list.map(r => `<div class="diag"><h3>REPAIR: ${esc(FT[r.fault].title)}</h3>
    <div class="note">Needs: ${needsList(r.tools, r.parts) || "nothing but your hands"}</div>
    <div class="row"><button class="btn sm go" data-act="repair" data-h="${h}" data-v="${r.fault}" ${r.missing.length ? "disabled" : ""}>Repair</button>
    ${r.missing.length ? `<button class="btn sm" data-act="open" data-v="market" data-tab="tools">Market</button>` : ""}
    <button class="btn sm warn" data-act="hire" data-h="${h}" data-v="${r.fault}" ${S.farm.coins < META.tech_fee ? "disabled" : ""}>Hire the technician (−${META.tech_fee})</button></div></div>`).join("");
  return {html, key: JSON.stringify([list, S.farm.coins >= META.tech_fee])};
}

const POPS = {
  bed(h, z) {
    const hs = S.houses[h], zo = hs.zones[z], f = S.farm;
    const title = `${META.house_names[h]} · BED ${z + 1}`;
    const vals = {};
    let html = "";
    if (zo.locked) {
      const it = f.shop.find(x => x.id === `bed:${h}:${z}`);
      html = it ? shopRow(it) : `<div class="note">Build bed ${z} first.</div>`;
      return {title, html, vals, key: "locked" + JSON.stringify(it)};
    }
    if (zo.crop) {
      const c = META.crops[zo.crop].comfort;
      html += `<div class="small"><b style="color:var(--ink)">${esc(zo.name)}</b> · ${esc(zo.variant)} · <span data-k="stage"></span> · sells for ${META.prices[zo.crop]} coins/kg</div>
        <div class="small">Growth <span data-k="mat"></span></div><div class="bar"><i data-w="mat"></i></div>
        <div class="small">Health <span data-k="hp"></span></div><div class="bar hp ok"><i data-w="hp"></i></div>
        <div class="small" data-k="stress"></div>
        <div class="note" style="margin-top:4px">Likes ${c[1]}–${c[2]} °C and EC ${c[4]}–${c[5]}. Last water: <span data-k="lastw"></span>.</div>
        <div class="row"><button class="btn go" data-act="harvest" data-h="${h}" data-z="${z}" ${zo.stage === "ripe" ? "" : "disabled"}>${ico("basket")} Harvest</button>
        <button class="btn bad" data-act="harvest" data-h="${h}" data-z="${z}">Clear</button>
        ${armed ? `<button class="btn" data-act="plant" data-h="${h}" data-z="${z}">Replant ${esc(cropName(armed.crop))}</button>` : ""}</div>`;
      vals.stage = zo.stage; vals.mat = fx(zo.maturity, 0) + " %"; vals.hp = fx(zo.health, 0) + " %";
      vals["w:mat"] = zo.maturity; vals["w:hp"] = zo.health;
      vals.stress = Object.keys(zo.stress).length ? "Stress: " + Object.keys(zo.stress).join(", ") : "Happy";
      vals.lastw = zo.last_ec == null ? "none yet" : `EC ${fx(zo.last_ec, 2)}, pH ${fx(zo.last_ph, 2)}`;
    } else {
      html += `<div class="note">Empty bed. Pick a seed below, then click this bed.</div>`;
      if (armed) html += `<div class="row"><button class="btn go" data-act="plant" data-h="${h}" data-z="${z}">Plant ${esc(cropName(armed.crop))} here</button></div>`;
    }
    if (zo.pest) html += `<div class="diag"><h3>PESTS!</h3><div class="note">Bugs are eating this bed. Neem oil in stock: ${f.parts.neem}.</div>
      <div class="row"><button class="btn sm go" data-act="spray" data-h="${h}" data-z="${z}" ${f.parts.neem ? "" : "disabled"}>Spray neem oil</button>
      ${f.parts.neem ? "" : `<button class="btn sm" data-act="open" data-v="market" data-tab="tools">Market</button>`}</div></div>`;
    html += `<h3>WATERING</h3><div class="sp">${spRow(h, `SP_SHOT_Z${z + 1}`, "Shot size for this bed (L)")}</div>`;
    const d = diag(h, "beds"), rp = repairs(h, "beds");
    return {title, html: html + d.html + rp.html, vals, key: JSON.stringify([zo.crop, zo.stage === "ripe", !!armed && armed.crop, hs.parked, d.key, rp.key, zo.pest, f.parts.neem])};
  },
  feed(h) {
    const hs = S.houses[h], p = hs.plc;
    const html = `<div class="kv">${kv("EC now", "ec")}${kv("EC set", "ecsp")}${kv("pH now", "ph")}${kv("pH set", "phsp")}${kv("Tank T-201", "lvl")}${kv("Dosing A · B · acid", "dose")}</div>
      <h3>FEED SET POINTS <button class="btn sm" data-act="recipe" data-h="${h}" style="float:right">Crop recipe</button></h3>
      <div class="sp">${spRow(h, "SP_EC", "EC (mS/cm)")}${spRow(h, "SP_PH", "pH")}</div>
      <div class="note">One dosing line feeds all four beds, so planting sets the mean of the crops' needs.</div>`;
    const d = diag(h, "feed"), rp = repairs(h, "feed");
    d.html += rp.html; d.key += rp.key;
    return {title: `${META.house_names[h]} · FEED TANK`, html: html + d.html, key: JSON.stringify([hs.parked, d.key]),
      vals: {ec: fx(p.ec, 2), ecsp: fx(hs.sp.SP_EC, 2), ph: fx(p.ph, 2), phsp: fx(hs.sp.SP_PH, 2), lvl: fx(p.level, 0) + " %",
             dose: p.dose.map(v => fx(v, 0)).join(" · ") + " %"}};
  },
  water(h) {
    const hs = S.houses[h], p = hs.plc;
    const html = `<div class="kv">${kv("Irrigation", "step")}${kv("Bed", "zone")}${kv("Flow", "flow")}${kv("Pressure", "press")}
        ${kv("Light since watering", "rad")}${kv("Minutes since", "since")}${kv("Cycles today", "cyc")}${kv("Water today", "wat")}</div>
      <div class="row"><button class="btn go" data-act="hmi" data-v="irrigate_now" data-h="${h}">Irrigate now</button>
        <button class="btn" data-act="hmi" data-v="stop" data-h="${h}">Stop</button><button class="btn" data-act="hmi" data-v="start" data-h="${h}">Start</button></div>
      <h3>WHEN TO WATER</h3>
      <div class="sp">${spRow(h, "SP_RAD_SUM", "Sunlight before watering (J/cm²)")}${spRow(h, "SP_MAX_INT", "Water at least every (min)")}</div>`;
    const d = diag(h, "water"), rp = repairs(h, ["water", "beds"]);
    d.html += rp.html; d.key += rp.key;
    return {title: `${META.house_names[h]} · PUMP P-201`, html: html + d.html, key: JSON.stringify([hs.parked, d.key]),
      vals: {step: p.step_name + (p.enabled ? "" : " (off)"), zone: p.zone || "–", flow: fx(p.flow, 0) + " L/h", press: fx(p.press, 2) + " bar",
             rad: `${fx(p.rad_sum, 0)} / ${hs.sp.SP_RAD_SUM}`, since: fx(p.min_since, 0), cyc: p.cycles, wat: fx(p.water, 0) + " L"}};
  },
  climate(h) {
    const hs = S.houses[h], p = hs.plc;
    const html = `<div class="kv">${kv("Air inside", "air")}${kv("Outside", "out")}${kv("Roof vent", "vent")}${kv("Fans", "fans")}${kv("Shade net", "net")}${kv("Climate mode", "mode")}</div>
      <h3>CLIMATE SET POINTS</h3>
      <div class="sp">${spRow(h, "SP_VENT_T", "Vent opens above (°C)")}${spRow(h, "SP_COOL_T", "Pad-and-fan above (°C)")}
      ${spRow(h, "SP_RH_MAX", "Humidity limit (%)")}${spRow(h, "SP_SCREEN_RAD", "Shade net above (W/m²)")}${spRow(h, "SP_VPD_FOG", "Fog when the air is drier than (kPa)")}</div>`;
    const d = diag(h, "climate"), rp = repairs(h, "climate");
    d.html += rp.html; d.key += rp.key;
    return {title: `${META.house_names[h]} · CLIMATE`, html: html + d.html, key: JSON.stringify([hs.parked, d.key]),
      vals: {air: `${fx(p.t_in)} °C · ${fx(p.rh, 0)} %`, out: `${fx(S.weather.t_out)} °C · ${fx(S.weather.wind)} m/s`,
             vent: fx(p.vent, 0) + " %", fans: has("cool") ? "stage " + p.fan_stage : "none", net: has("net") ? p.net : "none", mode: p.clim}};
  },
  plc(h) {
    const hs = S.houses[h], tr = S.farm.trouble, r = hs.result;
    let html = `<div class="alarms" style="margin-top:0">${hs.plc.alarms.length ? hs.plc.alarms.map(a =>
      `<div><span class="badge ${a.active ? (a.cls === "warning" ? "warn" : "bad") : ""}">${a.tag}</span>${esc(a.text)}${a.active ? "" : " <span class='small'>(cleared)</span>"}</div>`).join("")
      : '<div class="small">No alarms. All quiet.</div>'}</div>
      <div class="row"><button class="btn warn" data-act="hmi" data-v="reset" data-h="${h}">Reset alarms</button></div>`;
    if (r) html += `<div class="result ${r.correct ? "good" : "badr"}"><b>Last diagnosis: ${r.correct ? "✔" : "✘"} ${esc(r.title)}</b>
      <dl><dt>Symptoms</dt><dd>${esc(r.symptoms)}</dd><dt>Confirm</dt><dd>${esc(r.checks)}</dd><dt>Cause</dt><dd>${esc(r.cause)}</dd><dt>Fix</dt><dd>${esc(r.fix)}</dd></dl></div>`;
    const d = diag(h, null), rp = repairs(h, null);
    html += d.html + rp.html; d.key += rp.key;
    html += `<h3>PRACTICE</h3><div class="row"><button class="btn sm" data-act="practice" data-h="${h}" ${tr ? "disabled" : ""}>Hide a random fault here</button>
      <button class="btn sm" data-act="problems" data-v="${S.farm.problems_on ? "off" : "on"}">Random problems: ${S.farm.problems_on ? "on" : "off"}</button></div>
      <h3>BREAK SOMETHING <button class="btn sm" data-act="clearf" data-h="${h}" style="float:right" ${tr ? "disabled" : ""}>Fix all</button></h3>
      <div class="chips">${META.faults.map(f => `<button class="btn sm ${hs.faults.includes(f.id) ? "warn" : ""}" data-act="fault" data-v="${f.id}" data-h="${h}" ${tr ? "disabled" : ""}>${esc(f.title)}${f.level === 3 ? " ·" : ""}</button>`).join("")}</div>
      <div class="note" style="margin-top:4px">· = raises no alarm: find it from the numbers.</div>`;
    return {title: `${META.house_names[h]} · PLC CABINET`, html, vals: {},
      key: JSON.stringify([hs.plc.alarms, r && r.title, hs.faults, tr, S.farm.problems_on, d.key])};
  },
  farm() {
    const f = S.farm, ups = META.upgrades;
    const expand = f.shop.filter(i => !i.id.startsWith("up:"));
    const html = `<div class="small">Level ${f.level} · <span data-k="xp"></span></div>
      <h3>UPGRADES</h3><div class="shop">${ups.map(u => f.upgrades.includes(u.id)
        ? `<div><span class="what"><b>${ico("check")} ${esc(u.title)}</b><span class="small">${esc(u.desc)}</span></span></div>`
        : shopRow(f.shop.find(i => i.id === "up:" + u.id), u.desc)).join("")}</div>
      <h3>EXPAND</h3><div class="shop">${expand.map(i => shopRow(i)).join("") || '<div class="small">Every bed and greenhouse is built.</div>'}</div>
      <h3>ACHIEVEMENTS ${f.ach.length} / ${META.achievements.length}</h3>
      <div class="ach">${META.achievements.map(a => `<div class="${f.ach.includes(a.id) ? "" : "no"}">${ico(f.ach.includes(a.id) ? "cup" : "lock")}<span><b>${esc(a.title)}</b>${esc(a.desc)}</span></div>`).join("")}</div>
      <div class="row small"><span>Saved in this browser.</span><span class="spacer"></span><button class="btn sm bad" data-act="newfarm">New farm</button></div>`;
    return {title: "FARM BOOK", html, vals: {xp: f.level_to ? `${num(f.xp)} / ${num(f.level_to)} xp` : `${num(f.xp)} xp · max level`},
      key: JSON.stringify([f.shop.map(i => [i.id, i.ok, i.missing]), f.upgrades, f.ach, f.coins >= 0 && f.parts])};
  },
  market() {
    const f = S.farm, tab = mtab;
    const tabs = [["boosts", "Boosts"], ["tools", "Tools & parts"], ["style", "Cosmetics"]].map(([k, l]) =>
      `<button class="btn sm ${k === tab ? "on" : ""}" data-act="mtab" data-v="${k}">${l}</button>`).join("");
    let body = "";
    if (tab === "boosts") body = META.items.map(i => `<div>${ico(i.id)}<span class="what"><b>${esc(i.title)} · ${f.items[i.id]} owned</b>
        <span class="small">${esc(i.desc)} ${ico("coin")} ${i.cost}${f.boosts[i.id] != null ? ` · active, ${Math.ceil(f.boosts[i.id] / 60)} h left` : ""}</span></span>
        <button class="btn sm" data-act="buy" data-v="${i.id}" ${f.coins >= i.cost ? "" : "disabled"}>Buy</button>
        <button class="btn sm go" data-act="use" data-v="${i.id}" ${f.items[i.id] ? "" : "disabled"}>Use</button></div>`).join("");
    else if (tab === "tools") body = '<div class="small">Tools are yours for good. Parts are used up by a repair or a build.</div>' +
      META.tools.map(t => { const own = f.tools.includes(t.id);
        return `<div><span class="what"><b>${esc(t.title)}${own ? " ✔" : ""}</b><span class="small">${esc(t.desc)} ${ico("coin")} ${t.cost}</span></span>
          <button class="btn sm" data-act="buy" data-v="${t.id}" ${own || f.coins < t.cost ? "disabled" : ""}>${own ? "Owned" : "Buy"}</button></div>`; }).join("") +
      META.parts.map(x => `<div><span class="what"><b>${esc(x.title)} · ${f.parts[x.id]} in stock</b><span class="small">${esc(x.desc)} ${ico("coin")} ${x.cost}</span></span>
          <button class="btn sm" data-act="buy" data-v="${x.id}" ${f.coins < x.cost ? "disabled" : ""}>Buy</button></div>`).join("");
    else body = ["outfit", "paint", "path", "decor"].map(slot => `<h3>${{outfit: "FARMER OUTFIT", paint: "GREENHOUSE PAINT", path: "PATH", decor: "DECORATIONS"}[slot]}</h3>` +
      META.cosmetics.filter(c => c.slot === slot).map(c => {
        const own = f.owned.includes(c.id), on = slot === "decor" ? f.style.decor.includes(c.id) : f.style[slot] === c.id.split(":")[1];
        const label = !own ? `${ico("coin")} ${c.cost}` : slot === "decor" ? (on ? "Remove" : "Place") : on ? "Wearing" : "Use";
        return `<div><span class="what"><b>${esc(c.title)}${on ? " ✔" : ""}</b></span>
          <button class="btn sm ${own && !on ? "go" : ""}" data-act="cosmetic" data-v="${c.id}" ${(!own && f.coins < c.cost) || (on && slot !== "decor") ? "disabled" : ""}>${label}</button></div>`;
      }).join("")).join("");
    return {title: "MARKET", html: `<div class="row" style="margin-top:0">${tabs}</div><div class="shop" style="margin-top:8px">${body}</div>`, vals: {},
      key: JSON.stringify([tab, f.items, Object.keys(f.boosts), f.tools, f.parts, f.owned, f.style, Math.floor(f.coins / 10)])};
  },
  order() {
    const f = S.farm, o = f.order;
    const rows = Object.entries(f.prices_now).filter(([c]) => f.crops.includes(c)).map(([c, v]) =>
      `<div><span>${esc(cropName(c))}${c === f.today.hot ? " ▲" : c === f.today.glut ? " ▼" : ""}</span><b>${v} /kg</b></div>`).join("");
    const html = (o ? `<div class="small">The buyer wants <b style="color:var(--ink)">${num(o.kg)} kg of ${esc(cropName(o.crop).toLowerCase())}</b> by day ${o.due + 1}.
        Harvests of it count automatically. Bonus when it's full: ${ico("coin")} ${num(o.bonus)}.</div>
        <div class="bar"><i style="width:calc(${Math.min(100, 100 * o.got / o.kg)}% - 4px)"></i></div><div class="small">${num(o.got)} / ${num(o.kg)} kg</div>`
      : '<div class="note">No buyer today. Orders come with the morning.</div>') +
      `<h3>TODAY'S PRICES</h3><div class="kv">${rows}</div>`;
    return {title: "BUYER'S ORDER", html, vals: {}, key: JSON.stringify([o, f.prices_now, f.today])};
  },
  trees() {
    const tabs = [["crops", "Crop tree"], ["ups", "Upgrade tree"]].map(([k, l]) =>
      `<button class="btn sm ${k === ttab ? "on" : ""}" data-act="ttab" data-v="${k}">${l}</button>`).join("");
    const f = S.farm;
    return {title: "TREES", html: `<div class="row" style="margin-top:0">${tabs}</div>${ttab === "crops" ? cropTree() : upTree()}
      <div class="note">${ttab === "crops" ? "Harvest a crop to open the ones below it. Some need an upgrade or a level too."
        : "Tools are the roots. Each upgrade needs the one above it. Click a node to buy or build it."}</div>`,
      vals: {}, key: JSON.stringify([ttab, f.crops, f.crops_done, f.crop_locks, f.upgrades, f.tools, f.shop.map(i => [i.id, i.ok]), f.level])};
  },
  lot(i) {
    const it = S.farm.shop.find(x => x.id === `house:${i}`);
    const html = it ? `<div class="note">An empty lot. A new greenhouse here gets its own PLC running the same program.</div><div class="shop">${shopRow(it)}</div>`
      : `<div class="note">Build ${META.house_names[i - 1]} first.</div>`;
    return {title: `LOT ${META.house_names[i]}`, html, vals: {}, key: JSON.stringify([it, S.farm.parts, S.farm.tools])};
  },
};
// ---------------------------------------------------------------- crop tree and upgrade tree (SVG)
let CT = {};
const lockWhy = k => (S && S.farm.crop_locks[k]) || "";
const NODE_W = 90, NODE_H = 46, COL_W = 100, ROW_H = 66;
function wrap(t, n = 17) {
  const out = [""];
  for (const w of t.split(" ")) {
    if ((out[out.length - 1] + " " + w).trim().length > n && out.length < 2) out.push(w);
    else out[out.length - 1] = (out[out.length - 1] + " " + w).trim();
  }
  return out;
}
function treeSVG(nodes, edges) {
  const rows = Math.max(...nodes.map(n => n.row)) + 1;
  const pos = n => [6 + n.col * COL_W, 6 + n.row * ROW_H];
  const by = Object.fromEntries(nodes.map(n => [n.id, n]));
  const col = {done: "#6cc37a", open: "#f2c14e", locked: "#5d6672"};
  const lines = edges.map(([a, b]) => {
    const [x1, y1] = pos(by[a]), [x2, y2] = pos(by[b]), cx1 = x1 + NODE_W / 2, cx2 = x2 + NODE_W / 2, my = y1 + NODE_H + (ROW_H - NODE_H) / 2;
    const st = by[a].state === "done" ? (by[b].state === "locked" ? "open" : "done") : "locked";
    return `<path d="M${cx1} ${y1 + NODE_H}V${my}H${cx2}V${y2}" fill="none" stroke="${col[st]}" stroke-width="3" stroke-dasharray="${st === "locked" ? "4 3" : "none"}"/>`;
  }).join("");
  const boxes = nodes.map(n => {
    const [x, y] = pos(n), c = col[n.state], [l1, l2 = ""] = wrap(n.sub);
    return `<g class="node" data-act="node" data-v="${n.id}" style="cursor:pointer" role="button" tabindex="0" aria-label="${esc(n.title)}: ${esc(n.sub)}">
      <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" fill="${n.state === "locked" ? "#161a33" : "#262c52"}" stroke="${c}" stroke-width="3"/>
      <image href="${n.icon}" x="${x + 5}" y="${y + 5}" width="16" height="16" style="image-rendering:pixelated" opacity="${n.state === "locked" ? 0.45 : 1}"/>
      <text x="${x + 25}" y="${y + 16}" fill="${n.state === "locked" ? "#9aa0c4" : "#f1ecd8"}" font-size="10" font-family="Pixelify Sans, monospace">${esc(n.title)}</text>
      <text x="${x + 6}" y="${y + 32}" fill="${c}" font-size="8" font-family="Pixelify Sans, monospace">${esc(l1)}</text>
      <text x="${x + 6}" y="${y + 41}" fill="${c}" font-size="8" font-family="Pixelify Sans, monospace">${esc(l2)}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${COL_W * 3 + 2} ${rows * ROW_H + 4}" width="100%" style="margin-top:8px;display:block">${lines}${boxes}</svg>`;
}
const CROP_ICONS = {};
function cropIconURL(c) {
  if (!CROP_ICONS[c]) { const cv2 = document.createElement("canvas"); cv2.width = cv2.height = 16; cropIcon(cv2, c); CROP_ICONS[c] = cv2.toDataURL(); }
  return CROP_ICONS[c];
}
function cropTree() {
  const f = S.farm;
  const nodes = META.crop_tree.map(n => {
    const done = f.crops_done.includes(n.id), open = f.crops.includes(n.id);
    return {...n, title: n.id === "kangkung" ? "Kangkung" : cropName(n.id).split(" ")[0], icon: cropIconURL(n.id),
      state: done ? "done" : open ? "open" : "locked",
      sub: done ? `✔ harvested · ${META.prices[n.id]}/kg` : open ? `Plant it · LV${n.level}` : lockWhy(n.id)};
  });
  return treeSVG(nodes, META.crop_tree.filter(n => n.after).map(n => [n.after, n.id]));
}
function upTree() {
  const f = S.farm;
  const nodes = META.up_tree.map(n => {
    if (n.tool) {
      const t = META.tools.find(x => x.id === n.id), own = f.tools.includes(n.id);
      return {...n, title: {wrench: "Wrench", multimeter: "Multimeter", ladder: "Ladder"}[n.id], icon: icoSrc(n.id), state: own ? "done" : "open", sub: own ? "✔ in the toolbox" : `Buy · ${t.cost} coins`};
    }
    const u = META.upgrades.find(x => x.id === n.id), it = f.shop.find(x => x.id === "up:" + n.id);
    const done = f.upgrades.includes(n.id), locked = !done && it && (it.locked_by.length || it.missing.some(m => META.tools.some(t => t.id === m)));
    const sub = done ? "✔ installed" : locked ? `after ${[...it.locked_by.map(upTitle), ...it.missing.filter(m => META.tools.some(t => t.id === m)).map(nameOf)].join(", ")}`
      : `${num(u.cost)} coins · LV${u.level}`;
    return {...n, title: UP_SHORT[n.id], icon: icoSrc(n.id === "solar" ? "sun" : n.id === "fog" ? "cloud" : n.id),
      state: done ? "done" : locked ? "locked" : "open", sub};
  });
  return treeSVG(nodes, META.up_tree.flatMap(n => n.after.map(a => [a, n.id])));
}
const UP_SHORT = {solar: "Sun sensor", net: "Shade net", film: "Clear film", cool: "Cooling", fog: "Fogging", robot: "Robot", cold: "Cold room"};
function treeClick(id) {
  const f = S.farm;
  if (META.crop_tree.some(n => n.id === id)) {
    if (!f.crops.includes(id)) { toast(`${cropName(id)} is locked: ${lockWhy(id)}`); return; }
    armed = {crop: id, variant: 0}; renderBar(); renderSeedInfo(); closePop(); toast(`${cropName(id)} seed ready: click an empty bed`);
  } else if (META.tools.some(t => t.id === id)) {
    if (!f.tools.includes(id)) send({cmd: "buy", item: id});
  } else if (!f.upgrades.includes(id)) {
    const it = f.shop.find(x => x.id === "up:" + id);
    if (it && it.ok) send({cmd: "build", item: it.id});
    else toast(it.locked_by.length ? `Build ${it.locked_by.map(upTitle).join(" and ")} first` : it.missing.length ? `Needs ${it.missing.map(nameOf).join(", ")}` :
      it.level > f.level ? `Needs level ${it.level}` : `Needs ${num(it.cost - f.coins)} more coins`);
  }
}

function shopRow(it, desc = "") {
  const f = S.farm;
  const why = (it.locked_by || []).length ? `Build ${it.locked_by.map(upTitle).join(" and ")} first` :
    it.level > f.level ? `Needs level ${it.level}` : it.cost > f.coins ? `Needs ${num(it.cost - f.coins)} more coins` :
    it.missing.length ? "Get the missing tools or parts at the market" : f.trouble ? "Sort out the problem first" : "";
  const needs = needsList(it.tools, it.parts);
  return `<div><span class="what"><b>${esc(it.title)}</b>${desc ? `<span class="small">${esc(desc)}</span>` : ""}
    <span class="small">${ico("coin")} ${num(it.cost)} · level ${it.level}${it.roadblock ? " · roadblock ahead" : ""}</span>
    ${needs ? `<span class="small">${needs}</span>` : ""}
    ${why ? `<span class="small">${why}</span>` : ""}</span><button class="btn sm ${it.ok ? "go" : ""}" data-act="build" data-v="${it.id}" ${it.ok ? "" : "disabled"}>Build</button></div>`;
}

function renderPop() {
  if (!pop || !S) return;
  if (!["farm", "market", "lot", "trees", "order"].includes(pop.type) && pop.h >= S.houses.length) { closePop(); return; }
  const o = POPS[pop.type](pop.h, pop.z), body = $("popBody"), key = pop.type + pop.h + pop.z + o.key;
  if ($("pop").dataset.key !== key) {
    const keep = $("dpick") && $("dpick").value, top = $("pop").scrollTop;
    $("popTitle").textContent = o.title; body.innerHTML = o.html; $("pop").dataset.key = key;
    if (keep && $("dpick")) $("dpick").value = keep;
    $("pop").scrollTop = top;
  }
  for (const el of body.querySelectorAll("[data-k]")) {
    const k = el.dataset.k;
    if (k.startsWith("sp:")) el.textContent = +S.houses[pop.h].sp[k.slice(3)].toFixed(2);
    else if (k in o.vals) el.textContent = o.vals[k];
  }
  for (const el of body.querySelectorAll("[data-w]")) el.style.width = `calc(${o.vals["w:" + el.dataset.w]}% - 4px)`;
  for (const r of body.querySelectorAll("[data-sp]")) if (dragging !== r) r.value = S.houses[+r.dataset.h].sp[r.dataset.sp];
}
$("pop").addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const d = b.dataset, h = +(d.h || 0);
  const act = {
    close: closePop,
    harvest: () => send({cmd: "harvest", house: h, zone: +d.z}),
    plant: () => plantArmed(h, +d.z),
    hmi: () => send({cmd: "hmi", house: h, name: d.v}),
    recipe: () => send({cmd: "recipe", house: h}),
    build: () => send({cmd: "build", item: d.v}),
    buy: () => send({cmd: "buy", item: d.v}),
    use: () => send({cmd: "use", item: d.v}),
    cosmetic: () => send({cmd: "cosmetic", id: d.v}),
    spray: () => send({cmd: "spray", house: h, zone: +d.z}),
    repair: () => send({cmd: "repair", house: h, fault: d.v}),
    hire: () => send({cmd: "repair", house: h, fault: d.v, hire: true}),
    mtab: () => { mtab = d.v; renderPop(); },
    ttab: () => { ttab = d.v; renderPop(); },
    node: () => treeClick(d.v),
    open: () => { if (d.tab) mtab = d.tab; openPop(d.v); },
    inspect: () => send({cmd: "challenge", action: "hint"}),
    answer: () => $("dpick").value ? send({cmd: "challenge", action: "answer", fault: $("dpick").value}) : toast("Pick what you think is wrong"),
    quit: () => send({cmd: "challenge", action: "quit"}),
    practice: () => send({cmd: "challenge", action: "start", house: h}),
    problems: () => send({cmd: "problems", on: d.v === "on"}),
    fault: () => send({cmd: "fault", house: h, name: d.v, on: !S.houses[h].faults.includes(d.v)}),
    clearf: () => send({cmd: "clear_faults", house: h}),
    newfarm: () => {
      if (!confirm("Start a new farm? Coins, buildings, upgrades and achievements in this browser are reset.")) return;
      store.set("gh1-farm", null); store.set("gh1-tut2", null); tut = 0; tipsSeen.clear();
      sel = {h: 0, z: 0}; armed = null; closePop(); cam.tx = 0; send({cmd: "new_farm"});
    },
  }[d.act];
  if (act) act();
});
$("pop").addEventListener("input", e => { if (e.target.dataset.sp) { dragging = e.target; e.target.previousElementSibling.textContent = +(+e.target.value).toFixed(2); } });
$("pop").addEventListener("change", e => {
  const r = e.target;
  if (r.dataset.sp) { send({cmd: "setpoint", house: +r.dataset.h, name: r.dataset.sp, value: +r.value}); dragging = null; }
});
addEventListener("keydown", e => { if (e.key === "Escape" && pop) closePop(); });

// ---------------------------------------------------------------- HUD, lots, seed and item bar
const changed = (el, key) => { if (el.dataset.key === key) return false; el.dataset.key = key; return true; };
function renderTop() {
  const f = S.farm;
  $("clock").textContent = S.clock; $("day").textContent = `DAY ${S.day}`;
  $("coins").textContent = num(f.coins);
  const pct = f.level_to ? 100 * (f.xp - f.level_from) / (f.level_to - f.level_from) : 100;
  $("lvl").textContent = `LV ${f.level}`; $("xpbar").style.width = `calc(${Math.min(100, pct)}% - 4px)`;
  $("kg").textContent = num(f.kg); $("harvests").textContent = f.harvests; $("lost").textContent = f.lost;
  $("speedtxt").textContent = S.achieved ? `${fx(S.achieved, 0)}× real time · ${S.houses.length} PLC${S.houses.length > 1 ? "s" : ""} running` : "";
  document.querySelectorAll("[data-wx]").forEach(b => b.classList.toggle("on", b.dataset.wx === S.weather.look));
  if (changed($("boosts"), JSON.stringify(Object.entries(f.boosts).map(([k, v]) => [k, Math.ceil(v / 60)]))))
    $("boosts").innerHTML = Object.entries(f.boosts).map(([k, v]) => `<span class="chip boost" title="${esc(META.items.find(i => i.id === k).title)}">${ico(k)} ${Math.ceil(v / 60)}h</span>`).join("");
  const td = f.today, o = f.order, wxIco = {clear: "sun", cloudy: "cloud", rain: "rain", storm: "storm"}[td.weather];
  const news = `<span class="chip" title="Today's forecast">${ico(wxIco)}${td.heat ? " Heatwave" : ""}</span>` +
    (td.hot ? `<span class="chip" title="Sells high today">▲ ${esc(shortName(td.hot))} ×1.8</span>` : "") +
    (td.glut ? `<span class="chip" title="Cheap today">▼ ${esc(shortName(td.glut))} ×0.6</span>` : "") +
    (o ? `<button class="btn sm" id="orderChip" title="The buyer's order">${ico("basket")} ${num(o.got)}/${num(o.kg)} kg ${esc(shortName(o.crop))}</button>` : "");
  if (changed($("news"), news)) { $("news").innerHTML = news; if ($("orderChip")) $("orderChip").onclick = () => { cam.tx = -YARD; openPop("order"); }; }
  const lots = META.house_names.map((n, i) => {
    const h = S.houses[i];
    if (!h) return `<button class="btn" data-lot="${i}">${ico("lock")} ${n}</button>`;
    const al = Object.values(alerts(h)).some(Boolean) || (f.trouble && f.trouble.house === i) || f.repairs.some(r => r.house === i) || h.zones.some(z => z.pest), ripe = h.zones.some(z => z.stage === "ripe");
    return `<button class="btn" data-lot="${i}">${ico("house")} ${n}${al ? '<span class="dot"></span>' : ""}${ripe ? '<span class="dot ripe"></span>' : ""}</button>`;
  }).join("");
  if (changed($("lots"), lots)) {
    $("lots").innerHTML = lots;
    document.querySelectorAll("[data-lot]").forEach(b => b.onclick = () => camTo(+b.dataset.lot));
  }
}

function renderBar() {
  const open = S ? S.farm.crops : ["kangkung"], items = S ? S.farm.items : {};
  if (armed && !open.includes(armed.crop)) armed = null;
  if (!changed($("hotbar"), JSON.stringify([open, items, armed, S && S.farm.crop_locks]))) return;
  $("hotbar").innerHTML = Object.entries(META.crops).map(([k, c]) => {
    const locked = !open.includes(k), label = esc(k === "kangkung" ? "Kangkung" : c.name.split(" ")[0]);
    return `<button class="slot ${armed && armed.crop === k ? "on" : ""} ${locked ? "locked" : ""}" data-seed="${k}"
      title="${esc(c.name)}${locked ? " · locked: " + lockWhy(k) : ""}" ${locked ? 'aria-disabled="true"' : ""}>
      ${locked ? `<span class="lock">T${CT[k].row + 1}</span>` : ""}<canvas width="16" height="16"></canvas><span>${label}</span></button>`;
  }).join("") + '<span class="sep"></span>' + META.items.map(i =>
    `<button class="slot" data-item="${i.id}" title="${esc(i.title)}: ${esc(i.desc)}"><img src="${icoSrc(i.id)}" alt="" style="width:32px;height:32px;image-rendering:pixelated">
      <span class="count">${items[i.id] || 0}</span><span>${esc(i.title.split(" ").pop())}</span></button>`).join("");
  document.querySelectorAll("[data-seed]").forEach(b => {
    cropIcon(b.querySelector("canvas"), b.dataset.seed);
    b.onclick = () => {
      const k = b.dataset.seed;
      if (!open.includes(k)) { toast(`${cropName(k)} is locked: ${lockWhy(k)}`); return; }
      armed = armed && armed.crop === k ? null : {crop: k, variant: 0}; renderBar(); renderSeedInfo();
    };
  });
  document.querySelectorAll("[data-item]").forEach(b => b.onclick = () =>
    S.farm.items[b.dataset.item] ? send({cmd: "use", item: b.dataset.item}) : (mtab = "boosts", openPop("market")));
  renderSeedInfo();
}
function renderSeedInfo() {
  if (!armed) { $("seedinfo").textContent = "Pick a seed, then click an empty bed. Click a ripe bed to harvest. Drag the farm to look around."; return; }
  const c = META.crops[armed.crop], r = c.recipe;
  $("seedinfo").innerHTML = `<b style="color:var(--ink)">${esc(c.name)}</b> · ${META.prices[armed.crop]} coins/kg · likes ${c.comfort[1]}–${c.comfort[2]} °C · EC ${r[0]}<br>` +
    c.variants.map((v, i) => `<button class="btn sm ${i === armed.variant ? "on" : ""}" data-var="${i}">${esc(v.name)} · ${v.days} d · ${v.kg_m2} kg/m²</button>`).join("");
  document.querySelectorAll("[data-var]").forEach(b => b.onclick = () => { armed.variant = +b.dataset.var; renderSeedInfo(); });
}

function buildStatic() {
  drawLogo();
  FT = Object.fromEntries(META.faults.map(f => [f.id, f]));
  CT = Object.fromEntries(META.crop_tree.map(n => [n.id, n]));
  $("ico-coin").src = icoSrc("coin");
  const sp = [[0, "pause", "Pause"], [1, "play", "1× real time"], [5, "ff", "5×"], [20, "fff", "20×"], ["max", "max", "As fast as this device can"]];
  $("speeds").innerHTML = sp.map(([v, i, t]) => `<button class="btn icon" data-speed="${v}" title="${t}" aria-label="${t}">${ico(i)}</button>`).join("") +
    `<button class="btn icon" id="skip" title="Skip to the next morning" aria-label="Skip to the next morning">${ico("moon")}</button>`;
  document.querySelectorAll("[data-speed]").forEach(b => b.onclick = () => {
    speed = b.dataset.speed === "max" ? "max" : +b.dataset.speed; send({cmd: "speed", value: speed}); markSpeed();
  });
  markSpeed();
  const wxIcon = {clear: "sun", cloudy: "cloud", rain: "rain", storm: "storm"};
  $("weather").innerHTML = META.scenarios.map(w => `<button class="btn icon" data-wx="${w}" title="${w}" aria-label="Weather: ${w}">${ico(wxIcon[w])}</button>`).join("");
  document.querySelectorAll("[data-wx]").forEach(b => b.onclick = () => send({cmd: "weather", scenario: b.dataset.wx}));
  $("menus").innerHTML = `<button class="btn icon" id="openFarm" title="Farm book: upgrades, building, achievements" aria-label="Farm book">${ico("book")}</button>
    <button class="btn icon" id="openTrees" title="Crop tree and upgrade tree" aria-label="Trees">${ico("tree")}</button>
    <button class="btn icon" id="openShop" title="Market: boosts, tools, parts and cosmetics" aria-label="Market">${ico("bag")}</button>`;
  $("openFarm").onclick = () => openPop("farm");
  $("openShop").onclick = () => openPop("market");
  $("openTrees").onclick = () => openPop("trees");
  $("skip").onclick = () => send({cmd: "skip_night"});
  renderBar();
}
function markSpeed() { document.querySelectorAll("[data-speed]").forEach(b => b.classList.toggle("on", String(speed) === b.dataset.speed)); }

send({cmd: "init", save: store.get("gh1-farm")});
farmerSheet("wave_hat");
worker.onmessage = e => {
  const m = e.data;
  if (m.status) $("loadmsg").textContent = m.status;
  if (m.error) $("loadmsg").textContent = "Could not start: " + m.error;
  if (m.meta) { META = m.meta; buildStatic(); }
  if (m.save) store.set("gh1-farm", m.save);
  if (m.state) {
    const first = !S; S = m.state;
    if (first) { $("loading").hidden = true; fit(); }
    renderTop(); renderBar();
    S.farm.events.forEach(onEvent);
    tutorial(S); tips(S); renderPop();
  }
  if (m.reply) {
    const c = m.cmd;
    if (!m.reply.ok) toast(m.reply.error);
    else if (c.cmd === "harvest" && m.reply.kg > 0) {
      floaters.push({text: `+${m.reply.coins}`, x: c.house * LOT + 160, y: BED_Y[c.zone] + 6, t0: performance.now()});
      burst(c.house * LOT + 190, BED_Y[c.zone] + 8, [META.crops[m.reply.crop].colour, LEAF[m.reply.crop], "#f2c14e"]);
      toast(`Harvested ${num(m.reply.kg)} kg · +${num(m.reply.coins)} coins`);
    } else if (c.cmd === "plant") toast(`Planted ${cropName(c.crop)} in ${META.house_names[c.house]} bed ${c.zone + 1}`);
    else if (c.cmd === "buy") toast(`Bought ${(META.items.find(i => i.id === c.item) || {title: nameOf(c.item)}).title}`);
    else if (c.cmd === "cosmetic") toast(META.cosmetics.find(x => x.id === c.id).title);
  }
};
