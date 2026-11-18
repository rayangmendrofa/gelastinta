#!/usr/bin/env python3
"""The scroll story layer, shared by every page except the study pack library.

What it adds to a page (all between story markers, so it can be run again safely):
  * display fonts (Anton for headings, Instrument Serif for lines under them)
  * a style block: scene colour frame, sections as stacked cards, the left chapter rail,
    pixel stages, ink wipe between pages
  * markup tags: data-st-ch (chapter + its rail label) on each chapter section, st-h on chapter
    headings, data-st-w on headings whose letters may wobble, st-scene on index page heroes
  * a stStart() method on the page Component, called from componentDidMount

Content and each page's own colours are left alone: cards keep their own backgrounds, the
frame around them shifts through the page's palette as you read.

Usage: python3 tools/story.py [PAGE.dc.html ...]   (no args: every page in src/pages except Home-v2)
       python3 tools/story.py --dir DIR PAGE...     (run on canvas copies in DIR)
"""
import html as H
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FONTS = ('<link data-story href="https://fonts.googleapis.com/css2?family=Anton&amp;'
         'family=Instrument+Serif:ital@0;1&amp;display=swap" rel="stylesheet">')

# sprites (asset ids from the owner's packs; frames, ms per frame)
SPR = {
    'hoodie-walk': ('effa22a25ea7853b01b88ec50805f0c1', 4, 140), 'hoodie-idle': ('4c1e039267cfd582c0ee4d5930f6998b', 8, 160),
    'hoodie-wave': ('723c80f6c3239c1eb034218c7a3249a4', 7, 150), 'hoodie-happy': ('c86bf217f8e4735869fc0fcabfe44c9f', 8, 130),
    'hoodie-pour': ('cf0cbbc176dcedea4a1c0d45350432cf', 11, 150), 'hoodie-thinking': ('e88a75bea0e274305b8af51e265cba31', 10, 220),
    'labcoat-walk': ('2ac8f04301980f265efc51c1c861396a', 4, 140), 'labcoat-idle': ('0adff87b8a0ce54aa1d503767bf28772', 8, 160),
    'labcoat-wave': ('af590436f0155acb650ca7a370a6820d', 7, 150), 'labcoat-inspect': ('abb3bf9b38e58b145b90221cfdc2e9b2', 10, 180),
    'labcoat-eureka': ('cecfa839f65d924244169b8f91ad87c7', 10, 170),
    'suit-walk': ('a4413c34a748659e2cdd0d82ca3cce01', 4, 140), 'suit-idle': ('36e3f4b4d1181d7f9e6ca9560d607250', 8, 160),
    'suit-wave': ('1d89ba917ee97de87e63eed0524044b1', 7, 150), 'suit-present': ('d307f3fd9e458bd63d3e69b9eaa671d5', 12, 200),
}
ENV = {'stage': 'efd70dc38e4ae3c3a02db6deb28d74a1', 'workshop': '65780fc86606cd75aa11317255ece978',
       'lab': 'bbf5d67d3298b7c3ed1180c9237a0b85', 'study': '82c4e1082eabbc5c14cb325c13447af7'}

SITE = ['#4F4086', '#7A4456', '#5A82B3', '#064F6E']
PAGES = {
    'Main.dc.html': dict(pal=SITE, outfit='hoodie', label='Hello'),
    'Talks.dc.html': dict(pal=['#10131C', '#4F4086', '#064F6E', '#7A4456'], outfit='suit', label='Talks', scene=True),
    'Projects.dc.html': dict(pal=['#064F6E', '#4F4086', '#5A82B3', '#10131C'], outfit='labcoat', label='Projects', scene=True,
                             stage=('workshop', 'labcoat', 'inspect', 'Pixel scene: the GelasTinta character in a lab coat walks into the workshop and holds a beaker up to the light'),
                             stage_at=('after', '<div class="px-side" style="align-self:end">')),
    'Products.dc.html': dict(pal=['#7A4456', '#4F4086', '#064F6E', '#5A82B3'], outfit='hoodie', label='Products', scene=True,
                             stage=('study', 'hoodie', 'happy', 'Pixel scene: the GelasTinta character in his hoodie walks into his study room and jumps for joy'),
                             stage_at=('before', '</div>\n<nav class="card jump')),
    'Author.dc.html': dict(pal=['#5A82B3', '#4F4086', '#7A4456', '#064F6E'], outfit='hoodie', label='Author', scene=True),
}
PROJECT_PAL = ['#10131C', '#064F6E', '#2B44C8', '#5A82B3']


def page_cfg(name, s):
    if name in PAGES:
        return PAGES[name]
    if name.startswith('Talk-'):
        i = s.find('aria-label="Colour palette"')
        pal = re.findall(r'#[0-9A-Fa-f]{6}', s[i:s.find('</section>', i)]) if i > 0 else []
        pal = [p.upper() for p in pal][:4]
        if '#10131C' not in pal and '#111314' not in pal:
            pal.append('#10131C')
        return dict(pal=pal or PROJECT_PAL, outfit='suit', label='Intro')
    return dict(pal=PROJECT_PAL, outfit='labcoat', label='Intro')


