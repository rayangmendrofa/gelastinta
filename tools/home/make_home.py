#!/usr/bin/env python3
"""Build src/pages/Main.dc.html, the Home page as a scroll story.

Eight scenes in the site palette, each a card that slides over the last. The ink flask is the
centrepiece of the first scene, the header and footer are the site's own, and the chapter rail,
ink wipe and walking character come from tools/story.py.

Sources (kept in tools/home/ so the page can be rebuilt):
  classic-main.dc.html  the Home page before the redesign: its styles, script (flask motion,
                        dark mode, clips), header, footer, flask figure and teardown cards
  cards.json            the Featured works and Latest talks cards (edit here when a talk is added)
Run: python3 tools/home/make_home.py
"""
import html
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
import story  # noqa: E402

C = open(os.path.join(HERE, 'classic-main.dc.html')).read()
CARDS = json.load(open(os.path.join(HERE, 'cards.json')))

VIOLET, TAUPE, OLYMPIC, VANDAR, INK, PAPER, MIST = '#4F4086', '#7A4456', '#5A82B3', '#064F6E', '#10131C', '#EDEFF2', '#8DB0DA'

PX = {
    'read':  ('5e57846f1023308734ee379e7a9f60c8', 16, 2560, 128, 80),
    'rush':  ('0bdd3b0cc4df29182214044820c55db5', 16, 2240, 128, 80),
    'music': ('d2e84f22d868d8739a5351cc3aa8e9e5', 12, 1680, 128, 80),
    'exam':  ('214357d23e3f1d75a0d60cf034b2161a', 16, 2400, 128, 80),
    'rain':  ('5f546531126ecca601b1bd5ebcad7ece', 16, 2880, 128, 80),
    'happy': ('830a7c1fe3e504f0c08301fe92d425c3', 8, 1200, 76, 58),
    'lab':   ('11e2aed629c96b98dcbbc577c17261a4', 8, 1200, 76, 58),
    'pour':  ('cf0cbbc176dcedea4a1c0d45350432cf', 11, 1650, 76, 58),
}


def px(key, label, cls=''):
    i, n, ms, w, h = PX[key]
    return (f'<div class="pix {cls}" role="img" aria-label="{html.escape(label)}" style="--fw:{w};--fh:{h};--n:{n};--t:{ms}ms">'
            f'<img src="/_blob/{i}" alt="" draggable="false"></div>')


def wobble(text, seed, amp=4.0):
    rnd = random.Random(seed)
    out = []
    for word in text.split(' '):
        letters = ''.join(
            f'<span class="l" style="--r:{rnd.uniform(-amp, amp):.1f}deg;--y:{rnd.uniform(-0.05, 0.05):.3f}em">{html.escape(ch)}</span>'
            for ch in word)
        out.append(f'<span class="w">{letters}</span>')
    return ' '.join(out)


def big(tag, text, seed, cls='', amp=4.0, extra=''):
    return f'<{tag} class="big {cls}" data-st-w="" aria-label="{html.escape(text)}"{extra}><span aria-hidden="true">{wobble(text, seed, amp)}</span></{tag}>'


def stars(seed, n=7):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.choice([rnd.uniform(2, 12), rnd.uniform(88, 97)])
        y, sz, o = rnd.uniform(8, 90), rnd.choice([10, 14, 18, 24]), rnd.choice([.5, .7, .9])
        out.append(f'<svg class="star" style="left:{x:.1f}%;top:{y:.1f}%;width:{sz}px;height:{sz}px;opacity:{o}" viewBox="0 0 20 20" aria-hidden="true">'
                   '<path d="M10 0C10.8 6.6 13.4 9.2 20 10C13.4 10.8 10.8 13.4 10 20C9.2 13.4 6.6 10.8 0 10C6.6 9.2 9.2 6.6 10 0Z" fill="currentColor"/></svg>')
    return ''.join(out)


