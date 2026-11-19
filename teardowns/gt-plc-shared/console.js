// The T-101 console, laid out at 1600 x 900 in the GelasTinta site colours: the title block, the active step, the
// readings with a small trend, the outputs, the controls, the batch timeline at the bottom and the 3D labels.
// update(s) redraws every live part from the frame.
import {BATCH, DT, DURATION, SPANS, STEP_NAME, STEP_NOTE} from './data.js';

export const C = {ink: '#10131C', mute: '#6b7080', faint: '#d5d9e2', line: '#e3e6ec', panel: 'rgba(255,255,255,.94)', blue: '#2B44C8', orange: '#D9622B', green: '#2E9E6B', red: '#C8323C', band: {10: '#e3e8fa', 20: '#d3dbf6', 30: '#fbe6d8', 40: '#f6d6c2', 50: '#e0f1e6'}};
export const VIEWS = ['hero', 'inside', 'pump', 'top'];
export const VIEW_LABEL = {hero: 'HERO', inside: 'INSIDE', pump: 'DRAIN', top: 'TOP'};
export const DISPLAY = ['glass', 'labels'];
export const DISPLAY_LABEL = {glass: 'GLASS TANK', labels: 'LABELS'};
export const SPEEDS = [5, 10, 20];
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:8px;box-shadow:0 2px 14px rgba(16,19,28,.06)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 12px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.ph i{display:block;width:3px;height:14px;background:${C.blue}}
.pn{position:absolute;font:500 11px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:28px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:5px;background:#fff;font:700 11.5px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.bt.on{background:${C.ink};border-color:${C.ink};color:#fff}
.chip{position:absolute;height:26px;display:flex;align-items:center;padding:0 10px;border:1px solid ${C.faint};border-radius:4px;font:700 11px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:#3a4152;background:#fff;box-sizing:border-box}
.chip.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.lamp{position:absolute;display:flex;align-items:center;gap:10px;font:700 12px 'JetBrains Mono',monospace;letter-spacing:1px}
.lamp i{display:block;width:12px;height:12px;border-radius:50%;background:#c9ced8;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.lamp.on i{background:${C.green};box-shadow:0 0 0 4px rgba(46,158,107,.18)}
.lamp.heat.on i{background:${C.orange};box-shadow:0 0 0 4px rgba(217,98,43,.2)}
.lamp span{font-weight:500;color:${C.mute};letter-spacing:.4px;font-size:11px}
.tag{position:absolute;transform:translate(-50%,-100%);padding:3px 7px;border-radius:4px;background:${C.ink};color:#fff;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1px;white-space:nowrap}
.tag:after{content:'';position:absolute;left:50%;bottom:-5px;width:1px;height:5px;background:${C.ink}}
.tag.on{background:${C.green}}
.tag.on:after{background:${C.green}}
.tag.heat{background:${C.orange}}
.tag.heat:after{background:${C.orange}}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:1.5px solid ${C.blue};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    if (title) add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    if (n) add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 14}px">${n}</div>`);
  };
  const LX = 24;
  const LW = 320;
  const RX = 1256;
  const RW = 320;

  // ------------------------------------------------------------ title block
  add(`<div class="sm" style="position:absolute;left:${LX + 2}px;top:24px;letter-spacing:2.6px;font-size:11.5px">GELASTINTA · INDUSTRY PROJECT IP1</div>`);
  add(`<div style="position:absolute;left:${LX}px;top:42px;font-size:34px;font-weight:700;letter-spacing:-.7px;line-height:1">T-101 batch tank <span style="color:${C.blue};font-weight:400">/</span> one batch in 3D</div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 2}px;top:84px;font-size:11.5px;letter-spacing:2px;color:#4a5060">FILL · STIR · HEAT · HOLD · DRAIN, DRIVEN BY THE REAL PLC PROGRAM</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:26px;letter-spacing:2.2px">40 L · 45 KW HEATER · OPENPLC · 50 MS SCAN</div>`);
  const clock = add(`<div class="mo" style="position:absolute;right:24px;top:44px;font-size:26px;font-weight:600;letter-spacing:-.3px"></div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:80px;letter-spacing:1.6px">TIME SINCE START · ONE RECORDED BATCH</div>`);

  // ------------------------------------------------------------ 01 the step
  const P1 = 116;
  panel(LX, P1, LW, 238, 'THE STEP', '01');
  const chips = {};
  const order = [10, 20, 30, 40, 50, 99];
  order.forEach((k, i) => {
    const x = LX + 16 + (i % 3) * 98;
    const y = P1 + 44 + Math.floor(i / 3) * 32;
    chips[k] = add(`<div class="chip" style="left:${x}px;top:${y}px;width:92px;justify-content:center">${k === 99 ? 'DONE' : STEP_NAME[k]}</div>`);
  });
  const stepBig = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P1 + 118}px;font-size:22px;font-weight:700;letter-spacing:-.3px"></div>`);
  const stepNote = add(`<div style="position:absolute;left:${LX + 16}px;top:${P1 + 150}px;width:${LW - 32}px;font-size:13.5px;line-height:19px;color:#3a4152;white-space:normal"></div>`);

  // ------------------------------------------------------------ 02 readings and trend
  const P2 = 368;
  panel(LX, P2, LW, 300, 'READINGS', '02');
  const RDX = [0, 98, 206];
  const rd = [['LEVEL LT-101', C.blue], ['TEMP TT-101', C.orange], ['HEATER E-101', C.ink]].map(([k, col], i) => {
    const x = LX + 16 + RDX[i];
    add(`<div class="sm" style="position:absolute;left:${x}px;top:${P2 + 42}px;font-size:9.5px">${k}</div>`);
    return add(`<div class="mo" style="position:absolute;left:${x}px;top:${P2 + 58}px;font-size:21px;font-weight:700;letter-spacing:-.6px;color:${col}"></div>`);
  });
  const TC = {x: LX + 16, y: P2 + 104, w: LW - 32, h: 150};
  const tx = (t) => (t / DURATION) * TC.w;
  const ty = (v) => TC.h - 6 - (v / 100) * (TC.h - 14);
  let bands = '';
  for (const s of SPANS) bands += `<rect x="${tx(s.t0).toFixed(1)}" y="0" width="${(tx(s.t1) - tx(s.t0)).toFixed(1)}" height="${TC.h}" fill="${C.band[s.step]}"/>`;
  let dl = '';
  let dT = '';
  BATCH.forEach((b, i) => {
    dl += `${i ? 'L' : 'M'}${tx(i * DT).toFixed(1)} ${ty(b[0]).toFixed(1)}`;
    dT += `${i ? 'L' : 'M'}${tx(i * DT).toFixed(1)} ${ty(b[1]).toFixed(1)}`;
  });
  const trend = add(`<svg style="position:absolute;left:${TC.x}px;top:${TC.y}px;overflow:visible" width="${TC.w}" height="${TC.h}">
    <defs><clipPath id="tclip"><rect x="0" y="0" width="0" height="${TC.h}"/></clipPath></defs>
    ${bands}
    <line x1="0" x2="${TC.w}" y1="${ty(45)}" y2="${ty(45)}" stroke="${C.orange}" stroke-dasharray="2 3"/>
    <path d="${dl}" fill="none" stroke="${C.blue}" stroke-width="1.2" opacity=".18"/>
    <path d="${dT}" fill="none" stroke="${C.orange}" stroke-width="1.2" opacity=".18"/>
    <g clip-path="url(#tclip)"><path d="${dl}" fill="none" stroke="${C.blue}" stroke-width="2.2"/><path d="${dT}" fill="none" stroke="${C.orange}" stroke-width="2.2"/></g>
    <line class="cur" x1="0" x2="0" y1="0" y2="${TC.h}" stroke="${C.ink}" stroke-width="1.2"/>
    <text x="${TC.w}" y="${ty(45) - 4}" text-anchor="end" font-family="JetBrains Mono" font-size="9.5" fill="${C.orange}">45 °C</text></svg>`);
  const clipR = trend.querySelector('#tclip rect');
  const curL = trend.querySelector('line.cur');
  add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 262}px;font-size:10.5px;color:${C.mute};letter-spacing:.4px">recorded from the PLC program every 0.5 s</div>`);

  // ------------------------------------------------------------ 03 outputs
  const P3 = 116;
  panel(RX, P3, RW, 238, 'OUTPUTS', '03');
  const OUT = [['xv101', 'XV-101', 'inlet A'], ['xv102', 'XV-102', 'inlet B'], ['m101', 'M-101', 'agitator'], ['e101', 'E-101', 'heater'], ['xv103', 'XV-103', 'outlet valve'], ['p101', 'P-101', 'drain pump']];
  const lamps = {};
  OUT.forEach(([k, tag, what], i) => {
    lamps[k] = add(`<div class="lamp${k === 'e101' ? ' heat' : ''}" style="left:${RX + 18}px;top:${P3 + 46 + i * 30}px"><i></i>${tag} <span>${what}</span></div>`);
  });

  // ------------------------------------------------------------ 04 controls
  const btn = {};
  const P4 = 368;
  panel(RX, P4, RW, 236, 'CONTROLS', '04');
  const row = (keys, labels, y, wFix) => {
    let x = RX + 16;
    for (const k of keys) {
      const w = wFix ?? Math.round(labels[k].length * 8.2 + 18);
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:${w}px">${labels[k]}</div>`);
      x += w + 6;
    }
  };
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P4 + 42}px">VIEW</div>`);
  row(VIEWS, VIEW_LABEL, P4 + 58, 68);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P4 + 98}px">DISPLAY</div>`);
  row(DISPLAY, DISPLAY_LABEL, P4 + 114);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P4 + 154}px">SPEED</div>`);
  row(SPEEDS.map((s) => 'x' + s), Object.fromEntries(SPEEDS.map((s) => ['x' + s, '×' + s])), P4 + 170, 52);
  add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 208}px;font-size:10.5px;color:${C.mute};letter-spacing:.3px">drag to orbit · scroll to zoom</div>`);

  // ------------------------------------------------------------ the timeline bar
  const BY = 812;
  add(`<div class="cp" style="left:${LX}px;top:${BY - 30}px;width:${1600 - 2 * LX}px;height:84px"></div>`);
  btn.play = add(`<div class="bt" style="left:${LX + 16}px;top:${BY - 4}px;width:96px;height:34px;font-size:12.5px"></div>`);
  const TL = {x: LX + 136, w: 1600 - 2 * LX - 136 - 24, y: BY + 2};
  let tb = '';
  for (const s of SPANS) {
    const x0 = TL.x + (s.t0 / DURATION) * TL.w;
    const w = ((s.t1 - s.t0) / DURATION) * TL.w;
    tb += `<div style="position:absolute;left:${x0}px;top:${TL.y - 22}px;width:${w}px;text-align:center" class="sm">${STEP_NAME[s.step]}</div>`;
    tb += `<div style="position:absolute;left:${x0}px;top:${TL.y}px;width:${w - 2}px;height:22px;background:${C.band[s.step]};border-radius:3px"></div>`;
  }
  ui.insertAdjacentHTML('beforeend', tb);
  const prog = add(`<div style="position:absolute;left:${TL.x}px;top:${TL.y + 26}px;height:3px;width:0;background:${C.ink};border-radius:2px"></div>`);
  const knob = add(`<div style="position:absolute;top:${TL.y - 4}px;width:3px;height:30px;margin-left:-1px;background:${C.ink};border-radius:2px"></div>`);
  add(`<div class="mo" style="position:absolute;left:${TL.x}px;top:${TL.y + 34}px;font-size:10.5px;color:${C.mute}">0 s</div>`);
  add(`<div class="mo" style="position:absolute;left:${TL.x + TL.w - 40}px;top:${TL.y + 34}px;width:40px;text-align:right;font-size:10.5px;color:${C.mute}">159 s</div>`);
  add(`<div class="mo" style="position:absolute;left:${TL.x + TL.w / 2 - 300}px;top:${TL.y + 34}px;width:600px;text-align:center;font-size:10.5px;color:${C.mute}">drag the timeline to scrub · vessel proportions are illustrative</div>`);

  // ------------------------------------------------------------ 3D tags, pointer
  const tagEls = {};
  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.5 15 L17 15 Z" fill="#fff" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ring = add(`<div class="ring"></div>`);
  const centre = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width || 60) / 2, parseFloat(n.style.top) + 14];
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const txt = (e, v) => {
    if (e.textContent !== v) e.textContent = v;
  };
  return {
    root: ui,
    btn,
    spots,
    TL,
    update(s) {
      const t = s.t;
      txt(clock, `${t.toFixed(1)} s`);
      for (const k of order) chips[k].classList.toggle('on', k === s.step);
      txt(stepBig, s.step === 0 ? 'IDLE' : STEP_NAME[s.step]);
      txt(stepNote, STEP_NOTE[s.step] || '');
      txt(rd[0], `${s.level.toFixed(1)} %`);
      txt(rd[1], `${s.temp.toFixed(1)} °C`);
      txt(rd[2], `${Math.round(s.heat)} %`);
      const x = tx(t);
      clipR.setAttribute('width', x.toFixed(1));
      curL.setAttribute('x1', x.toFixed(1));
      curL.setAttribute('x2', x.toFixed(1));
      const on = {xv101: s.xv101, xv102: s.xv102, m101: s.m101, e101: s.heat > 0.5, xv103: s.xv103, p101: s.p101};
      for (const k in lamps) lamps[k].classList.toggle('on', !!on[k]);
      const px = TL.x + (t / DURATION) * TL.w;
      prog.style.width = `${px - TL.x}px`;
      knob.style.left = `${px}px`;
      txt(btn.play, s.paused ? 'PLAY ▶' : 'PAUSE ❚❚');
      for (const v of VIEWS) btn[v].classList.toggle('on', s.view === v);
      for (const k of DISPLAY) btn[k].classList.toggle('on', !!s.display[k]);
      for (const sp of SPEEDS) btn['x' + sp].classList.toggle('on', s.speed === sp);
      // tags
      for (const g of s.tags) {
        let n = tagEls[g.k];
        if (!n) n = tagEls[g.k] = add(`<div class="tag">${g.label}</div>`);
        if (!g.p || g.a < 0.02) {
          n.style.display = 'none';
          continue;
        }
        n.style.display = '';
        n.style.left = `${g.p[0]}px`;
        n.style.top = `${g.p[1]}px`;
        n.style.opacity = g.a.toFixed(2);
        n.className = 'tag' + (g.on ? (g.k === 'e101' ? ' heat' : ' on') : '');
      }
      // pointer
      const c = s.cursor;
      cur.style.transform = `translate(${c.x - 2}px, ${c.y - 2}px) scale(${c.press ? 0.9 : 1})`;
      ring.style.left = `${c.ringX}px`;
      ring.style.top = `${c.ringY}px`;
      ring.style.opacity = c.ring.toFixed(2);
      ring.style.transform = `scale(${1.6 - c.ring * 0.6})`;
    },
  };
}
