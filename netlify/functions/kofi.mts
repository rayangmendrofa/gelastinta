// Ko-fi webhook: Ko-fi calls this after every payment (Ko-fi > Settings > API > Webhook URL:
// https://gelastinta.com/api/kofi). Shop orders for study packs unlock the packs for the buyer's
// email and, when sign in emails are set up (GMAIL_APP_PASSWORD or RESEND_API_KEY), email them
// a sign in link straight away.
// Ko-fi sends a form with one field, "data", holding JSON; verification_token must match
// KOFI_VERIFICATION_TOKEN. Every shop sale is kept in the "packs-orders" store, including sales
// whose item code is not in lib/packs-config.mjs, so nothing is lost (see /api/packs/admin?orders=1).
import crypto from 'node:crypto'
import type { Config } from '@netlify/functions'
import { itemByKofiCode, ITEMS } from '../../lib/packs-config.mjs'
import { env, cleanEmail, validEmail, grant, saveOrder, sendMail, signInMail, hasKey } from '../../lib/packs-core.mjs'

const ok = (s = 'ok') => new Response(s, { status: 200, headers: { 'content-type': 'text/plain' } })

export default async (req: Request) => {
  let data: any = null
  try {
    const type = req.headers.get('content-type') || ''
    if (type.includes('application/json')) data = await req.json()
    else data = JSON.parse(String((await req.formData()).get('data') || ''))
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const want = env('KOFI_VERIFICATION_TOKEN')
  const got = String(data?.verification_token || '')
  if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new Response('unauthorized', { status: 401 })
  }
  if (data.type !== 'Shop Order') return ok('ignored') // donations and memberships are not pack sales

  const id = String(data.kofi_transaction_id || data.message_id || '')
  if (!id) return new Response('no transaction id', { status: 400 })
  const items: string[] = [], unknown: string[] = []
  for (const s of data.shop_items || []) {
    const hit = itemByKofiCode(s.direct_link_code)
    if (hit) items.push(hit[0]); else unknown.push(String(s.direct_link_code || ''))
  }
  const email = cleanEmail(data.email)
  // Ko-fi items are "pay what you want" with a minimum, so check the payment covers the listed
  // prices (lib/packs-config.mjs). Underpaid sales are kept but not unlocked; the owner can grant them.
  const due = items.reduce((t, k) => t + (ITEMS[k as keyof typeof ITEMS]?.price || 0), 0)
  const paid = parseFloat(String(data.amount || '0'))
  const underpaid = String(data.currency || 'USD').toUpperCase() === 'USD' && paid + 0.005 < due
  const order = { id, at: Date.parse(data.timestamp) || Date.now(), email, name: String(data.from_name || ''), amount: String(data.amount || ''), currency: String(data.currency || ''), items, unknown, underpaid }
  if (!(await saveOrder(id, order))) return ok('already handled')
  if (underpaid) console.error(`Ko-fi order ${id}: paid ${paid} for items worth ${due}; not unlocked`)

  if (items.length && validEmail(email) && !underpaid) {
    const rec = await grant(email, order.name === 'Anonymous' ? '' : order.name, items, { id, at: order.at, amount: order.amount, currency: order.currency, items })
    if (hasKey()) {
      const origin = new URL(req.url).origin
      const m = signInMail(origin, rec, '')
      await sendMail(email, 'Your GelasTinta study packs are ready', m.html, m.text)
    }
  }
  return ok()
}

export const config: Config = {
  path: '/api/kofi',
  method: ['POST'],
}
