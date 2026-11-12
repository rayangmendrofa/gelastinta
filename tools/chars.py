# GelasTinta pixel character (owner's sprite sheets, v2: 76 x 58 px frames, transparent, one row
# per move) placed straight on the pages: no card, no caption, it stands on the page's own lines
# and blends with each page's palette. It breathes and blinks (idle), acts out its move by itself
# every few seconds, and plays the move at once on hover or tap. CSS only: steps() over the
# sheets, image-rendering: pixelated, still under reduced motion.
#
# Index pages (no comments, so src/pages == canvas copy):
#   Home      About            hoodie   pour      stands at the end of the About text
#   Talks     hero (dark)      labcoat  teach     writes F = ma on a board
#   Projects  hero             labcoat  inspect   stands on top of the "On this page" card
#   Products  Services menu    suit     present   in the menu head
#   Author    hero             hoodie wave, labcoat eureka, suit tie, standing on one line
#   404       build.mjs        hoodie   sad       (markup lives in build.mjs)
# Talk articles (comment pages: the canvas copy differs from src/pages in the comments code, so
# these are changed on the canvas with edit_version using the edits this script writes):
#   one story beat beside the opening paragraph of a section (BEATS below)
#
# Usage:
#   python3 tools/chars.py                 rewrite index pages in src/pages (from the pristine
#                                          copies in git a9326b0) and add beats to talk pages
#   python3 tools/chars.py --edits DIR     also write DIR/<page>.json: [{old_text,new_text}] for
#                                          edit_version on the canvas copy of each talk page
import json, os, re, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PAGES = os.path.join(ROOT, 'src', 'pages')
PRISTINE = 'a9326b0'   # index pages before any character work

ID = {
    'hoodie-idle': '4c1e039267cfd582c0ee4d5930f6998b', 'hoodie-pour': 'cf0cbbc176dcedea4a1c0d45350432cf',
    'hoodie-wave': '723c80f6c3239c1eb034218c7a3249a4', 'hoodie-sad': 'aac8e546325c530b66d6b529ada318e5',
    'hoodie-thinking': 'e88a75bea0e274305b8af51e265cba31', 'hoodie-surprised': '8fd913bdbee174cb92b497d3321baed6',
    'hoodie-happy': 'c86bf217f8e4735869fc0fcabfe44c9f',
    'labcoat-idle': '0adff87b8a0ce54aa1d503767bf28772', 'labcoat-teach': '5693ad8832d1d2ead719089b76f76150',
    'labcoat-inspect': 'abb3bf9b38e58b145b90221cfdc2e9b2', 'labcoat-eureka': 'cecfa839f65d924244169b8f91ad87c7',
    'labcoat-thinking': '1777a946f341b1e9e5f78755bd62c712', 'labcoat-surprised': '53e81a4090d6abadcee60c255bdd74ad',
    'labcoat-walk': '2ac8f04301980f265efc51c1c861396a',
    'suit-idle': '36e3f4b4d1181d7f9e6ca9560d607250', 'suit-present': 'd307f3fd9e458bd63d3e69b9eaa671d5',
    'suit-tie': 'e150c57115cd2ff61d3381f954a77a39',
}
# frames, ms per frame (owner's README)
MOVE = {'idle': (8, 160), 'pour': (11, 150), 'wave': (7, 150), 'sad': (10, 200), 'teach': (12, 220),
        'inspect': (10, 180), 'eureka': (10, 170), 'present': (12, 200), 'tie': (8, 170),
        'thinking': (10, 220), 'surprised': (8, 150), 'happy': (8, 130), 'walk': (4, 140)}
IDLE_MS = MOVE['idle'][0] * MOVE['idle'][1]
# rightmost drawn pixel per sheet (measured): the view is cropped to the body plus its props
RIGHT = {'hoodie-idle': 32, 'hoodie-pour': 42, 'hoodie-wave': 32, 'hoodie-sad': 32, 'hoodie-thinking': 37,
         'hoodie-surprised': 34, 'hoodie-happy': 37, 'labcoat-idle': 31, 'labcoat-teach': 70,
         'labcoat-inspect': 39, 'labcoat-eureka': 34, 'labcoat-thinking': 37, 'labcoat-surprised': 34,
         'labcoat-walk': 31, 'suit-idle': 31, 'suit-present': 70, 'suit-tie': 31}

