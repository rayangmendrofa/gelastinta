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
    'Talks.dc.html': dict(pal=['#10131C', '#4F4086', '#064F6E', '#7A4456'], outfit='suit', label='Talks', scene=True,
                          stage=('stage', 'suit', 'present', 'Pixel scene: the GelasTinta character in a suit walks onto a stage and presents a growing chart'),
                          stage_at=('after', '<div class="prose intro" style="align-self:end">')),
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
html.st-on .st-card{position:relative;margin-left:calc(var(--rail) + var(--st-gap));margin-right:var(--st-gap);border-radius:var(--st-r) var(--st-r) 0 0;border-top:0;border-bottom:0;box-shadow:0 -16px 40px rgba(16,19,28,.22);overflow-x:clip}
:where(html.st-on .st-card){background-color:var(--st-paper,#F3EFE6)}
html.st-on .st-card + .st-card,html.st-on .st-card + .site-foot{margin-top:calc(var(--st-r) * -1)}
html.st-on .site-foot{position:relative;z-index:1;margin-left:calc(var(--rail) + var(--st-gap));margin-right:var(--st-gap);border-radius:var(--st-r) var(--st-r) 0 0;box-shadow:0 -16px 40px rgba(16,19,28,.22)}
html.st-live .st-card{position:sticky}
html.st-on .st-scene{background:transparent!important;color:var(--st-fg);box-shadow:none}
html.st-on .st-scene::before,html.st-on .st-scene::after{display:none}
html.st-on h1{font-family:'Anton',Impact,sans-serif;font-weight:400;font-style:normal;text-transform:uppercase;letter-spacing:.006em;line-height:.94;font-size:clamp(50px,6.4vw,118px)}
html.st-on h1.t-title{font-size:clamp(40px,4.8vw,84px);line-height:.96}
html.st-on h1 *{font-family:inherit;font-weight:inherit}
html.st-on .st-h{font-family:'Anton',Impact,sans-serif;font-weight:400;font-style:normal;text-transform:uppercase;letter-spacing:.01em;line-height:.96;font-size:clamp(34px,4.2vw,64px)}
html.st-on .st-scene h1,html.st-on .st-scene .st-h{color:var(--st-fg)}
html.st-on .st-scene :is(.kicker,.meta,.lead,.prose,.prose p,.prose b,figcaption,.muted):not(.card *){color:var(--st-fg)}
html.st-live .st-hpin{position:sticky;top:calc(var(--st-top) + 24px)}
.st-xon{overflow:visible!important;scroll-snap-type:none!important;will-change:transform}
html.st-on [data-st-w] .w{display:inline-block;white-space:nowrap}
html.st-on [data-st-w] .l{display:inline-block;transform:translateY(calc(var(--y) * var(--k,0))) rotate(calc(var(--r) * var(--k,0)));transition:transform .25s linear}
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
@media (prefers-reduced-motion:reduce){html.st-on [data-st-w] .l{transition:none}.st-actor.walk{display:none}.st-actor.act{animation:none;opacity:1}.st-actor img,.st-walker img{animation:none}}
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
      window.scrollTo({ top: Math.max(0, y), behavior: still ? 'auto' : 'smooth' });
      de.classList.remove('st-railopen');
      chip.setAttribute('aria-expanded', 'false');
    };
    on(rail, 'click', (e) => { const b = e.target.closest('[data-st-go]'); if (b) go(+b.getAttribute('data-st-go')); });
    on(chip, 'click', () => { const o = de.classList.toggle('st-railopen'); chip.setAttribute('aria-expanded', o ? 'true' : 'false'); });
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
      // the card being covered shrinks back a little as the next one slides over it
      if (!still) cards.forEach((card, i) => {
        const nx = cards[i + 1] || d.querySelector('.site-foot');
        const r = card.getBoundingClientRect();
        let k = 0;
        if (nx && r.bottom > 0 && r.top < vh) {
          const nt = nx.getBoundingClientRect().top;
          if (nt < vh && r.top <= parseFloat(card.style.top || 0) + 1) k = Math.min(1, Math.max(0, (vh - nt) / (vh - hh)));
        }
        if (k > 0.001) {
          card.style.transformOrigin = '50% ' + Math.round(-r.top + (vh + hh) / 2) + 'px';
          card.style.transform = 'scale(' + (1 - k * 0.05).toFixed(4) + ')';
          card.style.filter = 'brightness(' + (1 - k * 0.22).toFixed(3) + ')';
        } else if (card.style.transform) { card.style.transform = ''; card.style.filter = ''; card.style.transformOrigin = ''; }
      });
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
        h.style.setProperty('--k', (0.12 + Math.abs(p) * 1.9).toFixed(3));
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
    s = re.sub(r'(class="[^"]*?) st-h(?=[ "])', r'\1', s)
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
        inner = inner[:hm.start()] + f'<h2{new_attrs}>' + hm.group(2) + '</h2>' + inner[hm.end():]
        open_tag = open_tag.replace('<section', f'<section data-st-ch="{H.escape(label)}"', 1)
        return open_tag + inner + '</section>'
    body = re.sub(r'(<section\b[^>]*>)(.*?)</section>', chap, body, flags=re.S)

    # h1 wobble when it is plain text
    body = re.sub(r'<h1\b([^>]*)>([^<]+)</h1>', lambda m: f'<h1{m.group(1)} data-st-w="">{m.group(2)}</h1>' if 'data-st-w' not in m.group(1) else m.group(0), body, count=1)

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
