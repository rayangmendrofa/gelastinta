#!/usr/bin/env python3
"""Reflow the Talks page bookshelf into shelves of at most 8 books, newest shelf on top.

Usage: python3 tools/shelves.py src/pages/Talks.dc.html [more pages...]
Run it after adding a book (newest first, as the first book of the first shelf); it
collects every book on the page's talks shelves, then rebuilds them in rows of 8.
Book order, colours and covers are kept; indices, ids and counters are renumbered.
"""
import re, sys

PER = 8
WRAP_RE = re.compile(r'<div class="shelf-stack">.*?</div><!-- /shelf-stack -->|<div class="shelf-wrap" data-shelf>.*?<span class="bookend" aria-hidden="true"></span></div></div>', re.S)
BOOK_RE = re.compile(r'<div class="book(?: open)?" data-book=.*?</a></div>', re.S)
CSS = ('.shelf-stack{display:flex;flex-direction:column;gap:44px}'
       '.shelf-row-k{font-family:\'Ubuntu Mono\',ui-monospace,monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;margin:0 0 -4px}')


def bar(n):
    return ('<div class="shelf-bar"><button type="button" class="sh-btn" data-shelf-step="-1" aria-label="Previous book">←</button>'
            f'<span class="sh-count" aria-live="polite"><b data-shelf-pos>1</b> / {n}</span>'
            '<button type="button" class="sh-btn" data-shelf-step="1" aria-label="Next book">→</button>'
            '<span class="sh-hint">Click a spine to pull it out · click the cover to read</span>'
            '<button type="button" class="sh-btn sh-sound" data-shelf-sound aria-pressed="true">♪ Sound on</button></div>')


def renum(b, i, gid):
    b = re.sub(r'class="book(?: open)?" data-book="\d+"', f'class="book{" open" if i == 0 else ""}" data-book="{i}"', b)
    b = re.sub(r'data-pick="\d+" aria-expanded="\w+" aria-controls="sh-talks-\d+"',
               f'data-pick="{i}" aria-expanded="{"true" if i == 0 else "false"}" aria-controls="sh-talks-{gid}"', b)
    return re.sub(r'id="sh-talks-\d+"', f'id="sh-talks-{gid}"', b)


def reflow(s):
    m = WRAP_RE.search(s)
    if not m:
        raise SystemExit('no talks shelf found')
    books = BOOK_RE.findall(m.group(0))
    rows = [books[k:k + PER] for k in range(0, len(books), PER)]
    out = ['<div class="shelf-stack">']
    g = 0
    for r, row in enumerate(rows):
        first = re.search(r'sp-n">(\d+)', row[0]).group(1)
        last = re.search(r'sp-n">(\d+)', row[-1]).group(1)
        label = 'Newest first' if r == 0 else 'Older talks'
        out.append(f'<p class="shelf-row-k">{label} · Talks {first} to {last}</p>')
        out.append('<div class="shelf-wrap" data-shelf>' + bar(len(row)) +
                   f'<div class="shelf tall" role="group" aria-label="Talks {first} to {last}">')
        for i, b in enumerate(row):
            out.append(renum(b, i, g)); g += 1
        out.append('<span class="bookend" aria-hidden="true"></span></div></div>')
    out.append('</div><!-- /shelf-stack -->')
    s = s[:m.start()] + ''.join(out) + s[m.end():]
    if '.shelf-stack{' not in s:
        s = s.replace('.shelf-wrap{display:flex;', CSS + '\n.shelf-wrap{display:flex;', 1)
    return s, [len(r) for r in rows]


if __name__ == '__main__':
    for p in sys.argv[1:]:
        s, rows = reflow(open(p, encoding='utf-8').read())
        open(p, 'w', encoding='utf-8').write(s)
        print(p, 'shelves:', rows)
