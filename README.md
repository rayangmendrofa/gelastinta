# GelasTinta

**[gelastinta.com](https://gelastinta.com)** — the personal website of **Rayang T Mendrofa**, mechanical engineer
(BEng, University of Exeter · MSc Mechanical Engineering, University College London).

> *GelasTinta* — "a glass of ink": a metaphorical vessel where ideas flow like ink, shaped by
> structure yet free in spirit.

GelasTinta is a notebook of engineering work and curiosity: research, prototypes, CAD, hobby builds,
and *Talks* — reviews of scientific papers told with a personal take, somewhere between logic and laughter.

## What's on the site

| Section | What you'll find |
|---|---|
| [Home](https://gelastinta.com/) | The idea behind GelasTinta, featured work and the latest talks |
| [Projects](https://gelastinta.com/projects/) | Dissertations, hobby builds, infographics and 360° CAD models |
| ↳ [MSc dissertation](https://gelastinta.com/projects/msc-dissertation/) | Bio-inspired pneumatic soft actuators for underwater robots (UCL) |
| ↳ [BEng dissertation](https://gelastinta.com/projects/beng-dissertation/) | Constructing and analysing a modified prosthetic hand (Exeter) |
| ↳ [InMoov hand](https://gelastinta.com/projects/inmoov-hand/) | Hobby replication of Gaël Langevin's open-source InMoov robot hand |
| [Talks](https://gelastinta.com/talks/) | Paper reviews with interactive figures and a personal take |
| ↳ [Skin to spine](https://gelastinta.com/talks/skin-to-spine/) | *Skin to Spine* — a sticky gel-free electrode and an artificial plateau neuron, reviewed together |
| ↳ [Modular legs](https://gelastinta.com/talks/modular-legs/) | *Microbot is not quite Micro* — reconfigurable robot legs that design themselves |
| ↳ [Dream puzzles](https://gelastinta.com/talks/dream-puzzles/) | *Inception, but for Homework* — solving puzzles inside your dreams |
| ↳ [Project Hail Mary](https://gelastinta.com/talks/project-hail-mary/) | *Amaze, Amaze, Amaze* — the science (and the heart) of the story |
| ↳ [Navier–Stokes](https://gelastinta.com/talks/navier-stokes/) | *Mathematician vs Clanker* — the Millennium Prize question |
| ↳ [Necrobotics](https://gelastinta.com/talks/necrobotics/) | When necromancy leaves the game and enters the skill tree |
| ↳ [Crack-headed salmon](https://gelastinta.com/talks/crack-headed-salmon/) | Pharmaceutical pollution and fish behaviour |
| ↳ [Cooking and science](https://gelastinta.com/talks/cooking-and-science/) | The physics of a perfect cacio e pepe |
| [Products](https://gelastinta.com/products/) | Coming soon — work in progress with [rtechm.com](https://rtechm.com) |
| [Author](https://gelastinta.com/author/) | Background, education, skills and life around the studies |

Readers can leave comments on every Talk and project write-up.

## How the site is built

A small, dependency-light static site:

- **Pages** — hand-composed HTML pages in `src/pages/`, one file per page.
- **Assets** — photographs, renders, papers and video clips in `src/assets/`.
- **Build** — `build.mjs` turns the pages into a static site in `public/`: clean URLs, optimised
  links, and interactive pages pre-rendered so they load instantly and are readable by search engines.
  Photos are published as WebP no larger than they appear on screen (`src/image-widths.json`), and
  the build writes each page's link-preview card (title, summary, picture), `sitemap.xml`,
  `robots.txt` and a branded 404 page.
- **Interactivity** — a tiny script (`src/runtime/dc-lite.js`) powers slideshows, the CAD viewer,
  poster zoom, charts and expandable explanations. No framework.
- **Motion** — page animations use [Anime.js](https://animejs.com/) (MIT licence) and respect the
  visitor's *reduce motion* setting.
- **Comments** — a serverless function (`netlify/functions/comments.mts`) backed by Netlify Blobs.
  Commenters register with a name and email; emails are private and never shown on the site.
- **Hosting** — [Netlify](https://www.netlify.com/), deployed automatically from the `main` branch.

```bash
npm install        # once
npm run build      # build the site into public/
npm run preview    # preview at http://localhost:4173 (comments need Netlify)
```

## Updates and automation

All writing, research, photography and project work on GelasTinta is by the author.

Publishing is automated. Routine site maintenance — converting edited pages, adding new pages
and images, rebuilding, and pushing to this repository — is handled with the help of
[Claude](https://claude.ai) by Anthropic. Every push to `main` triggers a fresh Netlify build, so
new content goes live within a minute or two.

## Credits

- InMoov is an open-source project created by [Gaël Langevin](https://inmoov.fr/); the hand on this
  site is a hobby replication, not an original design.
- Papers reviewed in *Talks* are cited and linked on each article page.
- Animation library: [Anime.js](https://animejs.com/) by Julian Garnier (MIT).
- Typefaces: Bricolage Grotesque, Newsreader and JetBrains Mono (Google Fonts).

## Contact

- Email: [mendrofarayang@gmail.com](mailto:mendrofarayang@gmail.com)
- LinkedIn: [linkedin.com/in/raysmendrofa](https://www.linkedin.com/in/raysmendrofa/)

© 2026 Rayang T Mendrofa. All rights reserved for site content, writing and images.
