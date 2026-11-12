#!/usr/bin/env python3
"""Count AI writing tells in the visible text of each page (style check, no edits)."""
import re, sys, glob, html
BUZZ = r'\b(delve|delves|tapestry|testament|underscore[sd]?|pivotal|crucial|landscape|foster(s|ed)?|realm|nuanced|leverag\w*|seamless\w*|robust|navigate[sd]?|showcas\w*|intricate|vibrant|elevate[sd]?|unlock\w*|game.?changer)\b'
def visible(s):
    s = re.sub(r'<(script|style)\b.*?</\1>', ' ', s, flags=re.S)
    s = re.sub(r'<!--.*?-->', ' ', s, flags=re.S)
    heads = [html.unescape(re.sub('<[^>]+>', '', h)).strip() for h in re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', s, flags=re.S)]
    txt = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    return re.sub(r'\s+', ' ', txt), heads
rows = []
for p in sorted(glob.glob('src/pages/*.dc.html')):
    t, heads = visible(open(p, encoding='utf-8').read())
    w = len(t.split())
    c = dict(words=w,
             emdash=t.count('—'),
             semicolon=len(re.findall(r'\w;\s', t)),
             colon_head=sum(1 for h in heads if ':' in h),
             notjust=len(re.findall(r'\bnot (just|only|merely)\b', t, re.I)),
             buzz=len(re.findall(BUZZ, t, re.I)),
             bold_lead=len(re.findall(r'<(b|strong)>[^<]{1,40}[:.]</\1>', open(p, encoding='utf-8').read())))
    rows.append((p.split('/')[-1], c))
keys = ['words', 'emdash', 'semicolon', 'colon_head', 'notjust', 'buzz', 'bold_lead']
print('page'.ljust(30), *[k.rjust(9) for k in keys])
tot = {k: 0 for k in keys}
for n, c in rows:
    print(n.ljust(30), *[str(c[k]).rjust(9) for k in keys])
    for k in keys: tot[k] += c[k]
print('TOTAL'.ljust(30), *[str(tot[k]).rjust(9) for k in keys])