CSS = r'''
html.st-on{--rail:0px;--st-gap:8px;--st-r:20px;--st-top:76px}
@media (min-width:760px){html.st-on{--st-gap:14px;--st-r:28px}}
@media (min-width:1180px){html.st-on{--rail:176px}}
html.st-on body{background:var(--st-bg,#10131C);transition:background-color .9s cubic-bezier(.65,0,.35,1)}
html.st-on .gt-progress{display:none}
html.st-on .site-head{background:var(--st-bg,#10131C);border-bottom:0;color:var(--st-fg);transition:background-color .9s cubic-bezier(.65,0,.35,1),color .9s}
html.st-on .site-head .brand-name{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:24px;letter-spacing:.05em;text-transform:uppercase;color:var(--st-fg);text-decoration:none}
html.st-on .site-head .nav a{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--st-fg);background:none;border-color:transparent;opacity:.82}
html.st-on .site-head .nav a.on,html.st-on .site-head .nav a:hover{opacity:1;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:6px;background:none}
html.st-on .site-head .bk-logo path[stroke]{stroke:var(--st-fg)}
html.st-on .st-card{position:relative;margin-left:calc(var(--rail) + var(--st-gap));margin-right:var(--st-gap);border-radius:var(--st-r) var(--st-r) 0 0;border-top:0;border-bottom:0;box-shadow:0 -10px 24px rgba(16,19,28,.2);overflow-x:clip}
:where(html.st-on .st-card){background-color:var(--st-paper,#F3EFE6)}
html.st-on .st-card + .st-card,html.st-on .st-card + .site-foot{margin-top:calc(var(--st-r) * -1)}
html.st-on .site-foot{position:relative;z-index:1;margin-left:calc(var(--rail) + var(--st-gap));margin-right:var(--st-gap);border-radius:var(--st-r) var(--st-r) 0 0;box-shadow:0 -16px 40px rgba(16,19,28,.22)}
html.st-live .st-card{position:sticky}
html.st-on .st-scene{background:transparent!important;color:var(--st-fg);box-shadow:none}
html.st-on .st-scene::before,html.st-on .st-scene::after{display:none}
html.st-on h1{font-family:'Anton',Impact,sans-serif;font-weight:400;font-style:normal;text-transform:uppercase;letter-spacing:.006em;line-height:1;font-size:clamp(46px,6vw,112px);text-wrap:balance;margin-bottom:.06em}
html.st-on h1.t-title{font-size:clamp(38px,4.4vw,78px);line-height:1.02}
html.st-on h1.st-long{font-size:clamp(34px,3.6vw,62px);line-height:1.04}
html.st-on h1 *{font-family:inherit;font-weight:inherit}
html.st-on .st-h{font-family:'Anton',Impact,sans-serif;font-weight:400;font-style:normal;text-transform:uppercase;letter-spacing:.01em;line-height:1.02;font-size:clamp(32px,3.8vw,58px);text-wrap:balance;margin-bottom:.1em;max-width:22ch}
html.st-on .st-h.st-long{font-size:clamp(28px,2.9vw,44px);max-width:28ch}
html.st-on :is(p,li,figcaption,blockquote){text-wrap:pretty}
html.st-on .prose,html.st-on .col > p{max-width:68ch}
html.st-on .st-scene h1,html.st-on .st-scene .st-h{color:var(--st-fg)}
html.st-on .st-scene :is(.kicker,.meta,.lead,.prose,.prose p,.prose b,figcaption,.muted):not(.card *){color:var(--st-fg)}
html.st-live .st-hpin{position:sticky;top:calc(var(--st-top) + 24px)}
.st-xon{overflow:visible!important;scroll-snap-type:none!important;will-change:transform}
html.st-on [data-st-w] .w{display:inline-block;white-space:nowrap}
html.st-on [data-st-w] .l{display:inline-block;transform:translateY(calc(var(--y) * var(--k,0))) rotate(calc(var(--r) * var(--k,0)))}
.st-serif{font-family:'Instrument Serif',Georgia,serif;font-weight:400}
.st-stage{--s:3;position:relative;width:calc(128px * var(--s));max-width:100%;aspect-ratio:128/80;flex:none;border-radius:10px;overflow:hidden;background:#10131C;box-shadow:0 0 0 3px rgba(237,239,242,.9),0 18px 40px rgba(16,19,28,.35)}
.st-scene .st-stage{margin:8px 0 18px}
.st-stage > img{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
.st-actor{position:absolute;left:20.3%;top:25%;width:59.375%;height:72.5%;overflow:hidden}
.st-actor img{display:block;height:100%;width:calc(var(--n) * 100%);max-width:none;image-rendering:pixelated;image-rendering:crisp-edges;animation:st-px var(--t) steps(var(--n)) infinite}
.st-actor.walk{animation:st-walkin 7s linear infinite}
.st-actor.act{animation:st-act 7s steps(1,end) infinite}
@keyframes st-px{to{transform:translateX(-100%)}}
@keyframes st-walkin{0%{transform:translateX(-140%);opacity:1}40%{transform:translateX(0);opacity:1}40.01%,100%{transform:translateX(0);opacity:0}}
@keyframes st-act{0%,40%{opacity:0}40.01%,100%{opacity:1}}
.st-rail{position:fixed;left:0;top:calc(var(--st-top) + 18px);bottom:28px;width:var(--rail);z-index:55;color:var(--st-fg);display:none;font-family:'Anton',Impact,sans-serif;transition:color .9s}
@media (min-width:1180px){html.st-on .st-rail{display:block}}
html.st-framed .st-rail{position:absolute;bottom:auto;height:720px}
.st-track{position:absolute;left:26px;top:4px;bottom:4px;width:10px;background:repeating-linear-gradient(180deg,currentColor 0 1px,transparent 1px 9px);opacity:.5}
.st-now{position:absolute;left:18px;width:26px;height:3px;border-radius:2px;background:currentColor;top:calc(4px + (100% - 8px) * var(--st-prog,0));transition:top .12s linear}
.st-walker{position:absolute;left:14px;width:34px;height:58px;overflow:hidden;top:max(0px,calc(4px + (100% - 8px) * var(--st-prog,0) - 60px));transition:top .12s linear;pointer-events:none}
.st-walker img{display:block;height:58px;width:calc(var(--n) * 76px);max-width:none;image-rendering:pixelated;animation:st-px var(--t) steps(var(--n)) infinite}
.st-rail ol{list-style:none;margin:0;padding:0 14px 0 54px;height:100%;display:flex;flex-direction:column;justify-content:space-between}
.st-rail button{display:flex;gap:8px;align-items:baseline;width:100%;border:0;background:none;color:inherit;font:inherit;font-size:12.5px;letter-spacing:.09em;line-height:1.15;text-transform:uppercase;text-align:left;opacity:.5;cursor:pointer;padding:3px 0;transition:opacity .3s}
.st-rail button .n{font-family:'Ubuntu Mono',monospace;font-size:11px;letter-spacing:.04em;flex:none}
.st-rail button .t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.st-rail button:hover{opacity:.85}
.st-rail button.on{opacity:1}
.st-rail button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.st-chip{position:fixed;left:10px;bottom:12px;z-index:56;display:none;align-items:center;gap:8px;max-width:calc(100vw - 20px);padding:9px 16px;border-radius:999px;border:0;background:var(--st-bg,#10131C);color:var(--st-fg);box-shadow:0 0 0 2px var(--st-fg),0 8px 24px rgba(16,19,28,.3);font-family:'Anton',Impact,sans-serif;font-size:13px;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;transition:background-color .9s,color .9s}
.st-chip .n{font-family:'Ubuntu Mono',monospace;font-size:11px}
.st-chip .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:1179px){html.st-live .st-chip{display:inline-flex}
html.st-railopen .st-rail{display:block;left:10px;top:auto;bottom:62px;width:min(340px,calc(100vw - 20px));max-height:70vh;overflow:auto;padding:16px 0;border-radius:18px;background:var(--st-bg,#10131C);box-shadow:0 0 0 2px var(--st-fg),0 18px 40px rgba(16,19,28,.35)}
html.st-railopen .st-rail ol{height:auto;gap:12px;padding:0 18px}
html.st-railopen .st-rail button{font-size:15px}
html.st-railopen .st-track,html.st-railopen .st-now,html.st-railopen .st-walker{display:none}}
.st-wipe{position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:var(--c);clip-path:circle(0 at var(--x) var(--y));transition:clip-path .55s cubic-bezier(.65,0,.35,1)}
.st-wipe.go{clip-path:circle(150% at var(--x) var(--y))}
html.st-in::after{content:"";position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:var(--st-wipe,#10131C);clip-path:inset(0 0 0 0)}
html.st-in.st-go::after{clip-path:inset(0 0 100% 0);transition:clip-path .7s cubic-bezier(.65,0,.35,1)}
.st-foot{position:relative;z-index:1;overflow:hidden;color:#EDEFF2!important;padding:clamp(80px,12vh,130px) clamp(20px,5vw,80px) 28px!important}
html.st-on .site-foot.st-foot{background:var(--sf,#064F6E)}
.st-foot .st-star{position:absolute;color:#EDEFF2;pointer-events:none}
.st-foot-in{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(12px,2.2vh,22px);max-width:1000px;margin:0 auto}
.st-foot .st-over{margin:0;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:clamp(20px,2vw,28px);opacity:.92;color:inherit}
html.st-on .st-foot .st-big{margin:0;font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;font-size:clamp(54px,9vw,160px);line-height:.92;letter-spacing:.005em;color:#EDEFF2;max-width:none}
.st-foot .st-big .w{display:inline-block;white-space:nowrap}
.st-foot .st-lead{margin:0;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(22px,2.4vw,36px);line-height:1.15;max-width:36ch;color:inherit}
.st-mail{display:inline-flex;align-items:center;gap:14px;padding:0;border:0;background:none;color:inherit;cursor:pointer;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(26px,3.2vw,48px);border-bottom:3px solid #8DB0DA}
.st-mail-ok{font-family:'Ubuntu Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:#EDEFF2;color:#10131C;opacity:0;transition:opacity .25s}
.st-mail.ok .st-mail-ok{opacity:1}
html.st-on .st-foot .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
html.st-on .st-foot .social{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid rgba(237,239,242,.6);border-radius:999px;background:none;text-decoration:none;color:#EDEFF2;font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.05em}
html.st-on .st-foot .social:hover{background:#EDEFF2;color:#10131C}
html.st-on .st-foot .social img{filter:brightness(0) invert(1)}
html.st-on .st-foot .social:hover img{filter:none}
.st-foot .st-rain{--s:3;width:calc(128px * var(--s));max-width:100%;aspect-ratio:128/80;overflow:hidden;border-radius:6px;box-shadow:0 0 0 3px rgba(237,239,242,.85),0 18px 40px rgba(16,19,28,.35)}
.st-foot .st-rain img{display:block;height:100%;width:1600%;max-width:none;image-rendering:pixelated;image-rendering:crisp-edges;animation:st-px 2880ms steps(16) infinite}
.st-foot-bar{position:relative;z-index:2;max-width:1160px;margin:clamp(48px,8vh,90px) auto 0;padding-top:18px;border-top:1px solid rgba(237,239,242,.3);display:flex;flex-direction:column;gap:14px}
html.st-on .st-foot .foot-nav{display:flex;flex-wrap:wrap;gap:8px 22px;margin:0;padding:0;border:0}
html.st-on .st-foot .foot-nav a{color:#EDEFF2;font-family:'Anton',Impact,sans-serif;font-size:14px;letter-spacing:.09em;text-transform:uppercase;text-decoration:none;opacity:.85}
html.st-on .st-foot .foot-nav a:hover{opacity:1;text-decoration:underline;text-underline-offset:5px}
html.st-on .st-foot .foot-nav .to-top{margin-left:auto}
html.st-on .st-foot .wada-credit{color:rgba(237,239,242,.75);margin:0;font-size:11px}
.st-book-src{display:none!important}
.st-book{--ar:.7071;position:relative;width:100%;max-width:min(1080px,calc((100vh - 220px) * var(--ar) * 2));margin:0 auto;outline:none}
.st-book.one{max-width:min(560px,calc((100vh - 220px) * var(--ar)))}
.st-book:focus-visible{outline:3px solid #8DB0DA;outline-offset:6px;border-radius:6px}
.st-book-stage{position:relative;perspective:2200px;cursor:pointer;-webkit-user-select:none;user-select:none}
.st-book-spread{display:grid;grid-template-columns:1fr 1fr;box-shadow:0 24px 50px rgba(0,0,0,.35)}
.st-book.one .st-book-spread{grid-template-columns:1fr}
.st-book.one .st-pg.l{display:none}
.st-pg,.st-face{position:relative;aspect-ratio:var(--ar);background:#FFFFFF;overflow:hidden}
.st-pg.blank,.st-face.blank{background:transparent}
.st-book-spread .st-pg.l:not(.blank){box-shadow:inset -18px 0 24px -18px rgba(0,0,0,.35)}
.st-book-spread .st-pg.r:not(.blank){box-shadow:inset 18px 0 24px -18px rgba(0,0,0,.3)}
.st-pg img,.st-face img{display:block;width:100%;height:100%;object-fit:contain;background:#FFFFFF}
.st-leaf{position:absolute;top:0;width:50%;height:100%;transform-style:preserve-3d;transition:transform .75s cubic-bezier(.45,.05,.25,1);will-change:transform}
.st-leaf.fwd{left:50%;transform-origin:0 50%}
.st-leaf.back{left:0;transform-origin:100% 50%}
.st-leaf.fwd.go{transform:rotateY(-180deg)}
.st-leaf.back.go{transform:rotateY(180deg)}
.st-leaf.one{left:0;width:100%;transform-origin:0 50%}
.st-leaf.fwd.one.go{transform:rotateY(-180deg)}
.st-leaf.back.one{transform:rotateY(-180deg)}
.st-leaf.back.one.go{transform:rotateY(0)}
.st-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.st-face.backf{transform:rotateY(180deg)}
.st-leaf .st-face::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.18),transparent 40%);opacity:0;transition:opacity .75s}
.st-leaf.go .st-face::after{opacity:1}
.st-book-bar{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:18px}
.st-bk{min-width:48px;min-height:44px;border-radius:999px;border:1px solid currentColor;background:none;color:inherit;font-size:20px;cursor:pointer}
.st-bk:disabled{opacity:.3;cursor:default}
.st-bk-n{font-family:'Ubuntu Mono',monospace;font-size:13px;letter-spacing:.08em;min-width:16ch;text-align:center}
@media (prefers-reduced-motion:reduce){.st-leaf{transition:none}.st-actor.walk{display:none}.st-actor.act{animation:none;opacity:1}.st-actor img,.st-walker img{animation:none}}
'''