def card(c):
    fit = 'contain' if 'contain' in c['style'] else 'cover'
    return (f'<a class="hcard" href="{c["href"]}"><span class="hcard-img" style="background:{c["bg"]}">'
            f'<img src="/_blob/{c["img"]}" alt="{c["alt"]}" loading="lazy" style="object-fit:{fit}"></span>'
            f'<span class="hcard-k">{c["kicker"]}</span><span class="hcard-t">{c["title"]}</span>'
            f'<span class="hcard-p">{c["p"]}</span><span class="hcard-m">{c["meta"]}</span></a>')


def scene(id_, label, colour, inner, cls='', extra=''):
    sid = ' id="main"' if id_ == 'hello' else f' id="{id_}"'
    return (f'<section{sid} class="sec scene {cls}" data-st-ch="{label}" data-st-bg="{colour}" style="--sb:{colour};background:{colour}"{extra}>\n'
            f'{stars(len(id_) * 7 + ord(id_[0]))}\n{inner}\n</section>')


def grab(pattern):
    m = re.search(pattern, C, re.S)
    if not m:
        raise SystemExit('not found in classic Home: ' + pattern[:60])
    return m.group(0)


header = grab(r'<a class="skip-link".*?</header>')
footer = grab(r'<footer class="site-foot dark">.*?</footer>')
flask = grab(r'<figure class="hero-vessel flask">.*?</figure>')
show = grab(r'<div class="show-grid">.*?</a></div>')
bars = ''.join(
    f'<a class="tbar" href="{h}"><span class="tbar-k">{k}</span><span class="tbar-t">{t}</span><span class="tbar-go">Open the 3D model →</span></a>'
    for h, k, t in re.findall(r'<a class="show-card" href="([^"]+)">.*?<span class="kicker">([^<]*)</span><span class="show-t">([^<]*)</span>', show, re.S))
works = ''.join(card(c) for c in CARDS if c['shelf'] == 'works')
talks = ''.join(card(c) for c in CARDS if c['shelf'] == 'latest')
build = open(os.path.join(ROOT, 'build.mjs')).read()
n_talks = len(re.findall(r"'Talk-\w+\.dc\.html': '/talks/", build))

PACKS = ['TH · Thermodynamics', 'RB · Robotics', 'T · Mechanics', 'VA · Vibration', 'CE · Control', 'E · Electronics',
         'FE · Computational', 'M · Materials', 'EM · Engineering Maths', 'AM · Advanced Materials']

S = []
S.append(scene('hello', 'Hello', VIOLET, f'''<div class="hello">
<div class="hello-text">
<p class="over">Gelas · glass &nbsp;/&nbsp; Tinta · ink</p>
{big('h1', 'Ideas in Ink', 11)}
<p class="serif">A metaphorical vessel where ideas flow like ink, shaped by structure yet free in spirit.</p>
<div class="hello-me">{px('pour', 'Pixel character: the GelasTinta character in his hoodie lifts a beaker and pours ink into a puddle', 'face pour')}<p class="cue">Scroll to step inside ↓</p></div>
</div>
{flask}
</div>'''))

S.append(scene('hi', 'Hi', TAUPE, f'''<div class="row">
<div class="stack-l">
{big('h2', "Hi, I'm Rayang.", 22, 'huge', 6)}
<svg class="squiggle" viewBox="0 0 300 24" aria-hidden="true"><path d="M2 12 C 27 0, 52 24, 77 12 S 127 0, 152 12 S 202 24, 227 12 S 277 0, 298 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>
<p class="serif">A mechanical engineer with a passion for turning ideas into reality.</p>
<p class="mono-l">BEng · University of Exeter · 2023 &nbsp;/&nbsp; MSc · University College London · 2025</p>
<a class="more" href="Author.dc.html">More about me →</a>
</div>
{px('happy', 'Pixel portrait: the GelasTinta character in his hoodie, smiling', 'face')}
</div>'''))

S.append(scene('apart', 'Take apart', OLYMPIC, f'''<div class="stack-c wide">
<p class="over">Take it apart</p>
{big('h2', 'See how it works.', 33)}
<p class="serif"><i>From the inside.</i> Every model runs on the numbers from the work behind it.</p>
{px('rush', 'Pixel scene: the GelasTinta character typing fast against a deadline, a progress bar filling, then leaning back relieved', 'md')}
<div class="tbars">{bars}</div>
</div>'''))

