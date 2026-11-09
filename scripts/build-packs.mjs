// Turn the study pack files into what the site serves at /packs/<key>/.
//
//   PACKS_KEY=<base64 key> node scripts/build-packs.mjs <folder>
//
// <folder> holds one built pack per key, either <key>/index.html or <key>.html
// (keys: see lib/packs-config.mjs). Use the private preview builds, or
// `build.py --pack <key> --artifact` from the study pack source.
//
// For every pack it writes two files to packs-data/:
//   <key>.sample.gz  the free sample: the first sheet of each course (x1.01) stays whole,
//                    every other sheet is replaced by a short "in the full pack" card that keeps
//                    only its title, summary and outcomes. Safe to publish: the lessons, labs,
//                    problems and quizzes of the locked sheets are not in it.
//   <key>.full.bin   the whole pack, gzipped and encrypted (AES 256 GCM) with PACKS_KEY, so the
//                    public repo holds nothing readable. The function decrypts it for buyers.
// PACKS_KEY must be the same value as the PACKS_KEY environment variable on Netlify.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import * as acorn from 'acorn';
import { PACKS } from '../lib/packs-config.mjs';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const from = process.argv[2];
if (!from) { console.error('usage: PACKS_KEY=... node scripts/build-packs.mjs <folder with the pack files>'); process.exit(1); }
// PACKS_STAGE=<folder> instead of PACKS_KEY: do everything except the encryption. The samples and
// teardowns.json go to packs-data as usual; every file that would be encrypted is written plain to
// <folder>/<name>.plain (keep that folder private), for tools/seal-packs.html to encrypt in the
// owner's own browser with PACKS_KEY. That way the key never leaves the owner's machine.
const STAGE = process.env.PACKS_STAGE || '';
const key = Buffer.from(process.env.PACKS_KEY || '', 'base64');
if (!STAGE && key.length !== 32) { console.error('PACKS_KEY must be 32 bytes, base64 encoded (or set PACKS_STAGE)'); process.exit(1); }
if (STAGE) fs.mkdirSync(STAGE, { recursive: true });
const OUT = path.join(ROOT, 'packs-data');
fs.mkdirSync(OUT, { recursive: true });

const FREE = /^[A-Z]+1\.01$/;
const one = (s, a, b, what) => {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`engine patch "${what}" matched ${n} times; the engine changed, update scripts/build-packs.mjs`);
  return s.replace(a, b);
};

// A literal value from the AST (strings, numbers, arrays of them, plain templates).
function lit(node, src) {
  if (!node) return undefined;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis.map((q) => q.value.cooked).join('');
  if (node.type === 'ArrayExpression') return node.elements.map((e) => lit(e, src));
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal') return -node.argument.value;
  return src.slice(node.start, node.end); // not a plain value: keep the source text
}
const prop = (obj, name) => obj.properties.find((p) => p.key && (p.key.name === name || p.key.value === name));
const len = (obj, name, src, code) => {
  const p = prop(obj, name);
  if (!p) return 0;
  if (p.value.type !== 'ArrayExpression') throw new Error(`${code}: "${name}" is not a plain array, cannot count it`);
  return p.value.elements.length;
};

// Find GT.add({...}) inside a sheet's IIFE.
function findAdd(node) {
  let hit = null;
  (function walk(n) {
    if (hit || !n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'GT' && n.callee.property.name === 'add') {
      hit = n.arguments[0];
      // some sheets wrap the object: GT.add(subify({...})), which turns X_ab into X<sub>ab</sub>
      if (hit && hit.type === 'CallExpression' && hit.arguments[0] && hit.arguments[0].type === 'ObjectExpression') { hit = Object.assign(hit.arguments[0], { wrap: hit.callee.name }); }
      return;
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.type) walk(v); }
  })(node);
  return hit;
}

const LOCK_FIG = `<svg viewBox="0 0 440 260" width="440" height="260" role="img" aria-label="A closed lock"><rect x="150" y="112" width="140" height="108" rx="14" fill="none" stroke="currentColor" stroke-width="5"/><path d="M180 112V84a40 40 0 0 1 80 0v28" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="220" cy="158" r="11" fill="currentColor"/><path d="M220 166v24" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>`;