JS = r'''  // story:start
  // The scroll story layer (tools/story.py): stacked cards, scene colours from this page's palette,
  // the left chapter rail with the walking character, wobbling headings and the ink wipe between pages.
  stStart(tries) {
    const marks = document.querySelectorAll('[data-st-ch]');
    if (!marks.length) { if (tries < 40) this.stT = setTimeout(() => this.stStart(tries + 1), 100); return; }
    if (this.stOn) return;
    this.stOn = true;
    const d = document, de = d.documentElement;
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const css = getComputedStyle(de);
    const pal = (css.getPropertyValue('--st-pal') || '#10131C').split(',').map((x) => x.trim()).filter(Boolean);
    const outfit = (css.getPropertyValue('--st-outfit') || 'hoodie').trim();
    const SPR = __SPR__;
    if (!css.getPropertyValue('--st-paper').trim()) de.style.setProperty('--st-paper', getComputedStyle(d.body).backgroundColor);
    de.classList.add('st-on');
    if (framed) de.classList.add('st-framed'); else de.classList.add('st-live');
    const fgFor = (hex) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return '#EDEFF2';
      const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) > 0.33 ? '#10131C' : '#EDEFF2';
    };
    const chs = Array.from(marks);
    const colourOf = (i) => chs[i].getAttribute('data-st-bg') || pal[i % pal.length];
    const setScene = (i) => { const c = colourOf(i); de.style.setProperty('--st-bg', c); de.style.setProperty('--st-fg', fgFor(c)); };
    setScene(0);
    // the rail, built from the chapters
    const rail = d.createElement('nav');
    rail.className = 'st-rail';
    rail.setAttribute('aria-label', 'Chapters');
    const pad = (n) => (n < 10 ? '0' : '') + n;
    rail.innerHTML = '<span class="st-track" aria-hidden="true"></span><span class="st-now" aria-hidden="true"></span>' +
      '<span class="st-walker" aria-hidden="true"><img alt="" src=""></span><ol>' +
      chs.map((c, i) => '<li><button type="button" data-st-go="' + i + '"><span class="n">' + pad(i + 1) + '</span><span class="t"></span></button></li>').join('') + '</ol>';
    rail.querySelectorAll('.t').forEach((t, i) => { t.textContent = chs[i].getAttribute('data-st-ch'); });
    d.body.appendChild(rail);
    const chip = d.createElement('button');
    chip.type = 'button';
    chip.className = 'st-chip';
    chip.setAttribute('aria-expanded', 'false');
    chip.innerHTML = '<span class="n"></span><span class="t"></span>';
    d.body.appendChild(chip);
    const btns = Array.from(rail.querySelectorAll('[data-st-go]'));
    const walker = rail.querySelector('.st-walker');
    const wimg = walker.querySelector('img');
    const pose = (move) => {
      const s = SPR[outfit + '-' + move] || SPR['hoodie-' + move];
      if (!s) return 0;
      if (wimg.getAttribute('src') !== '/_blob/' + s[0]) wimg.setAttribute('src', '/_blob/' + s[0]);
      walker.style.setProperty('--n', s[1]);
      walker.style.setProperty('--t', (s[1] * s[2]) + 'ms');
      return s[1] * s[2];
    };
    ['walk', 'wave', 'idle'].forEach((m) => { const s = SPR[outfit + '-' + m]; if (s) { const im = new Image(); im.src = '/_blob/' + s[0]; } });
    pose('idle');
    const offs = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };
    this.stOff = () => offs.forEach((f) => f());
    const go = (i) => {
      const t = chs[i];
      if (!t) return;
      const head = d.querySelector('.site-head');
      const y = t.getBoundingClientRect().top + window.scrollY - (head ? head.offsetHeight : 0) + 2;
      if (this.stGlide) this.stGlide(Math.max(0, y)); else window.scrollTo({ top: Math.max(0, y), behavior: still ? 'auto' : 'smooth' });
      de.classList.remove('st-railopen');
      chip.setAttribute('aria-expanded', 'false');
    };
    on(rail, 'click', (e) => { const b = e.target.closest('[data-st-go]'); if (b) go(+b.getAttribute('data-st-go')); });
    on(chip, 'click', () => { const o = de.classList.toggle('st-railopen'); chip.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    // click the email to copy it
    on(d, 'click', (e) => {
      const cp = e.target && e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!cp) return;
      const v = cp.getAttribute('data-copy');
      const done = () => { cp.classList.add('ok'); clearTimeout(cp.__t); cp.__t = setTimeout(() => cp.classList.remove('ok'), 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => { location.href = 'mailto:' + v; });
      else location.href = 'mailto:' + v;
    }, true);
    // document previews read like a book: turn the pages instead of scrolling
    this.stBooks(0, still);
    // sections become cards (in the design canvas too, so the frame and cards show there)
    const head = d.querySelector('.site-head');
    const box = (d.getElementById('main') || chs[0]).parentElement;
    const cards = Array.from(box.children).filter((el) => el.matches('section, nav, aside, div.sec') && !el.matches('.site-head, .site-foot, .skip-link, .gt-progress'));
    cards.forEach((c) => c.classList.add('st-card'));
    if (framed) return;
    // wobbling heading letters
    const words = Array.from(d.querySelectorAll('[data-st-w]'));
    if (!still) words.forEach((h, hi) => {
      if (h.children.length) return;
      let seed = hi * 97 + 13;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      const txt = h.textContent.trim().replace(/\s+/g, ' ');
      h.setAttribute('aria-label', txt);
      h.innerHTML = txt.split(' ').map((w) => '<span class="w" aria-hidden="true">' + Array.from(w).map((ch) =>
        '<span class="l" style="--r:' + ((rnd() - 0.5) * 9).toFixed(1) + 'deg;--y:' + ((rnd() - 0.5) * 0.1).toFixed(3) + 'em">' +
        ch.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>').join('') + '</span>').join(' ');
    });
    // stacked cards: each pins once its bottom reaches the screen, the next slides over it
    let vh = window.innerHeight, hh = head ? head.offsetHeight : 0;
    const tops = () => {
      vh = window.innerHeight; hh = head ? head.offsetHeight : 0;
      de.style.setProperty('--st-top', hh + 'px');
      cards.forEach((c) => { c.style.top = Math.min(hh, vh - c.offsetHeight) + 'px'; });
      ask();
    };
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(() => tops()); cards.forEach((c) => ro.observe(c)); offs.push(() => ro.disconnect()); }
    // sideways rows: scroll down, the row moves across
    const rows = Array.from(d.querySelectorAll('[data-st-x]'));
    const wide = () => window.innerWidth >= 900 && !still && !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
    const sizeRows = () => rows.forEach((r) => {
      const scene = r.closest('.st-card'), pin = r.closest('.st-hpin');
      if (!scene || !pin) return;
      r.style.transform = '';
      if (!wide()) { r.classList.remove('st-xon'); scene.style.minHeight = ''; r.__x = 0; return; }
      r.classList.add('st-xon');
      const extra = Math.max(0, r.scrollWidth - r.clientWidth);
      r.__x = extra;
      scene.style.minHeight = (pin.offsetHeight + extra + 160) + 'px';
    });
    // the frame colour, the rail and the walker
    let cur = -1, raf = 0, moving = 0, acting = 0;
    const tick = () => {
      raf = 0;
      let c = 0;
      chs.forEach((s, i) => { if (s.getBoundingClientRect().top < vh * 0.45) c = i; });
      if (c !== cur) {
        const first = cur < 0;
        cur = c;
        setScene(c);
        btns.forEach((b, i) => { b.classList.toggle('on', i === c); if (i === c) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
        chip.querySelector('.n').textContent = pad(c + 1);
        chip.querySelector('.t').textContent = chs[c].getAttribute('data-st-ch');
        if (!first && !still) { clearTimeout(this.stA); acting = 1; this.stA = setTimeout(() => { acting = 0; pose(moving ? 'walk' : 'idle'); }, pose('wave')); }
      }
      const max = Math.max(1, de.scrollHeight - vh);
      de.style.setProperty('--st-prog', Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4));
      rows.forEach((r) => {
        if (!r.__x) return;
        const sc = r.closest('.st-card').getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (hh + 40 - sc.top) / r.__x));
        r.style.transform = 'translate3d(' + (-p * r.__x).toFixed(1) + 'px,0,0)';
      });
      if (!still) words.forEach((h) => {
        const r = h.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh * 0.42) / vh));
        const k = Math.round((0.12 + Math.abs(p) * 1.9) * 40) / 40;
        if (h.__k !== k) { h.__k = k; h.style.setProperty('--k', k); }
      });
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(tick); };
    on(window, 'scroll', () => {
      ask();
      if (still) return;
      if (!moving && !acting) pose('walk');
      moving = 1;
      clearTimeout(this.stM);
      this.stM = setTimeout(() => { moving = 0; if (!acting) pose('idle'); }, 180);
    }, { passive: true });
    on(window, 'resize', () => { sizeRows(); tops(); }, { passive: true });
    on(window, 'load', () => { sizeRows(); tops(); });
    sizeRows();
    tops();
    // mouse wheels glide instead of jumping (trackpads and touch keep their own native momentum)
    if (!still && window.matchMedia && matchMedia('(pointer: fine)').matches) {
      let target = window.scrollY, pos = window.scrollY, gliding = false, last = 0;
      const maxY = () => de.scrollHeight - window.innerHeight;
      const step = (t) => {
        const dt = Math.min(48, t - (last || t)); last = t;
        pos += (target - pos) * (1 - Math.exp(-dt / 90));
        if (Math.abs(target - pos) < 0.5) { pos = target; gliding = false; last = 0; }
        window.scrollTo(0, pos);
        if (gliding) requestAnimationFrame(step);
      };
      const glide = (y) => {
        target = Math.max(0, Math.min(maxY(), y));
        if (!gliding) { gliding = true; pos = window.scrollY; requestAnimationFrame(step); }
      };
      this.stGlide = glide;
      const scrollsInside = (el, dy) => {
        for (; el && el !== d.body && el !== de; el = el.parentElement) {
          if (el.hasAttribute && el.hasAttribute('data-st-native')) return true;
          const st = getComputedStyle(el);
          if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) {
            if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
          }
        }
        return false;
      };
      on(window, 'wheel', (e) => {
        if (e.ctrlKey || e.defaultPrevented) return;
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 32; else if (e.deltaMode === 2) dy *= window.innerHeight;
        // small fractional steps come from trackpads: leave them alone
        if (Math.abs(e.deltaX) > Math.abs(dy) || (e.deltaMode === 0 && Math.abs(dy) < 40)) { if (!gliding) target = window.scrollY; return; }
        if (scrollsInside(e.target, dy)) return;
        e.preventDefault();
        glide((gliding ? target : window.scrollY) + dy);
      }, { passive: false });
      on(window, 'scroll', () => { if (!gliding) { target = window.scrollY; pos = target; } }, { passive: true });
      on(window, 'keydown', () => { gliding = false; target = window.scrollY; });
    }
    // ink wipe between pages (not into the study pack library, which keeps its own pages)
    const inkFor = (p) => (p === '/' ? '#4F4086' : /^\/talks\//.test(p) ? '#10131C' : /^\/projects\//.test(p) ? '#064F6E' : /^\/products\//.test(p) ? '#7A4456' : /^\/author\//.test(p) ? '#5A82B3' : '');
    if (de.classList.contains('st-in')) {
      requestAnimationFrame(() => requestAnimationFrame(() => { de.classList.add('st-go'); setTimeout(() => de.classList.remove('st-in', 'st-go'), 800); }));
    }
    on(window, 'pageshow', (e) => { if (e.persisted) { d.querySelectorAll('.st-wipe').forEach((w) => w.remove()); de.classList.remove('st-in', 'st-go'); } });
    if (!still) on(d, 'click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      let u;
      try { u = new URL(a.href, location.href); } catch (er) { return; }
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
      const ink = inkFor(u.pathname);
      if (!ink || /\.[a-z0-9]{2,4}$/i.test(u.pathname)) return;
      e.preventDefault();
      const w = d.createElement('div');
      w.className = 'st-wipe';
      w.style.setProperty('--c', ink);
      w.style.setProperty('--x', e.clientX + 'px');
      w.style.setProperty('--y', e.clientY + 'px');
      d.body.appendChild(w);
      try { sessionStorage.setItem('gt-wipe', ink); } catch (er) {}
      requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('go')));
      setTimeout(() => { location.href = u.href; }, 520);
    }, true);
  }
  stBooks(tries, still) {
    const views = Array.from(document.querySelectorAll('[data-st-book]')).filter((v) => !v.__book);
    const ready = views.filter((v) => v.querySelector('img'));
    if (!ready.length) { if (tries < 60) this.stBT = setTimeout(() => this.stBooks(tries + 1, still), 150); return; }
    ready.forEach((view) => {
      view.__book = 1;
      const pages = Array.from(view.querySelectorAll('img')).map((im) => {
        const lab = im.parentElement && im.parentElement.querySelector('.meta');
        return { src: im.getAttribute('src') || im.getAttribute('data-src'), alt: im.getAttribute('alt') || '', lab: lab ? lab.textContent.trim() : '' };
      }).filter((p) => p.src && p.src.indexOf('{{') < 0);
      if (!pages.length) { view.__book = 0; return; }
      const d = document;
      const book = d.createElement('div');
      book.className = 'st-book';
      book.setAttribute('role', 'region');
      book.setAttribute('aria-roledescription', 'book');
      book.setAttribute('aria-label', (view.getAttribute('aria-label') || 'Document').replace(/, scrollable$/, ''));
      book.tabIndex = 0;
      book.innerHTML = '<div class="st-book-stage"><div class="st-book-spread"><div class="st-pg l"></div><div class="st-pg r"></div></div></div>' +
        '<div class="st-book-bar"><button type="button" class="st-bk prev" aria-label="Previous pages">←</button>' +
        '<span class="st-bk-n" aria-live="polite"></span><button type="button" class="st-bk next" aria-label="Next pages">→</button></div>';
      view.insertAdjacentElement('afterend', book);
      view.classList.add('st-book-src');
      const stage = book.querySelector('.st-book-stage');
      const L = book.querySelector('.st-pg.l'), R = book.querySelector('.st-pg.r');
      const num = book.querySelector('.st-bk-n');
      const fill = (el, i) => {
        el.innerHTML = '';
        el.classList.toggle('blank', !(i >= 0 && i < pages.length));
        if (!(i >= 0 && i < pages.length)) return;
        const im = d.createElement('img');
        im.src = pages[i].src; im.alt = pages[i].alt; im.draggable = false;
        el.appendChild(im);
      };
      const two = () => book.clientWidth >= 720;
      // spreads: the first page sits alone on the right, like a cover
      let at = 0;
      const spreadOf = (i) => (two() ? (i === 0 ? [-1, 0] : (i % 2 ? [i, i + 1] : [i - 1, i])) : [i]);
      const first = (i) => (two() ? (i === 0 ? 0 : (i % 2 ? i : i - 1)) : i);
      const lastStart = () => first(pages.length - 1);
      const label = () => {
        const sp = spreadOf(at).filter((i) => i >= 0 && i < pages.length);
        const a = sp[0] + 1, b = sp[sp.length - 1] + 1;
        num.textContent = (a === b ? 'Page ' + a : 'Pages ' + a + ' to ' + b) + ' of ' + pages.length;
        book.querySelector('.prev').disabled = at <= 0;
        book.querySelector('.next').disabled = at >= lastStart();
      };
      const show = () => {
        book.classList.toggle('one', !two());
        const sp = spreadOf(at);
        if (two()) { fill(L, sp[0]); fill(R, sp[1]); } else { fill(R, sp[0]); L.innerHTML = ''; }
        label();
        [1, 2, 3].forEach((k) => { const n = pages[at + k]; if (n) { const im = new Image(); im.src = n.src; } });
      };
      const im0 = new Image();
      im0.onload = () => { if (im0.naturalWidth) book.style.setProperty('--ar', (im0.naturalWidth / im0.naturalHeight).toFixed(4)); };
      im0.src = pages[0].src;
      let busy = false;
      const turn = (dir) => {
        if (busy) return;
        const nextAt = dir > 0 ? (two() ? (at === 0 ? 1 : at + 2) : at + 1) : (two() ? (at <= 1 ? 0 : at - 2) : at - 1);
        if (nextAt < 0 || nextAt > lastStart() || nextAt === at) return;
        if (still) { at = nextAt; show(); return; }
        busy = true;
        const now = spreadOf(at), then = spreadOf(nextAt);
        const leaf = d.createElement('div');
        leaf.className = 'st-leaf ' + (two() ? (dir > 0 ? 'fwd' : 'back') : (dir > 0 ? 'fwd one' : 'back one'));
        leaf.innerHTML = '<div class="st-face front"></div><div class="st-face backf"></div>';
        const F = leaf.querySelector('.front'), B = leaf.querySelector('.backf');
        if (two()) {
          if (dir > 0) { fill(F, now[1]); fill(B, then[0]); fill(L, now[0]); fill(R, then[1]); }
          else { fill(F, now[0]); fill(B, then[1]); fill(L, then[0]); fill(R, now[1]); }
        } else if (dir > 0) { fill(F, now[0]); B.classList.add('blank'); fill(R, then[0]); }
        else { fill(F, then[0]); B.classList.add('blank'); fill(R, now[0]); }
        stage.appendChild(leaf);
        requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add('go')));
        setTimeout(() => { at = nextAt; show(); leaf.remove(); busy = false; }, 760);
      };
      book.querySelector('.prev').addEventListener('click', () => turn(-1));
      book.querySelector('.next').addEventListener('click', () => turn(1));
      stage.addEventListener('click', (e) => { const r = stage.getBoundingClientRect(); turn(e.clientX - r.left < r.width / 2 ? -1 : 1); });
      book.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); } });
      let sx = null;
      stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
      stage.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) turn(e.clientX < sx ? 1 : -1); sx = null; });
      let wasTwo = two();
      window.addEventListener('resize', () => { if (two() !== wasTwo) { wasTwo = two(); at = first(at); show(); } }, { passive: true });
      show();
    });
    if (views.length > ready.length && tries < 60) this.stBT = setTimeout(() => this.stBooks(tries + 1, still), 150);
  }
  // story:end
'''

