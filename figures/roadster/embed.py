# Copies the light figure pages into the site as embeds: tighter margins, noindex, favicon, and a note of the page
# height to the parent so the talk can size the frame.
import os, re
SITE = os.environ.get('GT_SITE') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'static', 'figures') + '/'
for src, dst, title in [('ramp-light.html', 'roadster-ramp.html', 'The ramp · Fig 1 · GelasTinta'), ('flip-light.html', 'roadster-kickflip.html', 'The kickflip · Fig 2 · GelasTinta')]:
    s = open(src, encoding='utf8').read()
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml">', 1)
    s = s.replace('</style>', '.iso-page{margin:6px auto 10px!important;width:min(980px,100% - 12px)!important}@media (max-width:480px){.iso-plate-corner[data-corner="readout"]{white-space:normal;left:0;text-align:right;line-height:1.35}.iso-plate-corner[data-corner="hint"]{bottom:34px}}</style>', 1)
    ping = "<script>(function(){var n=0;function p(){try{parent.postMessage({gtFig:location.pathname,h:document.documentElement.scrollHeight},'*')}catch(e){}}addEventListener('load',p);addEventListener('resize',p);var t=setInterval(function(){p();if(++n>20)clearInterval(t)},300)})();</script>"
    i = s.rindex('</body>')  # the last one: the kit's own source, inlined above, also contains the string
    s = s[:i] + ping + s[i:]
    s = re.sub(r'<title>.*?</title>', '<title>' + title + '</title>', s, count=1)
    open(SITE + dst, 'w', encoding='utf8').write(s)
    print(dst, len(s))
