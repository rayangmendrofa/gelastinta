#!/usr/bin/env python3
"""Build src/pages/Home-v2.dc.html, the scroll story prototype of the Home page.

Content comes from the current Home, Author and footer copy; cards are read from the
Home shelves (Main.dc.html) so they stay in step. Pixel scenes are the owner's v4
character pack (1x sheets, scaled by whole numbers with steps()).
Run: python3 tools/make_home_v2.py
"""
import html, json, os, random, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = open(os.path.join(ROOT, 'src/pages/Main.dc.html')).read()

# palette (site Wada 360 plus the site ink and paper)
VIOLET, TAUPE, OLYMPIC, VANDAR, INK, PAPER, MIST = '#4F4086', '#7A4456', '#5A82B3', '#064F6E', '#10131C', '#EDEFF2', '#8DB0DA'

# v4 sheets: id, frames, ms, frame w, frame h
PX = {
    'cram':  ('cd7ae1fe0e2bd96a0c04404ee468052e', 18, 2700, 128, 80),
    'read':  ('5e57846f1023308734ee379e7a9f60c8', 16, 2560, 128, 80),
    'rush':  ('0bdd3b0cc4df29182214044820c55db5', 16, 2240, 128, 80),
    'music': ('d2e84f22d868d8739a5351cc3aa8e9e5', 12, 1680, 128, 80),
    'exam':  ('214357d23e3f1d75a0d60cf034b2161a', 16, 2400, 128, 80),
    'coffee': ('33f6bbac57a781128b07eb85c0aab3a1', 16, 2720, 128, 80),
    'rain':  ('5f546531126ecca601b1bd5ebcad7ece', 16, 2880, 128, 80),
    'happy': ('830a7c1fe3e504f0c08301fe92d425c3', 8, 1200, 76, 58),
    'lab':   ('11e2aed629c96b98dcbbc577c17261a4', 8, 1200, 76, 58),
}


def px(key, label, cls=''):
    i, n, ms, w, h = PX[key]
    return (f'<div class="pix {cls}" role="img" aria-label="{html.escape(label)}" style="--fw:{w};--fh:{h};--n:{n};--t:{ms}ms">'
            f'<img src="/_blob/{i}" alt="" draggable="false"></div>')


def wobble(text, seed, amp=4.0):
    """Big statement with each letter slightly turned; the live page scales the turn with scroll."""
    rnd = random.Random(seed)
    out = []
    for word in text.split(' '):
        letters = ''.join(
            f'<span class="l" style="--r:{rnd.uniform(-amp, amp):.1f}deg;--y:{rnd.uniform(-0.05, 0.05):.3f}em">{html.escape(ch)}</span>'
            for ch in word)
        out.append(f'<span class="w">{letters}</span>')
    return ' '.join(out)


def star(x, y, s, o=0.9):
    return (f'<svg class="star" style="left:{x}%;top:{y}%;width:{s}px;height:{s}px;opacity:{o}" viewBox="0 0 20 20" aria-hidden="true">'
            '<path d="M10 0C10.8 6.6 13.4 9.2 20 10C13.4 10.8 10.8 13.4 10 20C9.2 13.4 6.6 10.8 0 10C6.6 9.2 9.2 6.6 10 0Z" fill="currentColor"/></svg>')


def stars(seed, n=7):
    rnd = random.Random(seed)
    return ''.join(star(rnd.choice([rnd.uniform(2, 13), rnd.uniform(87, 97)]), rnd.uniform(6, 90), rnd.choice([10, 14, 18, 24]), rnd.choice([.5, .7, .9])) for _ in range(n))


# cards from the Home shelves
cards = []
for m in re.finditer(r'<a class="cover" id="sh-(\w+)-\d+" href="([^"]+)"><span class="cv-img" style="background:([^"]+)"><img src="/_blob/(\w+)" alt="([^"]*)"[^>]*style="([^"]*)"></span><span class="cv-body"><span class="kicker">([^<]*)</span><span class="cv-t">([^<]*)</span><span class="cv-p">([^<]*)</span><span class="cv-m">([^<]*)</span>', MAIN):
    cards.append(dict(shelf=m.group(1), href=m.group(2), bg=m.group(3), img=m.group(4), alt=m.group(5), style=m.group(6),
                      kicker=m.group(7), title=m.group(8), p=m.group(9), meta=m.group(10)))


