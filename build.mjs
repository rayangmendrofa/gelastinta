// Builds the GelasTinta website from the Claude Design pages in src/pages
// into plain static files in public/ (ready for Cloudflare Pages, Netlify, Vercel or GitHub Pages).
//
//   npm install      (once)
//   npm run build
//
// Add a page: drop its .dc.html into src/pages and give it a route in ROUTES below.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

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
  'Thesis-BEng.dc.html': '/projects/beng-dissertation/',
  'Thesis-MSc.dc.html': '/projects/msc-dissertation/',
};

const SITE_URL = 'https://gelastinta.com';

// ---- assets -------------------------------------------------------------
const assetDir = path.join(SRC, 'assets');
const assetExt = {}; // id -> filename
for (const f of fs.readdirSync(assetDir)) {
  const m = f.match(/^([0-9a-f]{32})\.(\w+)$/);
  if (m) assetExt[m[1]] = f;
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
for (const f of Object.values(assetExt)) fs.copyFileSync(path.join(assetDir, f), path.join(OUT, 'assets', f));
fs.writeFileSync(path.join(OUT, 'assets', 'dc-lite.js'), runtime);
fs.writeFileSync(path.join(OUT, 'favicon.svg'), FAVICON);

const pages = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.dc.html'));
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
  const dynamic = /\{\{|<sc-(if|for)\b/.test(body);

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

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="canonical" href="${SITE_URL}${route}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
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