function stub(meta, full, packName, buyItem) {
  const body = `<p>This sheet is part of the full <b>${packName}</b>${packName.endsWith('library') ? '' : ' pack'}. The free sample opens the first sheet; buying the pack opens every sheet: the animated lesson, the labs, practice problems with new numbers each time, the quiz and the formula list.</p>`
    + `<p class="gt-lock-cta"><a class="btn-go" href="/packs/buy/${buyItem}">Unlock on Ko-fi</a> <a href="/packs/signin/?next=__GT_NEXT__">Already bought it? Sign in</a></p>`;
  const t = {
    id: meta.id, term: meta.term, wk: meta.wk, code: meta.code, title: meta.title, short: meta.short, sum: meta.sum, out: meta.out,
    locked: true, full,
    slides: [{ k: 'Full pack', t: 'Unlock this sheet', b: body, fig: LOCK_FIG }],
    formulas: [], labs: [], practice: [], quiz: [],
  };
  return `(function () {\nGT.add(${JSON.stringify(t)});\n})();`;
}

const BAR_CSS = `<style id="gt-sample-css">
.gt-sample{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;max-width:980px;margin:0 auto;padding:12px 16px;background:#1C1F33;color:#EEF3F4;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:15px/1.45 'Titillium Web',system-ui,sans-serif}
.gt-sample b{font-weight:700}.gt-sample p{margin:0;flex:1 1 320px}
.gt-sample a{color:#EEF3F4}.gt-sample .gt-buy{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;border-radius:999px;background:#A5C8D1;color:#1C1F33;text-decoration:none;font-weight:600;white-space:nowrap}
.gt-sample .gt-x{background:none;border:0;color:#9AA3B5;font-size:18px;cursor:pointer;padding:4px 6px}
.gt-lock-cta{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center}
body{padding-bottom:84px}
</style>`;
const bar = (text, item, price) => `<div class="gt-sample" role="region" aria-label="Free sample"><p>${text}</p><a class="gt-buy" href="/packs/buy/${item}">Unlock for ${price} on Ko-fi</a><a href="/packs/signin/?next=__GT_NEXT__">Already bought it? Sign in</a><button class="gt-x" type="button" aria-label="Hide" onclick="this.parentNode.remove();document.body.style.paddingBottom='0'">×</button></div>`;


