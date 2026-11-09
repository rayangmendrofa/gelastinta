#!/usr/bin/env python3
"""Second pass on the pixel scenes: make them sit in the page grid.

* In a text column (project pages, BEng) the scene fills the column width,
  so both edges line up with the text under it.
* In a section heading row (Author, Products, Talks, MSc) the scene moves to
  the right of the heading, and the heading's intro or count moves under the
  heading, so the row is text on the left and the picture on the right.
* The frame matches the site's cards: square corners and a 1px ink border.

Usage: tools/scenes2.py PAGES_DIR [--edits OUT_DIR]
With --edits, also writes edit_version JSON (old_text/new_text) per page.
"""
import json, os, re, sys

CSS = """/* pxs:start */
.pxs{position:relative;display:block;width:100%;aspect-ratio:128/80;overflow:hidden;background:#10131C;margin:0}
.pxs::after{content:"";position:absolute;inset:0;border:1px solid #10131C;pointer-events:none}
.pxs img{display:block;width:calc(100% * var(--n));height:100%;max-width:none;image-rendering:crisp-edges;image-rendering:pixelated;animation:pxs-run var(--t) steps(var(--n)) infinite;pointer-events:none;user-select:none;-webkit-user-drag:none}
@keyframes pxs-run{to{transform:translateX(-100%)}}
.sec-head.pxs-head{flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:24px 48px}
.pxs-head > .stack{flex:1 1 320px;min-width:0}
.pxs-head > .pxs{flex:0 0 auto;width:384px;max-width:100%}
@media (max-width:760px){.pxs-head > .pxs{width:100%}}
@media (prefers-reduced-motion:reduce){.pxs img{animation:none}}
/* pxs:end */"""

HEAD_PAGES = {'Author', 'Products', 'Talks', 'Thesis-MSc'}

SCENE_RE = re.compile(r'\n<div class="pxs"[^>]*><img [^>]*></div>')


def css_swap(s):
    a = s.index('/* pxs:start */')
    b = s.index('/* pxs:end */') + len('/* pxs:end */')
    return s[:a] + CSS + s[b:], (s[a:b], CSS)


def head_row(s, page):
    """Move the scene to the right of the heading row. Returns (new, (old, new))."""
    m = SCENE_RE.search(s)
    scene = m.group(0)
    a = s.rfind('<div class="sec-head', 0, m.start())
    # end of the sec-head block: first '\n</div>\n' that closes it
    if page == 'Thesis-MSc':
        b = s.index('\n</div>', m.end()) + len('\n</div>')
        old = s[a:b]
        inner = old[len('<div class="sec-head">'):-len('\n</div>')].replace(scene, '')
        new = ('<div class="sec-head pxs-head">\n<div class="stack g12">' + inner +
               '\n</div>' + scene + '\n</div>')
    else:
        # <div class="sec-head row">\n<div class="stack g12">...SCENE\n</div>\nAFTER\n</div>
        stack_end = s.index('\n</div>', m.end())
        b = s.index('\n</div>', stack_end + 1) + len('\n</div>')
        old = s[a:b]
        head = s[a:m.start()]            # sec-head open + stack open + kicker + h2
        after = s[stack_end + len('\n</div>'):b - len('\n</div>')]  # intro/meta line(s)
        head = head.replace('<div class="sec-head row">', '<div class="sec-head row pxs-head">')
        new = head + after + '\n</div>' + scene + '\n</div>'
    return s.replace(old, new, 1), (old, new)


def main():
    root = sys.argv[1]
    out = sys.argv[sys.argv.index('--edits') + 1] if '--edits' in sys.argv else None
    for f in sorted(os.listdir(root)):
        if not f.endswith('.dc.html'):
            continue
        p = os.path.join(root, f)
        s = open(p, encoding='utf-8').read()
        if '/* pxs:start */' not in s or 'class="pxs"' not in s:
            continue
        page = f[:-len('.dc.html')]
        edits = []
        s, e = css_swap(s); edits.append(e)
        if page in HEAD_PAGES:
            s, e = head_row(s, page); edits.append(e)
        open(p, 'w', encoding='utf-8').write(s)
        if out:
            os.makedirs(out, exist_ok=True)
            json.dump([{'old_text': o, 'new_text': n} for o, n in edits],
                      open(os.path.join(out, f + '.json'), 'w'), ensure_ascii=False)
        print(page, len(edits))


if __name__ == '__main__':
    main()