BASE_CSS = '''.px{--s:3;--w:76;position:relative;display:inline-block;flex:none;width:calc(var(--w)*1px*var(--s));height:calc(58px*var(--s));cursor:pointer;-webkit-tap-highlight-color:transparent}
.px::after{content:"";position:absolute;left:calc(4px*var(--s));width:calc(30px*var(--s));bottom:calc(-1.5px*var(--s));height:calc(4px*var(--s));background:radial-gradient(closest-side,rgba(16,19,28,.2),rgba(16,19,28,0));pointer-events:none}
.px-v{position:absolute;inset:0;overflow:hidden;z-index:1}
.px-v img{display:block;width:calc(var(--n)*76px*var(--s));max-width:none;height:100%;image-rendering:crisp-edges;image-rendering:pixelated;animation:px-run var(--t) steps(var(--n)) infinite;pointer-events:none;user-select:none;-webkit-user-drag:none}
@keyframes px-run{to{transform:translateX(-100%)}}
.px-am{visibility:hidden}
.px-hm{display:none}
.px:hover .px-ai,.px:hover .px-am{display:none}
.px:hover .px-hm{display:block}
.dark .px{filter:drop-shadow(0 0 1px rgba(244,242,238,.85)) drop-shadow(0 0 4px rgba(244,242,238,.25))}
.dark .px::after{background:radial-gradient(closest-side,rgba(244,242,238,.16),rgba(244,242,238,0))}
html[data-theme="dark"] .px:not(.dark .px){filter:drop-shadow(0 0 1px rgba(16,19,28,.95)) drop-shadow(0 0 4px rgba(16,19,28,.35))}
.px-row{display:grid;grid-template-columns:minmax(0,820px) auto;gap:56px;align-items:end}
.px-row>.px{margin-bottom:6px}
.px-side{display:flex;flex-direction:column;align-items:stretch}
.px-side>.px{align-self:flex-end;margin:0 28px calc(-1.5px*var(--s)) 0;z-index:2}
.px-lineup{display:flex;align-items:flex-end;gap:28px;width:max-content;max-width:100%;padding:0 10px;border-bottom:1px solid currentColor;margin-top:4px}
.px-lineup .px{--s:2;margin-bottom:calc(-1.5px*var(--s))}
.px-lineup .px::after{display:none}
.menu-head .px{margin-top:8px}
.px-beat{float:right;--s:2;margin:6px 0 14px 28px}
@media (max-width:960px){.px-row{grid-template-columns:minmax(0,1fr);gap:20px}.px-row>.px{justify-self:start}}
@media (max-width:640px){.px{--s:2}.px-lineup .px{--s:1.6}.px-lineup{gap:18px}.px-beat{--s:1.6;margin:4px 0 8px 16px}}
@media (prefers-reduced-motion:reduce){.px-v img,.px-ai,.px-am{animation:none}}'''


def cycle(move):
    """Per-move CSS: idle k times, then the move once, on one shared clock."""
    n, ms = MOVE[move]
    m = n * ms
    k = max(2, round(4800 / IDLE_MS))
    c = IDLE_MS * k + m
    p = round(100 * IDLE_MS * k / c, 3)
    key = f'{move}'
    return (f'.pxc-{key} .px-ai{{animation:pxvi-{key} {c}ms step-end infinite}}\n'
            f'.pxc-{key} .px-am{{animation:pxvm-{key} {c}ms step-end infinite}}\n'
            f'.pxc-{key} .px-am img{{animation:pxr-{key} {c}ms infinite}}\n'
            f'@keyframes pxvi-{key}{{0%{{visibility:visible}}{p}%,100%{{visibility:hidden}}}}\n'
            f'@keyframes pxvm-{key}{{0%{{visibility:hidden}}{p}%,100%{{visibility:visible}}}}\n'
            f'@keyframes pxr-{key}{{0%{{transform:translateX(0);animation-timing-function:step-end}}'
            f'{p}%{{transform:translateX(0);animation-timing-function:steps({n},end)}}100%{{transform:translateX(-100%)}}}}')


def css_for(moves):
    return '/* px:start */\n' + BASE_CSS + '\n' + '\n'.join(cycle(m) for m in sorted(set(moves))) + '\n/* px:end */'