// The paywall in the sample: any click or link to a locked sheet (sheet cards, pager, search hits,
// deep links, tabs) opens a sign in / buy window instead of the sheet. Only the first sheet opens.
const GATE_CSS = `<style id="gt-gate-css">
.gt-gate{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(28,31,51,.55);backdrop-filter:blur(3px)}
.gt-gate[hidden]{display:none}
.gt-gate-card{position:relative;width:min(460px,100%);padding:28px 24px 22px;background:#fff;color:#1C1F33;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);font:16px/1.5 'Titillium Web',system-ui,sans-serif}
.gt-gate-card svg{display:block;width:44px;height:44px;margin-bottom:12px;color:#D96629}
.gt-gate-k{margin:0 0 4px;font:13px 'Ubuntu Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#5A6275}
.gt-gate-card h2{margin:0 0 10px;font:700 26px/1.15 'Titillium Web',system-ui,sans-serif;letter-spacing:-.01em}
.gt-gate-card p{margin:0 0 16px}
.gt-gate-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.gt-gate-row a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;font-weight:600;text-decoration:none}
.gt-gate-buy{background:#40456A;color:#fff}.gt-gate-in{border:1.5px solid #1C1F33;color:#1C1F33}
.gt-gate-free{font-size:14px;color:#40456A}
.gt-gate-x{position:absolute;top:10px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#5A6275;cursor:pointer;padding:6px}
a.sheet-card.gt-lock{position:relative}a.sheet-card.gt-lock::after{content:"";position:absolute;top:10px;right:10px;width:16px;height:16px;opacity:.7;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z'/%3E%3C/svg%3E") center/contain no-repeat}
</style>`;
const gateHtml = (item, price) => `<div class="gt-gate" hidden role="dialog" aria-modal="true" aria-labelledby="gt-gate-t"><div class="gt-gate-card">
<button class="gt-gate-x" type="button" aria-label="Close">×</button>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
<p class="gt-gate-k">Sheet <span data-gt-code></span> · full pack</p>
<h2 id="gt-gate-t" data-gt-title></h2>
<p>Only the first sheet is free. Sign in if you bought this pack, or unlock every sheet, lab, problem and quiz for ${price}.</p>
<div class="gt-gate-row"><a class="gt-gate-buy" href="/packs/buy/${item}">Unlock for ${price} on Ko-fi</a><a class="gt-gate-in" href="/packs/signin/?next=__GT_NEXT__">Sign in</a></div>
<a class="gt-gate-free" data-gt-free href="#">Open the free sheet instead →</a>
</div></div>
<script>(function () {
  var gate = document.querySelector('.gt-gate'), last = '';
  function lists() { var G = window.GT || {}; return G.library && G.library.length ? G.library : [{ topics: G.topics || [] }]; }
  function find(id) { var L = lists(); for (var i = 0; i < L.length; i++) { var ts = L[i].topics || []; for (var j = 0; j < ts.length; j++) if (ts[j].id === id) return { t: ts[j], e: L[i] }; } return null; }
  function lockedOf(h) { h = String(h || '').replace(/^#/, ''); var m = h.match(/^(?:debug-)?([a-z][1-3]-\\d\\d)/); var f = m && find(m[1]); return f && f.t.locked ? f : null; }
  function show(f) {
    gate.querySelector('[data-gt-code]').textContent = f.t.code;
    gate.querySelector('[data-gt-title]').innerHTML = f.t.title;
    var free = (f.e.topics || []).filter(function (t) { return !t.locked; })[0];
    var fl = gate.querySelector('[data-gt-free]');
    if (free) { fl.hidden = false; fl.setAttribute('href', '#' + free.id); fl.textContent = 'Open the free sheet, ' + free.code + ', instead →'; } else fl.hidden = true;
    gate.hidden = false; gate.querySelector('.gt-gate-buy').focus();
  }
  function hide() { gate.hidden = true; }
  function leave(f) {
    var back = last && !lockedOf(last) ? last : '';
    history.replaceState(null, '', location.pathname + location.search + back);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    show(f);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || gate.contains(a)) return;
    var f = lockedOf(a.getAttribute('href')); if (f) { e.preventDefault(); e.stopPropagation(); show(f); }
  }, true);
  window.addEventListener('hashchange', function () { var f = lockedOf(location.hash); if (f) leave(f); else { last = location.hash; hide(); } });
  gate.addEventListener('click', function (e) { if (e.target === gate || e.target.closest('.gt-gate-x')) hide(); if (e.target.closest('[data-gt-free]')) hide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !gate.hidden) hide(); });
  function mark() { var as = document.querySelectorAll('a[href^="#"]:not([data-gt-seen])'); for (var i = 0; i < as.length; i++) { as[i].setAttribute('data-gt-seen', ''); if (lockedOf(as[i].getAttribute('href'))) as[i].classList.add('gt-lock'); } }
  new MutationObserver(mark).observe(document.body, { childList: true, subtree: true }); mark();
  var f0 = lockedOf(location.hash); if (f0) leave(f0); else last = location.hash;
})();</script>`;