S.append(scene('builds', 'Builds', VANDAR, f'''<div class="st-hpin stack-l wide">
<div class="head-row"><div><p class="over">Dissertations, builds and industry projects</p>{big('h2', 'Featured works.', 44)}</div>{px('lab', 'Pixel portrait: the GelasTinta character in his lab coat, looking determined', 'face sm')}</div>
<div class="cards" data-st-x="" tabindex="0" aria-label="Featured works">{works}</div>
<a class="more" href="Projects.dc.html">All projects →</a>
</div>''', 'xs'))

S.append(scene('talks', 'Talks', INK, f'''<div class="st-hpin stack-l wide">
<div class="head-row"><div><p class="over">Talks · science and engineering, reviewed</p>{big('h2', f'{n_talks} talks.', 55)}<p class="serif">What’s new?</p></div>{px('read', 'Pixel scene: the GelasTinta character reading at his desk, turning pages until an idea lights up', 'sm')}</div>
<div class="cards" data-st-x="" tabindex="0" aria-label="Latest talks">{talks}</div>
<a class="more" href="Talks.dc.html">All talks →</a>
</div>''', 'xs'))

S.append(scene('beliefs', 'Beliefs', VIOLET, f'''<div class="stack-c">
<blockquote class="quote"><p>“The highest forms of understanding we can achieve are laughter and human compassion.”</p><footer>Richard P. Feynman</footer></blockquote>
<p class="lede">Much of how I think was shaped by Richard Feynman. It reminds me that science doesn’t have to be cold: the best ideas make people smile and bring them closer.</p>
{px('music', 'Pixel scene: the GelasTinta character with headphones on, eyes closed, nodding along to music', 'md')}
</div>'''))

S.append(scene('packs', 'Packs', TAUPE, f'''<div class="row">
<div class="stack-l">
<p class="over">Products</p>
{big('h2', 'Study packs.', 77)}
<p class="serif">Each pack opens with a free first sheet. The teardowns sit inside the full pack.</p>
<div class="chips">{''.join(f'<span class="chip">{p}</span>' for p in PACKS)}</div>
<a class="more" href="Products.dc.html">See the study packs →</a>
</div>
{px('exam', 'Pixel scene: the GelasTinta character writing an exam nervously, getting stuck, pushing through and showing off an A plus', 'md')}
</div>'''))

