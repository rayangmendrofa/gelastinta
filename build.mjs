// Builds the GelasTinta website from the Claude Design pages in src/pages
// into plain static files in public/ (ready for Cloudflare Pages, Netlify, Vercel or GitHub Pages).
//
//   npm install      (once)
//   npm run build
//
// Add a page: drop its .dc.html into src/pages and give it a route in ROUTES below.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public');

// source file  ->  URL on the live site
export const ROUTES = {
  'Main.dc.html': '/',
  'Projects.dc.html': '/projects/',
  'Talks.dc.html': '/talks/',
  'Products.dc.html': '/products/',
  'Author.dc.html': '/author/',
  'Talk-Necro.dc.html': '/talks/necrobotics/',
  'Talk-Salmon.dc.html': '/talks/crack-headed-salmon/',
  'Talk-CacioPepe.dc.html': '/talks/cooking-and-science/',
  'Talk-NavierStokes.dc.html': '/talks/navier-stokes/',
  'Talk-ProjectHailMary.dc.html': '/talks/project-hail-mary/',
  'Talk-DreamPuzzles.dc.html': '/talks/dream-puzzles/',
  'Thesis-BEng.dc.html': '/projects/beng-dissertation/',
  'Thesis-MSc.dc.html': '/projects/msc-dissertation/',
  'Hobby-InMoov.dc.html': '/projects/inmoov-hand/',
};

const SITE_URL = 'https://gelastinta.com';

// ---- sharing & search ------------------------------------------------------
// One line per page: the summary shown under the link on WhatsApp, LinkedIn and Google,
// and the picture (an asset id) used for the preview card. Talks also carry their date.
const SITE_NAME = 'GelasTinta';
const AUTHOR = 'Rayang T Mendrofa';
export const META = {
  'Main.dc.html': { title: 'GelasTinta — Rayang T Mendrofa', img: '54e236f0eae207dc01d1ee7e8e745b14',
    desc: 'The notebook of mechanical engineer Rayang T Mendrofa (BEng Exeter, MSc UCL): robot hands, soft robots, science reviews and the ideas in between.' },
  'Projects.dc.html': { title: 'Projects — GelasTinta', img: 'e6b092fd16f445a4cdd7dec4374667d7', pos: 'centre',
    desc: 'The workshop: a 3D-printed prosthetic hand, bio-inspired soft actuators for underwater robots, and an InMoov robot hand built as a hobby.' },
  'Talks.dc.html': { title: 'Talks — GelasTinta', pos: 'centre',
    img: ['ec28ec78594bd9ac3bed820bb5857e7f', '6c50dd80c38fa40df5aac2eea7534976', '4f9fc858b3f233d90a5db49a21bd6b1f', '8640ecc3e79609c3709944fae4972088'],
    desc: 'Part review, part reflection: research papers, films and everyday curiosities, explained by a mechanical engineer.' },
  'Products.dc.html': { title: 'Products — GelasTinta', img: '518ae264b395a2a2e1f6f611dd5a1731',
    desc: 'Coming soon: products from Rayang T Mendrofa’s work with PT RTM on lithium-ion battery recycling.' },
  'Author.dc.html': { title: 'About Rayang T Mendrofa — GelasTinta', img: '5936b0b34cc6169434d1443ff7894ce2', pos: 'centre',
    desc: 'Rayang Termedate Mendrofa is a mechanical engineer (BEng Exeter, MSc UCL) who turns ideas into prototypes, and science into stories.' },
  'Thesis-BEng.dc.html': { title: 'Constructing and Analysing a Modified Prosthetic Hand — GelasTinta', img: 'd694dc45d8f43526db8f49c7eb77877a', pos: 'centre',
    desc: 'BEng dissertation, University of Exeter: a low-cost 3D-printed robotic hand whose fingers close when you flex your forearm muscles.' },
  'Thesis-MSc.dc.html': { title: 'Bio-Inspired Soft Actuators for Underwater Robots — GelasTinta', img: '98fc0d23d247aa1b0088684a767e2a1c',
    desc: 'MSc thesis, UCL: soft robot limbs modelled on manta rays and trilobites, pumped with water so a robot can study coral reefs without harming them.' },
  'Hobby-InMoov.dc.html': { title: 'Rebuilding the InMoov Robot Hand — GelasTinta', img: '8dcea2945392b3e0d9b3bd41927badc4', pos: 'centre',
    desc: 'A build diary: printing and assembling Gaël Langevin’s open-source InMoov hand, from the first layers to the first movement.' },
  'Talk-CacioPepe.dc.html': { title: 'The Art of Combining Cooking and Science — GelasTinta', img: '4f9fc858b3f233d90a5db49a21bd6b1f', date: '2025-12-23',
    desc: 'Why cacio e pepe turns clumpy, and the Ig Nobel-winning physics paper that fixes it with a little starch.' },
  'Talk-Salmon.dc.html': { title: 'How Crack-headed Salmon Influence Human and Environment — GelasTinta', img: 'cda359f19fa6c877bb9c7a27d1d81add', date: '2026-01-23',
    desc: 'Cocaine in rivers changes how salmon swim. What a fish study says about drugs, wastewater and us.' },
  'Talk-Necro.dc.html': { title: 'Necromancy, Unlocked: Meet Necrobotics — GelasTinta', img: '6c50dd80c38fa40df5aac2eea7534976', date: '2026-02-23',
    desc: 'A dead spider, a needle and a drop of superglue: how engineers turned spider legs into a gripper.' },
  'Talk-ProjectHailMary.dc.html': { title: 'Amaze, Amaze, Amaze: The Science of Project Hail Mary — GelasTinta', img: 'ec28ec78594bd9ac3bed820bb5857e7f', date: '2026-03-23',
    desc: 'A spinning spaceship that makes its own gravity, a language made of chords and the friendliest alien in fiction.' },
  'Talk-NavierStokes.dc.html': { title: 'Mathematician vs Clanker: Navier–Stokes Answered? — GelasTinta', img: '8640ecc3e79609c3709944fae4972088', fit: 'contain', date: '2026-09-23',
    desc: 'The equation every engineer meets, the AI-made proof that it can break, and the fight over who gets the credit.' },
  'Talk-DreamPuzzles.dc.html': { title: 'Inception, but for Homework: Solving Puzzles Inside Your Dreams — GelasTinta', img: '515bbb256ab40f87ea976b100e2ef7a2', pos: 'centre', date: '2026-04-23',
    desc: 'Twenty sleepers, a soundtrack for every puzzle, and a sniff that means “I’m working on it”: can a dream help you solve tomorrow’s problem?' },
};