def card(c):
    fit = 'contain' if 'contain' in c['style'] else 'cover'
    return (f'<a class="card" href="{c["href"]}" draggable="false"><span class="card-img" style="background:{c["bg"]}">'
            f'<img src="/_blob/{c["img"]}" alt="{c["alt"]}" loading="lazy" draggable="false" style="object-fit:{fit}"></span>'
            f'<span class="card-k">{c["kicker"]}</span><span class="card-t">{c["title"]}</span>'
            f'<span class="card-p">{c["p"]}</span><span class="card-m">{c["meta"]}</span></a>')


works = ''.join(card(c) for c in cards if c['shelf'] == 'works')
talks = ''.join(card(c) for c in cards if c['shelf'] == 'latest')
n_talks = len(re.findall(r"'Talk-\w+\.dc\.html': '/talks/", open(os.path.join(ROOT, 'build.mjs')).read()))

ICON = {
    'yt': '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
    'ig': '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>',
    'tt': '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 3c.5 2.6 2.4 4.4 5 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
}

CHAPTERS = [('hello', 'Hello'), ('hi', 'Hi'), ('apart', 'Take apart'), ('builds', 'Builds'), ('talks', 'Talks'),
            ('beliefs', 'Beliefs'), ('packs', 'Packs'), ('contact', 'Contact')]

TEAR = [
    ('Thesis-BEng.dc.html', 'Project · prosthetic hand', 'How a prosthetic hand closes', 'One muscle signal drives six servos and five tendons, and each finger curls shut in 0.4 s.'),
    ('Thesis-MSc.dc.html', 'Project · soft robot limb', 'How a soft limb bends', 'A bellows pumps water into seven silicone chambers, and each one adds a little arc.'),
    ('Talk-HairClipFish.dc.html', 'Talk 07 · hair clip fish', 'How a hair clip fish swims', 'One servo loads a snap hair clip slowly, then it flicks the tail across in 50 ms.'),
]
tear = ''.join(f'<a class="mini" href="{h}"><span class="mini-k">{k}</span><span class="mini-t">{t}</span><span class="mini-p">{p}</span><span class="mini-go">Open it →</span></a>' for h, k, t, p in TEAR)
PACKS = ['TH · Thermodynamics', 'RB · Robotics', 'T · Mechanics', 'VA · Vibration', 'CE · Control', 'E · Electronics',
         'FE · Computational', 'M · Materials', 'EM · Engineering Maths', 'AM · Advanced Materials']
packs = ''.join(f'<span class="chip">{p}</span>' for p in PACKS)

