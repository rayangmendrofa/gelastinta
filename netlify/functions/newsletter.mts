// Newsletter signups for gelastinta.com
//   POST /api/newsletter  (HTML form: email, website[honeypot])  -> 303 back to the page, #subscribed or #subscribe-error
//   POST /api/newsletter  (JSON: { email })                        -> { ok: true } or { error }
//   GET  /api/newsletter?key=SECRET                                 -> CSV of all subscribers (owner only)
//   GET  /api/newsletter?key=SECRET&remove=someone@example.com      -> removes that address (owner only)
// SECRET is the NEWSLETTER_ADMIN_KEY environment variable set in Netlify. Without it, GET does nothing.
// Each address is stored once in the Netlify Blobs store "newsletter", keyed by a hash of the
// lower-cased address, with the page it came from and the time. Addresses are only for sending new
// talks; they are never shown on the site. To export or remove them, open Netlify > Data & Storage >
// Blobs > newsletter (or ask Claude to).
import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const sha256 = async (text: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Only send people back to a page on this site.
const backTo = (req: Request, hash: string) => {
  const site = new URL(req.url)
  let path = "/"
  const ref = req.headers.get("referer")
  if (ref) {
    try {
      const r = new URL(ref)
      if (r.host === site.host) path = r.pathname
    } catch {}
  }
  return new URL(path + hash, site.origin).toString()
}

const adminKey = () => {
  const g = globalThis as unknown as { Netlify?: { env?: { get: (k: string) => string | undefined } } }
  return g.Netlify?.env?.get("NEWSLETTER_ADMIN_KEY") || process.env.NEWSLETTER_ADMIN_KEY || ""
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)

// Owner tools: download the list as CSV, or remove one address. Hidden (404) without the right key.
const admin = async (req: Request) => {
  const url = new URL(req.url)
  const key = adminKey()
  if (!key || url.searchParams.get("key") !== key) return new Response("Not found", { status: 404 })
  const store = getStore({ name: "newsletter", consistency: "strong" })
  const remove = (url.searchParams.get("remove") || "").trim().toLowerCase()
  if (remove) {
    await store.delete(await sha256(remove))
    return new Response(`Removed ${remove} (if it was on the list).\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } })
  }
  const { blobs } = await store.list()
  const rows = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }))))
    .filter(Boolean)
    .map((r) => r as { email: string; page: string; at: number })
    .sort((a, b) => a.at - b.at)
  const csv = ["email,signed_up_on,page"]
    .concat(rows.map((r) => [r.email, new Date(r.at).toISOString().slice(0, 10), r.page].map(csvCell).join(",")))
    .join("\n") + "\n"
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="gelastinta-newsletter.csv"',
      "cache-control": "no-store",
    },
  })
}

export default async (req: Request, context: Context) => {
  if (req.method === "GET") return admin(req)
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
  const isJson = (req.headers.get("content-type") || "").includes("application/json")
  let email = ""
  let trap = ""
  try {
    if (isJson) {
      const body = await req.json()
      email = String(body.email ?? "")
      trap = String(body.website ?? "")
    } else {
      const form = await req.formData()
      email = String(form.get("email") ?? "")
      trap = String(form.get("website") ?? "")
    }
  } catch {
    email = ""
  }
  email = email.trim().toLowerCase()
  const reply = (ok: boolean) =>
    isJson
      ? new Response(JSON.stringify(ok ? { ok: true } : { error: "Please enter a valid email address." }), {
          status: ok ? 200 : 400,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        })
      : Response.redirect(backTo(req, ok ? "#subscribed" : "#subscribe-error"), 303)

  // Bots fill the hidden field: pretend it worked and store nothing.
  if (trap) return reply(true)
  if (!EMAIL.test(email) || email.length > 200) return reply(false)

  const store = getStore({ name: "newsletter", consistency: "strong" })
  const key = await sha256(email)
  const existing = await store.get(key, { type: "json" })
  if (!existing) {
    let page = "/"
    try {
      page = new URL(req.headers.get("referer") || "/", req.url).pathname
    } catch {}
    await store.setJSON(key, { email, page, at: Date.now() }, { metadata: { ip: context.ip } })
  }
  return reply(true)
}

export const config: Config = {
  path: "/api/newsletter",
  method: ["GET", "POST"],
  rateLimit: { action: "rate_limit", windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