// 1200×630 preview card: one picture, or a 2×2 grid when META lists four.
// `pos` picks the crop ('attention' = the busiest part, or 'centre', 'top'…); `fit: 'contain'` keeps whole drawings.
async function previewCard(ids, meta, dest) {
  const tile = (id, w, h) => sharp(path.join(assetDir, assetSrc[id])).rotate()
    .resize(w, h, meta.fit === 'contain'
      ? { fit: 'contain', background: '#FFFFFF' }
      : { fit: 'cover', position: meta.pos || sharp.strategy.attention })
    .flatten({ background: '#FFFFFF' }).toBuffer();
  let img;
  if (ids.length === 4) {
    const tiles = await Promise.all(ids.map((id) => tile(id, 598, 313)));
    img = sharp({ create: { width: 1200, height: 630, channels: 3, background: '#10131C' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * 602, top: Math.floor(i / 2) * 317 })));
  } else {
    img = sharp(await tile(ids[0], 1200, 630));
  }
  await img.jpeg({ quality: 82, mozjpeg: true }).toFile(dest);
}
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slugOf = (route) => route.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home';

// ---- assets -------------------------------------------------------------
const assetDir = path.join(SRC, 'assets');
const assetExt = {}; // id -> filename as published
const assetSrc = {}; // id -> filename in src/assets
for (const f of fs.readdirSync(assetDir)) {
  const m = f.match(/^([0-9a-f]{32})\.(\w+)$/);
  if (m) { assetExt[m[1]] = f; assetSrc[m[1]] = f; }
}

// Photos are published as WebP, no wider than they are ever shown on screen.
// src/image-widths.json holds the widest each image is drawn (in device pixels, measured on
// desktop and phone); images not listed there are capped at FALLBACK_WIDTH.
const FALLBACK_WIDTH = 1600;
const WEBP_QUALITY = 78;
const widthsFile = path.join(SRC, 'image-widths.json');
const IMG_WIDTHS = fs.existsSync(widthsFile) ? JSON.parse(fs.readFileSync(widthsFile, 'utf8')) : {};
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'gt-images'); // node_modules is kept between Netlify builds