def js_block():
    spr = '{' + ', '.join(f"'{k}': ['{v[0]}', {v[1]}, {v[2]}]" for k, v in SPR.items()) + '}'
    return JS.replace('__SPR__', spr)


def strip(s):
    s = re.sub(r'\n?<link data-story [^>]*>', '', s)
    s = re.sub(r'\n?<style data-story>.*?</style>', '', s, flags=re.S)
    s = re.sub(r'\n  // story:start.*?// story:end\n', '\n', s, flags=re.S)
    s = s.replace(' this.stStart(0);', '')
    s = re.sub(r' data-st-ch="[^"]*"', '', s)
    s = re.sub(r' data-st-w=""', '', s)
    s = re.sub(r' class="st-long"', '', s)
    s = re.sub(r'(class="[^"]*?) st-long(?=[ "])', r'\1', s)
    s = re.sub(r'(class="[^"]*?) st-h(?=[ "])', r'\1', s)
    s = s.replace(' data-st-book=""', '')
    s = re.sub(r'(class="[^"]*?) st-scene(?=[ "])', r'\1', s)
    s = re.sub(r'\n?<div class="st-stage"[^>]*>.*?<!--/st-stage-->\n?', '', s, flags=re.S)
    return s


def stage_html(env, outfit, move, label):
    w = SPR[outfit + '-walk']
    m = SPR[outfit + '-' + move]
    return (f'<div class="st-stage" role="img" aria-label="{H.escape(label)}"><img src="/_blob/{ENV[env]}" alt="">'
            f'<div class="st-actor walk" style="--n:{w[1]};--t:{w[1] * w[2]}ms"><img src="/_blob/{w[0]}" alt=""></div>'
            f'<div class="st-actor act" style="--n:{m[1]};--t:{m[1] * m[2]}ms"><img src="/_blob/{m[0]}" alt=""></div></div><!--/st-stage-->')


