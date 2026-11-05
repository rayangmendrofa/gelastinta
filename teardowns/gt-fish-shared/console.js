// The fish's console, laid out at 1600 x 900: the title block, the clip's energy with a dot where it is now, the tail
// angle over the last second, swimming, the clip's design numbers, the controls, and the bar with the one input (the
// tail beat frequency), play, slow motion and water or air. update(s) redraws every live part from the frame.
import {energyOf, P} from './kin.js';

export const C = {ink: '#252413', mute: '#7e8466', faint: '#d5d6c6', line: '#e4e5da', panel: 'rgba(255,255,255,.95)', acc: '#F48067', accInk: '#B05C4B', green: '#4F9A72', olive: '#837E31', accSoft: 'rgba(244,128,103,.12)'};
export const VIEWS = ['hero', 'top', 'clip', 'head'];
export const VIEW_LABEL = {hero: 'HERO', top: 'TOP', clip: 'THE CLIP', head: 'INSIDE THE HEAD'};
export const DISPLAY = ['glass', 'labels', 'orbit'];
export const DISPLAY_LABEL = {glass: 'GLASS HEAD', labels: 'LABELS', orbit: 'ORBIT'};
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
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:8px;box-shadow:0 2px 12px rgba(40,40,20,.06)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 12px 'JetBrains Mono',monospace;letter-spacing:1.6px}
.ph i{display:block;width:3px;height:14px;background:${C.acc}}
.pn{position:absolute;font:500 11px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:28px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:5px;background:#fff;font:700 11.5px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
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
  add(`<div class="sm" style="position:absolute;left:${LX + 2}px;top:24px;letter-spacing:2.6px;font-size:11.5px">GELASTINTA · TALK 07</div>`);
  add(`<div style="position:absolute;left:${LX}px;top:42px;font-size:34px;font-weight:700;letter-spacing:-.7px;line-height:1">Hair clip fish <span style="color:${C.acc};font-weight:400">/</span> one servo, two snaps</div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 2}px;top:84px;font-size:11.5px;letter-spacing:2px;color:#5f6347">LOAD SLOWLY, SNAP FAST, FLICK THE TAIL</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:26px;letter-spacing:2.2px">21.5 CM · 125 G · 7.4 V · ONE SERVO</div>`);
  add(`<div class="mo" style="position:absolute;right:24px;top:44px;font-size:24px;font-weight:600;letter-spacing:-.3px">St = f A / U = 0.28</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:80px;letter-spacing:1.6px">TAIL BEATS, AMPLITUDE AND SPEED IN ONE NUMBER</div>`);

  // ------------------------------------------------------------ 01 the clip's energy
  const P1 = 112;
  panel(LX, P1, LW, 270, 'TWO VALLEYS', '01');
  add(`<div class="sm" style="position:absolute;left:${LX + 142}px;top:${P1 + 15}px;text-transform:none;letter-spacing:.3px">stored energy</div>`);
  const CH = {x: LX + 16, y: P1 + 44, w: LW - 32, h: 132};
  add(`<div style="position:absolute;left:${CH.x}px;top:${CH.y}px;width:${CH.w}px;height:${CH.h}px;border-radius:4px;background:#f8f8f3"></div>`);
  const XS = 1.35;
  const ex = (x) => ((x + XS) / (2 * XS)) * CH.w;
  const ey = (u) => CH.h - 14 - Math.min(1.25, u) * (CH.h - 34);
  {
    let d = '';
    for (let i = 0; i <= 120; i++) {
      const x = -XS + (2 * XS * i) / 120;
      d += `${i ? 'L' : 'M'}${ex(x).toFixed(1)} ${ey(energyOf(x)).toFixed(1)}`;
    }
    add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}">
      <line x1="0" x2="${CH.w}" y1="${ey(0)}" y2="${ey(0)}" stroke="${C.faint}"/>
      <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="2"/>
      <line x1="${ex(0)}" x2="${ex(0)}" y1="${ey(1)}" y2="${ey(0)}" stroke="${C.acc}" stroke-dasharray="3 3"/>
      <text x="${ex(0) + 6}" y="${ey(1) + 12}" font-family="JetBrains Mono" font-size="10.5" fill="${C.accInk}">barrier</text>
      <text x="${ex(-1)}" y="${CH.h - 2}" text-anchor="middle" font-family="JetBrains Mono" font-size="10.5" fill="${C.mute}">shape A</text>
      <text x="${ex(1)}" y="${CH.h - 2}" text-anchor="middle" font-family="JetBrains Mono" font-size="10.5" fill="${C.mute}">shape B</text></svg>`);
  }
  const dot = add(`<div style="position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:${C.acc};border:2px solid #fff;box-shadow:0 0 0 1px ${C.accInk}"></div>`);
  const phaseEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P1 + 186}px;font-size:19px;font-weight:700;letter-spacing:-.3px"></div>`);
  const phaseNote = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P1 + 214}px;width:${LW - 32}px;font-size:11px;line-height:15px;color:#5f6347;white-space:normal"></div>`);

  // ------------------------------------------------------------ 02 the tail over the last second
  const P2 = 396;
  panel(LX, P2, LW, 214, 'TAIL ANGLE', '02');
  add(`<div class="sm" style="position:absolute;left:${LX + 138}px;top:${P2 + 15}px;text-transform:none;letter-spacing:.3px">last second · ±${P.psi}°</div>`);
  const TC = {x: LX + 16, y: P2 + 42, w: LW - 32, h: 96};
  add(`<div style="position:absolute;left:${TC.x}px;top:${TC.y}px;width:${TC.w}px;height:${TC.h}px;border-radius:4px;background:#f8f8f3"></div>`);
  const tChart = add(`<svg style="position:absolute;left:${TC.x}px;top:${TC.y}px;overflow:visible" width="${TC.w}" height="${TC.h}"></svg>`);
  const psiEl = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 150}px;font-size:22px;font-weight:700"></div>`);
  add(`<div class="sm" style="position:absolute;left:${LX + 16}px;top:${P2 + 180}px">TAIL ANGLE NOW</div>`);
  const wEl = add(`<div class="mo" style="position:absolute;left:${LX + 160}px;top:${P2 + 150}px;font-size:22px;font-weight:700"></div>`);
  add(`<div class="sm" style="position:absolute;left:${LX + 160}px;top:${P2 + 180}px">TAIL SPEED, °/S</div>`);

  // ------------------------------------------------------------ 03 swimming
  const P3 = 112;
  panel(RX, P3, RW, 238, 'SWIMMING', '03');
  const sw = ['SPEED (CM/S)', 'BODY LENGTHS/S'].map((k, i) => {
    const x = RX + 16 + i * 150;
    add(`<div class="sm" style="position:absolute;left:${x}px;top:${P3 + 42}px">${k}</div>`);
    return add(`<div class="mo" style="position:absolute;left:${x}px;top:${P3 + 57}px;font-size:26px;font-weight:700;letter-spacing:-.5px"></div>`);
  });
  const estEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 94}px;width:${RW - 32}px;font-size:11px;line-height:15px;color:#5f6347;white-space:normal"></div>`);
  add(`<div style="position:absolute;left:${RX + 16}px;top:${P3 + 132}px;width:${RW - 32}px;height:1px;background:${C.line}"></div>`);
  add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 142}px;font-size:11.5px;line-height:18px;color:#3d3f2e;white-space:pre">measured in a lake at 3 Hz
