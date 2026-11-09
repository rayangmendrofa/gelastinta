# GelasTinta pixel character (owner's sprite sheets, v2, 76 x 58 px frames) on five canvas pages.
# Each appearance is a paper card: the character idles (breathing, blinking) and plays one move
# on hover, tap or keyboard focus. Pure CSS (steps() over a one row sprite sheet), so it works on
# the canvas and the live site alike, stays crisp (image-rendering: pixelated) and costs ~26 KB.
#
#   Home      About          hoodie   idle -> pour     (ink, the site's name)
#   Talks     hero           labcoat  idle -> teach    (writes F = ma on a board)
#   Projects  hero           labcoat  idle -> inspect  (beaker up to the light)
#   Products  Services menu  suit     idle -> present  (growing bar chart)
#   Author    hero           all three: hoodie wave, labcoat eureka, suit tie
#   404       (build.mjs)    hoodie   sad
#
# Usage: python3 tools/chars.py <folder with the .dc.html pages>   (idempotent)
import os, re, sys

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'src', 'pages')

# canvas asset ids for the sheets (also in src/assets/<id>.png)
ID = {
    'hoodie-idle': '4c1e039267cfd582c0ee4d5930f6998b', 'hoodie-pour': 'cf0cbbc176dcedea4a1c0d45350432cf',
    'hoodie-wave': '723c80f6c3239c1eb034218c7a3249a4', 'hoodie-sad': 'aac8e546325c530b66d6b529ada318e5',
    'labcoat-idle': '0adff87b8a0ce54aa1d503767bf28772', 'labcoat-teach': '5693ad8832d1d2ead719089b76f76150',
    'labcoat-inspect': 'abb3bf9b38e58b145b90221cfdc2e9b2', 'labcoat-eureka': 'cecfa839f65d924244169b8f91ad87c7',
    'suit-idle': '36e3f4b4d1181d7f9e6ca9560d607250', 'suit-present': 'd307f3fd9e458bd63d3e69b9eaa671d5',
    'suit-tie': 'e150c57115cd2ff61d3381f954a77a39',
}
# frames, ms per frame (from the owner's README)
MOVE = {'idle': (8, 160), 'pour': (11, 150), 'wave': (7, 150), 'sad': (10, 200), 'teach': (12, 220),
        'inspect': (10, 180), 'eureka': (10, 170), 'present': (12, 200), 'tie': (8, 170)}

CSS = '''/* px:start */
.px-card{--s:3;display:inline-flex;align-self:flex-start;flex-direction:column;align-items:center;gap:10px;margin:0;padding:14px 18px 12px;background:#F4F2EE;border:1px solid #10131C;box-shadow:4px 4px 0 #10131C;color:#10131C;cursor:pointer;-webkit-tap-highlight-color:transparent}
.px-card:focus-visible{outline:3px solid #5A82B3;outline-offset:4px}
.px{position:relative;display:block;width:calc(76px*var(--s));height:calc(58px*var(--s))}
.px-v{position:absolute;inset:0;overflow:hidden}
.px-v img{display:block;width:calc(var(--n)*100%);max-width:none;height:100%;image-rendering:crisp-edges;image-rendering:pixelated;animation:px-run var(--t) steps(var(--n)) infinite;pointer-events:none;user-select:none;-webkit-user-drag:none}
@keyframes px-run{to{transform:translateX(-100%)}}
.px-move{display:none}
.px-card:hover .px-move,.px-card:focus-visible .px-move{display:block}
.px-card:hover .px-idle,.px-card:focus-visible .px-idle{display:none}
.px-cap{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}
.px-k{font-family:'Ubuntu Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#10131C}
.px-h{font-family:'Ubuntu Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.04em;color:#5B6273}
.px-tap{display:none}
@media (hover:none){.px-hov{display:none}.px-tap{display:inline}}
.px-row{display:grid;grid-template-columns:minmax(0,820px) auto;gap:56px;align-items:start}
.px-row>.px-card{margin-top:44px;transform:rotate(1.5deg)}
.px-trio{display:flex;flex-wrap:wrap;gap:20px;margin-top:4px}
.px-trio .px-card{--s:2;padding:10px 12px 10px}
.px-side{display:flex;flex-direction:column;align-items:flex-start;gap:28px}
.menu-head .px-card{margin-top:10px}
html[data-theme="dark"] .px-card:not(.dark .px-card){filter:invert(1) hue-rotate(180deg)}
html[data-theme="dark"] .px-card:not(.dark .px-card) img{filter:none}
@media (max-width:960px){.px-row{grid-template-columns:minmax(0,1fr);gap:28px}.px-row>.px-card{margin-top:0;justify-self:start}}
@media (max-width:640px){.px-card{--s:2}.px-trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.px-trio .px-card{--s:1.2;align-self:stretch;padding:8px 4px;box-shadow:3px 3px 0 #10131C}.px-trio .px-h{font-size:10px;letter-spacing:0}}
@media (prefers-reduced-motion:reduce){.px-v img{animation:none}}
/* px:end */'''


def sprite(outfit, move, label, kicker, hint, cls=''):
    def view(kind, name):
        n, ms = MOVE[name]
        return (f'<span class="px-v px-{kind}" style="--n:{n};--t:{n * ms}ms">'
                f'<img src="/_blob/{ID[outfit + "-" + name]}" alt="" draggable="false"></span>')
    views = view('idle', 'idle') + (view('move', move) if move else '')
    h = f'<span class="px-h"><span class="px-hov">Hover</span><span class="px-tap">Tap</span> {hint}</span>' if move else ''
    c = f' {cls}' if cls else ''
    return (f'<figure class="px-card{c}" tabindex="0"><span class="px" role="img" aria-label="{label}">{views}</span>'
            f'<figcaption class="px-cap"><span class="px-k">{kicker}</span>{h}</figcaption></figure>')