CSS = f'''
.v2{{--vh:9px}}
html.st-live .v2{{--vh:1vh}}
.v2::after{{content:"";position:fixed;inset:0;pointer-events:none;z-index:40;opacity:.05;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}}
.v2 .scene{{position:relative;min-height:820px;display:flex;align-items:center;justify-content:center;padding:96px clamp(20px,5vw,80px) 110px;color:{PAPER}}}
html.st-live .v2 .scene{{min-height:calc(100vh - var(--st-top))}}
.v2 .scene.xs{{align-items:flex-start}}
.v2 .scene :is(p,h1,h2,blockquote,footer){{color:inherit}}
.v2 .star{{position:absolute;color:{PAPER};pointer-events:none}}
.v2 .hello{{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,4.6fr) minmax(0,7.4fr);gap:clamp(16px,3vw,48px);align-items:center;width:100%;max-width:1320px}}
.v2 .hello-text{{display:flex;flex-direction:column;gap:clamp(12px,2.2vh,22px)}}
.v2 .hello-me{{display:flex;align-items:flex-end;gap:18px}}
.v2 .hello .hero-vessel.flask{{max-width:none;justify-self:center;width:100%}}
.v2 .hello .hero-vessel.flask svg{{max-width:760px;max-height:calc(var(--vh) * 66);margin:0 auto;display:block}}
.v2 .hello .hero-vessel figcaption{{max-width:760px;margin:0 auto;font-family:'Ubuntu Mono',monospace;font-size:11px;letter-spacing:.1em;opacity:.8}}
.v2 .stack-c{{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(12px,2.2vh,22px);max-width:1100px;width:100%}}
.v2 .stack-c.wide{{max-width:1240px}}
.v2 .stack-l{{position:relative;z-index:2;display:flex;flex-direction:column;gap:18px;max-width:760px}}
.v2 .stack-l.wide{{max-width:1240px;width:100%}}
.v2 .row{{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:clamp(24px,5vw,80px);width:100%;max-width:1240px}}
.v2 .head-row{{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}}
.v2 .over{{margin:0;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:clamp(20px,2vw,28px);opacity:.92}}
.v2 .big{{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;font-size:clamp(54px,min(10.5vw,calc(var(--vh) * 16)),180px);line-height:.9;letter-spacing:.005em;color:{PAPER}}}
.v2 .hello .big{{font-size:clamp(54px,min(8.4vw,calc(var(--vh) * 16)),150px)}}
.v2 .big.huge{{font-size:clamp(58px,min(11.5vw,calc(var(--vh) * 18)),200px)}}
.v2 .big .w{{display:inline-block;white-space:nowrap}}
.v2 .big .l{{display:inline-block;transform:translateY(calc(var(--y) * var(--k,1))) rotate(calc(var(--r) * var(--k,1)));transition:transform .2s linear}}
.v2 .serif{{margin:0;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(24px,min(2.6vw,calc(var(--vh) * 4.4)),40px);line-height:1.12;max-width:26ch}}
.v2 .stack-c .serif{{max-width:40ch}}
.v2 .lede{{margin:0;font-size:clamp(18px,1.6vw,21px);max-width:56ch;opacity:.94}}
.v2 .mono-l,.v2 .cue{{margin:0;font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}}
.v2 .squiggle{{width:min(300px,60%);height:24px;color:{MIST}}}
.v2 .quote{{margin:0;max-width:min(1000px,100%)}}
.v2 .quote p{{margin:0;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(34px,min(4.6vw,calc(var(--vh) * 7.4)),76px);line-height:1.04}}
.v2 .quote footer{{margin-top:18px;font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85}}
.v2 .pix{{--s:3;position:relative;width:calc(var(--fw) * 1px * var(--s));height:calc(var(--fh) * 1px * var(--s));overflow:hidden;flex:none;border-radius:6px;box-shadow:0 0 0 3px rgba(237,239,242,.85),0 18px 40px rgba(16,19,28,.35)}}
.v2 .pix img{{display:block;height:100%;width:calc(var(--n) * 100%);max-width:none;image-rendering:pixelated;image-rendering:crisp-edges;animation:hm-px var(--t) steps(var(--n)) infinite}}
@keyframes hm-px{{to{{transform:translateX(-100%)}}}}
.v2 .pix.md{{--s:3}}
.v2 .pix.sm{{--s:2}}
.v2 .pix.face{{--s:3;border-radius:50%;box-shadow:0 0 0 3px rgba(237,239,242,.85);background:rgba(237,239,242,.12)}}
.v2 .pix.face.sm{{--s:2}}
.v2 .pix.pour{{border-radius:12px}}
.v2 .tbars{{display:flex;flex-direction:column;width:100%;max-width:880px;margin-top:4px;border-top:1px solid rgba(237,239,242,.4)}}
.v2 .tbar{{display:grid;grid-template-columns:minmax(0,13em) minmax(0,1fr) auto;align-items:baseline;gap:18px;padding:14px 4px;border-bottom:1px solid rgba(237,239,242,.4);text-decoration:none;color:{PAPER};text-align:left;transition:background-color .25s,padding .25s}}
.v2 .tbar:hover{{background:rgba(16,19,28,.16);padding-left:14px}}
.v2 .tbar-k{{font-family:'Ubuntu Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}}
.v2 .tbar-t{{font-family:'Instrument Serif',Georgia,serif;font-size:clamp(22px,2.2vw,30px);line-height:1.1}}
.v2 .tbar-go{{font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.06em;white-space:nowrap}}
.v2 .cards{{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(280px,340px);gap:22px;overflow-x:auto;padding:8px 2px 18px;scroll-snap-type:x mandatory;scrollbar-width:thin}}
.v2 .cards:focus-visible{{outline:3px solid {MIST};outline-offset:4px}}
.v2 .hcard{{scroll-snap-align:start;display:flex;flex-direction:column;gap:8px;text-decoration:none;color:{PAPER}}}
.v2 .hcard-img{{display:block;aspect-ratio:4/3;border-radius:14px;overflow:hidden;border:2px solid rgba(237,239,242,.85)}}
.v2 .hcard-img img{{display:block;width:100%;height:100%;object-position:50% 50%;transition:transform .5s cubic-bezier(.16,1,.3,1)}}
.v2 .hcard:hover .hcard-img img{{transform:scale(1.05)}}
.v2 .hcard-k{{font-family:'Ubuntu Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}}
.v2 .hcard-t{{font-family:'Instrument Serif',Georgia,serif;font-size:26px;line-height:1.08}}
.v2 .hcard-p{{font-size:15px;line-height:1.5;opacity:.88;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
.v2 .hcard-m{{font-family:'Ubuntu Mono',monospace;font-size:12px;opacity:.75}}
.v2 .more{{align-self:flex-start;font-family:'Anton',Impact,sans-serif;font-size:20px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:{PAPER};border-bottom:3px solid {MIST};padding-bottom:2px}}
.v2 .chips{{display:flex;flex-wrap:wrap;gap:8px}}
.v2 .chip{{padding:6px 12px;border:1px solid rgba(237,239,242,.55);border-radius:999px;font-family:'Ubuntu Mono',monospace;font-size:12px;color:{PAPER};background:none}}
.v2 .mail{{display:inline-flex;align-items:center;gap:14px;padding:0;border:0;background:none;color:inherit;cursor:pointer;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(28px,3.4vw,52px);border-bottom:3px solid {MIST}}}
.v2 .mail-ok{{font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:{PAPER};color:{INK};opacity:0;transition:opacity .25s}}
.v2 .mail.ok .mail-ok{{opacity:1}}
.v2 .socials{{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}}
.v2 .socials a{{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid rgba(237,239,242,.6);border-radius:999px;text-decoration:none;color:{PAPER};font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.05em}}
.v2 .socials a:hover{{background:{PAPER};color:{INK}}}
@media (max-width:960px){{
.v2 .hello{{grid-template-columns:minmax(0,1fr)}}
.v2 .hello .hero-vessel.flask{{order:-1}}
.v2 .row{{flex-direction:column;align-items:flex-start}}
.v2 .head-row{{flex-direction:column;align-items:flex-start}}
.v2 .tbar{{grid-template-columns:minmax(0,1fr)}}
}}
@media (max-width:640px){{
.v2 .scene{{padding:72px 18px 96px}}
.v2 .pix.md{{--s:2.4}}
.v2 .pix.face{{--s:2}}
.v2 .cards{{grid-auto-columns:minmax(240px,78vw)}}
.v2 .hello .gt-call text{{font-size:15px}}
}}
@media (prefers-reduced-motion:reduce){{.v2 .pix img{{animation:none}}.v2 .big .l{{transition:none}}}}
'''

FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Anton&amp;family=Instrument+Serif:ital@0;1&amp;'
         'display=swap" rel="stylesheet">')



head = C[:C.index('</helmet>')]
head = head.replace('</helmet>', '')
head += FONTS + '\n<style>' + CSS + '</style>\n'
body = ('</helmet>\n<div style="min-height:100vh" data-gt-root="" class="v2">\n' + header + '\n\n' + '\n\n'.join(S) +
        '\n\n' + footer + '\n\n</div>\n</x-dc>')
script = C[C.index('</x-dc>') + len('</x-dc>'):]
page = story.core(story.footer(head + body + script), story.page_cfg('Main.dc.html', ''))
page = page.replace('"height":', '"height":', 1)
page = re.sub(r'("\$preview":\{"width":1440,"height":)\d+', r'\g<1>7400', page)
open(os.path.join(ROOT, 'src/pages/Main.dc.html'), 'w').write(page)
print('Main.dc.html', len(page), 'talks', n_talks, 'cards', len(CARDS))