554 cm in 12.7 s = <b>43.6 cm/s</b> = <b>2.03 BL/s</b>
thrust 245.66 mN (peak 250.31 at 3.5 Hz)
${(P.powerRef).toFixed(2)} W in · efficiency ${P.eff} % · CoT ${P.cot}</div>`);

  // ------------------------------------------------------------ 04 the clip's design
  const P4 = 362;
  panel(RX, P4, RW, 184, 'THE CLIP', '04');
  add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 42}px;font-size:11.5px;line-height:18px;color:#3d3f2e;white-space:pre">PETG ribbon  t = ${(P.clipT * 1000).toFixed(3)} mm, 2l = ${(P.clip2l * 1000).toFixed(0)} mm
kink θ = ${M}23.5°  ·  γ${SUB('s')} = ${P.gamma}  ·  tail ±${P.psi}°
shape set by θ and γ${SUB('s')} alone

U${SUB('barrier')} = 3 P${SUB('cr')} L${SUB(2)} (asin(1/γ${SUB('s')}) + θ)</div>`);
  const snapEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P4 + 140}px;width:${RW - 32}px;font-size:11.5px;line-height:17px;color:#3d3f2e;white-space:normal"></div>`);

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
  btnRow(['hero', 'top', 'clip'], VIEW_LABEL, P5 + 55);
  btnRow(['head'], VIEW_LABEL, P5 + 88);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 124}px">SHOW</div>`);
  btnRow(DISPLAY, DISPLAY_LABEL, P5 + 139);

  // ------------------------------------------------------------ 06 the bar: play, the one input, slow motion, water or air
  const P6 = 764;
  const BX0 = 352;
  const BW0 = 896;
  panel(BX0, P6, BW0, 104, '', '');
  btn.play = add(`<div class="bt" style="left:${BX0 + 16}px;top:${P6 + 30}px;width:46px;height:46px;border-radius:50%;border:none;background:${C.acc};color:#fff;font-size:16px"></div>`);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 80}px;top:${P6 + 16}px;color:${C.ink}">TAIL BEAT · THE INPUT</div>`);
  const fVal = add(`<div class="mo" style="position:absolute;left:${BX0 + 80}px;top:${P6 + 34}px;font-size:28px;font-weight:700;letter-spacing:-.5px"></div>`);
  const SP = {x: BX0 + 200, w: 280};
  add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;width:${SP.w}px;height:4px;background:#ebece3;border-radius:2px"></div>`);
  const k3 = (3 - P.fMin) / (P.fMax - P.fMin);
  add(`<div style="position:absolute;left:${SP.x + k3 * SP.w}px;top:${P6 + 42}px;width:1px;height:20px;background:${C.mute}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + k3 * SP.w}px;top:${P6 + 26}px;transform:translateX(-50%)">LAKE TEST</div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;height:4px;background:${C.acc};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:${P6 + 44}px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x - 4}px;top:${P6 + 62}px">${P.fMin} HZ</div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + SP.w - 30}px;top:${P6 + 62}px">${P.fMax} HZ</div>`);
  const snapsEl = add(`<div class="mo" style="position:absolute;left:${BX0 + 80}px;top:${P6 + 80}px;font-size:10.5px;color:${C.mute}"></div>`);
  add(`<div style="position:absolute;left:${BX0 + 512}px;top:${P6 + 14}px;width:1px;height:76px;background:${C.line}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 530}px;top:${P6 + 16}px">TIME · MEDIUM</div>`);
  btn.slow = add(`<div class="bt" style="left:${BX0 + 530}px;top:${P6 + 34}px;width:162px">SLOW MOTION ×10</div>`);
  btn.medium = add(`<div class="bt" style="left:${BX0 + 530}px;top:${P6 + 66}px;width:162px">IN WATER</div>`);
  const mNote = add(`<div class="mo" style="position:absolute;left:${BX0 + 710}px;top:${P6 + 40}px;width:170px;font-size:11px;line-height:16px;color:#5f6347;white-space:normal"></div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:${LX}px;top:880px;letter-spacing:1.6px">XIONG ET AL., NPJ ROBOTICS 4, 7 (2026) · SNAP MODELLED AS A DOUBLE WELL · SPEED AWAY FROM 3 HZ ESTIMATED FROM ST</div>`);
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
  const PH = {load: 'LOADING', snap: 'SNAP', settle: 'SETTLING'};
  const PN = {
    load: 'The servo turns the clip\'s centre slowly. The clip climbs the energy hill and the tail barely moves.',
    snap: 'Past the top of the hill the clip throws itself into the other valley: the tail whips across.',
    settle: 'The clip wobbles to rest in its other shape, holding the tail out with no power needed.',
  };

  return {
    spots,
    btn,
    root: ui,
    SP,
    P6,
    knobSpot: (f) => [SP.x + fK(f) * SP.w, P6 + 52],
    update(s) {
      // 01: the dot on the energy curve
      const xx = Math.max(-XS, Math.min(XS, s.x));
      dot.style.left = `${(CH.x + ex(xx)).toFixed(1)}px`;
      dot.style.top = `${(CH.y + ey(energyOf(xx))).toFixed(1)}px`;
      phaseEl.innerHTML = `${PH[s.phase]}<span style="font-size:11.5px;font-weight:600;color:${C.mute};letter-spacing:.5px"> · energy ${Math.round(energyOf(xx) * 100)} % of the hill</span>`;
      phaseEl.style.color = s.phase === 'snap' ? C.accInk : C.ink;
      phaseNote.textContent = PN[s.phase];
      // 02: the tail over the last second
      const n = s.tailHist.length;
      let d = '';
      s.tailHist.forEach((v, i) => {
        const x = (i / (n - 1)) * TC.w;
        const y = TC.h / 2 - (v / (P.psi * 1.25)) * (TC.h / 2 - 6);
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      const yp = (v) => (TC.h / 2 - (v / (P.psi * 1.25)) * (TC.h / 2 - 6)).toFixed(1);
      tChart.innerHTML = `<line x1="0" x2="${TC.w}" y1="${yp(0)}" y2="${yp(0)}" stroke="${C.faint}"/><line x1="0" x2="${TC.w}" y1="${yp(P.psi)}" y2="${yp(P.psi)}" stroke="${C.faint}" stroke-dasharray="3 3"/><line x1="0" x2="${TC.w}" y1="${yp(-P.psi)}" y2="${yp(-P.psi)}" stroke="${C.faint}" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="${C.green}" stroke-width="2.2" stroke-linejoin="round"/>`;
      psiEl.textContent = `${num(s.psi, 0)}°`;
      wEl.textContent = `${Math.round(Math.abs(s.psiRate)).toLocaleString('en-GB')}`;
      wEl.style.color = Math.abs(s.psiRate) > 1500 ? C.accInk : C.ink;
      // 03: swimming
      sw[0].textContent = num(s.speed * 100, 1);
      sw[1].textContent = num(s.bl, 2);
      estEl.innerHTML = Math.abs(s.f - 3) < 0.05 ? `At 3 Hz this is the measured lake speed.` : `Estimated from St = 0.28: U = f A / St, with the 4.07 cm tail sweep measured at 3 Hz${s.share < 0.99 ? `, cut to ${Math.round(s.share * 100)} % because the snap cannot settle` : ''}.`;
      // 04: snap time
      snapEl.innerHTML = `snap now <b>${Math.round(s.tau * 1000)} ms</b> (${s.medium === 'air' ? 'in air' : 'in water'}) · air 17, water 50, theory 34`;
      // controls
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.acc : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.acc : C.faint;
      };
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      onBtn('slow', s.slow < 0.99);
      onBtn('medium', s.medium === 'air');
      btn.medium.textContent = s.medium === 'air' ? 'IN AIR' : 'IN WATER';
      mNote.textContent = s.medium === 'air' ? 'No water to push: the snap takes 17 ms.' : 'Water slows the snap to about 50 ms.';
      btn.play.innerHTML = s.paused ? '▶' : '❚❚';
      // the input
      const k = fK(s.f);
      fVal.innerHTML = `${s.f.toFixed(1)}<span style="font-size:13px;font-weight:600;color:${C.mute}"> Hz</span>`;
      spFill.style.width = `${(k * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${(SP.x + k * SP.w).toFixed(1)}px`;
      snapsEl.textContent = `${(2 * s.f).toFixed(1)} SNAPS A SECOND${s.slow < 0.99 ? ' · SHOWN 10 TIMES SLOWER' : ''}`;
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
