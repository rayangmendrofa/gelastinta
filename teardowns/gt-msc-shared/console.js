// The soft limb's console, laid out at 1600 x 900: the title block, bend against pressure for straight and tilted
// chambers, the bellows pump, the constant curvature numbers, the design table, the controls, and the bar with the one
// input (chamber pressure), the design switch and the walking cycle. update(s) redraws every live part from the frame.
import {BELLOWS, DESIGN_KEYS, DESIGNS, GAIN, P_MAX, P_MID, R2D, bendAt} from './kin.js';

export const C = {ink: '#1f2430', mute: '#7a8291', faint: '#cfd4dc', line: '#e1e5ea', panel: 'rgba(255,255,255,.95)', acc: '#2B44C8', accSoft: 'rgba(43,68,200,.09)', warm: '#A36AA5'};
export const VIEWS = ['rig', 'close', 'robot'];
export const VIEW_LABEL = {rig: 'TEST RIG', close: 'CLOSE UP', robot: 'ROBOT'};
export const DISPLAY = ['glass', 'labels', 'orbit'];
export const DISPLAY_LABEL = {glass: 'SEE THE WATER', labels: 'LABELS', orbit: 'ORBIT'};
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
  add(`<div class="sm" style="position:absolute;left:${LX + 2}px;top:24px;letter-spacing:2.6px;font-size:11.5px">GELASTINTA · MSC DISSERTATION</div>`);
  add(`<div style="position:absolute;left:${LX}px;top:42px;font-size:34px;font-weight:700;letter-spacing:-.7px;line-height:1">Soft limb <span style="color:${C.acc};font-weight:400">/</span> water in, bend out</div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 2}px;top:84px;font-size:11.5px;letter-spacing:2px;color:#5b6372">SERVO BELLOWS → WATER → CHAMBERS → BEND</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:26px;letter-spacing:2.2px">ECOFLEX SILICONE · TWO DESIGNS · 2.17 KG ROBOT</div>`);
  add(`<div class="mo" style="position:absolute;right:24px;top:44px;font-size:24px;font-weight:600;letter-spacing:-.3px">φ = Σ φ${SUB('i')} = κ L</div>`);
  add(`<div class="sm" style="position:absolute;right:24px;top:80px;letter-spacing:1.6px">EACH CHAMBER ADDS ONE ARC</div>`);

  // ------------------------------------------------------------ 01 bend against pressure
  const P1 = 112;
  panel(LX, P1, LW, 268, 'BEND AGAINST PRESSURE', '01');
  const CH = {x: LX + 46, y: P1 + 48, w: LW - 66, h: 150};
  add(`<div style="position:absolute;left:${CH.x}px;top:${CH.y}px;width:${CH.w}px;height:${CH.h}px;border-radius:4px;background:#f6f7f9"></div>`);
  const chart = add(`<svg style="position:absolute;left:${CH.x}px;top:${CH.y}px;overflow:visible" width="${CH.w}" height="${CH.h}"></svg>`);
  for (const p of [0, 5, 10, 15, 20]) add(`<div class="sm" style="position:absolute;left:${CH.x + (p / P_MAX) * CH.w}px;top:${CH.y + CH.h + 5}px;transform:translateX(-50%);letter-spacing:.4px">${p}</div>`);
  add(`<div class="sm" style="position:absolute;left:${CH.x + CH.w - 24}px;top:${CH.y + CH.h + 18}px;letter-spacing:.6px">kPa</div>`);
  const yLab = [0, 1, 2, 3].map((k) => add(`<div class="sm" style="position:absolute;right:${1600 - CH.x + 6}px;top:${CH.y + CH.h - (k / 3) * CH.h - 6}px;letter-spacing:.3px"></div>`));
  add(`<div class="sm" style="position:absolute;left:${LX + 16}px;top:${P1 + 228}px;text-transform:none;letter-spacing:.3px"><span style="color:#9aa3b1">━</span> straight chambers &nbsp; <span style="color:${C.acc}">━</span> tilted 30°</div>`);
  add(`<div class="sm" style="position:absolute;left:${LX + 16}px;top:${P1 + 246}px;text-transform:none;letter-spacing:.3px">FEA load cases at 15 and 20 kPa</div>`);

  // ------------------------------------------------------------ 02 the bellows pump
  const P2 = 392;
  panel(LX, P2, LW, 214, 'BELLOWS PUMP', '02');
  add(`<div class="sm" style="position:absolute;left:${LX + 140}px;top:${P2 + 15}px;text-transform:none;letter-spacing:.3px">servo and worm gear</div>`);
  const pmp = ['STROKE', 'WATER IN'].map((k, i) => {
    const x = LX + 16 + i * 150;
    add(`<div class="sm" style="position:absolute;left:${x}px;top:${P2 + 42}px">${k}</div>`);
    return add(`<div class="mo" style="position:absolute;left:${x}px;top:${P2 + 57}px;font-size:26px;font-weight:700;letter-spacing:-.5px"></div>`);
  });
  const SB = {x: LX + 16, w: LW - 32};
  add(`<div style="position:absolute;left:${SB.x}px;top:${P2 + 104}px;width:${SB.w}px;height:6px;border-radius:3px;background:#e8ebf0"></div>`);
  const sbFill = add(`<div style="position:absolute;left:${SB.x}px;top:${P2 + 104}px;height:6px;border-radius:3px;background:${C.acc}"></div>`);
  const sbNote = add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 118}px;font-size:11px;color:${C.mute}"></div>`);
  add(`<div style="position:absolute;left:${LX + 16}px;top:${P2 + 144}px;width:${LW - 32}px;height:1px;background:${C.line}"></div>`);
  add(`<div class="mo" style="position:absolute;left:${LX + 16}px;top:${P2 + 154}px;font-size:11.5px;line-height:18px;color:#4a5262">bellows Ø35 × 40 mm = <b style="color:${C.ink}">${BELLOWS.vol.toFixed(1)} mL</b> sweep<br>outlet 2 mm · water, not air, for more pressure</div>`);

  // ------------------------------------------------------------ 03 the bend
  const P3 = 112;
  panel(RX, P3, RW, 250, 'CONSTANT CURVATURE', '03');
  const bendEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 40}px;font-size:34px;font-weight:700;letter-spacing:-.8px"></div>`);
  const bendSub = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 82}px;font-size:11.5px;color:${C.mute}"></div>`);
  const rows = ['per chamber φ / 7', 'curvature κ = φ / L', 'radius R = 1 / κ', 'tip moves'].map((k, i) => {
    const y = P3 + 108 + i * 24;
    add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${y}px;font-size:12px;color:#4a5262">${k}</div>`);
    return add(`<div class="mo" style="position:absolute;right:${1600 - RX - RW + 16}px;top:${y}px;font-size:12.5px;font-weight:700"></div>`);
  });
  const gainEl = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${P3 + 212}px;font-size:11.5px;color:#4a5262"></div>`);

  // ------------------------------------------------------------ 04 the design
  const P4 = 374;
  panel(RX, P4, RW, 172, '', '04');
  const dName = add(`<div class="ph" style="left:${RX + 14}px;top:${P4 + 13}px"><i></i><span></span></div>`).querySelector('span');
  const dRows = [0, 1, 2, 3, 4, 5].map((i) => {
    const y = P4 + 40 + i * 20;
    const k = add(`<div class="mo" style="position:absolute;left:${RX + 16}px;top:${y}px;font-size:11.5px;color:#4a5262"></div>`);
    const v = add(`<div class="mo" style="position:absolute;right:${1600 - RX - RW + 16}px;top:${y}px;font-size:11.5px;font-weight:700"></div>`);
    return {k, v};
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
  btnRow(VIEWS, VIEW_LABEL, P5 + 55);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 90}px">SHOW</div>`);
  btnRow(DISPLAY, DISPLAY_LABEL, P5 + 105);
  add(`<div class="sm" style="position:absolute;left:${RX + 16}px;top:${P5 + 140}px">CHAMBER WALLS</div>`);
  btnRow(['straight', 'tilted'], {straight: 'STRAIGHT', tilted: 'TILTED 30°'}, P5 + 155);

  // ------------------------------------------------------------ 06 the bar: the one input, the design, the walk
  const P6 = 764;
  const BX0 = 352;
  const BW0 = 896;
  panel(BX0, P6, BW0, 104, '', '');
  add(`<div class="sm" style="position:absolute;left:${BX0 + 18}px;top:${P6 + 16}px;color:${C.ink}">CHAMBER PRESSURE · THE INPUT</div>`);
  const pVal = add(`<div class="mo" style="position:absolute;left:${BX0 + 18}px;top:${P6 + 34}px;font-size:28px;font-weight:700;letter-spacing:-.5px"></div>`);
  const SP = {x: BX0 + 150, w: 250};
  add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;width:${SP.w}px;height:4px;background:#e8ebf0;border-radius:2px"></div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:${P6 + 50}px;height:4px;background:${C.acc};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:${P6 + 44}px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box"></div>`);
  for (const p of [P_MID, P_MAX]) add(`<div style="position:absolute;left:${SP.x + (p / P_MAX) * SP.w}px;top:${P6 + 58}px;width:1px;height:6px;background:${C.mute}"></div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x - 4}px;top:${P6 + 68}px">0 KPA</div>`);
  add(`<div class="sm" style="position:absolute;left:${SP.x + SP.w - 46}px;top:${P6 + 68}px">20 KPA</div>`);
  const DIV = (x) => add(`<div style="position:absolute;left:${x}px;top:${P6 + 14}px;width:1px;height:76px;background:${C.line}"></div>`);
  DIV(BX0 + 432);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 450}px;top:${P6 + 16}px">DESIGN</div>`);
  {
    let x = BX0 + 450;
    for (const k of DESIGN_KEYS) {
      const w = Math.round(DESIGNS[k].name.length * 8.2 + 18);
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${P6 + 34}px;width:${w}px">${DESIGNS[k].name}</div>`);
      x += w + 5;
    }
  }
  const dNote = add(`<div class="mo" style="position:absolute;left:${BX0 + 450}px;top:${P6 + 72}px;font-size:10.5px;color:${C.mute}"></div>`);
  DIV(BX0 + 744);
  add(`<div class="sm" style="position:absolute;left:${BX0 + 760}px;top:${P6 + 16}px">PUMP</div>`);
  btn.walk = add(`<div class="bt" style="left:${BX0 + 760}px;top:${P6 + 34}px;width:120px">WALK CYCLE</div>`);
  const walkNote = add(`<div class="mo" style="position:absolute;left:${BX0 + 760}px;top:${P6 + 72}px;font-size:10.5px;color:${C.mute}"></div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="sm" style="position:absolute;left:${LX}px;top:880px;letter-spacing:2px">R T MENDROFA MSC PROJECT · NUMBERS FROM THE THESIS · FEA TIP FIGURES TAKEN AT 20 KPA (ASSUMED)</div>`);
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
  let lastDesign = '';
  let curvePath = '';

  return {
    spots,
    btn,
    root: ui,
    SP,
    P6,
    knobSpot: (p) => [SP.x + (p / P_MAX) * SP.w, P6 + 52],
    update(s) {
      const d = DESIGNS[s.design];
      // 01: the chart, redrawn only when the design changes, plus the live dot
      const yMax = Math.ceil(((d.phiTilted * R2D) * 1.02) / 10) * 10;
      const X = (p) => (p / P_MAX) * CH.w;
      const Y = (a) => CH.h - (a / yMax) * (CH.h - 6);
      if (lastDesign !== s.design) {
        lastDesign = s.design;
        const line = (tilted) => {
          let p = '';
          for (let i = 0; i <= 40; i++) {
            const P = (i / 40) * P_MAX;
            p += `${i ? 'L' : 'M'}${X(P).toFixed(1)} ${Y(bendAt(d, P, tilted) * R2D).toFixed(1)}`;
          }
          return p;
        };
        curvePath = `<line x1="${X(P_MID)}" x2="${X(P_MID)}" y1="0" y2="${CH.h}" stroke="${C.faint}" stroke-dasharray="3 3"/><line x1="${X(P_MAX)}" x2="${X(P_MAX)}" y1="0" y2="${CH.h}" stroke="${C.faint}" stroke-dasharray="3 3"/>` + `<path d="${line(false)}" fill="none" stroke="#9aa3b1" stroke-width="2"/><path d="${line(true)}" fill="none" stroke="${C.acc}" stroke-width="2.4"/>`;
        yLab.forEach((n, k) => (n.textContent = `${Math.round((k / 3) * yMax)}°`));
        dName.textContent = d.name;
        d.table.forEach(([k, v], i) => {
          dRows[i].k.textContent = k;
          dRows[i].v.textContent = v;
        });
      }
      const a = s.bendDeg;
      const other = s.bendOtherDeg;
      chart.innerHTML = curvePath + `<circle cx="${X(s.P).toFixed(1)}" cy="${Y(other).toFixed(1)}" r="4" fill="#fff" stroke="#9aa3b1" stroke-width="2"/><circle cx="${X(s.P).toFixed(1)}" cy="${Y(a).toFixed(1)}" r="5.5" fill="${C.acc}" stroke="#fff" stroke-width="2"/>`;
      // 02: the pump
      pmp[0].innerHTML = `${(s.stroke * 1000).toFixed(2)}<span style="font-size:12px;color:${C.mute}"> mm</span>`;
      pmp[1].innerHTML = `${s.water.toFixed(2)}<span style="font-size:12px;color:${C.mute}"> mL</span>`;
      sbFill.style.width = `${Math.min(1, s.water / d.vol) * SB.w}px`;
      sbNote.textContent = `of ${d.vol} mL limb volume · ${(s.water / BELLOWS.vol * 100).toFixed(1)}% of the bellows`;
      // 03: the bend
      bendEl.innerHTML = `${num(a, 1)}°<span style="font-size:13px;color:${C.mute};font-weight:600"> total bend φ</span>`;
      bendSub.textContent = `${s.tilted ? 'tilted 30° walls' : 'straight walls'} · L = ${(d.L * 1000).toFixed(0)} mm`;
      const kappa = (a / R2D) / d.L;
      rows[0].textContent = `${num(a / d.n, 2)}°`;
      rows[1].textContent = `${num(kappa, 2)} 1/m`;
      rows[2].textContent = kappa > 0.01 ? `${num(1000 / kappa, 0)} mm` : '∞';
      rows[3].textContent = `${num(s.tip * 1000, 1)} mm`;
      gainEl.innerHTML = `tilted vs straight at this pressure: <b style="color:${C.acc}">+${Math.round((GAIN - 1) * 100)}%</b>`;
      // controls
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.acc : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.acc : C.faint;
      };
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      onBtn('straight', !s.tilted);
      onBtn('tilted', s.tilted);
      for (const k of DESIGN_KEYS) onBtn(k, s.design === k);
      onBtn('walk', !!s.walk);
      dNote.textContent = s.design === 'manta' ? 'A GLIDING WING: 7 CHAMBERS ALONG THE SPAN' : 'A WALKING LIMB: 7 BELLOWS CHAMBERS';
      walkNote.textContent = s.walk ? 'PRESSURE 0 TO 20 KPA, 1.5 S' : 'PUMP AND RELEASE ON A LOOP';
      // the input
      pVal.innerHTML = `${s.P.toFixed(1)}<span style="font-size:13px;color:${C.mute}"> kPa</span>`;
      spFill.style.width = `${((s.P / P_MAX) * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${(SP.x + (s.P / P_MAX) * SP.w).toFixed(1)}px`;
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
