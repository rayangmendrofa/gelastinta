// The Hail Mary's console, laid out at 1600 x 900: the title block, the sequence, gravity against spin rate, the
// numbers, what it feels like in the lab, the controls, and the bar with the input (the sequence) and the spin rate.
// update(s) redraws every live part from the frame's state.
import {gOf, P, periodOf, rimOf, headFeetOf, coriolisOf, STAGES} from './kin.js';

export const C = {ink: '#29120F', mute: '#8F7F74', faint: '#E3D6C8', line: '#EFE4D8', panel: 'rgba(255,253,250,.95)', acc: '#2B44C8', accInk: '#1F33A0', red: '#D9452B', taupe: '#8F7F74', soft: '#FBF4EC'};
export const VIEWS = ['ship', 'inside', 'spools', 'whole'];
export const VIEW_LABEL = {ship: 'SHIP', inside: 'INSIDE', spools: 'SPOOLS', whole: 'WHOLE SPIN'};
export const DISPLAY = ['glass', 'labels', 'paths', 'orbit'];
export const DISPLAY_LABEL = {glass: 'GLASS', labels: 'LABELS', paths: 'PATHS', orbit: 'ORBIT'};
const STEP_TEXT = [
  'One long ship. While the engines fire, everyone is pressed towards the back, so “down” points at the engines.',
  'Engines off. The crew compartment unlatches and drifts away from the heavy rear half on two Zylon cables while the whole ship starts to turn.',
  'The crew compartment turns 180° on its two hinges, so its nose points inwards and the floors face outwards.',
  'Both halves circle their shared centre of mass: the crew 78 m out, the heavy rear half 26 m out. “Down” is now outwards.',
];
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:8px;box-shadow:0 2px 12px rgba(41,18,15,.06)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 12px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.ph i{display:block;width:3px;height:14px;background:${C.acc}}
.pn{position:absolute;font:500 11px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:28px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:5px;background:#fff;font:700 11.5px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:1.5px solid ${C.acc};opacity:0;z-index:49}
.row{position:absolute;display:flex;justify-content:space-between;font:500 12px 'JetBrains Mono',monospace;color:#4a3a33}
.row b{color:${C.ink};font-weight:700}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const fx = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '∞');

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
  const LW = 324;
  const RX = 1252;
  const RW = 324;

  // ------------------------------------------------------------ title block
  add(`<div class="sm" style="position:absolute;left:${LX + 2}px;top:24px;letter-spacing:2.6px;font-size:11.5px">GELASTINTA · TALK 04</div>`);
  add(`<div style="position:absolute;left:${LX}px;top:42px;font-size:34px;font-weight:700;letter-spacing:-.7px;line-height:1">Hail Mary <span style="color:${C.acc};font-weight:400">/</span> split in two, spin for gravity</div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 2}px;top:84px;font-size:11.5px;letter-spacing:2px;color:#6b5a52">TWO HALVES · TWO ZYLON CABLES · ONE SPIN</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:26px;letter-spacing:2.2px">104 M OF CABLE · MASS 3 : 1 · ${P.wBook}°/S</div>`);
  add(`<div class="mo" style="position:absolute;right:24px;top:44px;font-size:24px;font-weight:600;letter-spacing:-.3px">a = ω² r</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:80px;letter-spacing:1.6px">SPIN FASTER OR SIT FURTHER OUT: HEAVIER</div>`);

  // ------------------------------------------------------------ 01 the sequence
  const P1 = 112;
  panel(LX, P1, LW, 250, 'CENTRIFUGE SEQUENCE', '01');
  const steps = STAGES.map((g, i) => {
    const y = P1 + 44 + i * 30;
    const dotEl = add(`<div style="position:absolute;left:${LX + 18}px;top:${y + 5}px;width:12px;height:12px;border-radius:50%;border:2px solid ${C.faint};box-sizing:border-box"></div>`);
    const lab = add(`<div class="mo" style="position:absolute;left:${LX + 40}px;top:${y + 1}px;font-size:13px;font-weight:700;letter-spacing:1px">STEP ${i + 1} · ${g.name}</div>`);
    return {dotEl, lab};
  });
  const stepNote = add(`<div style="position:absolute;left:${LX + 16}px;top:${P1 + 172}px;width:${LW - 32}px;font-size:13px;line-height:18px;color:#4a3a33"></div>`);

  // ------------------------------------------------------------ 02 gravity against spin rate
  const P2 = 374;
  panel(LX, P2, LW, 238, 'GRAVITY FROM SPIN', '02');
  const CH = {x: LX + 40, y: P2 + 44, w: LW - 60, h: 128};
  const GX = P.wMax;
  const GY = 3;
  const cx = (w) => (w / GX) * CH.w;
  const cy = (g) => CH.h - (Math.min(GY, g) / GY) * CH.h;
  {
    let dc = '';
    let dr = '';
    for (let i = 0; i <= 90; i++) {
      const w = (GX * i) / 90;
      dc += `${i ? 'L' : 'M'}${cx(w).toFixed(1)} ${cy(gOf(w, P.rCrew)).toFixed(1)}`;
      dr += `${i ? 'L' : 'M'}${cx(w).toFixed(1)} ${cy(gOf(w, P.rRear)).toFixed(1)}`;
    }
    let ticks = '';
    for (const g of [0, 1, 2, 3]) ticks += `<line x1="0" x2="${CH.w}" y1="${cy(g)}" y2="${cy(g)}" stroke="${g === 1 ? C.faint : C.line}" ${g === 1 ? '' : 'stroke-dasharray="2 3"'}/><text x="-6" y="${cy(g) + 4}" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="${C.mute}">${g} g</text>`;
    for (const w of [0, 10, 20, 30]) ticks += `<text x="${cx(w)}" y="${CH.h + 14}" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="${C.mute}">${w}</text>`;
    add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}">${ticks}
      <line x1="${cx(P.wBook)}" x2="${cx(P.wBook)}" y1="0" y2="${CH.h}" stroke="${C.acc}" stroke-dasharray="3 3" opacity=".7"/>
      <text x="${cx(P.wBook) + 4}" y="10" font-family="JetBrains Mono" font-size="10" fill="${C.accInk}">book</text>
      <path d="${dr}" fill="none" stroke="${C.taupe}" stroke-width="2"/>
      <path d="${dc}" fill="none" stroke="${C.acc}" stroke-width="2.2"/></svg>`);
    add(`<div class="sm" style="position:absolute;left:${CH.x + CH.w - 64}px;top:${CH.y + CH.h + 4}px">°/S</div>`);
  }
  const dotC = add(`<div style="position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:${C.acc};border:2px solid #fff;box-shadow:0 0 0 1px ${C.accInk}"></div>`);
  const dotR = add(`<div style="position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:${C.taupe};border:2px solid #fff"></div>`);
  const gLine = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 196}px;width:${LW - 32}px;font-size:12px;line-height:17px;color:#4a3a33"></div>`);

  // ------------------------------------------------------------ 03 the numbers
  const P3 = 112;
  panel(RX, P3, RW, 236, 'THE NUMBERS', '03');
  const nums = ['cable out', 'crew compartment from centre', 'rear half from centre', 'spin rate', 'one turn every', 'crew compartment speed'].map((k, i) => {
    const y = P3 + 44 + i * 27;
    add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${y}px;font-size:12px;color:#4a3a33">${k}</div>`);
    return add(`<div class="mo" style="position:absolute;right:${1600 - RX - RW + 16}px;top:${y - 2}px;font-size:14px;font-weight:700"></div>`);
  });
  add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 210}px;width:${RW - 32}px;font-size:10.5px;color:${C.mute}">rear 3 × heavier: the centre sits ¼ of the way out</div>`);

  // ------------------------------------------------------------ 04 inside the lab
  const P4 = 360;
  panel(RX, P4, RW, 186, 'IN THE LAB', '04');
  const downEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 40}px;font-size:28px;font-weight:700;letter-spacing:-.5px"></div>`);
  const downNote = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 76}px;width:${RW - 32}px;font-size:11.5px;line-height:16px;color:#4a3a33"></div>`);
  const labRows = ['a 70 kg person feels', 'head lighter than feet by', 'walking at 1 m/s, sideways push'].map((k, i) => {
    const y = P4 + 112 + i * 22;
    add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${y}px;font-size:11.5px;color:#4a3a33">${k}</div>`);
    return add(`<div class="mo" style="position:absolute;right:${1600 - RX - RW + 16}px;top:${y - 1}px;font-size:12.5px;font-weight:700"></div>`);
  });

  // ------------------------------------------------------------ 05 controls
  const btn = {};
  const P5 = 558;
  panel(RX, P5, RW, 194, 'CONTROLS', '05');
  const btnRow = (keys, labels, y) => {
    let x = RX + 16;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 8.2 + 18);
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:${w}px">${labels[k]}</div>`);
      x += w + 5;
    }
  };
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 40}px">VIEW</div>`);
  btnRow(['ship', 'inside', 'spools'], VIEW_LABEL, P5 + 55);
  btnRow(['whole'], VIEW_LABEL, P5 + 88);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 124}px">SHOW</div>`);
  btnRow(DISPLAY, DISPLAY_LABEL, P5 + 139);

  // ------------------------------------------------------------ 06 the bar: play, the sequence, the spin rate
  const P6 = 764;
  const BX0 = 352;
  const BW0 = 896;
  panel(BX0, P6, BW0, 104, '', '');
  btn.play = add(`<div class="bt" style="left:${BX0 + 16}px;top:${P6 + 30}px;width:46px;height:46px;border-radius:50%;border:none;background:${C.acc};color:#fff;font-size:16px"></div>`);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 80}px;top:${P6 + 16}px;color:${C.ink}">THE SEQUENCE · THE INPUT</div>`);
  let sx = BX0 + 80;
  for (const g of STAGES) {
    const w = Math.round(g.name.length * 8.2 + 22);
    btn[g.key] = add(`<div class="bt" style="left:${sx}px;top:${P6 + 36}px;width:${w}px">${g.name}</div>`);
    sx += w + 5;
  }
  const SQ = {x: BX0 + 80, w: sx - BX0 - 85};
  add(`<div style="position:absolute;left:${SQ.x}px;top:${P6 + 76}px;width:${SQ.w}px;height:3px;background:#efe4d8;border-radius:2px"></div>`);
  const sqFill = add(`<div style="position:absolute;left:${SQ.x}px;top:${P6 + 76}px;height:3px;background:${C.acc};border-radius:2px"></div>`);
  const sqNote = add(`<div class="mo" style="position:absolute;left:${SQ.x}px;top:${P6 + 84}px;font-size:10px;color:${C.mute}"></div>`);
  const DV = BX0 + 486;
  add(`<div style="position:absolute;left:${DV}px;top:${P6 + 14}px;width:1px;height:76px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${DV + 18}px;top:${P6 + 16}px;color:${C.ink}">SPIN RATE</div>`);
  const wVal = add(`<div class="mo" style="position:absolute;left:${DV + 18}px;top:${P6 + 34}px;font-size:26px;font-weight:700;letter-spacing:-.5px"></div>`);
  const SP = {x: DV + 160, w: 210};
  add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;width:${SP.w}px;height:4px;background:#efe4d8;border-radius:2px"></div>`);
  const kB = P.wBook / P.wMax;
  add(`<div style="position:absolute;left:${SP.x + kB * SP.w}px;top:${P6 + 42}px;width:1px;height:20px;background:${C.mute}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + kB * SP.w}px;top:${P6 + 26}px;transform:translateX(-50%)">BOOK</div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;height:4px;background:${C.acc};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:${P6 + 44}px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x - 4}px;top:${P6 + 62}px">0</div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + SP.w - 34}px;top:${P6 + 62}px">${P.wMax}°/S</div>`);
  const wNote = add(`<div class="mo" style="position:absolute;left:${DV + 18}px;top:${P6 + 80}px;font-size:10.5px;color:${C.mute}"></div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:${LX}px;top:880px;letter-spacing:1.4px">NUMBERS: WEIR, PROJECT HAIL MARY (2021) · SHIP DRAWN BY GELASTINTA, NOT TO SCALE OF THE BOOK · CABLES DRAWN THICKER · SEQUENCE SPED UP</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:880px;letter-spacing:2px">DRAG TO TURN · SCROLL TO ZOOM</div>`);

  // ------------------------------------------------------------ tags, pointer
  const tagSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const tagDiv = add(`<div style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="24" height="24" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };
  const wK = (w) => Math.min(1, Math.max(0, w / P.wMax));

  return {
    spots,
    btn,
    root: ui,
    SP,
    P6,
    knobSpot: (w) => [SP.x + wK(w) * SP.w, P6 + 52],
    update(s) {
      // 01 sequence
      steps.forEach((x, i) => {
        const on = s.stage === i;
        const done = s.stage > i;
        x.dotEl.style.background = on ? C.acc : done ? C.faint : '#fff';
        x.dotEl.style.borderColor = on ? C.acc : C.faint;
        x.lab.style.color = on ? C.accInk : done ? C.mute : C.ink;
      });
      stepNote.textContent = STEP_TEXT[s.stage];
      // 02 gravity
      const wNow = Math.min(GX, s.w);
      dotC.style.left = `${(CH.x + cx(wNow)).toFixed(1)}px`;
      dotC.style.top = `${(CH.y + cy(gOf(wNow, s.rCrew))).toFixed(1)}px`;
      dotR.style.left = `${(CH.x + cx(wNow)).toFixed(1)}px`;
      dotR.style.top = `${(CH.y + cy(gOf(wNow, s.rRear))).toFixed(1)}px`;
      gLine.innerHTML = `<span style="color:${C.accInk}">● crew ${fx(s.gCrew, 2)} g</span>  ·  <span style="color:${C.taupe}">● rear half ${fx(s.gRear, 2)} g</span>`;
      // 03 numbers
      const per = periodOf(s.w);
      nums[0].textContent = `${fx(s.d, 1)} m`;
      nums[1].textContent = `${fx(s.rCrew, 1)} m`;
      nums[2].textContent = `${fx(s.rRear, 1)} m`;
      nums[3].textContent = `${fx(s.w, 2)} °/s`;
      nums[4].textContent = per > 999 ? '—' : `${fx(per, 1)} s`;
      nums[5].textContent = `${fx(rimOf(s.w, s.rCrew), 1)} m/s`;
      // 04 lab
      const g = s.gDown;
      downEl.innerHTML = g < 0.02 ? `≈ 0 g<span style="font-size:13px;font-weight:600;color:${C.mute}"> weightless</span>` : `${fx(g, 2)} g<span style="font-size:13px;font-weight:600;color:${C.mute}"> “down”</span>`;
      downEl.style.color = g > 0.02 ? C.red : C.ink;
      downNote.textContent = s.thrust > 0.5 ? 'Under thrust: down points at the engines.' : s.stage >= 3 || s.flip > 170 ? 'From the spin: down points away from the centre, onto the floor.' : s.flip > 5 ? 'Turning over: the floors swing round to face outwards.' : 'Engines off, barely turning: everything floats.';
      labRows[0].textContent = `${Math.round(70 * g)} kg`;
      const spinG = s.stage >= 1 && s.thrust < 0.5;
      labRows[1].textContent = spinG && g > 0.02 ? `${fx(headFeetOf(s.rCrew) * 100, 1)} %` : '—';
      labRows[2].textContent = spinG && g > 0.02 ? `${fx(coriolisOf(s.w, s.rCrew) * 100, 0)} % of g` : '—';
      // controls
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.acc : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.acc : C.faint;
      };
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      STAGES.forEach((g2, i) => onBtn(g2.key, s.stage === i));
      btn.play.innerHTML = s.paused ? '▶' : '❚❚';
      sqFill.style.width = `${((Math.min(4, s.s) / 4) * SQ.w).toFixed(1)}px`;
      sqNote.textContent = s.s >= 3.98 ? 'SPINNING · REAL SPEED' : 'SEQUENCE SPED UP TO WATCH';
      // spin rate
      const k = wK(s.wTarget);
      wVal.innerHTML = `${s.wTarget.toFixed(2)}<span style="font-size:12px;font-weight:600;color:${C.mute}"> °/s</span>`;
      spFill.style.width = `${(k * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${(SP.x + k * SP.w).toFixed(1)}px`;
      wNote.textContent = `CREW ${fx(gOf(s.wTarget, P.rCrew), 2)} G AT 78 M`;
      // tags
      let sv = '';
      let hv = '';
      for (const t of s.tags) {
        if (t.line) sv += `<line x1="${t.line[0].toFixed(1)}" y1="${t.line[1].toFixed(1)}" x2="${t.at[0].toFixed(1)}" y2="${t.at[1].toFixed(1)}" stroke="${t.c}" stroke-width="1.4" opacity="${t.o.toFixed(2)}"/><circle cx="${t.line[0].toFixed(1)}" cy="${t.line[1].toFixed(1)}" r="3" fill="${t.c}" opacity="${t.o.toFixed(2)}"/>`;
        const [x, y] = t.at;
        hv += `<div class="mo" style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:translate(4px,-50%);font-size:12.5px;font-weight:700;color:${t.c};opacity:${t.o.toFixed(2)};white-space:nowrap;background:rgba(255,253,250,.9);padding:2px 5px;border-radius:3px">${t.text}</div>`;
      }
      tagSvg.innerHTML = sv;
      tagDiv.innerHTML = hv;
      pointer(s.cursor);
    },
    pointer,
  };
}