body = f'''<div class="v2" data-v2 style="--bg:{VIOLET}">
<a class="skip" href="#hello">Skip to content</a>
<header class="top">
<a class="brand" href="Main.dc.html">GelasTinta</a>
<nav class="nav" aria-label="Main"><a href="Projects.dc.html">Projects</a><a href="Talks.dc.html">Talks</a><a href="Products.dc.html">Products</a><a href="/packs/library/">Library</a><a href="Author.dc.html">Author</a></nav>
</header>

<section class="scene" id="hello" data-scene data-bg="{VIOLET}" style="--sb:{VIOLET}">
{stars(1)}
<div class="stack-c">
<p class="over">Gelas · glass &nbsp;/&nbsp; Tinta · ink</p>
<h1 class="big">{wobble('Ideas as in ink', 11)}</h1>
<p class="serif">A metaphorical vessel where ideas flow like ink, shaped by structure yet free in spirit.</p>
{px('cram', 'Pixel scene: the GelasTinta character studying late at night in his room, dozing off and waking up to keep working', 'xl')}
<p class="cue">Scroll to step inside ↓</p>
</div>
</section>

<section class="scene" id="hi" data-scene data-bg="{TAUPE}" style="--sb:{TAUPE}">
{stars(2, 5)}
<div class="row">
<div class="stack-l">
<h2 class="big huge">{wobble("Hi, I'm Rayang.", 22, 6)}</h2>
<svg class="squiggle" viewBox="0 0 300 24" aria-hidden="true"><path d="M2 12 C 27 0, 52 24, 77 12 S 127 0, 152 12 S 202 24, 227 12 S 277 0, 298 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>
<p class="serif">A mechanical engineer with a passion for turning ideas into reality.</p>
<p class="mono-l">BEng · University of Exeter · 2023 &nbsp;/&nbsp; MSc · University College London · 2025</p>
</div>
{px('happy', 'Pixel portrait: the GelasTinta character in his hoodie, smiling', 'face')}
</div>
</section>

<section class="scene" id="apart" data-scene data-bg="{OLYMPIC}" style="--sb:{OLYMPIC}">
{stars(3, 5)}
<div class="stack-c">
<p class="over">Take it apart</p>
<h2 class="big">{wobble('See how it works.', 33)}</h2>
<p class="serif"><i>From the inside.</i> Every model runs on the numbers from the work behind it.</p>
{px('rush', 'Pixel scene: the GelasTinta character typing fast against a deadline, a progress bar filling, then leaning back relieved', 'lg')}
<div class="minis">{tear}</div>
</div>
</section>

<section class="scene" id="builds" data-scene data-bg="{VANDAR}" style="--sb:{VANDAR}">
{stars(4, 6)}
<div class="stack-l wide">
<div class="head-row"><div><p class="over">Dissertations and hobby builds</p><h2 class="big">{wobble('Featured works.', 44)}</h2></div>{px('lab', 'Pixel portrait: the GelasTinta character in his lab coat, looking determined', 'face sm')}</div>
<div class="cards" data-drag tabindex="0" aria-label="Featured works, scroll sideways">{works}</div>
<a class="more" href="Projects.dc.html">All projects →</a>
</div>
</section>

<section class="scene" id="talks" data-scene data-bg="{INK}" style="--sb:{INK}">
{stars(5, 12)}
<div class="stack-l wide">
<div class="head-row"><div><p class="over">Talks · science and engineering, reviewed</p><h2 class="big">{wobble(f'{n_talks} talks.', 55)}</h2><p class="serif">What’s new?</p></div>{px('read', 'Pixel scene: the GelasTinta character reading at his desk, turning pages until an idea lights up', 'md')}</div>
<div class="cards" data-drag tabindex="0" aria-label="Latest talks, scroll sideways">{talks}</div>
<a class="more" href="Talks.dc.html">All talks →</a>
</div>
</section>

<section class="scene" id="beliefs" data-scene data-bg="{VIOLET}" style="--sb:{VIOLET}">
{stars(6, 6)}
<div class="stack-c">
<blockquote class="quote"><p>“The highest forms of understanding we can achieve are laughter and human compassion.”</p><footer>Richard P. Feynman</footer></blockquote>
<p class="lede">Much of how I think was shaped by Richard Feynman. It reminds me that science doesn’t have to be cold: the best ideas make people smile and bring them closer.</p>
{px('music', 'Pixel scene: the GelasTinta character with headphones on, eyes closed, nodding along to music', 'lg')}
</div>
</section>

<section class="scene" id="packs" data-scene data-bg="{TAUPE}" style="--sb:{TAUPE}">
{stars(7, 5)}
<div class="row">
<div class="stack-l">
<p class="over">Products</p>
<h2 class="big">{wobble('Study packs.', 77)}</h2>
<p class="serif">Each pack opens with a free first sheet. The teardowns sit inside the full pack.</p>
<div class="chips">{packs}</div>
<a class="more" href="Products.dc.html">See the study packs →</a>
</div>
{px('exam', 'Pixel scene: the GelasTinta character writing an exam nervously, getting stuck, pushing through and showing off an A plus', 'lg')}
</div>
</section>

<section class="scene" id="contact" data-scene data-bg="{VANDAR}" style="--sb:{VANDAR}">
{stars(8, 8)}
<div class="stack-c">
<p class="over">Jakarta · London · Singapore</p>
<h2 class="big">{wobble('Get in touch.', 88)}</h2>
<p class="serif">Open to collaborations, discussions, projects, and work in discussing creative science, design, and engineering work.</p>
<button type="button" class="mail" data-copy="mendrofarayang@gmail.com"><span class="mail-a">mendrofarayang@gmail.com</span><span class="mail-ok" aria-live="polite">Copied</span></button>
<div class="socials">
<a href="https://www.linkedin.com/in/raysmendrofa/">LinkedIn</a>
<a href="https://wa.me/447376459918">WhatsApp</a>
<a href="https://www.youtube.com/@gelastinta">{ICON['yt']}YouTube</a>
<a href="https://www.instagram.com/gelastinta/">{ICON['ig']}Instagram</a>
<a href="https://www.tiktok.com/@gelastinta.com">{ICON['tt']}TikTok</a>
</div>
{px('rain', 'Pixel scene: the GelasTinta character drinking warm tea on the sofa while it rains outside', 'lg')}
<p class="fine">Drawn by Rayang T Mendrofa · GelasTinta</p>
</div>
</section>

<nav class="ruler" data-ruler aria-label="Chapters">
<span class="ruler-ticks" aria-hidden="true"></span><span class="ruler-now" aria-hidden="true"></span>
{''.join(f'<button type="button" data-go="{i}">{n}</button>' for i, n in CHAPTERS)}
</nav>
</div>'''