function build(keyName, html) {
  const cfg = PACKS[keyName];
  const a = html.indexOf('<script>');
  const b = html.indexOf('</script>', a);
  if (a < 0 || !html.slice(a, b).includes('window.GT')) throw new Error(`${keyName}: pack script not found`);
  let js = html.slice(a + 8, b);
  const comments = [];
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script', onComment: comments });
  const edits = [], teardowns = [];
  let open = 0, locked = 0;
  const figsFor = (id) => (html.match(new RegExp(`attach['"]?\\s*:\\s*['"]${id.replace(/[-]/g, '\\-')}['"]`, 'g')) || []).length;
  for (const st of ast.body) {
    // the comment right before this statement
    const c = comments.filter((x) => x.end <= st.start && /^\s*$/.test(js.slice(x.end, st.start))).pop();
    const td = c && /GelasTinta 3D teardown '(\w+)'/.exec(c.value);
    if (td) { teardowns.push({ key: td[1], start: c.start, end: st.end, st }); continue; }
    const m = c && /^\s*Sheet ([A-Z]+\d\.\d\d)\b/.exec(c.value);
    if (!m) continue;
    const code = m[1];
    const obj = findAdd(st);
    if (!obj) throw new Error(`${keyName} ${code}: GT.add not found`);
    if (FREE.test(code)) { open++; continue; }
    const meta = {};
    for (const f of ['id', 'term', 'wk', 'code', 'title', 'short', 'sum', 'out']) meta[f] = lit(prop(obj, f)?.value, js);
    if (obj.wrap === 'subify') { const SUB = /\b([A-Za-z])_([A-Za-z]{1,3})\b/g; const Hs = (v) => typeof v === 'string' ? v.replace(/(^|>)([^<]*)/g, (x, p1, p2) => p1 + p2.replace(SUB, '$1<sub>$2</sub>')) : v; meta.title = Hs(meta.title); meta.sum = Hs(meta.sum); meta.out = (meta.out || []).map(Hs); }
    else if (obj.wrap) throw new Error(`${keyName} ${code}: GT.add wrapped in ${obj.wrap}(), teach scripts/build-packs.mjs what it does`);
    for (const f of ['title', 'sum']) if (typeof meta[f] !== 'string') throw new Error(`${keyName} ${code}: ${f} is not a plain string`);
    const full = { slides: len(obj, 'slides', js, code), labs: len(obj, 'labs', js, code) + figsFor(meta.id), prac: len(obj, 'practice', js, code), quiz: len(obj, 'quiz', js, code), f: len(obj, 'formulas', js, code) };
    edits.push([st.start, st.end, stub(meta, full, cfg.library ? 'GelasTinta library' : cfg.name, cfg.item)]);
    locked++;
  }
  for (const t of teardowns) edits.push([t.start, t.end, `/* 3D teardown '${t.key}' is in the full pack */`]);
  for (const [s, e, r] of edits.sort((x, y) => y[0] - x[0])) js = js.slice(0, s) + r + js.slice(e);
  js = one(js, 'const figuresFor = t => Object.values(GT.figures)', 'const figuresFor = t => t.locked ? [] : Object.values(GT.figures)', 'figuresFor');
  js = one(js, 'list.forEach(t => { n.slides += t.slides.length;', 'list.forEach(t => { if (t.full) { n.slides += t.full.slides; n.labs += t.full.labs; n.prac += t.full.prac; n.quiz += t.full.quiz; n.f += t.full.f; return; } n.slides += t.slides.length;', 'countsOf');
  const card = "<span class=\"counts\">${t.slides.length} slides · ${labsFor(t).length} lab${labsFor(t).length === 1 ? '' : 's'} · ${t.practice.length} problems</span>";
  js = one(js, card, "${t.locked ? '<span class=\"counts\">In the full pack</span>' : `" + card + "`}", 'sheet card counts');
  js = one(js, "licensee: '__LICENSEE__'", "licensee: 'Free sample'", 'licensee');
  let out = html.slice(0, a + 8) + js + html.slice(b);
  const text = cfg.library
    ? `<b>Free sample of the whole library.</b> The first sheet of every course is open; the other ${locked} sheets unlock with the library.`
    : `<b>Free sample.</b> Sheet ${cfg.prefix}1.01 is open; the other ${locked} sheets unlock with the full pack.`;
  const head = out.indexOf('</head>'); // the real one comes first; scripts may contain the text later
  out = out.slice(0, head) + BAR_CSS + GATE_CSS + out.slice(head);
  const end = out.lastIndexOf('</body>');
  out = out.slice(0, end) + bar(text, cfg.item, '$' + cfg.price) + gateHtml(cfg.item, '$' + cfg.price) + out.slice(end);
  // sanity: no locked lesson text survives
  return { sample: out, open, locked, teardowns: teardowns.length };
}