def sprite(outfit, move, label, cls=''):
    def view(kind, name):
        n, ms = MOVE[name]
        return (f'<span class="px-v px-{kind}" style="--n:{n};--t:{n * ms}ms">'
                f'<img src="/_blob/{ID[outfit + "-" + name]}" alt="" draggable="false"></span>')
    c = f' {cls}' if cls else ''
    w = max(RIGHT[outfit + '-idle'], RIGHT[outfit + '-' + move]) + 4
    return (f'<span class="px pxc-{move}{c}" style="--w:{w}" role="img" aria-label="{label}">'
            + view('ai', 'idle') + view('am', move) + view('hm', move) + '</span>')


def put_css(s, moves):
    block = css_for(moves)
    if '/* px:start */' in s:
        return re.sub(r'/\* px:start \*/.*?/\* px:end \*/', lambda m: block, s, flags=re.S)
    i = s.index('</style>')
    return s[:i] + block + '\n' + s[i:]


def one(s, old, new):
    assert s.count(old) == 1, (old[:60], s.count(old))
    return s.replace(old, new)


# ---- index pages ---------------------------------------------------------------------------
HOME = sprite('hoodie', 'pour', 'The GelasTinta pixel character in a hoodie, pouring ink from a beaker')
TALKS = sprite('labcoat', 'teach', 'The GelasTinta pixel character in a lab coat, writing F = ma on a board and explaining it')
PROJ = sprite('labcoat', 'inspect', 'The GelasTinta pixel character in a lab coat, holding a beaker up to the light while bubbles rise')
PROD = sprite('suit', 'present', 'The GelasTinta pixel character in a suit, presenting a growing bar chart')
TRIO = ('<div class="px-lineup">'
        + sprite('hoodie', 'wave', 'The GelasTinta pixel character in a hoodie, waving hello')
        + sprite('labcoat', 'eureka', 'The GelasTinta pixel character in a lab coat, thinking and then jumping with a lightbulb')
        + sprite('suit', 'tie', 'The GelasTinta pixel character in a suit, adjusting his tie')
        + '</div>')


def main_page(s):
    s = put_css(s, ['pour'])
    s = one(s, '<section class="sec">\n<div class="wrap">\n<div class="stack g16" style="max-width:820px">\n<p class="kicker">01 — About</p>',
            '<section class="sec">\n<div class="wrap">\n<div class="px-row">\n<div class="stack g16" style="max-width:820px">\n<p class="kicker">01 — About</p>')
    end = 'but to ask better questions.</p>\n</div>\n</div>\n</div>\n</section>'
    return one(s, end, 'but to ask better questions.</p>\n</div>\n</div>\n' + HOME + '\n</div>\n</div>\n</section>')


def talks_page(s):
    s = put_css(s, ['teach'])
    old = '<h1 class="t-hero">Talks</h1>\n<p class="meta muted">logic ⇄ laughter</p>\n</div>'
    return one(s, old, old.replace('</p>\n</div>', '</p>\n' + TALKS + '\n</div>'))


def projects_page(s):
    s = put_css(s, ['inspect'])
    old = '<nav class="card jump stack g16" aria-label="On this page" style="align-self:end">'
    s = one(s, old, '<div class="px-side" style="align-self:end">\n' + PROJ + '\n<nav class="card jump stack g16" aria-label="On this page">')
    a = s.index('<div class="px-side"')
    b = s.index('</nav>', a) + len('</nav>')
    return s[:b] + '\n</div>' + s[b:]


def products_page(s):
    s = put_css(s, ['present'])
    old = '<p class="menu-legend">Prices from · USD, then Rupiah · time to deliver</p>\n</header>'
    return one(s, old, old.replace('</p>\n</header>', '</p>\n' + PROD + '\n</header>'))


def author_page(s):
    s = put_css(s, ['wave', 'eureka', 'tie'])
    # the kit's hover labels at the right edge made the page scroll sideways on phones
    s = s.replace('/* px:end */', '#expertise{overflow-x:clip}\n/* px:end */')
    a = s.index('<h1 class="t-title">Rayang Termedate Mendrofa</h1>')
    b = s.index('<div class="prose intro">', a)
    c = s.index('</div>', b) + len('</div>')
    return s[:c] + '\n' + TRIO + s[c:]


INDEX = {'Main.dc.html': main_page, 'Talks.dc.html': talks_page, 'Projects.dc.html': projects_page,
         'Products.dc.html': products_page, 'Author.dc.html': author_page}