async function publishImage(id, file) {
  const srcPath = path.join(assetDir, file);
  const isPng = /\.png$/i.test(file);
  const meta = await sharp(srcPath).metadata();
  const target = isPng ? meta.width : Math.min(meta.width, IMG_WIDTHS[id] || FALLBACK_WIDTH);
  const key = `${id}-${target}-q${WEBP_QUALITY}-${fs.statSync(srcPath).size}.webp`;
  const cached = path.join(CACHE, key);
  if (!fs.existsSync(cached)) {
    const img = sharp(srcPath).rotate().resize({ width: target, withoutEnlargement: true });
    let buf;
    if (isPng) {
      // drawings and pixel art stay crisp: lossless unless that is much bigger than lossy
      const lossless = await img.clone().webp({ lossless: true, effort: 5 }).toBuffer();
      const lossy = await img.clone().webp({ quality: 85, alphaQuality: 90, effort: 5 }).toBuffer();
      buf = lossless.length <= lossy.length * 1.3 ? lossless : lossy;
    } else {
      buf = await img.webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true }).toBuffer();
    }
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cached, buf);
  }
  const before = fs.statSync(srcPath).size, after = fs.statSync(cached).size;
  if (after >= before) { fs.copyFileSync(srcPath, path.join(OUT, 'assets', file)); return [before, before]; }
  fs.copyFileSync(cached, path.join(OUT, 'assets', `${id}.webp`));
  assetExt[id] = `${id}.webp`;
  return [before, after];
}

function rewrite(src, file) {
  let out = src.replace(/\/_blob\//g, '/assets/');
  // asset ids (in markup and in page scripts) -> id.ext
  out = out.replace(/\b([0-9a-f]{32})\b(?!\.)/g, (m, id) => {
    if (assetExt[id]) return assetExt[id];
    console.warn(`  ! ${file}: unknown asset ${id}`);
    return m;
  });
  // links between pages
  out = out.replace(/(["'])([A-Za-z0-9_.-]+\.dc\.html)(#[^"']*)?\1/g, (m, q, page, hash) => {
    const route = ROUTES[page];
    if (!route) { console.warn(`  ! ${file}: link to unknown page ${page}`); return m; }
    return q + route + (hash || '') + q;
  });
  return out;
}

function between(str, open, close) {
  const a = str.indexOf(open), b = str.lastIndexOf(close);
  return a < 0 || b < 0 ? '' : str.slice(a + open.length, b);
}

const runtime = fs.readFileSync(path.join(SRC, 'runtime', 'dc-lite.js'), 'utf8');

function prerender(template, logic) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="dc-root"></div><template id="dc-tpl">${template}</template>` +
    `<script type="text/x-dc" id="dc-logic">${logic}</script></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.__DC_NO_AUTOBOOT = true;
  dom.window.__DC_PRERENDER = true; // render markup only: no lifecycle hooks, timers or network
  dom.window.eval(runtime);
  dom.window.DCLite.boot();
  const html = dom.window.document.getElementById('dc-root').innerHTML;
  dom.window.close();
  return html;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M9.6 20 6.3 26.4A1.7 1.7 0 0 0 7.8 29h16.4a1.7 1.7 0 0 0 1.5-2.6L22.4 20z" fill="#2B44C8"/><path d="M11 3h10M13 3v9L6 26.4A1.7 1.7 0 0 0 7.8 29h16.4a1.7 1.7 0 0 0 1.5-2.6L19 12V3" stroke="#10131C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---- build ----------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
{
  let before = 0, after = 0;
  const ids = Object.keys(assetSrc);
  const queue = ids.slice();
  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const f = assetSrc[id];
      if (/\.(jpe?g|png)$/i.test(f)) { const [b, a] = await publishImage(id, f); before += b; after += a; }
      else fs.copyFileSync(path.join(assetDir, f), path.join(OUT, 'assets', f));
    }
  }
  await Promise.all([1, 2, 3, 4].map(worker));
  console.log(`images: ${(before / 1e6).toFixed(1)} MB of JPG/PNG -> ${(after / 1e6).toFixed(1)} MB published`);
}
fs.writeFileSync(path.join(OUT, 'assets', 'dc-lite.js'), runtime);
fs.writeFileSync(path.join(OUT, 'favicon.svg'), FAVICON);

