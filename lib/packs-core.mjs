// Shared code for the study pack paywall (used by netlify/functions/packs.mts, packs-api.mts, kofi.mts).
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   PACKS_KEY               32 random bytes, base64. Decrypts packs-data/*.full.bin and signs sign in
//                           links and cookies. Must match the key used by scripts/build-packs.mjs.
//   KOFI_VERIFICATION_TOKEN The token on Ko-fi > Settings > API (webhooks). Proves a sale came from Ko-fi.
//   Sign in emails, either of:
//   GMAIL_APP_PASSWORD      A Google app password for GMAIL_USER (default mendrofarayang@gmail.com).
//                           Emails go out from that Gmail address. Simplest: no domain set up needed.
//   RESEND_API_KEY          Or a resend.com key; sender PACKS_FROM, default
//                           "GelasTinta <packs@gelastinta.com>" (domain verified in Resend).
//                           With neither, buyers are asked to email the owner, who sends a link
//                           made with the admin tool.
//   PACKS_ADMIN_KEY         Owner key for /api/packs/admin (falls back to NEWSLETTER_ADMIN_KEY).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { PACKS, ITEMS } from './packs-config.mjs';

export const OWNER_EMAIL = 'mendrofarayang@gmail.com';

export const env = (k) => {
  const g = globalThis;
  return (g.Netlify && g.Netlify.env && g.Netlify.env.get(k)) || process.env[k] || '';
};

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const cleanEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

// ---- keys ----
const packsKey = () => {
  const k = Buffer.from(env('PACKS_KEY'), 'base64');
  return k.length === 32 ? k : null;
};
export const hasKey = () => !!packsKey();
const signKey = () => crypto.createHash('sha256').update('gelastinta packs sign v1').update(packsKey()).digest();

// ---- signed tokens: base64url(json).base64url(hmac) ----
export function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(crypto.createHmac('sha256', signKey()).update(body).digest());
}
export function verify(token, purpose) {
  if (!hasKey() || !token || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', signKey()).update(body).digest();
  const got = fromB64u(mac);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let p;
  try { p = JSON.parse(fromB64u(body).toString('utf8')); } catch { return null; }
  if (!p || p.p !== purpose || typeof p.x !== 'number' || p.x < Date.now()) return null;
  return p;
}
export const loginToken = (email, next) => sign({ p: 'login', e: email, n: next || '', x: Date.now() + 1000 * 60 * 60 * 24 * 3 });
export const sessionToken = (email) => sign({ p: 'session', e: email, x: Date.now() + 1000 * 60 * 60 * 24 * 365 });

export const COOKIE = 'gt_packs';
export const readCookie = (req, name = COOKIE) => {
  const m = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
};
export const sessionCookie = (token) => `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=Lax`;
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
export const sessionEmail = (req) => { const p = verify(readCookie(req), 'session'); return p ? p.e : ''; };

// Only send people back to pages on this site.
export const safeNext = (n) => (typeof n === 'string' && /^\/(packs|products)\/[\w\-/#]*$/.test(n) ? n : '/products/#packs');

// ---- buyers (Netlify Blobs) ----
const buyers = () => getStore({ name: 'packs-buyers', consistency: 'strong' });
const orders = () => getStore({ name: 'packs-orders', consistency: 'strong' });
export async function getBuyer(email) {
  if (!email) return null;
  return (await buyers().get(sha256(email), { type: 'json' })) || null;
}
export async function grant(email, name, items, order) {
  const store = buyers();
  const k = sha256(email);
  const rec = (await store.get(k, { type: 'json' })) || { email, name: '', packs: [], items: [], orders: [], at: Date.now() };
  if (name && !rec.name) rec.name = name;
  for (const it of items) {
    if (!ITEMS[it]) continue;
    if (!rec.items.includes(it)) rec.items.push(it);
    for (const p of ITEMS[it].grants) if (!rec.packs.includes(p)) rec.packs.push(p);
  }
  if (order) rec.orders.push(order);
  rec.updated = Date.now();
  await store.setJSON(k, rec);
  return rec;
}
export async function revoke(email, items) {
  const store = buyers();
  const k = sha256(email);
  const rec = await store.get(k, { type: 'json' });
  if (!rec) return null;
  rec.items = rec.items.filter((i) => !items.includes(i));
  rec.packs = [...new Set(rec.items.flatMap((i) => (ITEMS[i] ? ITEMS[i].grants : [])))];
  rec.updated = Date.now();
  await store.setJSON(k, rec);
  return rec;
}
export async function allBuyers() {
  const store = buyers();
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
}
export async function saveOrder(id, data) {
  const store = orders();
  if (await store.get(id)) return false; // Ko-fi may retry: handle each sale once
  await store.setJSON(id, data);
  return true;
}
export async function allOrders() {
  const store = orders();
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
}
export const owns = (rec, pack) => !!rec && Array.isArray(rec.packs) && rec.packs.includes(pack);

// ---- pack files ----
let DATA_DIR = null;
function dataDir() {
  if (DATA_DIR) return DATA_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tries = [path.join(process.cwd(), 'packs-data'), path.join(here, 'packs-data'), path.join(here, '..', 'packs-data'), path.join(here, '..', '..', 'packs-data'), '/var/task/packs-data'];
  DATA_DIR = tries.find((d) => fs.existsSync(path.join(d, 'README.md'))) || tries[0];
  return DATA_DIR;
}
export const sampleGz = (pack) => fs.readFileSync(path.join(dataDir(), `${pack}.sample.gz`));
export function fullHtml(pack) {
  const key = packsKey();
  if (!key) return null;
  const buf = fs.readFileSync(path.join(dataDir(), `${pack}.full.bin`));
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString('utf8');
}
// A 3D teardown page (the base64 text of its gzipped HTML), for buyers of its pack.
export function teardownFor(key) {
  if (!/^[a-z]+[0-9]*$/.test(key)) return null;
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(dataDir(), 'teardowns.json'), 'utf8')); } catch { return null; }
  const pack = map[key];
  if (!pack) return null;
  return { pack, text: () => {
    const k = packsKey();
    if (!k) return null;
    const buf = fs.readFileSync(path.join(dataDir(), `td-${key}.bin`));
    const d = crypto.createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } };
}
export const isPack = (k) => Object.prototype.hasOwnProperty.call(PACKS, k);

// Text safe inside a single quoted JS string inside HTML.
export const jsText = (s) => String(s).replace(/[^\p{L}\p{N} .,&()@+_-]/gu, '').slice(0, 80).trim();

// ---- email ----
export const canMail = () => !!(env('GMAIL_APP_PASSWORD') || env('RESEND_API_KEY'));
let gmail = null;
export async function sendMail(to, subject, html, text) {
  try {
    if (env('GMAIL_APP_PASSWORD')) {
      if (!gmail) {
        const { default: nodemailer } = await import('nodemailer');
        gmail = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env('GMAIL_USER') || OWNER_EMAIL, pass: env('GMAIL_APP_PASSWORD').replace(/\s+/g, '') } });
      }
      await gmail.sendMail({ from: { name: 'GelasTinta', address: env('GMAIL_USER') || OWNER_EMAIL }, to, subject, html, text });
      return true;
    }
    const key = env('RESEND_API_KEY');
    if (!key) return false;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('PACKS_FROM') || 'GelasTinta <packs@gelastinta.com>', to: [to], reply_to: OWNER_EMAIL, subject, html, text }),
    });
    if (!r.ok) console.error('resend', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('sign in email failed', e && e.message);
    return false;
  }
}
export const linkUrl = (origin, email, next) => `${origin}/api/packs/login?t=${encodeURIComponent(loginToken(email, next))}`;
export function signInMail(origin, rec, next) {
  const url = linkUrl(origin, rec.email, next);
  const list = rec.packs.filter((p) => PACKS[p]).map((p) => `<li><a href="${origin}/packs/${p}/">${PACKS[p].name}</a></li>`).join('');
  const html = `<div style="font:16px/1.55 Georgia,serif;color:#10131C;max-width:520px">
<p style="font:700 20px system-ui,sans-serif;margin:0 0 12px">Your GelasTinta study packs</p>
<p>Hi${rec.name ? ' ' + rec.name.replace(/[<>&]/g, '') : ''}, here is your sign in link. It works for 3 days and keeps this browser signed in for a year.</p>
<p><a href="${url}" style="display:inline-block;background:#064F6E;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font:600 15px system-ui,sans-serif">Open my study packs</a></p>
${list ? `<p>Your packs:</p><ul>${list}</ul>` : ''}
<p style="color:#5A6275;font-size:14px">On another device, ask for a new link at ${origin}/packs/signin/. Questions? Just reply to this email.</p>
<p style="color:#5A6275;font-size:14px">Rayang, GelasTinta</p></div>`;
  const text = `Your GelasTinta study packs\n\nSign in link (works for 3 days): ${url}\n\nOn another device, ask for a new link at ${origin}/packs/signin/\n\nRayang, GelasTinta`;
  return { html, text };
}

// ---- small pages in the site style ----
export function page(title, body, status = 200, headers = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · GelasTinta</title><link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@400;600;700&family=Ubuntu+Mono&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#EDEFF2;color:#10131C;font:18px/1.55 'Titillium Web',system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:56px 20px 80px}
a{color:#064F6E}.brand{display:inline-flex;gap:10px;align-items:center;font:800 20px 'Titillium Web',system-ui,sans-serif;color:#10131C;text-decoration:none;margin-bottom:40px}
h1{font:800 36px/1.1 'Titillium Web',system-ui,sans-serif;letter-spacing:-.02em;margin:0 0 14px}
.kicker{font:12px 'Ubuntu Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#5A6275;margin:0 0 10px}
form{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}
input{flex:1 1 240px;min-height:48px;padding:0 16px;border:1px solid #10131C;border-radius:999px;font:16px system-ui,sans-serif;background:#fff}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:0;border-radius:999px;background:#064F6E;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer;text-decoration:none}
.muted{color:#5A6275;font-size:15px}ul{padding-left:20px}li{margin:6px 0}
</style></head><body><main><a class="brand" href="/">GelasTinta</a>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
