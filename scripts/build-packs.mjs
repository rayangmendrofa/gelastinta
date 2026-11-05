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
const key = Buffer.from(process.env.PACKS_KEY || '', 'base64');
if (key.length !== 32) { console.error('PACKS_KEY must be 32 bytes, base64 encoded'); process.exit(1); }
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
.gt-sample{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;max-width:980px;margin:0 auto;padding:12px 16px;background:#10131C;color:#EDEFF2;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.45 system-ui,sans-serif}
.gt-sample b{font-weight:700}.gt-sample p{margin:0;flex:1 1 320px}
.gt-sample a{color:#EDEFF2}.gt-sample .gt-buy{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;border-radius:999px;background:#2B44C8;color:#fff;text-decoration:none;font-weight:600;white-space:nowrap}
.gt-sample .gt-x{background:none;border:0;color:#9AA3B5;font-size:18px;cursor:pointer;padding:4px 6px}
.gt-lock-cta{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center}
body{padding-bottom:84px}
</style>`;
const bar = (text, item, price) => `<div class="gt-sample" role="region" aria-label="Free sample"><p>${text}</p><a class="gt-buy" href="/packs/buy/${item}">Unlock for ${price} on Ko-fi</a><a href="/packs/signin/?next=__GT_NEXT__">Already bought it? Sign in</a><button class="gt-x" type="button" aria-label="Hide" onclick="this.parentNode.remove();document.body.style.paddingBottom='0'">×</button></div>`;

function build(keyName, html) {
  const cfg = PACKS[keyName];
  const a = html.indexOf('<script>');
  const b = html.indexOf('</script>', a);
  if (a < 0 || !html.slice(a, b).includes('window.GT')) throw new Error(`${keyName}: pack script not found`);
  let js = html.slice(a + 8, b);
  const comments = [];
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script', onComment: comments });
  const edits = [];
  let open = 0, locked = 0;
  const figsFor = (id) => (html.match(new RegExp(`attach\\s*:\\s*['"]${id.replace(/[-]/g, '\\-')}['"]`, 'g')) || []).length;
  for (const st of ast.body) {
    // the comment right before this statement
    const c = comments.filter((x) => x.end <= st.start && /^\s*$/.test(js.slice(x.end, st.start))).pop();
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
  out = out.slice(0, head) + BAR_CSS + out.slice(head);
  const end = out.lastIndexOf('</body>');
  out = out.slice(0, end) + bar(text, cfg.item, '$' + cfg.price) + out.slice(end);
  // sanity: no locked lesson text survives
  return { sample: out, open, locked };
}

const files = (k) => [path.join(from, k, 'index.html'), path.join(from, k + '.html')].find((f) => fs.existsSync(f));
let n = 0;
for (const k of Object.keys(PACKS)) {
  const f = files(k);
  if (!f) { console.log(`skip ${k}: no file`); continue; }
  const html = fs.readFileSync(f, 'utf8');
  if (!html.includes("licensee: '__LICENSEE__'")) throw new Error(`${k}: no __LICENSEE__ placeholder; use an unstamped build`);
  const { sample, open, locked } = build(k, html);
  fs.writeFileSync(path.join(OUT, `${k}.sample.gz`), zlib.gzipSync(sample, { level: 9 }));
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(zlib.gzipSync(html, { level: 9 })), c.final()]);
  fs.writeFileSync(path.join(OUT, `${k}.full.bin`), Buffer.concat([iv, c.getAuthTag(), enc]));
  console.log(`${k.padEnd(12)} open ${open}, locked ${locked}, sample ${(sample.length / 1e6).toFixed(2)} MB, full ${(html.length / 1e6).toFixed(2)} MB`);
  n++;
}
fs.writeFileSync(path.join(OUT, 'README.md'), '# packs-data\n\nMade by `scripts/build-packs.mjs`. `*.sample.gz` are the free samples (gzipped HTML). `*.full.bin` are the full packs, gzipped and encrypted with the PACKS_KEY environment variable; they cannot be read without it. Do not edit by hand.\n');
console.log(`${n} packs written to packs-data/`);
