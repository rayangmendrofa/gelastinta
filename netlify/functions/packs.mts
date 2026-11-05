// Study pack pages: /packs/<key>/ shows the full pack to buyers and the free sample to everyone else.
//   /packs/<key>/        maths, mechanics, materials, electronics, fea, advmat, thermo, control, vib,
//                        robotics, library (see lib/packs-config.mjs)
//   /packs/buy/<item>    goes to that item on Ko-fi (or the Ko-fi shop until its code is set)
//   /packs/signin/       ask for a sign in link by email
//   /packs/signout/      forget this browser
//   /packs/td/<key>      a 3D teardown page for buyers of its pack (the full pack fetches it)
// Access is checked here on the server; the full files are encrypted in packs-data/ and only
// decrypted for a signed in buyer who owns the pack. See lib/packs-core.mjs for the settings.
import zlib from 'node:zlib'
import type { Config } from '@netlify/functions'
import { PACKS, ITEMS, buyUrl } from '../../lib/packs-config.mjs'
import {
  isPack, sessionEmail, getBuyer, owns, fullHtml, sampleGz, jsText, page, esc, clearCookie, safeNext, hasKey, teardownFor, OWNER_EMAIL,
} from '../../lib/packs-core.mjs'

const send = (req: Request, html: string | Buffer, gz?: Buffer) => {
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex',
    vary: 'cookie, accept-encoding',
  }
  const body = gz || zlib.gzipSync(typeof html === 'string' ? Buffer.from(html) : html, { level: 6 })
  if (/\bgzip\b/.test(req.headers.get('accept-encoding') || '')) {
    headers['content-encoding'] = 'gzip'
    return new Response(body, { headers })
  }
  return new Response(zlib.gunzipSync(body), { headers })
}

const signinPage = (next: string, email: string, packs: string[]) => {
  const owned = packs.filter((p) => PACKS[p as keyof typeof PACKS])
  return page('Sign in', `<p class="kicker">Study packs</p><h1>${email ? 'You are signed in' : 'Open your study packs'}</h1>
${email ? `<p>Signed in as <b>${esc(email)}</b>.</p>${owned.length ? `<p>Your packs:</p><ul>${owned.map((p) => `<li><a href="/packs/${p}/">${PACKS[p as keyof typeof PACKS].name}</a></li>`).join('')}</ul>` : `<p>No packs are linked to this email yet. If you just paid on Ko-fi, give it a minute and reload. Still nothing? Email <a href="mailto:${OWNER_EMAIL}">${OWNER_EMAIL}</a>.</p>`}
<p class="muted">Not you? <a href="/packs/signout/">Sign out</a></p>` : `<p>Enter the email you used on Ko-fi and I will send you a sign in link. It keeps this browser signed in for a year.</p>
<form method="post" action="/api/packs/link"><input type="email" name="email" required placeholder="you@example.com" aria-label="Email" autocomplete="email"><input type="hidden" name="next" value="${esc(next)}"><button type="submit">Send my link</button></form>
<p class="muted">Not bought a pack yet? <a href="/products/#packs">See the study packs</a>.</p>`}`)
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean) // ['packs', ...]
  const a = parts[1] || ''
  if (!a) return Response.redirect(new URL('/products/#packs', url.origin).toString(), 302)

  if (a === 'buy') {
    const item = parts[2] || ''
    return Response.redirect(ITEMS[item as keyof typeof ITEMS] ? buyUrl(item) : buyUrl(''), 302)
  }
  if (a === 'signout') {
    return new Response(null, { status: 303, headers: { location: '/products/#packs', 'set-cookie': clearCookie(), 'cache-control': 'no-store' } })
  }
  const email = sessionEmail(req)
  if (a === 'signin') {
    const rec = email ? await getBuyer(email) : null
    return signinPage(safeNext(url.searchParams.get('next') || ''), rec ? email : '', rec ? rec.packs : [])
  }
  if (a === 'td') {
    // a 3D teardown page, fetched by the full pack when a buyer opens the 3D model
    const td = teardownFor(parts[2] || '')
    if (!td || parts.length > 3) return new Response('Not found', { status: 404 })
    const rec = email ? await getBuyer(email) : null
    if (!owns(rec, td.pack)) return new Response('This 3D model is part of the full pack.', { status: 403, headers: { 'cache-control': 'no-store' } })
    const text = td.text()
    if (!text) return new Response('Not available', { status: 503 })
    const headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex', vary: 'cookie, accept-encoding' }
    if (/\bgzip\b/.test(req.headers.get('accept-encoding') || '')) { headers['content-encoding'] = 'gzip'; return new Response(zlib.gzipSync(Buffer.from(text), { level: 6 }), { headers }) }
    return new Response(text, { headers })
  }
  if (!isPack(a) || parts.length > 2) return page('Not found', '<h1>No such pack</h1><p><a href="/products/#packs">See all study packs</a></p>', 404)
  if (!url.pathname.endsWith('/')) return Response.redirect(new URL(`/packs/${a}/`, url.origin).toString(), 301)

  const rec = email ? await getBuyer(email) : null
  if (owns(rec, a)) {
    const html = hasKey() ? fullHtml(a) : null
    if (html) return send(req, html.replace("licensee: '__LICENSEE__'", `licensee: '${jsText(rec.name || rec.email) || 'Buyer'}'`))
    console.error('PACKS_KEY missing or wrong: serving the sample to a buyer')
  }
  const next = encodeURIComponent(`/packs/${a}/`)
  const sample = zlib.gunzipSync(sampleGz(a)).toString('utf8').split('__GT_NEXT__').join(next)
  return send(req, sample)
}

export const config: Config = {
  path: ['/packs', '/packs/*'],
  method: ['GET', 'HEAD'],
}