CSS = f'''
*{{box-sizing:border-box}}
html{{scroll-behavior:auto}}
body{{margin:0;background:{INK};color:{PAPER};font-family:'Titillium Web',system-ui,sans-serif;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}}
a{{color:inherit}}
.v2{{position:relative;overflow-x:clip;--vh:9px}}
.v2.live{{--vh:1vh}}
.v2.live{{background:var(--bg);transition:background-color .9s cubic-bezier(.65,0,.35,1)}}
.v2::after{{content:"";position:fixed;inset:0;pointer-events:none;z-index:40;opacity:.16;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}}
.skip{{position:absolute;left:12px;top:-80px;z-index:90;background:{PAPER};color:{INK};padding:10px 16px;font-family:'Ubuntu Mono',monospace}}
.skip:focus{{top:8px}}
.top{{position:fixed;left:0;right:0;top:0;z-index:50;display:flex;align-items:center;gap:18px;padding:18px clamp(18px,3vw,40px);pointer-events:none}}
.top > *{{pointer-events:auto}}
.brand{{font-family:'Anton',Impact,sans-serif;font-size:22px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none}}
.badge{{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid rgba(237,239,242,.5);border-radius:999px;font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.04em;background:rgba(16,19,28,.18)}}
.badge i{{width:8px;height:8px;border-radius:50%;background:#7BD88F;box-shadow:0 0 0 3px rgba(123,216,143,.25)}}
.nav{{margin-left:auto;display:flex;gap:22px;font-family:'Anton',Impact,sans-serif;font-size:15px;letter-spacing:.08em;text-transform:uppercase}}
.nav a{{text-decoration:none;opacity:.9}}
.nav a:hover{{opacity:1;text-decoration:underline;text-underline-offset:6px}}
.scene{{position:relative;min-height:860px;display:flex;align-items:center;justify-content:center;padding:100px clamp(20px,6vw,96px) 110px;background:var(--sb)}}
.v2.live .scene{{min-height:100vh;background:transparent}}
.star{{position:absolute;color:{PAPER};pointer-events:none}}
.stack-c{{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(12px,calc(var(--vh) * 2.2),22px);max-width:1100px}}
.stack-l{{position:relative;z-index:2;display:flex;flex-direction:column;gap:20px;max-width:760px}}
.stack-l.wide{{max-width:1240px;width:100%}}
.row{{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:clamp(24px,5vw,80px);width:100%;max-width:1240px}}
.head-row{{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}}
.over{{margin:0;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:clamp(20px,2vw,28px);opacity:.9}}
.big{{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;font-size:clamp(56px,min(11vw,calc(var(--vh) * 17)),190px);line-height:.9;letter-spacing:.005em;color:{PAPER}}}
.big.huge{{font-size:clamp(60px,min(12vw,calc(var(--vh) * 19)),210px)}}
.big .w{{display:inline-block;white-space:nowrap}}
.big .l{{display:inline-block;transform:translateY(calc(var(--y) * var(--k,1))) rotate(calc(var(--r) * var(--k,1)));transition:transform .2s linear}}
.serif{{margin:0;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(24px,min(2.6vw,calc(var(--vh) * 4.4)),40px);line-height:1.12;max-width:26ch}}
.stack-c .serif{{max-width:40ch}}
.lede{{margin:0;font-size:clamp(18px,1.6vw,21px);max-width:56ch;opacity:.92}}
.mono-l{{margin:0;font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85}}
.cue{{margin:0;font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.8}}
.squiggle{{width:min(300px,60%);height:24px;color:{MIST}}}
.quote{{margin:0;max-width:min(1000px,100%)}}
.quote p{{margin:0;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(34px,min(4.6vw,calc(var(--vh) * 7.4)),76px);line-height:1.04}}
.quote footer{{margin-top:18px;font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85}}
.pix{{--s:5;position:relative;width:calc(var(--fw) * 1px * var(--s));height:calc(var(--fh) * 1px * var(--s));overflow:hidden;flex:none;border-radius:6px;box-shadow:0 0 0 3px rgba(237,239,242,.85),0 18px 40px rgba(16,19,28,.35)}}
.pix img{{display:block;height:100%;width:calc(var(--n) * 100%);max-width:none;image-rendering:pixelated;image-rendering:crisp-edges;animation:pix var(--t) steps(var(--n)) infinite}}
@keyframes pix{{to{{transform:translateX(-100%)}}}}
.pix.xl{{--s:4}}
.pix.lg{{--s:3}}
.pix.md{{--s:2.5}}
.pix.face{{--s:4;border-radius:50%;box-shadow:0 0 0 3px rgba(237,239,242,.85);background:rgba(237,239,242,.12)}}
.pix.face.sm{{--s:3}}
.minis{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;width:100%;margin-top:10px;text-align:left}}
.mini{{display:flex;flex-direction:column;gap:6px;padding:18px;border:1px solid rgba(237,239,242,.55);border-radius:14px;text-decoration:none;background:rgba(16,19,28,.12);transition:background .2s,transform .2s}}
.mini:hover{{background:rgba(16,19,28,.28);transform:translateY(-3px)}}
.mini-k,.card-k{{font-family:'Ubuntu Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}}
.mini-t{{font-family:'Instrument Serif',Georgia,serif;font-size:26px;line-height:1.1}}
.mini-p{{font-size:15px;line-height:1.5;opacity:.9}}
.mini-go{{font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.08em;margin-top:auto}}
.cards{{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(280px,340px);gap:20px;overflow-x:auto;padding:8px 2px 18px;scroll-snap-type:x mandatory;scrollbar-width:thin;cursor:grab}}
.cards.drag{{cursor:grabbing;scroll-snap-type:none}}
.cards:focus-visible{{outline:3px solid {MIST};outline-offset:4px}}
.card{{scroll-snap-align:start;display:flex;flex-direction:column;gap:8px;text-decoration:none;user-select:none}}
.card-img{{display:block;aspect-ratio:4/3;border-radius:14px;overflow:hidden;border:2px solid rgba(237,239,242,.85)}}
.card-img img{{display:block;width:100%;height:100%;object-position:50% 50%;transition:transform .5s cubic-bezier(.16,1,.3,1)}}
.card:hover .card-img img{{transform:scale(1.05)}}
.card-t{{font-family:'Instrument Serif',Georgia,serif;font-size:26px;line-height:1.08}}
.card-p{{font-size:15px;line-height:1.5;opacity:.88;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
.card-m{{font-family:'Ubuntu Mono',monospace;font-size:12px;opacity:.75}}
.more{{align-self:flex-start;font-family:'Anton',Impact,sans-serif;font-size:20px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border-bottom:3px solid {MIST};padding-bottom:2px}}
.chips{{display:flex;flex-wrap:wrap;gap:8px}}
.chip{{padding:6px 12px;border:1px solid rgba(237,239,242,.55);border-radius:999px;font-family:'Ubuntu Mono',monospace;font-size:12px}}
.mail{{display:inline-flex;align-items:center;gap:14px;padding:0;border:0;background:none;color:inherit;cursor:pointer;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(28px,3.4vw,52px);border-bottom:3px solid {MIST}}}
.mail-ok{{font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:{PAPER};color:{INK};opacity:0;transition:opacity .25s}}
.mail.ok .mail-ok{{opacity:1}}
.socials{{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}}
.socials a{{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid rgba(237,239,242,.6);border-radius:999px;text-decoration:none;font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.05em}}
.socials a:hover{{background:{PAPER};color:{INK}}}
.fine{{margin:6px 0 0;font-family:'Ubuntu Mono',monospace;font-size:12px;opacity:.7}}
.ruler{{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;justify-content:space-between;align-items:flex-end;padding:0 clamp(18px,4vw,60px) 26px;height:72px;pointer-events:none;background:linear-gradient(to top,var(--bg) 55%,transparent)}}
.v2:not(.live) .ruler{{display:none}}
.ruler-ticks{{position:absolute;left:clamp(18px,4vw,60px);right:clamp(18px,4vw,60px);bottom:10px;height:10px;background:repeating-linear-gradient(90deg,rgba(237,239,242,.55) 0 1px,transparent 1px 9px)}}
.ruler-now{{position:absolute;bottom:8px;left:calc(clamp(18px,4vw,60px) + (100% - 2 * clamp(18px,4vw,60px)) * var(--prog,0));width:2px;height:20px;background:{PAPER};transition:left .15s linear}}
.ruler button{{pointer-events:auto;position:relative;border:0;background:none;color:inherit;padding:4px 2px 10px;font-family:'Anton',Impact,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.55;cursor:pointer}}
.ruler button.on{{opacity:1}}
.ruler button:focus-visible{{outline:2px solid {PAPER};outline-offset:2px}}
@media (max-height:860px) and (min-width:641px){{.pix.xl{{--s:3}}.pix.lg{{--s:2.5}}.pix.md{{--s:2}}.pix.face{{--s:3}}.pix.face.sm{{--s:2.5}}}}
@media (max-width:960px){{
.row{{flex-direction:column;align-items:flex-start}}
.minis{{grid-template-columns:minmax(0,1fr)}}
.head-row{{flex-direction:column;align-items:flex-start}}
.pix.xl,.pix.lg{{--s:3}}
}}
@media (max-width:640px){{
.badge{{display:none}}
.nav{{gap:12px;font-size:12px}}
.top{{flex-wrap:wrap;gap:8px 14px}}
.scene{{padding:130px 20px 130px}}
.pix.xl,.pix.lg{{--s:2.5}}
.pix.md,.pix.face{{--s:2}}
.ruler button{{display:none}}
.ruler button.on{{display:block;position:absolute;left:50%;transform:translateX(-50%)}}
.cards{{grid-auto-columns:minmax(240px,78vw)}}
}}
@media (prefers-reduced-motion:reduce){{.pix img{{animation:none}}.big .l{{transition:none}}.v2.live{{transition:none}}}}
'''

