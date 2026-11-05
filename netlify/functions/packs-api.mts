// Study pack sign in and owner tools.
//   POST /api/packs/link    (form: email, next)  emails a sign in link if that email bought a pack
//   GET  /api/packs/login?t=TOKEN                signs this browser in, then opens the pack
//   GET  /api/packs/admin?key=OWNER_KEY          owner tools (404 without the right key):
//        (nothing else)                          CSV of buyers
//        &orders=1                               CSV of every Ko-fi sale, including ones not matched to a pack
//        &grant=mechanics,library&email=E&name=N give packs by hand (e.g. a Rupiah sale, a gift); shows a sign in link
//        &revoke=mechanics&email=E               take an item away (e.g. a refund)
//        &link=E                                 make a sign in link to send by hand
//        &send=E                                 email the sign in link (needs GMAIL_APP_PASSWORD or RESEND_API_KEY)
//   Item names: see lib/packs-config.mjs (single packs, foundations, advanced, library).
import crypto from 'node:crypto'
import type { Config } from '@netlify/functions'
import { ITEMS } from '../../lib/packs-config.mjs'
import {
  env, cleanEmail, validEmail, getBuyer, grant, revoke, allBuyers, allOrders, verify, sessionToken, sessionCookie,
  safeNext, sendMail, signInMail, linkUrl, page, esc, hasKey, canMail, OWNER_EMAIL,
} from '../../lib/packs-core.mjs'

const text = (s: string, status = 200, type = 'text/plain') =>
  new Response(s, { status, headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' } })
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '')

const sameKey = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

async function admin(req: Request, url: URL) {
  const key = env('PACKS_ADMIN_KEY') || env('NEWSLETTER_ADMIN_KEY')
  if (!key || !sameKey(url.searchParams.get('key') || '', key)) return text('Not found', 404)
  if (!hasKey()) return text('PACKS_KEY is not set on Netlify yet, so sign in links cannot be made.', 500)
  const q = (k: string) => url.searchParams.get(k) || ''
  const items = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const email = cleanEmail(q('email') || q('link') || q('send'))
  if (q('grant')) {
    const bad = items(q('grant')).filter((i) => !ITEMS[i as keyof typeof ITEMS])
    if (bad.length || !validEmail(email)) return text(`Check the email and item names. Unknown: ${bad.join(', ') || 'none'}. Items: ${Object.keys(ITEMS).join(', ')}`, 400)
    const rec = await grant(email, q('name'), items(q('grant')), { id: 'manual-' + Date.now(), at: Date.now(), items: items(q('grant')), by: 'owner' })
    return text(`Granted. ${rec.email} now has: ${rec.packs.join(', ')}\n\nSign in link (works for 3 days):\n${linkUrl(url.origin, email, '')}\n`)
  }
  if (q('revoke')) {
    const rec = await revoke(email, items(q('revoke')))
    return text(rec ? `Done. ${rec.email} now has: ${rec.packs.join(', ') || 'nothing'}\n` : 'No buyer with that email.\n')
  }
  if (q('link') || q('send')) {
    const rec = await getBuyer(email)
    if (!rec) return text('No buyer with that email. Grant a pack first.\n', 404)
    if (q('send')) {
      const m = signInMail(url.origin, rec, '')
      const ok = await sendMail(email, 'Your GelasTinta study packs', m.html, m.text)
      return text(ok ? `Sent to ${email}.\n` : 'Could not send (is GMAIL_APP_PASSWORD or RESEND_API_KEY set?).\n', ok ? 200 : 500)
    }
    return text(`Sign in link for ${email} (works for 3 days):\n${linkUrl(url.origin, email, '')}\n`)
  }
  if (q('orders')) {
    const rows = (await allOrders()).sort((a, b) => a.at - b.at)
    const csv = ['date,transaction,email,name,amount,currency,items,unmatched_codes']
      .concat(rows.map((o) => [day(o.at), o.id, o.email, o.name, o.amount, o.currency, (o.items || []).join(' '), (o.unknown || []).join(' ')].map(csvCell).join(',')))
    return new Response(csv.join('\n') + '\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="gelastinta-pack-orders.csv"', 'cache-control': 'no-store' } })
  }
  const rows = (await allBuyers()).sort((a, b) => a.at - b.at)
  const csv = ['email,name,items,packs,first_seen'].concat(rows.map((r) => [r.email, r.name, r.items.join(' '), r.packs.join(' '), day(r.at)].map(csvCell).join(',')))
  return new Response(csv.join('\n') + '\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="gelastinta-pack-buyers.csv"', 'cache-control': 'no-store' } })
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const what = url.pathname.replace(/^\/api\/packs\/?/, '').replace(/\/$/, '')

  if (what === 'admin' && req.method === 'GET') return admin(req, url)

  if (what === 'login' && req.method === 'GET') {
    const p = verify(url.searchParams.get('t') || '', 'login')
    const rec = p ? await getBuyer(p.e) : null
    if (!p || !rec) {
      return page('Link expired', `<p class="kicker">Study packs</p><h1>This link has expired</h1><p>Sign in links work for 3 days. Ask for a new one:</p>
<form method="post" action="/api/packs/link"><input type="email" name="email" required placeholder="you@example.com" aria-label="Email"><button type="submit">Send a new link</button></form>`, 400)
    }
    const next = p.n ? safeNext(p.n) : rec.packs.length === 1 || !rec.packs.includes('library') ? `/packs/${rec.packs[0] || ''}/`.replace('//', '/') : '/packs/library/'
    return new Response(null, { status: 303, headers: { location: rec.packs.length ? next : '/packs/signin/', 'set-cookie': sessionCookie(sessionToken(p.e)), 'cache-control': 'no-store' } })
  }

  if (what === 'link' && req.method === 'POST') {
    let email = '', next = ''
    try { const f = await req.formData(); email = cleanEmail(f.get('email')); next = String(f.get('next') || '') } catch {}
    if (!validEmail(email)) return page('Check your email address', `<h1>That email does not look right</h1><p><a href="/packs/signin/">Try again</a></p>`, 400)
    if (!hasKey() || !canMail()) {
      return page('Almost there', `<p class="kicker">Study packs</p><h1>I will send your link by hand</h1>
<p>Automatic sign in emails are not switched on yet. Email <a href="mailto:${OWNER_EMAIL}?subject=${encodeURIComponent('Study pack sign in link')}&body=${encodeURIComponent('My Ko-fi email: ' + email)}">${OWNER_EMAIL}</a> from <b>${esc(email)}</b> and I will reply with your sign in link.</p>`)
    }
    const rec = await getBuyer(email)
    if (rec && rec.packs.length) {
      const m = signInMail(url.origin, rec, safeNext(next))
      await sendMail(email, 'Your GelasTinta study packs', m.html, m.text)
    }
    // Same answer either way, so nobody can test which emails bought a pack.
    return page('Check your email', `<p class="kicker">Study packs</p><h1>Check your email</h1>
<p>If <b>${esc(email)}</b> bought a pack, a sign in link is on its way. It can take a minute; check spam too.</p>
<p class="muted">Paid just now? Ko-fi tells this site within a minute or two. Nothing after 10 minutes? Email <a href="mailto:${OWNER_EMAIL}">${OWNER_EMAIL}</a>.</p>`)
  }

  return text('Not found', 404)
}

export const config: Config = {
  path: '/api/packs/*',
  method: ['GET', 'POST'],
  rateLimit: { action: 'rate_limit', windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