def text_of(fragment):
    return H.unescape(re.sub(r'<[^>]+>', '', fragment)).strip()


FOOT_BG = '#064F6E'
RAIN = '5f546531126ecca601b1bd5ebcad7ece'


def wobble(text, seed, amp=4.0):
    import random
    rnd = random.Random(seed)
    out = []
    for word in text.split(' '):
        out.append('<span class="w">' + ''.join(
            f'<span class="l" style="--r:{rnd.uniform(-amp, amp):.1f}deg;--y:{rnd.uniform(-0.05, 0.05):.3f}em">{H.escape(ch)}</span>'
            for ch in word) + '</span>')
    return ' '.join(out)


def stars_svg(seed, n=8):
    import random
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.choice([rnd.uniform(2, 12), rnd.uniform(88, 97)])
        y, sz, o = rnd.uniform(8, 80), rnd.choice([10, 14, 18, 24]), rnd.choice([.5, .7, .9])
        out.append(f'<svg class="st-star" style="left:{x:.1f}%;top:{y:.1f}%;width:{sz}px;height:{sz}px;opacity:{o}" viewBox="0 0 20 20" aria-hidden="true">'
                   '<path d="M10 0C10.8 6.6 13.4 9.2 20 10C13.4 10.8 10.8 13.4 10 20C9.2 13.4 6.6 10.8 0 10C6.6 9.2 9.2 6.6 10 0Z" fill="currentColor"/></svg>')
    return ''.join(out)