SCRIPT = r'''class Component extends DCLogic {
  componentDidMount() { this.v2Start(0); }
  componentWillUnmount() { clearTimeout(this.v2T); if (this.v2Off) this.v2Off(); }
  // The scroll story: background colour per chapter, a chapter ruler, letters that settle as a scene
  // reaches the middle of the screen, drag to scroll card rows, click to copy the email.
  // Inside a frame (the design canvas) the page stays static: each scene keeps its own colour.
  v2Start(tries) {
    const root = document.querySelector('[data-v2]');
    if (!root) { if (tries < 40) this.v2T = setTimeout(() => this.v2Start(tries + 1), 100); return; }
    if (this.v2On) return;
    this.v2On = true;
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };
    on(document, 'click', (e) => {
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      const go = t.closest('[data-go]');
      if (go) {
        const s = document.getElementById(go.getAttribute('data-go'));
        if (s) { e.preventDefault(); s.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }); }
        return;
      }
      const cp = t.closest('[data-copy]');
      if (cp) {
        const v = cp.getAttribute('data-copy');
        const done = () => { cp.classList.add('ok'); clearTimeout(cp.__t); cp.__t = setTimeout(() => cp.classList.remove('ok'), 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => { location.href = 'mailto:' + v; });
        else location.href = 'mailto:' + v;
        return;
      }
      if (this.v2Dragged && t.closest('[data-drag]')) { e.preventDefault(); this.v2Dragged = false; }
    }, true);
    // drag to scroll the card rows with a mouse
    let drag = null;
    on(document, 'pointerdown', (e) => {
      const row = e.target.closest && e.target.closest('[data-drag]');
      if (!row || e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { row: row, x: e.clientX, left: row.scrollLeft, moved: 0 };
    }, true);
    on(window, 'pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      if (drag.moved > 4) { drag.row.classList.add('drag'); drag.row.scrollLeft = drag.left - dx; }
    }, true);
    on(window, 'pointerup', () => {
      if (!drag) return;
      this.v2Dragged = drag.moved > 4;
      drag.row.classList.remove('drag');
      drag = null;
    }, true);
    this.v2Off = () => offs.forEach((f) => f());
    if (framed) return;
    root.classList.add('live');
    const scenes = Array.from(root.querySelectorAll('[data-scene]'));
    const btns = Array.from(root.querySelectorAll('.ruler [data-go]'));
    let cur = -1, raf = 0;
    const tick = () => {
      raf = 0;
      const h = window.innerHeight || 800;
      let c = 0;
      scenes.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        if (r.top < h * 0.55) c = i;
        if (!still) {
          const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - h / 2) / h));
          s.style.setProperty('--k', (0.35 + Math.abs(p) * 1.9).toFixed(3));
        }
      });
      if (c !== cur) {
        cur = c;
        root.style.setProperty('--bg', scenes[c].getAttribute('data-bg'));
        btns.forEach((b, i) => { b.classList.toggle('on', i === c); if (i === c) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      }
      const max = Math.max(1, document.documentElement.scrollHeight - h);
      root.style.setProperty('--prog', Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4));
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(tick); };
    on(window, 'scroll', ask, { passive: true });
    on(window, 'resize', ask, { passive: true });
    tick();
  }
  renderVals() { return {}; }
}'''

head = MAIN[:MAIN.index('<x-dc>')]
head = head.replace('<title>GelasTinta · Home</title>', '<title>GelasTinta · Home v2 (prototype)</title>')
page = (head + '<x-dc>\n<helmet>\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link href="https://fonts.googleapis.com/css2?family=Anton&amp;family=Instrument+Serif:ital@0;1&amp;family=Titillium+Web:ital,wght@0,400;0,600;0,700;1,400&amp;family=Ubuntu+Mono:ital,wght@0,400;0,700;1,400&amp;display=swap" rel="stylesheet">\n'
        '<meta name="robots" content="noindex">\n'
        f'<style>{CSS}</style>\n</helmet>\n{body}\n</x-dc>\n'
        '<script type="text/x-dc" data-dc-script data-props=\'{"$preview":{"width":1440,"height":7600}}\'>\n'
        + SCRIPT + '\n</script>\n</body>\n</html>\n')
open(os.path.join(ROOT, 'src/pages/Home-v2.dc.html'), 'w').write(page)
print('written', len(page), 'talks', n_talks, 'cards', len(cards))
