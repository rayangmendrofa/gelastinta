import re,html,sys,glob
def words(s, panels=True, charts=True):
    a=s.index('class="dropcap"'); b=s.index('class="talk-nav',a); t=s[a:b]
    t=re.sub(r'<script.*?</script>|<style.*?</style>|<svg.*?</svg>|<button.*?</button>','',t,flags=re.S)
    if not panels: t=re.sub(r'<sc-if.*?</sc-if>','',t,flags=re.S)
    if not charts:
        # drop chart blocks: <div class="viz" ...> ... up to its viz-foot end; approximate by removing viz-head..viz-foot
        t=re.sub(r'<div class="viz[" ].*?<div class="viz-foot">.*?</div>','',t,flags=re.S)
    t=html.unescape(re.sub(r'<[^>]+>',' ',t)); t=re.sub(r'\{\{[^}]*\}\}','',t)
    return len(t.split())
for f in sorted(glob.glob('src/pages/Talk-*.dc.html')):
    s=open(f).read()
    m=re.search(r'(\d+) min read',s)
    if 'class="dropcap"' not in s: print(f,'no dropcap'); continue
    a,b,c=words(s),words(s,panels=False),words(s,panels=False,charts=False)
    print(f"{f.split('Talk-')[1][:-8]:18} stated {m.group(1) if m else '?':>3}  all {a:5} ({round(a/200)})  noPanels {b:5} ({round(b/200)})  prose {c:5} ({round(c/200)})")
