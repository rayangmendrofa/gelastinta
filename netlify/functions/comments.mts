// Comments API for gelastinta.com
//   GET  /api/comments?page=/talks/necrobotics   -> { comments: [{ name, text, when }] }
//   POST /api/comments  { page, name, email, text } -> { comment: { name, text, when } }
// Comments are stored in the Netlify Blobs store "comments", one entry per comment,
// keyed "<page>/<timestamp>-<random>". Emails are kept for the site owner only and
// are never returned to visitors. To remove a comment, delete its entry in the
// Netlify dashboard (Data & Storage > Blobs > comments) or ask Claude to.
import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

// Only these pages accept comments.
const PAGES = new Set([
  "/talks/necrobotics",
  "/talks/crack-headed-salmon",
  "/talks/cooking-and-science",
  "/talks/navier-stokes",
  "/talks/project-hail-mary",
  "/talks/dream-puzzles",
  "/talks/modular-legs",
  "/talks/hair-clip-fish",
  "/projects/beng-dissertation",
  "/projects/msc-dissertation",
  "/projects/inmoov-hand",
])

type Stored = { name: string; email: string; text: string; at: number }

const normalisePage = (p: unknown) =>
  typeof p === "string" ? p.trim().replace(/\/+$/, "") || "/" : ""
const keyPrefix = (page: string) => page.replace(/^\//, "").replace(/\//g, "__") + "/"
const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const publicView = (c: Stored) => ({ name: c.name, text: c.text, when: formatDate(c.at) })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })

export default async (req: Request, context: Context) => {
  const store = getStore({ name: "comments", consistency: "strong" })

  if (req.method === "GET") {
    const page = normalisePage(new URL(req.url).searchParams.get("page"))
    if (!PAGES.has(page)) return json({ comments: [] })
    const { blobs } = await store.list({ prefix: keyPrefix(page) })
    const entries = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }) as Promise<Stored | null>))
    const comments = entries
      .filter((c): c is Stored => !!c)
      .sort((a, b) => a.at - b.at)
      .map(publicView)
    return json({ comments })
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: "Could not read your comment. Please try again." }, 400)
    }
    const page = normalisePage(body.page)
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ")
    const email = String(body.email ?? "").trim()
    const text = String(body.text ?? "").trim()

    if (!PAGES.has(page)) return json({ error: "Comments are not open on this page." }, 400)
    if (!name || name.length > 60) return json({ error: "Please add your name (up to 60 characters)." }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200)
      return json({ error: "Please enter a valid email address." }, 400)
    if (!text) return json({ error: "Write a comment first." }, 400)
    if (text.length > 2000) return json({ error: "Please keep comments under 2,000 characters." }, 400)

    const at = Date.now()
    const comment: Stored = { name, email, text, at }
    const key = keyPrefix(page) + `${at}-${crypto.randomUUID().slice(0, 8)}`
    await store.setJSON(key, comment, { metadata: { page, ip: context.ip } })
    return json({ comment: publicView(comment) }, 201)
  }

  return json({ error: "Method not allowed" }, 405)
}

export const config: Config = {
  path: "/api/comments",
  method: ["GET", "POST"],
  rateLimit: { action: "rate_limit", windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
