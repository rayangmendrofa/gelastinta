# GelasTinta — gelastinta.com

The GelasTinta website, converted from the **GelasTinta Redesign** canvas in Claude Design.
It is a plain static site: the finished pages live in `public/` and can be hosted anywhere
(Cloudflare, Netlify, Vercel, GitHub Pages) with no build step on the host.

## Pages

| Live URL | Source file |
|---|---|
| `/` | `src/pages/Main.dc.html` |
| `/projects/` | `src/pages/Projects.dc.html` |
| `/projects/msc-dissertation/` | `src/pages/Thesis-MSc.dc.html` |
| `/projects/beng-dissertation/` | `src/pages/Thesis-BEng.dc.html` |
| `/talks/` | `src/pages/Talks.dc.html` |
| `/talks/necrobotics/` | `src/pages/Talk-Necro.dc.html` |
| `/talks/crack-headed-salmon/` | `src/pages/Talk-Salmon.dc.html` |
| `/talks/cooking-and-science/` | `src/pages/Talk-CacioPepe.dc.html` |
| `/products/` | `src/pages/Products.dc.html` |
| `/author/` | `src/pages/Author.dc.html` |

## How it fits together

- `src/pages/*.dc.html` — the pages, in the same format Claude Design uses, so a page
  redesigned on the canvas can be dropped back in unchanged.
- `src/assets/` — every image, PDF and video, named by its Claude Design asset id.
- `src/runtime/dc-lite.js` — a small script that powers the interactive bits
  (photo slideshow, CAD picker, poster zoom, chart toggles, expanders).
- `build.mjs` — turns the pages into `public/`: rewrites image paths to `/assets/…`,
  page links to clean URLs, and pre-renders interactive pages so they load instantly
  and are readable by search engines.
- `public/` — the built site. **This is the folder the host serves.**

## Updating the site

Ask Claude, e.g. "add a new Talk about <paper>" or "change the Home hero text". Claude edits
`src/`, runs the build, and pushes to GitHub; the host redeploys in about a minute.

By hand:

```bash
npm install        # once
npm run build      # regenerates public/
npm run preview    # view it at http://localhost:4173
```

To add a page: put `NewPage.dc.html` in `src/pages/`, add its URL to `ROUTES` in `build.mjs`,
link to it from other pages with `href="NewPage.dc.html"`, then build.

## Known limitation

The comment boxes on the Talk and dissertation pages only work inside the visitor's own
browser tab — comments are not saved or shown to anyone else. Swap in a real comment
service (for example Giscus, which stores comments in GitHub Discussions) or remove the
section before relying on it.

## Hosting

- Host setting: build command **none**, output / publish directory **`public`**.
- Domain: gelastinta.com was bought through Canva. Point it at the host either by editing
  its DNS records in Canva, or by changing its nameservers in Canva to the host's.
  Canva keeps the domain registration either way.