const pages = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.dc.html'));
const sitemap = [];
for (const file of pages) {
  const route = ROUTES[file];
  if (!route) { console.warn(`skip ${file}: no route in ROUTES`); continue; }
  const src = rewrite(fs.readFileSync(path.join(SRC, 'pages', file), 'utf8'), file);

  const lang = (src.match(/<html[^>]*lang="([^"]+)"/) || [])[1] || 'en';
  const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'GelasTinta';
  const xdc = between(src, '<x-dc>', '</x-dc>');
  const helmet = between(xdc, '<helmet>', '</helmet>').trim();
  const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '').trim();
  const logicMatch = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  const logic = logicMatch ? logicMatch[1] : '';
  // pages with template holes, or with lifecycle code (e.g. the motion layer), need the runtime
  const dynamic = /\{\{|<sc-(if|for)\b/.test(body) || /componentDidMount/.test(logic);
  // extra scripts the page loads in <head> (e.g. the anime.js motion library), minus the canvas runtime
  const headSrc = between(src, '<head>', '</head>');
  const headScripts = [...headSrc.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g)]
    .map((m) => m[1]).filter((u) => !/support\.js$/.test(u))
    .map((u) => `<script src="${u}"></script>`).join('\n');

  let main;
  if (dynamic) {
    const rendered = prerender(body, logic);
    main = `<div id="dc-root">${rendered}</div>\n` +
      `<template id="dc-tpl">${body}</template>\n` +
      `<script type="text/x-dc" id="dc-logic">${logic}</script>\n` +
      `<script src="/assets/dc-lite.js" defer></script>`;
  } else {
    main = body;
  }

  const meta = META[file] || {};
  const pageTitle = meta.title || title;
  const url = SITE_URL + route;
  let shareTags = '';
  if (meta.desc) {
    let ogImage = '';
    const ids = [].concat(meta.img || []);
    const missing = ids.filter((id) => !assetSrc[id]);
    if (ids.length && !missing.length) {
      ogImage = `/og/${slugOf(route)}.jpg`;
      fs.mkdirSync(path.join(OUT, 'og'), { recursive: true });
      await previewCard(ids, meta, path.join(OUT, ogImage.slice(1)));
    } else if (missing.length) console.warn(`  ! ${file}: preview image ${missing.join(', ')} not in src/assets`);
    const article = !!meta.date;
    shareTags = [
      `<meta name="description" content="${esc(meta.desc)}">`,
      `<meta name="author" content="${AUTHOR}">`,
      `<meta property="og:site_name" content="${SITE_NAME}">`,
      `<meta property="og:type" content="${article ? 'article' : 'website'}">`,
      `<meta property="og:title" content="${esc(pageTitle.replace(/ — GelasTinta$/, ''))}">`,
      `<meta property="og:description" content="${esc(meta.desc)}">`,
      `<meta property="og:url" content="${url}">`,
      ogImage && `<meta property="og:image" content="${SITE_URL}${ogImage}">`,
      ogImage && `<meta property="og:image:width" content="1200">`,
      ogImage && `<meta property="og:image:height" content="630">`,
      ogImage && `<meta property="og:image:alt" content="${esc(pageTitle.replace(/ — GelasTinta$/, ''))}">`,
      article && `<meta property="article:published_time" content="${meta.date}">`,
      article && `<meta property="article:author" content="${AUTHOR}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="theme-color" content="#10131C">`,
      article && `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'BlogPosting',
        headline: pageTitle.replace(/ — GelasTinta$/, ''), description: meta.desc, datePublished: meta.date,
        author: { '@type': 'Person', name: AUTHOR, url: SITE_URL + '/author/' },
        image: ogImage ? SITE_URL + ogImage : undefined, mainEntityOfPage: url,
      }).replace(/</g, '\\u003c')}</script>`,
    ].filter(Boolean).join('\n');
  } else console.warn(`  ! ${file}: no META entry (no description or preview card)`);
  sitemap.push({ url, file });

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${shareTags}
${headScripts}
${helmet}
</head>
<body>
${main}
</body>
</html>
`;
  const dest = path.join(OUT, route, 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  console.log(`${dynamic ? 'interactive' : 'static     '}  ${route.padEnd(32)} <- ${file}`);
}

// ---- sitemap.xml + robots.txt ------------------------------------------------
function lastModified(file) {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', path.join('src', 'pages', file)], { cwd: ROOT, encoding: 'utf8' }).trim();
    return d || null;
  } catch (e) { return null; }
}
sitemap.sort((a, b) => a.url.localeCompare(b.url));
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemap.map(({ url, file }) => {
    const lm = lastModified(file);
    return `  <url><loc>${url}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`;
  }).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`sitemap.xml   ${sitemap.length} pages`);

// ---- 404 page ------------------------------------------------------------------
// Netlify serves public/404.html for any address that doesn't exist.
// It borrows the header, footer and styles of the Talks page so it always matches the site.
{
  const src = rewrite(fs.readFileSync(path.join(SRC, 'pages', 'Talks.dc.html'), 'utf8'), 'Talks.dc.html');
  const xdc = between(src, '<x-dc>', '</x-dc>');
  const helmet = between(xdc, '<helmet>', '</helmet>').trim();
  const header = (xdc.match(/<header class="site-head">[\s\S]*?<\/header>/) || [''])[0]
    .replace(/ class="on" aria-current="page"/g, '');
  const footer = (xdc.match(/<footer[\s\S]*?<\/footer>/) || [''])[0]
    .replace(/<span>SHEET<\/span><span>[^<]*<\/span>/, '<span>SHEET</span><span>404 — MISSING</span>');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — GelasTinta</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${helmet}
<style>
.nf{min-height:62vh;display:flex;align-items:center}
.nf .split{align-items:center}
@media (min-width:961px){.nf .split{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}}
.nf-links .btn{white-space:nowrap}
@media (max-width:960px){.nf-art{max-width:220px;justify-self:start}.nf{min-height:0}}
.nf-code{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;font-size:clamp(96px,16vw,200px);line-height:.85;letter-spacing:-.05em;color:#2B44C8;margin:0}
.nf h1{margin:0}
.nf-links{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
.nf .btn.ghost{color:#EDEFF2;border:1px solid #EDEFF2}
.nf .btn.ghost:hover{background:#EDEFF2;color:#10131C}
.nf-art{width:100%;max-width:360px;justify-self:center}
.nf-art .ink{animation:nfDrip 2.8s cubic-bezier(.5,0,.75,0) infinite}
.nf-art .pool{transform-origin:262px 292px;animation:nfPool 2.8s ease-out infinite}
@keyframes nfDrip{0%,30%{transform:translateY(0);opacity:0}35%{opacity:1}80%{transform:translateY(82px);opacity:1}82%,100%{transform:translateY(82px);opacity:0}}
@keyframes nfPool{0%,78%{transform:scaleX(.9)}86%{transform:scaleX(1.12)}100%{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.nf-art .ink,.nf-art .pool{animation:none}}
</style>
</head>
<body>
${header}
<main class="sec dark nf">
<div class="wrap split">
<div class="stack g16">
<p class="kicker">Sheet 404 — Not in the notebook</p>
<p class="nf-code" aria-hidden="true">404</p>
<h1 class="t-hero" style="font-size:clamp(34px,4.4vw,56px)">This page spilled out of the glass.</h1>
<p class="prose" style="color:#C9CEDA">The link may be old, or the address mistyped. Everything that still exists is one click away.</p>
<div class="nf-links">
<a class="btn" href="/">Back to Home →</a>
<a class="btn ghost" href="/talks/">Read the talks</a>
<a class="btn ghost" href="/projects/">See the projects</a>
</div>
</div>
<svg class="nf-art" viewBox="0 0 320 320" role="img" aria-label="An ink flask tipped on its side, ink dripping from its mouth into a puddle">
<defs><clipPath id="nf-body"><path transform="translate(20 10) rotate(100 140 150)" d="M118 40v70L70 232a10 10 0 0 0 9 14h122a10 10 0 0 0 9-14L162 110V40z"/></clipPath></defs>
<rect x="0" y="182" width="320" height="120" fill="#2B44C8" clip-path="url(#nf-body)"/>
<path transform="translate(20 10) rotate(100 140 150)" d="M110 40h60M118 40v70L70 232a10 10 0 0 0 9 14h122a10 10 0 0 0 9-14L162 110V40" fill="none" stroke="#EDEFF2" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<circle class="ink" cx="262" cy="206" r="6" fill="#2B44C8"/>
<ellipse class="pool" cx="262" cy="292" rx="54" ry="8" fill="#2B44C8"/>
</svg>
</div>
</main>
${footer}
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, '404.html'), html);
  console.log('404.html      branded not-found page');
}