def once(s, old, new, mark):
    """Replace old with new unless mark is already there."""
    if mark in s:
        return s
    assert s.count(old) == 1, (mark, s.count(old))
    return s.replace(old, new)


def css(s):
    if '/* px:start */' in s:
        return re.sub(r'/\* px:start \*/.*?/\* px:end \*/', lambda m: CSS, s, flags=re.S)
    i = s.index('</style>')
    return s[:i] + CSS + '\n' + s[i:]


def page(name, fn):
    p = os.path.join(D, name)
    s0 = open(p).read()
    s = fn(css(s0))
    if s != s0:
        open(p, 'w').write(s)
        print('chars:', name)


def refresh(s, mark_open, html):
    """Swap an existing card (found by its data mark) for the current markup."""
    return re.sub(r'<figure class="px-card[^"]*" tabindex="0" data-px="' + mark_open + r'">.*?</figure>',
                  lambda m: html, s, flags=re.S)


def tag(html, mark):
    return html.replace('tabindex="0">', f'tabindex="0" data-px="{mark}">', 1)


# ---- Home: About ----------------------------------------------------------------------------
HOME = tag(sprite('hoodie', 'pour', 'The GelasTinta pixel character in a hoodie, pouring ink from a beaker',
                  'Fig. 01 — Meet the character', 'to pour some ink'), 'home')
def main(s):
    s = refresh(s, 'home', HOME)
    old = '<section class="sec">\n<div class="wrap">\n<div class="stack g16" style="max-width:820px">\n<p class="kicker">01 — About</p>'
    new = '<section class="sec">\n<div class="wrap">\n<div class="px-row">\n<div class="stack g16" style="max-width:820px">\n<p class="kicker">01 — About</p>'
    s = once(s, old, new, '<div class="px-row">\n')
    end = '<p>It reminds me that science doesn’t have to be cold: the best ideas make people smile and bring them closer. And over the years, the most valuable thing I have learned is not to answer every question, but to ask better questions.</p>\n</div>\n</div>\n</div>\n</section>'
    s = once(s, end, end.replace('</div>\n</div>\n</div>\n</section>', '</div>\n</div>\n' + HOME + '\n</div>\n</div>\n</section>'), 'data-px="home"')
    return s

# ---- Talks: hero ----------------------------------------------------------------------------
TALKS = tag(sprite('labcoat', 'teach', 'The GelasTinta pixel character in a lab coat, writing F = ma on a board and explaining it',
                   'Fig. 05 — Class is in', 'to start the lesson'), 'talks')
def talks(s):
    s = refresh(s, 'talks', TALKS)
    old = '<h1 class="t-hero">Talks</h1>\n<p class="meta muted">logic ⇄ laughter</p>\n</div>'
    return once(s, old, old.replace('</p>\n</div>', '</p>\n' + TALKS + '\n</div>'), 'data-px="talks"')

# ---- Projects: hero, above "On this page" -----------------------------------------------------
PROJ = tag(sprite('labcoat', 'inspect', 'The GelasTinta pixel character in a lab coat, holding a beaker up to the light while bubbles rise',
                  'Fig. 02 — Quality check', 'to hold it up to the light'), 'projects')
def projects(s):
    s = refresh(s, 'projects', PROJ)
    old = '<nav class="card jump stack g16" aria-label="On this page" style="align-self:end">'
    if 'data-px="projects"' not in s:
        s = once(s, old, '<div class="px-side" style="align-self:end">\n' + PROJ + '\n<nav class="card jump stack g16" aria-label="On this page">', '<div class="px-side"')
        a = s.index('<div class="px-side"')
        b = s.index('</nav>', a) + len('</nav>')
        s = s[:b] + '\n</div>' + s[b:]
    return s

# ---- Products: Services menu head --------------------------------------------------------------
PROD = tag(sprite('suit', 'present', 'The GelasTinta pixel character in a suit, presenting a growing bar chart',
                  'Fig. 03 — The pitch', 'for the pitch'), 'products')
def products(s):
    s = refresh(s, 'products', PROD)
    old = '<p class="menu-legend">Prices from · USD, then Rupiah · time to deliver</p>\n</header>'
    return once(s, old, old.replace('</p>\n</header>', '</p>\n' + PROD + '\n</header>'), 'data-px="products"')

# ---- Author: hero, all three outfits -----------------------------------------------------------
TRIO = ('<div class="px-trio" data-px-trio="1" aria-label="The GelasTinta pixel character in three outfits">'
        + sprite('hoodie', 'wave', 'The GelasTinta pixel character in a hoodie, waving hello', 'Builds', 'to say hi')
        + sprite('labcoat', 'eureka', 'The GelasTinta pixel character in a lab coat, thinking and then jumping with a lightbulb', 'Research', 'for a eureka')
        + sprite('suit', 'tie', 'The GelasTinta pixel character in a suit, adjusting his tie', 'Work', 'to fix the tie')
        + '</div>')
def author(s):
    s = re.sub(r'<div class="px-trio" data-px-trio="1".*?</figure></div>', lambda m: TRIO, s, flags=re.S)
    if 'data-px-trio' in s:
        return s
    a = s.index('<h1 class="t-title">Rayang Termedate Mendrofa</h1>')
    b = s.index('<div class="prose intro">', a)
    c = s.index('</div>', b) + len('</div>')
    return s[:c] + '\n' + TRIO + s[c:]


if __name__ == '__main__':
    page('Main.dc.html', main)
    page('Talks.dc.html', talks)
    page('Projects.dc.html', projects)
    page('Products.dc.html', products)
    page('Author.dc.html', author)