# ---- talk articles: (page, heading markup the sprite follows, outfit, move, label) ---------------
H2 = '<h2 class="t-h2" style="margin:12px 0 18px">{}</h2>'
BEATS = [
    ('Talk-CacioPepe.dc.html', H2.format('So, how did they actually prove it?'), 'labcoat', 'thinking', 'The GelasTinta pixel character in a lab coat, hand on chin, thinking'),
    ('Talk-Salmon.dc.html', H2.format('It matters? How?'), 'hoodie', 'surprised', 'The GelasTinta pixel character in a hoodie, jumping back in surprise'),
    ('Talk-Necro.dc.html', H2.format('Why a spider?'), 'labcoat', 'surprised', 'The GelasTinta pixel character in a lab coat, jumping back in surprise'),
    ('Talk-ProjectHailMary.dc.html', H2.format('First contact, without the horror'), 'hoodie', 'wave', 'The GelasTinta pixel character in a hoodie, waving hello'),
    ('Talk-DreamPuzzles.dc.html', H2.format('How do you talk to someone who is dreaming?'), 'hoodie', 'thinking', 'The GelasTinta pixel character in a hoodie, hand on chin, thinking'),
    ('Talk-DreamPuzzles.dc.html', H2.format('But did it help them solve?'), 'labcoat', 'eureka', 'The GelasTinta pixel character in a lab coat, thinking and then jumping with a lightbulb'),
    ('Talk-ModularLegs.dc.html', H2.format('Break it, and it keeps walking'), 'labcoat', 'walk', 'The GelasTinta pixel character in a lab coat, walking'),
    ('Talk-HairClipFish.dc.html', H2.format('Fish one, snapping versus bending'), 'hoodie', 'happy', 'The GelasTinta pixel character in a hoodie, jumping for joy'),
    ('Talk-FlyConnectome.dc.html', H2.format('Mapping every neuron in a fly brain'), 'labcoat', 'inspect', 'The GelasTinta pixel character in a lab coat, holding a beaker up to the light'),
    ('Talk-NavierStokes.dc.html', '<h3 class="t-h3" style="font-size:26px;margin-bottom:14px">The equation, term by term</h3>', 'labcoat', 'teach', 'The GelasTinta pixel character in a lab coat, writing F = ma on a board'),
    ('Talk-NavierStokes.dc.html', H2.format('Plagiarism and data leak allegations'), 'suit', 'tie', 'The GelasTinta pixel character in a suit, nervously adjusting his tie'),
    ('Talk-Cyberpunk.dc.html', H2.format('Cyberpsychosis is the price of chrome'), 'hoodie', 'sad', 'The GelasTinta pixel character in a hoodie, frowning with a single tear'),
]


def talk_edits(s, beats):
    """Edits (old, new) for one talk page; each old text is unique in the page."""
    edits = []
    i = s.index('</style>')
    j = s.rfind('\n', 0, i - 60)
    old = s[j:i + len('</style>')]
    edits.append((old, old[:-len('</style>')] + css_for([b[3] for b in beats]) + '\n</style>'))
    for _, head, outfit, move, label in beats:
        edits.append((head, head + sprite(outfit, move, label, 'px-beat')))
    for o, _ in edits:
        assert s.count(o) == 1, (o[:70], s.count(o))
    return edits


if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--edits') + 1] if '--edits' in sys.argv else None
    for name, fn in INDEX.items():
        s = subprocess.run(['git', 'show', f'{PRISTINE}:src/pages/{name}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        open(os.path.join(PAGES, name), 'w').write(fn(s))
        print('index:', name)
    by = {}
    for b in BEATS:
        by.setdefault(b[0], []).append(b)
    for name, beats in by.items():
        p = os.path.join(PAGES, name)
        s = open(p).read()
        if '/* px:start */' in s:
            print('talk (already done):', name)
            continue
        edits = talk_edits(s, beats)
        for o, n in edits:
            s = s.replace(o, n)
        open(p, 'w').write(s)
        if out:
            os.makedirs(out, exist_ok=True)
            json.dump([{'old_text': o, 'new_text': n} for o, n in edits], open(os.path.join(out, name + '.json'), 'w'), ensure_ascii=False, indent=1)
        print('talk:', name, len(edits) - 1, 'beat(s)')