def footer(s):
    """Swap the page footer for the Get in touch scene (same links, site map and palette credit)."""
    m = re.search(r'<footer class="site-foot[^"]*"[^>]*>.*?</footer>', s, re.S)
    if not m:
        return s
    f = m.group(0)
    chips = re.search(r'<div class="chips"[^>]*>.*?</div>', f, re.S)
    nav = re.search(r'<!-- nav2:foot:start -->.*?<!-- nav2:foot:end -->', f, re.S)
    if not nav:
        nav = re.search(r'<nav class="foot-nav".*?</nav>', f, re.S)
    wada = re.search(r'<!-- wadasite:start -->.*?<!-- wadasite:end -->', f, re.S)
    mail = re.search(r'mailto:([^"?]+)', f)
    email = mail.group(1) if mail else 'mendrofarayang@gmail.com'
    blurb = re.search(r'<p class="(?:foot-blurb|st-lead)">(.*?)</p>', f, re.S)
    blurb = blurb.group(1) if blurb else 'Open to collaborations, discussions, projects, and work in discussing creative science, design, and engineering work.'
    new = (f'<footer class="site-foot st-foot" id="contact" data-st-ch="Contact" data-st-bg="{FOOT_BG}" style="--sf:{FOOT_BG}">\n'
           f'{stars_svg(88)}\n<div class="st-foot-in">\n'
           '<p class="st-over">Jakarta · London · Singapore</p>\n'
           f'<h2 class="st-big" data-st-w="" aria-label="Get in touch."><span aria-hidden="true">{wobble("Get in touch.", 88)}</span></h2>\n'
           f'<p class="st-lead">{blurb}</p>\n'
           f'<button type="button" class="st-mail" data-copy="{email}"><span>{email}</span><span class="st-mail-ok" aria-live="polite">Copied</span></button>\n'
           f'{chips.group(0) if chips else ""}\n'
           f'<div class="st-rain" role="img" aria-label="Pixel scene: the GelasTinta character drinking warm tea on the sofa while it rains outside"><img src="/_blob/{RAIN}" alt="" draggable="false"></div>\n'
           '</div>\n<div class="st-foot-bar">\n'
           f'{nav.group(0) if nav else ""}\n{wada.group(0) if wada else ""}\n</div>\n</footer>')
    return s[:m.start()] + new + s[m.end():]


