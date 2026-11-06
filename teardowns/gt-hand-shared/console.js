// The hand's console, laid out at 1600 x 900: the title block, the muscle signal, the six servos, the tendon and the
// three joints of one finger, the fingertip from the report's equations, the controls, and the bar with the one input
// (muscle flex), the EMG filter and the wrist. update(s) redraws every live part from the frame.
import {DIGITS, MODE_KEYS, MODES, P} from './kin.js';

export const C = {ink: '#1f2430', mute: '#7a8291', faint: '#cfd4dc', line: '#e1e5ea', panel: 'rgba(255,255,255,.95)', acc: '#2B44C8', accSoft: 'rgba(43,68,200,.09)', warm: '#c4513a'};
export const VIEWS = ['hero', 'side', 'palm'];
export const VIEW_LABEL = {hero: 'HERO', side: 'SIDE', palm: 'INSIDE THE PALM'};
export const DISPLAY = ['glass', 'labels', 'orbit'];
export const DISPLAY_LABEL = {glass: 'GLASS PALM', labels: 'LABELS', orbit: 'ORBIT'};
export const ISO = ['all', 'thumb', 'index', 'middle', 'ring', 'little'];
export const ISO_LABEL = {all: 'ALL', thumb: 'THUMB', index: 'INDEX', middle: 'MIDDLE', ring: 'RING', little: 'LITTLE'};
const M = '−';
const SUB = (n) => `<sub style="font-size:.72em;line-height:0">${n}</sub>`;
const num = (v, d = 1) => {
  const t = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
  return (t < 0 ? M : '') + Math.abs(t).toFixed(d);
};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:8px;box-shadow:0 2px 12px rgba(30,40,60,.06)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 12px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.ph i{display:block;width:3px;height:14px;background:${C.acc}}
.pn{position:absolute;font:500 11px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:28px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:5px;background:#fff;font:700 11.5px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.tb{position:absolute;font:500 13px 'JetBrains Mono',monospace;white-space:nowrap}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:1.5px solid ${C.acc};opacity:0;z-index:49}
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
  add(`<div class="sm" style="position:absolute;left:${LX + 2}px;top:24px;letter-spacing:2.6px;font-size:11.5px">GELASTINTA · BENG DISSERTATION</div>`);
  add(`<div style="position:absolute;left:${LX}px;top:42px;font-size:34px;font-weight:700;letter-spacing:-.7px;line-height:1">Prosthetic hand <span style="color:${C.acc};font-weight:400">/</span> muscle to motion</div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 2}px;top:84px;font-size:11.5px;letter-spacing:2px;color:#5b6372">EMG SIGNAL → SERVO → TENDON → THREE JOINTS</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:26px;letter-spacing:2.2px">3D PRINTED · 5 FINGERS · 6 SERVOS · 300 G</div>`);
  add(`<div class="mo" style="position:absolute;right:24px;top:44px;font-size:24px;font-weight:600;letter-spacing:-.3px">s = r φ = 3 ρ θ</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:80px;letter-spacing:1.6px">ONE TENDON TURNS ALL THREE JOINTS ALIKE</div>`);

  // ------------------------------------------------------------ 01 the muscle signal
  const P1 = 112;
  panel(LX, P1, LW, 214, 'MUSCLE SIGNAL', '01');
  add(`<div class="sm" style="position:absolute;left:${LX + 158}px;top:${P1 + 15}px;text-transform:none;letter-spacing:.3px">EMG · last 3 s</div>`);
  const CH = {x: LX + 16, y: P1 + 44, w: LW - 32, h: 104};
  add(`<div style="position:absolute;left:${CH.x}px;top:${CH.y}px;width:${CH.w}px;height:${CH.h}px;border-radius:4px;background:#f6f7f9"></div>`);
  const chart = add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}"></svg>`);
  add(`<div class="sm" style="position:absolute;left:${CH.x}px;top:${CH.y + CH.h + 8}px;text-transform:none;letter-spacing:.3px"><span style="color:#9aa3b1">━</span> raw &nbsp; <span style="color:${C.acc}">━</span> command to the servos</div>`);
  const flexEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P1 + 176}px;font-size:22px;font-weight:700;letter-spacing:-.4px"></div>`);
  const filtEl = add(`<div class="mo" style="position:absolute;right:${1600 - CH.x - CH.w + 8}px;top:${CH.y + 6}px;font-size:10.5px;font-weight:700;letter-spacing:.8px;background:rgba(255,255,255,.9);padding:1px 5px;border-radius:3px"></div>`);

  // ------------------------------------------------------------ 02 the servos
  const P2 = 338;
  panel(LX, P2, LW, 300, 'SIX SERVOS', '02');
  add(`<div class="sm" style="position:absolute;left:${LX + 138}px;top:${P2 + 15}px;text-transform:none;letter-spacing:.3px">0.15 s per 60° · 400°/s</div>`);
  const BX = LX + 90;
  const BW = 150;
  const servoRows = DIGITS.map((d, i) => {
    const y = P2 + 44 + i * 30;
    const lab = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${y}px;font-size:12.5px;font-weight:700">${d.name}</div>`);
    add(`<div style="position:absolute;left:${BX}px;top:${y + 6}px;width:${BW}px;height:6px;border-radius:3px;background:#e8ebf0"></div>`);
    const f = add(`<div style="position:absolute;left:${BX}px;top:${y + 6}px;height:6px;border-radius:3px;background:#9aa3b1"></div>`);
    const tg = add(`<div style="position:absolute;top:${y + 2}px;width:2px;height:14px;background:${C.ink}"></div>`);
    const v = add(`<div class="mo" style="position:absolute;right:${1600 - LX - LW + 16}px;top:${y}px;font-size:12.5px;font-weight:600"></div>`);
    return {lab, f, tg, v};
  });
  const wy = P2 + 44 + 5 * 30;
  const wLab = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${wy}px;font-size:12.5px;font-weight:700">WRIST</div>`);
  add(`<div style="position:absolute;left:${BX}px;top:${wy + 6}px;width:${BW}px;height:6px;border-radius:3px;background:#e8ebf0"></div>`);
  const wF = add(`<div style="position:absolute;left:${BX}px;top:${wy + 6}px;height:6px;border-radius:3px;background:#9aa3b1"></div>`);
  const wV = add(`<div class="mo" style="position:absolute;right:${1600 - LX - LW + 16}px;top:${wy}px;font-size:12.5px;font-weight:600"></div>`);
  add(`<div style="position:absolute;left:${LX + 16}px;top:${P2 + 228}px;width:${LW - 32}px;height:1px;background:${C.line}"></div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 238}px;font-size:12px;line-height:18px;color:#4a5262">close time = (0.15 / 60°) × 160° = <b style="color:${C.ink}">${P.closeTime.toFixed(2)} s</b></div>`);
  const ampEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 260}px;font-size:12px;line-height:18px;color:#4a5262"></div>`);

  // ------------------------------------------------------------ 03 tendon and joints of one finger
  const P3 = 112;
  panel(RX, P3, RW, 226, 'TENDON AND JOINTS', '03');
  const focusEl = add(`<div class="sm" style="position:absolute;left:${RX + 196}px;top:${P3 + 15}px;text-transform:none;letter-spacing:.4px;color:${C.acc};font-weight:700"></div>`);
  const sEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 42}px;font-size:12.5px;line-height:19px;white-space:pre"></div>`);
  const JX = RX + 64;
  const JW = 170;
  const jRows = ['MCP', 'PIP', 'DIP'].map((n, k) => {
    const y = P3 + 112 + k * 26;
    const lab = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${y}px;font-size:12.5px;font-weight:700">${n}</div>`);
    add(`<div style="position:absolute;left:${JX}px;top:${y + 6}px;width:${JW}px;height:6px;border-radius:3px;background:#e8ebf0"></div>`);
    const f = add(`<div style="position:absolute;left:${JX}px;top:${y + 6}px;height:6px;border-radius:3px;background:${C.acc}"></div>`);
    const v = add(`<div class="mo" style="position:absolute;right:${1600 - RX - RW + 16}px;top:${y}px;font-size:12.5px;font-weight:600"></div>`);
    return {lab, f, v};
  });
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P3 + 196}px;text-transform:none;letter-spacing:.3px">θ${SUB(1)} = θ${SUB(2)} = θ${SUB(3)}: equal joint frames, ρ = ${(P.rho * 1000).toFixed(1)} mm</div>`);

  // ------------------------------------------------------------ 04 the fingertip
  const P4 = 350;
  panel(RX, P4, RW, 196, 'FINGERTIP', '04');
  add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 42}px;font-size:11.5px;line-height:17px;color:#4a5262;white-space:pre">P${SUB(3)} = Σ l${SUB('k')} (cos kθ, sin kθ)\n|V${SUB(3)}| = ω |Σ k l${SUB('k')} (−sin kθ, cos kθ)|</div>`);
  const tipXY = ['ALONG', 'OUT'].map((k, i) => {
    const x = RX + 16 + i * 104;
    add(`<div class="sm" style="position:absolute;left:${x}px;top:${P4 + 86}px">${k} (mm)</div>`);
    return add(`<div class="mo" style="position:absolute;left:${x}px;top:${P4 + 101}px;font-size:23px;font-weight:600;letter-spacing:-.5px"></div>`);
  });
  add(`<div class="sm" style="position:absolute;left:${RX + 224}px;top:${P4 + 86}px">SPEED</div>`);
  const vEl = add(`<div class="mo" style="position:absolute;left:${RX + 224}px;top:${P4 + 101}px;font-size:23px;font-weight:600;letter-spacing:-.5px"></div>`);
  const lEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 140}px;font-size:11.5px;color:#4a5262"></div>`);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P4 + 164}px;text-transform:none;letter-spacing:.3px">grip measured: at least ${P.grip * 1000} g per finger</div>`);

  // ------------------------------------------------------------ 05 controls
  const btn = {};
  const P5 = 558;
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
  btnRow(VIEWS, VIEW_LABEL, P5 + 55);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 90}px">SHOW</div>`);
  btnRow(DISPLAY, DISPLAY_LABEL, P5 + 105);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 140}px">ISOLATE ONE FINGER</div>`);
  const isoW = {all: 32, thumb: 48, index: 46, middle: 52, ring: 38, little: 48};
  {
    let x = RX + 16;
    for (const k of ISO) {
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${P5 + 155}px;width:${isoW[k]}px;font-size:10px;padding:0 3px;letter-spacing:.6px">${ISO_LABEL[k]}</div>`);
      x += isoW[k] + 4;
    }
  }

  // ------------------------------------------------------------ 06 the bar: the one input, the grip, the filter, the wrist
  const P6 = 764;
  const BX0 = 352;
  const BW0 = 896;
  panel(BX0, P6, BW0, 104, '', '');
  add(`<div class="sm" style="position:absolute;left:${BX0 + 18}px;top:${P6 + 16}px;color:${C.ink}">MUSCLE FLEX · THE INPUT</div>`);
  const flexVal = add(`<div class="mo" style="position:absolute;left:${BX0 + 18}px;top:${P6 + 34}px;font-size:28px;font-weight:700;letter-spacing:-.5px"></div>`);
  const SP = {x: BX0 + 110, w: 250};
  add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;width:${SP.w}px;height:4px;background:#e8ebf0;border-radius:2px"></div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;height:4px;background:${C.acc};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:${P6 + 44}px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x - 4}px;top:${P6 + 66}px">RELAXED</div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + SP.w - 62}px;top:${P6 + 66}px">FULL FLEX</div>`);
  const DIV = (x) => add(`<div style="position:absolute;left:${x}px;top:${P6 + 14}px;width:1px;height:76px;background:${C.line}"></div>`);
  DIV(BX0 + 392);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 410}px;top:${P6 + 16}px">GRIP</div>`);
  {
    let x = BX0 + 410;
    for (const k of MODE_KEYS) {
      const w = Math.round(MODES[k].name.length * 8.2 + 18);
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${P6 + 34}px;width:${w}px">${MODES[k].name}</div>`);
      x += w + 5;
    }
  }
  const modeNote = add(`<div class="mo" style="position:absolute;left:${BX0 + 410}px;top:${P6 + 72}px;font-size:10.5px;color:${C.mute}"></div>`);
  DIV(BX0 + 736);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 752}px;top:${P6 + 16}px">SIGNAL · WRIST</div>`);
  btn.filter = add(`<div class="bt" style="left:${BX0 + 752}px;top:${P6 + 34}px;width:128px">EMG FILTER</div>`);
  btn.wrist = add(`<div class="bt" style="left:${BX0 + 752}px;top:${P6 + 66}px;width:128px">TURN WRIST</div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:${LX}px;top:880px;letter-spacing:2px">R T MENDROFA BENG PROJECT · NUMBERS FROM THE REPORT · PHALANX LENGTHS: TYPICAL ADULT HAND</div>`);
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
  const path = (vals, col, wid) => {
    if (!vals.length) return '';
    const n = vals.length;
    let d = '';
    vals.forEach((v, i) => {
      const x = (i / (n - 1)) * CH.w;
      const y = CH.h - 6 - Math.min(1.15, Math.max(0, v)) * (CH.h - 16);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wid}" stroke-linejoin="round"/>`;
  };

  return {
    spots,
    btn,
    root: ui,
    SP,
    P6,
    knobSpot: (f) => [SP.x + f * SP.w, P6 + 52],
    update(s) {
      // 01: the signal
      chart.innerHTML = `<line x1="0" x2="${CH.w}" y1="${CH.h - 6}" y2="${CH.h - 6}" stroke="${C.faint}"/>` + path(s.rawHist, '#a7afbb', 1) + path(s.cmdHist, C.acc, 2.2);
      flexEl.innerHTML = `${Math.round(s.cmd * 100)}%<span style="font-size:12px;font-weight:600;color:${C.mute};letter-spacing:.5px"> command</span>`;
      filtEl.innerHTML = s.filtered ? `<span style="color:${C.acc}">FILTERED · 300 MS AVERAGE</span>` : `<span style="color:${C.warm}">RAW · SAMPLED EVERY 100 MS</span>`;
      // 02: the servos
      servoRows.forEach((r, i) => {
        const a = s.accent[i];
        r.f.style.width = `${((s.phi[i] / P.phiMax) * BW).toFixed(1)}px`;
        r.f.style.background = a > 0.3 ? C.acc : '#9aa3b1';
        r.tg.style.left = `${(BX + (s.target[i] / P.phiMax) * BW).toFixed(1)}px`;
        r.v.textContent = `${num(s.phi[i], 0)}°`;
        r.lab.style.color = a > 0.3 ? C.acc : s.iso === i + 1 ? C.acc : C.ink;
      });
      const wa = s.wristMoving ? 1 : 0;
      wF.style.width = `${((s.wrist / 180) * BW).toFixed(1)}px`;
      wF.style.background = wa ? C.acc : '#9aa3b1';
      wV.textContent = `${num(s.wrist, 0)}°`;
      wLab.style.color = wa ? C.acc : C.ink;
      ampEl.innerHTML = `current now <b style="color:${C.ink}">${s.amps.toFixed(2)} A</b> · 5 V, 1 A per two servos`;
      // 03: the focus finger
      const fi = s.focus;
      const d = DIGITS[fi];
      focusEl.textContent = `${d.name} FINGER`.replace('THUMB FINGER', 'THUMB');
      const sMM = s.tendon[fi] * 1000;
      sEl.innerHTML = `servo φ   <b>${num(s.phi[fi], 1)}°</b>\ntendon s = r φ = 7 mm × ${num(s.phi[fi] * Math.PI / 180, 2)} rad\n         = <b style="color:${C.acc}">${num(sMM, 1)} mm</b> of ${(P.tendonMax * 1000).toFixed(1)} mm`;
      jRows.forEach((r, k) => {
        const on = k < d.L.length;
        r.lab.style.opacity = on ? 1 : 0.3;
        r.f.style.width = on ? `${((s.theta[fi] / P.thetaMax) * JW).toFixed(1)}px` : '0px';
        r.v.textContent = on ? `${num(s.theta[fi], 1)}°` : '·';
      });
      // 04: the fingertip
      tipXY[0].textContent = num(s.tip.along * 1000, 1);
      tipXY[1].textContent = num(s.tip.out * 1000, 1);
      vEl.innerHTML = `${(s.tipV * 1000).toFixed(0)}<span style="font-size:12px;color:${C.mute}"> mm/s</span>`;
      lEl.innerHTML = d.L.map((l, k) => `l${SUB(k + 1)} ${(l * 1000).toFixed(0)}`).join(' &nbsp; ') + ' mm';
      // controls
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.acc : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.acc : C.faint;
      };
      for (const k of VIEWS) onBtn(k, s.view === k && !s.iso);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      ISO.forEach((k, i) => onBtn(k, s.iso === i));
      for (const k of MODE_KEYS) onBtn(k, s.mode === k);
      onBtn('filter', s.filtered);
      btn.filter.textContent = s.filtered ? 'EMG FILTER ON' : 'EMG FILTER OFF';
      btn.wrist.textContent = s.wristGoal > 90 ? 'PALM DOWN ⟲' : 'PALM UP ⟳';
      onBtn('wrist', !!s.wristMoving);
      modeNote.textContent = s.mode === 'pinch' ? 'THUMB 55° + INDEX 60°: THE TIPS MEET' : s.mode === 'point' ? 'INDEX STAYS OUT' : 'EVERY FINGER FOLLOWS THE MUSCLE';
      // the input
      flexVal.textContent = `${Math.round(s.flex * 100)}%`;
      spFill.style.width = `${(s.flex * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${(SP.x + s.flex * SP.w).toFixed(1)}px`;
      // tags in the scene
      let sv = '';
      let hv = '';
      for (const g of s.tags) {
        if (g.line) sv += `<line x1="${g.line[0].toFixed(1)}" y1="${g.line[1].toFixed(1)}" x2="${g.at[0].toFixed(1)}" y2="${g.at[1].toFixed(1)}" stroke="${g.c}" stroke-width="1.4" opacity="${g.o.toFixed(2)}"/><circle cx="${g.line[0].toFixed(1)}" cy="${g.line[1].toFixed(1)}" r="3" fill="${g.c}" opacity="${g.o.toFixed(2)}"/>`;
        const [x, y] = g.at;
        hv += `<div class="mo" style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:translate(${g.dx ?? 6}px,-50%);font-size:${g.size ?? 12.5}px;font-weight:700;color:${g.c};opacity:${g.o.toFixed(2)};white-space:nowrap;background:rgba(255,255,255,.88);padding:2px 5px;border-radius:3px">${g.text}</div>`;
      }
      tagSvg.innerHTML = sv;
      tagDiv.innerHTML = hv;
      pointer(s.cursor);
    },
    pointer,
  };
}