// The 3D teardown pages are big (about 500 KB each), so the full pack keeps only their poster and
// fetches the page from /packs/td/<key> when a buyer presses "Open the 3D model". Each page is
// encrypted on its own in packs-data/td-<key>.bin; packs-data/teardowns.json maps key -> pack.
const TD = {};
const seal = (name, buf) => { if (STAGE) fs.writeFileSync(path.join(STAGE, name + '.plain'), buf); else fs.writeFileSync(path.join(OUT, name), encrypt(buf)); };
const encrypt = (buf) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const e = Buffer.concat([c.update(buf), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]); };
function splitTeardowns(packKey, html) {
  const a = html.indexOf('<script>'), b = html.indexOf('</script>', a);
  let js = html.slice(a + 8, b);
  const comments = [];
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script', onComment: comments });
  const edits = [];
  for (const st of ast.body) {
    const c = comments.filter((x) => x.end <= st.start && /^\s*$/.test(js.slice(x.end, st.start))).pop();
    const m = c && /GelasTinta 3D teardown '(\w+)'/.exec(c.value);
    if (!m) continue;
    let gz = null, pack = null;
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Property' && n.key && (n.key.name === 'gz' || n.key.value === 'gz') && n.value.type === 'Literal') gz = n;
      if (n.type === 'Property' && n.key && (n.key.name === 'pack' || n.key.value === 'pack') && n.value.type === 'Literal' && !pack) pack = n.value.value;
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.type) walk(v); }
    })(st);
    if (!gz) throw new Error(`${packKey}: teardown ${m[1]} has no gz page`);
    if (!TD[m[1]]) { seal(`td-${m[1]}.bin`, Buffer.from(gz.value.value)); TD[m[1]] = pack || m[1]; }
    edits.push([gz.start, gz.end, `gz: "", src: "/packs/td/${m[1]}"`]);
  }
  for (const [s, e, r] of edits.sort((x, y) => y[0] - x[0])) js = js.slice(0, s) + r + js.slice(e);
  if (edits.length) js = one(js, 'async function tdHtml(td) {\n  if (td._html) return td._html;', "async function tdHtml(td) {\n  if (td._html) return td._html;\n  if (!td.gz && td.src) { const r = await fetch(td.src, { credentials: 'same-origin' }); if (!r.ok) throw new Error('3D model locked'); td.gz = (await r.text()).trim(); }", 'tdHtml');
  return html.slice(0, a + 8) + js + html.slice(b);
}

const files = (k) => [path.join(from, k, 'index.html'), path.join(from, k + '.html')].find((f) => fs.existsSync(f));
let n = 0;
for (const k of Object.keys(PACKS)) {
  const f = files(k);
  if (!f) { console.log(`skip ${k}: no file`); continue; }
  const html = fs.readFileSync(f, 'utf8');
  if (!html.includes("licensee: '__LICENSEE__'")) throw new Error(`${k}: no __LICENSEE__ placeholder; use an unstamped build`);
  const { sample, open, locked, teardowns } = build(k, html);
  const full = splitTeardowns(k, html);
  fs.writeFileSync(path.join(OUT, `${k}.sample.gz`), zlib.gzipSync(sample, { level: 9 }));
  seal(`${k}.full.bin`, zlib.gzipSync(full, { level: 9 }));
  console.log(`${k.padEnd(12)} open ${open}, locked ${locked}, 3D ${teardowns}, sample ${(sample.length / 1e6).toFixed(2)} MB, full ${(full.length / 1e6).toFixed(2)} MB`);
  n++;
}
fs.writeFileSync(path.join(OUT, 'teardowns.json'), JSON.stringify(TD, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'README.md'), '# packs-data\n\nMade by `scripts/build-packs.mjs`. `*.sample.gz` are the free samples (gzipped HTML). `*.full.bin` are the full packs, gzipped and encrypted with the PACKS_KEY environment variable; they cannot be read without it. `td-*.bin` are the 3D teardown pages, encrypted the same way and fetched by the full pack when a buyer opens a 3D model; `teardowns.json` says which pack each belongs to. Do not edit by hand.\n');
console.log(`${n} packs written to packs-data/`);