def core(s, cfg):
    """Fonts, the style block and the stStart method (no markup changes)."""
    vars_ = f":root{{--st-pal:{','.join(cfg['pal'])};--st-outfit:{cfg['outfit']}}}"
    s = s.replace('</helmet>', FONTS + '\n<style data-story>' + vars_ + CSS + '</style>\n</helmet>', 1)
    if 'this.stStart(0)' not in s:
        s = s.replace('componentDidMount() {', 'componentDidMount() { this.stStart(0);', 1)
    k = s.rfind('  renderVals()')
    if k < 0:
        raise SystemExit('no renderVals')
    return s[:k] + js_block().lstrip('\n') + s[k:]


def apply(name, s):
    s = strip(s)
    cfg = page_cfg(name, s)
    body_at = s.index('</helmet>')
    head, body = s[:body_at], s[body_at:]

    # hero chapter
    def hero(m):
        tag = m.group(0)
        tag = tag.replace('<section ', f'<section data-st-ch="{H.escape(cfg["label"])}" ', 1)
        if cfg.get('scene'):
            tag = re.sub(r'class="sec ', 'class="sec st-scene ', tag, count=1)
        return tag
    body = re.sub(r'<section id="main"[^>]*>', hero, body, count=1)

    # chapter sections: top level sections with a heading (h2)
    def chap(m):
        open_tag, inner = m.group(1), m.group(2)
        if 'data-st-ch' in open_tag:
            return m.group(0)
        hm = re.search(r'<h2\b([^>]*)>(.*?)</h2>', inner, re.S)
        if not hm:
            return m.group(0)
        label = text_of(hm.group(2))
        if 'id="newsletter"' in open_tag:
            label = 'Newsletter'
        attrs = hm.group(1)
        if 'class="' in attrs:
            new_attrs = re.sub(r'class="([^"]*)"', lambda c: f'class="{c.group(1)} st-h"', attrs, count=1)
        else:
            new_attrs = attrs + ' class="st-h"'
        if '<' not in hm.group(2).strip() and 'style="' not in attrs:
            new_attrs += ' data-st-w=""'
        if len(label) > 30:
            new_attrs = new_attrs.replace(' st-h"', ' st-h st-long"', 1)
        inner = inner[:hm.start()] + f'<h2{new_attrs}>' + hm.group(2) + '</h2>' + inner[hm.end():]
        open_tag = open_tag.replace('<section', f'<section data-st-ch="{H.escape(label)}"', 1)
        return open_tag + inner + '</section>'
    body = re.sub(r'(<section\b[^>]*>)(.*?)</section>', chap, body, flags=re.S)

    # h1 wobble when it is plain text
    def h1(m):
        attrs, txt = m.group(1), m.group(2)
        if len(H.unescape(txt).strip()) > 36:
            attrs = re.sub(r'class="([^"]*)"', lambda c: f'class="{c.group(1)} st-long"', attrs, count=1) if 'class="' in attrs else attrs + ' class="st-long"'
        return f'<h1{attrs} data-st-w="">{txt}</h1>'
    body = re.sub(r'<h1\b([^>]*)>([^<]+)</h1>', h1, body, count=1)

    # pixel stage in the hero of index pages
    if cfg.get('stage'):
        env, outfit, move, label = cfg['stage']
        where, anchor = cfg['stage_at']
        i = body.find(anchor)
        if i < 0:
            raise SystemExit(f'{name}: stage anchor not found')
        if where == 'after':
            i += len(anchor)
        body = body[:i] + '\n' + stage_html(env, outfit, move, label) + '\n' + body[i:]
    # document previews become books
    body = re.sub(r'<div class="viewer"(?![^>]*data-st-book)', '<div class="viewer" data-st-book=""', body)
    body = body.replace('scroll inside the frame', 'turn the pages')
    body = footer(body)
    return core(head + body, cfg)


def main(argv):
    d = os.path.join(ROOT, 'src/pages')
    if argv[:1] == ['--dir']:
        d, argv = argv[1], argv[2:]
    names = argv or sorted(f for f in os.listdir(d) if f.endswith('.dc.html') and f != 'Home-v2.dc.html')
    for n in names:
        p = os.path.join(d, n)
        s = open(p).read()
        out = apply(n, s)
        open(p, 'w').write(out)
        print(f'{n:32s} chapters {out.count("data-st-ch=")}')


if __name__ == '__main__':
    main(sys.argv[1:])
