#!/usr/bin/env python3
"""Turn a src/pages change into edit_version edits for the design canvas.

Usage: python3 tools/canvas-diff.py <base git rev> <page.dc.html>... [--out DIR]

For each page, diffs the page at <base rev> against the working copy (word level), and
writes DIR/<page>.json: a list of chunks, each a list of at most 60 {old_text, new_text}
edits. Each old_text is grown with context until it is unique in the document at the
moment it is applied, so the edits also apply to the canvas copy as long as the canvas
and src copies agree around the changed text (true for body text; the comments block and
its hook are the only parts that differ). The script replays every edit on the base text
and checks the result equals the working copy before writing anything.
"""
import difflib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOK = re.compile(r'\s+|[A-Za-z0-9’\']+|[^\sA-Za-z0-9’\']')


def edits_for(a, b):
    ta, tb = TOK.findall(a), TOK.findall(b)
    assert ''.join(ta) == a and ''.join(tb) == b
    sm = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    ops = [o for o in sm.get_opcodes() if o[0] != 'equal']
    # merge ops closer than 6 tokens
    merged = []
    for op in ops:
        if merged and op[1] - merged[-1][2] <= 6:
            p = merged[-1]
            merged[-1] = ('replace', p[1], op[2], p[3], op[4])
        else:
            merged.append(op)
    out = []
    doc = a
    shift = 0  # char offset between current doc and base for positions after applied edits
    pos_a = [0]
    for t in ta:
        pos_a.append(pos_a[-1] + len(t))
    applied = []
    for _, i1, i2, j1, j2 in merged:
        lo, hi = i1, i2
        while True:
            old = ''.join(ta[lo:hi])
            new = ''.join(ta[lo:i1]) + ''.join(tb[j1:j2]) + ''.join(ta[i2:hi])
            start = pos_a[lo] + shift
            if old and doc.count(old) == 1 and doc[start:start + len(old)] == old:
                break
            if lo > 0:
                lo -= 1
            if hi < len(ta):
                hi += 1
        doc = doc[:start] + new + doc[start + len(old):]
        shift += len(new) - len(old)
        applied.append({'old_text': old, 'new_text': new})
    assert doc == b, 'replay mismatch'
    return applied


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, '.canvas-out', 'diff')
    if '--out' in sys.argv:
        args.remove(out)
    rev, pages = args[0], args[1:]
    os.makedirs(out, exist_ok=True)
    for page in pages:
        a = subprocess.run(['git', 'show', f'{rev}:src/pages/{page}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        b = open(os.path.join(ROOT, 'src', 'pages', page), encoding='utf-8').read()
        if a == b:
            print(page, 'unchanged'); continue
        ed = edits_for(a, b)
        chunks, cur, size = [], [], 0
        for e in ed:
            n = len(e['old_text'].encode())
            if len(cur) >= 60 or size + n > 60000:
                chunks.append(cur); cur, size = [], 0
            cur.append(e); size += n
        if cur:
            chunks.append(cur)
        json.dump(chunks, open(os.path.join(out, page + '.json'), 'w'), ensure_ascii=False)
        print(page, len(ed), 'edits in', len(chunks), 'chunk(s)')


if __name__ == '__main__':
    main()
