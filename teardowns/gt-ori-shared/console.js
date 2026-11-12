// The robot's console, laid out at 1600 x 900: the title block, the stored energy with a dot at the fold angle, the
// torque balance (the elastic torque against the coils' torque now), the motion readout, the paper's table of eight
// modes with the one in use lit, the controls, and the bar with the coil command (nudge and its frequency, the pulse,
// slow motion). update(s) redraws every live part from the frame.
import {energyOf, P, torqueOf, T_DIP, T_PEAK} from './kin.js';

export const C = {ink: '#171C2C', mute: '#6b7088', faint: '#ddd3cf', line: '#ebe3df', panel: 'rgba(255,255,255,.95)', acc: '#E34A2B', accInk: '#B8381E', blue: '#5A82B3', blueInk: '#3D639A', soft: 'rgba(227,74,43,.1)'};
export const VIEWS = ['hero', 'end', 'top', 'rig'];
export const VIEW_LABEL = {hero: 'HERO', end: 'END ON', top: 'TOP', rig: 'THE COIL RIG'};
export const DISPLAY = ['labels', 'cargo', 'orbit'];
export const DISPLAY_LABEL = {labels: 'LABELS', cargo: 'CARGO BALL', orbit: 'ORBIT'};
const M = '−';
const num = (v, d = 1) => {
  const t = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
  return (t < 0 ? M : '') + Math.abs(t).toFixed(d);
};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:8px;box-shadow:0 2px 12px rgba(30,30,50,.06)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 12px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.ph i{display:block;width:3px;height:14px;background:${C.acc}}
.pn{position:absolute;font:500 11px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:28px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:5px;background:#fff;font:700 11.5px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:1.5px solid ${C.acc};opacity:0;z-index:49}
.mt{position:absolute;display:grid;grid-template-columns:62px repeat(4,1fr);gap:3px;font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:.3px}
.mt div{display:flex;align-items:center;justify-content:center;text-align:center;height:30px;border-radius:4px;background:#f6f2f0;color:#4a5068;line-height:12px;padding:0 2px}
.mt .h{background:none;height:32px;color:${C.mute};font-size:9.5px;letter-spacing:.6px}
.mt .r{background:none;justify-content:flex-start;color:${C.ink};font-weight:700;letter-spacing:1px}
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
  const LW = 324;
  const RX = 1252;
  const RW = 324;

  // ------------------------------------------------------------ title block
  add(`<div class="sm" style="position:absolute;left:${LX + 2}px;top:24px;letter-spacing:2.6px;font-size:11.5px">GELASTINTA · TALK 11</div>`);
  add(`<div style="position:absolute;left:${LX}px;top:42px;font-size:34px;font-weight:700;letter-spacing:-.7px;line-height:1">Bistable origami robot <span style="color:${C.acc};font-weight:400">/</span> two valleys, one coil rig</div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 2}px;top:84px;font-size:11.5px;letter-spacing:2px;color:#4f566e">SMALL NUDGES MOVE IT · ONE BIG PULSE SNAPS IT</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:26px;letter-spacing:2.2px">0.81 G · 4 MAGNETS · ABOUT 2 CM OPEN</div>`);
  add(`<div class="mo" style="position:absolute;right:24px;top:44px;font-size:24px;font-weight:600;letter-spacing:-.3px">dE/dθ = 2 T(θ)</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:80px;letter-spacing:1.6px">TWO PANELS EACH TURN θ ABOUT THE HINGE</div>`);

  // ------------------------------------------------------------ 01 stored energy
  const P1 = 112;
  panel(LX, P1, LW, 262, 'TWO VALLEYS', '01');
  add(`<div class="sm" style="position:absolute;left:${LX + 142}px;top:${P1 + 15}px;text-transform:none;letter-spacing:.3px">stored energy, mJ</div>`);
  const CH = {x: LX + 16, y: P1 + 44, w: LW - 32, h: 132};
  add(`<div style="position:absolute;left:${CH.x}px;top:${CH.y}px;width:${CH.w}px;height:${CH.h}px;border-radius:4px;background:#faf6f4"></div>`);
  const ex = (th) => 10 + (th / P.thMax) * (CH.w - 20);
  const ey = (e) => CH.h - 18 - (e / 0.25) * (CH.h - 34);
  {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const th = (P.thMax * i) / 120;
      d += `${i ? 'L' : 'M'}${ex(th).toFixed(1)} ${ey(energyOf(th)).toFixed(1)}`;
    }
    add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}">
      <line x1="0" x2="${CH.w}" y1="${ey(0)}" y2="${ey(0)}" stroke="${C.faint}"/>
      <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="2"/>
      <line x1="${ex(P.thPeak)}" x2="${ex(P.thPeak)}" y1="${ey(P.ePeak)}" y2="${ey(0)}" stroke="${C.acc}" stroke-dasharray="3 3"/>
      <text x="${ex(P.thPeak) + 6}" y="${ey(P.ePeak) - 4}" font-family="JetBrains Mono" font-size="10.5" fill="${C.accInk}">hill 0.21</text>
      <text x="${ex(P.thClosed) - 4}" y="${ey(P.eClosed) - 10}" text-anchor="end" font-family="JetBrains Mono" font-size="10.5" fill="${C.mute}">0.12</text>
      <text x="${ex(0)}" y="${CH.h - 3}" font-family="JetBrains Mono" font-size="10.5" fill="${C.blueInk}">OPEN θ=0</text>
      <text x="${ex(P.thClosed) + 8}" y="${CH.h - 3}" text-anchor="end" font-family="JetBrains Mono" font-size="10.5" fill="${C.blueInk}">CLOSED 1.45</text></svg>`);
  }
  const dot = add(`<div style="position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:${C.acc};border:2px solid #fff;box-shadow:0 0 0 1px ${C.accInk}"></div>`);
  const thEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P1 + 184}px;font-size:19px;font-weight:700;letter-spacing:-.3px"></div>`);
  const eNote = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P1 + 212}px;width:${LW - 32}px;font-size:11px;line-height:15px;color:#4f566e;white-space:normal"></div>`);

  // ------------------------------------------------------------ 02 torque balance
  const P2 = 388;
  panel(LX, P2, LW, 230, 'TORQUE BALANCE', '02');
  add(`<div class="sm" style="position:absolute;left:${LX + 168}px;top:${P2 + 15}px;text-transform:none;letter-spacing:.3px">per panel, N·mm</div>`);
  const TC = {x: LX + 16, y: P2 + 42, w: LW - 32, h: 112};
  add(`<div style="position:absolute;left:${TC.x}px;top:${TC.y}px;width:${TC.w}px;height:${TC.h}px;border-radius:4px;background:#faf6f4"></div>`);
  const TMAX = 0.9;
  const ty = (v) => TC.h / 2 - (Math.max(-TMAX, Math.min(TMAX, v)) / TMAX) * (TC.h / 2 - 6);
  {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const th = (P.thMax * i) / 120;
      d += `${i ? 'L' : 'M'}${ex(th).toFixed(1)} ${ty(torqueOf(th)).toFixed(1)}`;
    }
    add(`<svg style="position:absolute;left:${TC.x}px;top:${TC.y}px;overflow:visible" width="${TC.w}" height="${TC.h}">
      <line x1="0" x2="${TC.w}" y1="${ty(0)}" y2="${ty(0)}" stroke="${C.faint}"/>
      <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="2"/>
      <text x="${ex(0.25) + 10}" y="${ty(T_PEAK) - 3}" font-family="JetBrains Mono" font-size="10" fill="${C.mute}">springs back ${T_PEAK.toFixed(2)}</text>
      <text x="${ex(1.0)}" y="${ty(-T_DIP) + 13}" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="${C.mute}">holds shut ${M}${T_DIP.toFixed(2)}</text></svg>`);
  }
  const tSvg = add(`<svg style="position:absolute;left:${TC.x}px;top:${TC.y}px;overflow:visible" width="${TC.w}" height="${TC.h}"></svg>`);
  const tmEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 162}px;font-size:20px;font-weight:700"></div>`);
  add(`<div class="sm" style="position:absolute;left:${LX + 16}px;top:${P2 + 190}px">FROM THE COILS</div>`);
  const teEl = add(`<div class="mo" style="position:absolute;left:${LX + 168}px;top:${P2 + 162}px;font-size:20px;font-weight:700"></div>`);
  add(`<div class="sm" style="position:absolute;left:${LX + 168}px;top:${P2 + 190}px">FROM THE HINGES</div>`);
  const bEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 207}px;font-size:10.5px;color:${C.mute};white-space:nowrap"></div>`);

  // ------------------------------------------------------------ 03 motion
  const P3 = 112;
  panel(RX, P3, RW, 176, 'MOTION', '03');
  const stEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 40}px;font-size:26px;font-weight:700;letter-spacing:-.5px"></div>`);
  const moEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 74}px;font-size:13px;font-weight:700;letter-spacing:.5px"></div>`);
  const spEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 98}px;width:${RW - 32}px;font-size:11px;line-height:15px;color:#3e4459;white-space:normal"></div>`);
  const dEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 150}px;font-size:10.5px;color:${C.mute};white-space:nowrap"></div>`);

  // ------------------------------------------------------------ 04 the eight modes (the paper's Fig. 1I)
  const P4 = 300;
  panel(RX, P4, RW, 168, 'EIGHT MODES', '04');
  add(`<div class="sm" style="position:absolute;left:${RX + 140}px;top:${P4 + 15}px;text-transform:none;letter-spacing:.3px">paper's Fig. 1I</div>`);
  const mt = add(`<div class="mt" style="left:${RX + 12}px;top:${P4 + 40}px;width:${RW - 24}px">
    <div class="h"></div><div class="h">BIG PULSE<br>SHAPE</div><div class="h">SMALL WAVE<br>SHAPE</div><div class="h">SMALL WAVE<br>MOVE</div><div class="h">BIG PULSE<br>MOVE</div>
    <div class="r">OPEN</div><div data-m="1">① grip</div><div data-m="2">② crawl</div><div data-m="3">③ turn</div><div data-m="4">④ tumble</div>
    <div class="r">CLOSED</div><div data-m="5">⑤ expand</div><div data-m="6">⑥ scamper</div><div data-m="7">⑦ roll</div><div data-m="8">⑧ jump</div></div>`);
  const cells = Array.from(mt.querySelectorAll('[data-m]'));
  add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 144}px;width:${RW - 32}px;font-size:10.5px;color:${C.mute};white-space:nowrap">this model drives ①, ②, ⑤ and ⑦</div>`);

  // ------------------------------------------------------------ 05 controls
  const btn = {};
  const P5 = 480;
  panel(RX, P5, RW, 194, 'CONTROLS', '05');
  const btnRow = (keys, labels, y, wFix) => {
    let x = RX + 16;
    for (const k of keys) {
      const w = wFix ?? Math.round(labels[k].length * 8.2 + 18);
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:${w}px">${labels[k]}</div>`);
      x += w + 5;
    }
  };
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 40}px">VIEW</div>`);
  btnRow(['hero', 'end', 'top'], VIEW_LABEL, P5 + 55);
  btnRow(['rig'], VIEW_LABEL, P5 + 88);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 124}px">SHOW</div>`);
  btnRow(DISPLAY, DISPLAY_LABEL, P5 + 139);

  // ------------------------------------------------------------ 06 the bar: play, the nudge and its frequency, the pulse, slow motion
  const P6 = 764;
  const BX0 = 352;
  const BW0 = 896;
  panel(BX0, P6, BW0, 104, '', '');
  btn.play = add(`<div class="bt" style="left:${BX0 + 16}px;top:${P6 + 30}px;width:46px;height:46px;border-radius:50%;border:none;background:${C.acc};color:#fff;font-size:16px"></div>`);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 80}px;top:${P6 + 16}px;color:${C.ink}">SMALL WAVE · THE NUDGE</div>`);
  btn.nudge = add(`<div class="bt" style="left:${BX0 + 80}px;top:${P6 + 36}px;width:96px">NUDGE OFF</div>`);
  const fVal = add(`<div class="mo" style="position:absolute;left:${BX0 + 190}px;top:${P6 + 34}px;font-size:26px;font-weight:700;letter-spacing:-.5px"></div>`);
  const SP = {x: BX0 + 290, w: 200};
  add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;width:${SP.w}px;height:4px;background:#efe8e5;border-radius:2px"></div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;height:4px;background:${C.acc};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:${P6 + 44}px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x - 4}px;top:${P6 + 62}px">${P.fMin} HZ</div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + SP.w - 30}px;top:${P6 + 62}px">${P.fMax} HZ</div>`);
  const nNote = add(`<div class="mo" style="position:absolute;left:${BX0 + 80}px;top:${P6 + 80}px;font-size:10.5px;color:${C.mute};white-space:nowrap"></div>`);
  add(`<div style="position:absolute;left:${BX0 + 520}px;top:${P6 + 14}px;width:1px;height:76px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 538}px;top:${P6 + 16}px;color:${C.ink}">BIG PULSE · TIME</div>`);
  btn.pulse = add(`<div class="bt" style="left:${BX0 + 538}px;top:${P6 + 34}px;width:150px;background:${C.ink};color:#fff;border-color:${C.ink}">PULSE · CLOSE</div>`);
  btn.slow = add(`<div class="bt" style="left:${BX0 + 538}px;top:${P6 + 66}px;width:150px">SLOW MOTION ×10</div>`);
  const pNote = add(`<div class="mo" style="position:absolute;left:${BX0 + 704}px;top:${P6 + 36}px;width:178px;font-size:11px;line-height:16px;color:#4f566e;white-space:normal"></div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:${LX}px;top:880px;letter-spacing:1.4px">HUANG ET AL., NAT. COMMUN. (2026), CC BY 4.0 · ENERGY AND TORQUE READ FROM FIG. 1C, 1D · FOLD SPEED, TORQUES AND DRAWING ARE MY MODEL</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:880px;letter-spacing:2px">DRAG TO TURN · SCROLL TO ZOOM</div>`);

  // ------------------------------------------------------------ the 3D tags, the pointer
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
  const fK = (f) => (f - P.fMin) / (P.fMax - P.fMin);

  return {
    spots,
    btn,
    root: ui,
    SP,
    P6,
    knobSpot: (f) => [SP.x + fK(f) * SP.w, P6 + 52],
    update(s) {
      const closed = s.th > P.thPeak;
      // 01 the dot on the energy curve
      dot.style.left = `${(CH.x + ex(s.th)).toFixed(1)}px`;
      dot.style.top = `${(CH.y + ey(energyOf(s.th))).toFixed(1)}px`;
      thEl.innerHTML = `θ ${num(s.th, 2)} rad<span style="font-size:11.5px;font-weight:600;color:${C.mute};letter-spacing:.5px"> · ${num(energyOf(s.th), 3)} mJ stored</span>`;
      eNote.textContent = s.snapping
        ? 'The coils push harder than the hinges push back: the panels race up the hill and drop into the other valley.'
        : closed
          ? 'Closed valley. The hinges hold it shut with no power: the paper calls this self locking.'
          : 'Open valley. Leave it alone and it stays open, with no power needed.';
      // 02 torque balance: the elastic curve, a marker for the coils' torque now
      const x0 = ex(s.th);
      const yM = ty(s.tauM);
      const over = Math.abs(s.tauM) > (closed ? T_DIP : T_PEAK) * 1.02;
      tSvg.innerHTML = `<line x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="4" y2="${TC.h - 4}" stroke="${C.blue}" stroke-dasharray="2 3"/>
        <line x1="${(x0 - 22).toFixed(1)}" x2="${(x0 + 22).toFixed(1)}" y1="${yM.toFixed(1)}" y2="${yM.toFixed(1)}" stroke="${over ? C.acc : C.blue}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${x0.toFixed(1)}" cy="${ty(torqueOf(s.th)).toFixed(1)}" r="4" fill="${C.ink}"/>`;
      tmEl.textContent = num(s.tauM, 2);
      tmEl.style.color = over ? C.accInk : C.blueInk;
      teEl.textContent = num(torqueOf(s.th), 2);
      bEl.textContent = Math.abs(s.field) > 0.5 ? `field on the platform now ≈ ${Math.round(Math.abs(s.field))} mT` : 'coils off';
      // 03 motion
      stEl.textContent = s.snapping ? 'SNAPPING' : closed ? 'CLOSED' : 'OPEN';
      stEl.style.color = s.snapping ? C.accInk : C.ink;
      const mode = s.snapping ? (s.pulseDir > 0 ? 1 : 5) : s.nudge ? (closed ? 7 : 2) : 0;
      const MODE = {0: 'STILL', 1: '① GRIPPING', 2: '② CRAWLING', 5: '⑤ EXPANDING', 7: '⑦ ROLLING'};
      moEl.textContent = MODE[mode] + (s.waiting ? ' · PULSE WAITS FOR THE ROLL' : '');
      moEl.style.color = mode ? C.accInk : C.mute;
      if (mode === 2) spEl.innerHTML = `Crawling at about <b>${num(s.crawl, 2)} mm/s</b>, read from the paper's Fig. 2F at 6 A and ${num(s.f, 1)} Hz.`;
      else if (mode === 7) spEl.innerHTML = Math.abs(s.f - P.rollF) < 0.05 ? `Rolling: the paper measured <b>5.45 body lengths/s</b> at 2 Hz. Half a cycle rolls it half way round.` : `Rolling one turn per cycle (my assumption away from 2 Hz, where the paper measured 5.45 body lengths/s).`;
      else if (mode === 1) spEl.innerHTML = `The pulse beats the hill: the panels snap shut in about 0.06 s, as in the paper's Fig. 3B.`;
      else if (mode === 5) spEl.innerHTML = `A pulse the other way pops it open again, about 0.06 s.`;
      else spEl.innerHTML = closed ? `Shut and holding. Nudge it to roll, pulse it to open.` : `Sitting open. Nudge it to crawl, pulse it to close.`;
      dEl.textContent = `travelled ${num(s.dist, 1)} mm · snaps ${s.snaps}`;
      for (const c of cells) {
        const on = +c.getAttribute('data-m') === mode;
        c.style.background = on ? C.acc : '#f6f2f0';
        c.style.color = on ? '#fff' : '#4a5068';
      }
      // controls
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.acc : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.acc : C.faint;
      };
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      onBtn('slow', s.slow < 0.99);
      onBtn('nudge', s.nudge);
      btn.nudge.textContent = s.nudge ? 'NUDGE ON' : 'NUDGE OFF';
      btn.pulse.textContent = closed ? 'PULSE · OPEN' : 'PULSE · CLOSE';
      btn.pulse.style.background = s.snapping || s.waiting ? C.acc : C.ink;
      btn.pulse.style.borderColor = s.snapping || s.waiting ? C.acc : C.ink;
      pNote.textContent = closed ? 'About 78 mN pushes it open in the paper\'s force test.' : 'About 33 mN pushes it shut in the paper\'s force test.';
      btn.play.innerHTML = s.paused ? '▶' : '❚❚';
      const k = fK(s.f);
      fVal.innerHTML = `${s.f.toFixed(1)}<span style="font-size:13px;font-weight:600;color:${C.mute}"> Hz</span>`;
      spFill.style.width = `${(k * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${(SP.x + k * SP.w).toFixed(1)}px`;
      nNote.textContent = (closed ? 'FIELD MAPS ABOUT ±30 MT · ' : 'FIELD MAPS ABOUT ±25 MT · ') + 'PULSE ABOUT ±150 MT' + (s.slow < 0.99 ? ' · SHOWN 10× SLOWER' : '');
      // tags in the scene
      let sv = '';
      let hv = '';
      for (const g of s.tags) {
        if (g.line) sv += `<line x1="${g.line[0].toFixed(1)}" y1="${g.line[1].toFixed(1)}" x2="${g.at[0].toFixed(1)}" y2="${g.at[1].toFixed(1)}" stroke="${g.c}" stroke-width="1.4" opacity="${g.o.toFixed(2)}"/><circle cx="${g.line[0].toFixed(1)}" cy="${g.line[1].toFixed(1)}" r="3" fill="${g.c}" opacity="${g.o.toFixed(2)}"/>`;
        const [x, y] = g.at;
        hv += `<div class="mo" style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:translate(4px,-50%);font-size:${g.size ?? 12.5}px;font-weight:700;color:${g.c};opacity:${g.o.toFixed(2)};white-space:nowrap;background:rgba(255,255,255,.88);padding:2px 5px;border-radius:3px">${g.text}</div>`;
      }
      tagSvg.innerHTML = sv;
      tagDiv.innerHTML = hv;
      pointer(s.cursor);
    },
    pointer,
  };
}
