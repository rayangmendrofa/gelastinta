// Newsletter signups for gelastinta.com
//   POST /api/newsletter  (HTML form: email, website[honeypot])  -> 303 back to the page, #subscribed or #subscribe-error
//   POST /api/newsletter  (JSON: { email })                        -> { ok: true } or { error }
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

export default async (req: Request, context: Context) => {
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
  method: ["POST"],
  rateLimit: { action: "rate_limit", windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
