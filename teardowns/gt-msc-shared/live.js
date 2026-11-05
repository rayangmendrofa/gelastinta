// The soft limb as a page you drive: the film's rig, stage and console in real time. The chamber pressure slider is
// the one input; the design buttons swap the trilobite limb and the manta ray wing, the wall buttons pick straight or
// 30 degree tilted chambers, the walk button runs the pump in a loop; three views, see the water, labels and orbit;
// drag to orbit, scroll to zoom. Left alone it plays the film's script as an auto tour with the operator's cursor,
// looped; a click, drag, wheel or key hands control to the visitor, 25 s of quiet hands it back.
import {warmUp} from '../kit/warm.js';
import {createConsole, DISPLAY, VIEWS} from './console.js';
import {camAt, designAt, displayAt, DURATION, makeCursor, makeTags, pressureAt, rigState, ss, tiltAt, toCam, viewAt, VIEW_FN, walkAt, walkP} from './film.js';
import {DESIGN_KEYS, P_MAX} from './kin.js';
import {createRigStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const CSS = `
html,body{background:#eef0f3;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.bt{pointer-events:auto;cursor:pointer;user-select:none}
.bt:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:112px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:28px;padding:0 13px;border:1px solid #e1e5ea;border-radius:5px;background:rgba(255,255,255,.95);color:#1f2430;font:700 11px 'JetBrains Mono',monospace;letter-spacing:1.2px;white-space:nowrap;cursor:pointer;pointer-events:auto;user-select:none}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:#2B44C8}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#7a8291;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createRigStage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeCursor(ui);

  // ------------------------------------------------------------ quality tiers (no post effects at any tier)
  const TIERS = [
    {shadow: 2048, pr: 2, every: 1},
    {shadow: 1024, pr: 1.25, every: 1},
    {shadow: 1024, pr: 0.85, every: 2},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  let tier = light ? 1 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.6, TIERS[tier].pr));
  };
  const applyTier = () => {
    st.setQuality({shadow: TIERS[tier].shadow});
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let setP = 0; // the slider
  let P = 0; // the chamber pressure (follows the slider over a pump stroke)
  let lastP = 0;
  let design = 'trilobite';
  let tilted = true;
  let tilt = 1;
  let walk = false;
  let walkT0 = 0;
  let walkW = 0;
  let view = 'rig';
  let viewAt0 = 0;
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  const eased = (k, dur = 0.7) => {
    const d = disp[k];
    const x = ss(d.t, d.t + dur, T);
    return d.on ? x : 1 - x;
  };
  const pulse = (k) => (ring = {t: T, x: ui.spots[k][0], y: ui.spots[k][1]});

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    view = viewAt(cyc);
    viewAt0 = T;
    setP = Math.round(P);
    walkW = walk ? 1 : 0;
    if (walk) walkT0 = T - (cyc - 21.0);
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });
  const syncTour = (cyc) => {
    const want = displayAt(cyc);
    for (const k of DISPLAY) {
      if (disp[k].on !== want[k]) {
        disp[k].on = want[k];
        disp[k].t = T;
      }
    }
    design = designAt(cyc);
    tilted = tiltAt(cyc) > 0.5;
    walk = walkAt(cyc);
  };

  // ------------------------------------------------------------ controls
  for (const v of VIEWS)
    ui.btn[v].addEventListener('click', () => {
      takeOver();
      pulse(v);
      view = v;
      viewAt0 = T;
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  for (const k of DISPLAY)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      disp[k].on = disp[k].on ? 0 : 1;
      disp[k].t = T;
    });
  for (const k of DESIGN_KEYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      design = k;
      if (view === 'robot') {
        view = 'rig';
        viewAt0 = T;
      }
    });
  for (const k of ['straight', 'tilted'])
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      tilted = k === 'tilted';
    });
  ui.btn.walk.addEventListener('click', () => {
    takeOver();
    pulse('walk');
    walk = !walk;
    if (walk) walkT0 = T - (1.5 / Math.PI) * Math.acos(clamp(1 - (2 * P) / P_MAX, -1, 1)) / 2;
    else setP = P;
  });
  const slider = (x0, w, y, apply) => {
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x0 - 10}px`, top: `${y - 16}px`, width: `${w + 20}px`, height: '32px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(clamp((x - x0) / w, 0, 1));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      e.preventDefault();
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider(ui.SP.x, ui.SP.w, ui.P6 + 52, (k) => {
    setP = Math.round(k * P_MAX * 2) / 2;
    walk = false;
  });
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === 'g') ui.btn.glass.click();
    else if (key === 'l') ui.btn.labels.click();
    else if (key === 'o') ui.btn.orbit.click();
    else if (key === ' ' || key === 'w') ui.btn.walk.click();
    else if (key === 'd') ui.btn[DESIGN_KEYS[(DESIGN_KEYS.indexOf(design) + 1) % DESIGN_KEYS.length]].click();
    else if (key === 't') ui.btn[tilted ? 'straight' : 'tilted'].click();
    else if (key === 'v') ui.btn[VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]].click();
    else if (key === 'arrowup' || key === 'arrowright' || key === 'arrowdown' || key === 'arrowleft') {
      takeOver();
      walk = false;
      setP = clamp(setP + (key === 'arrowup' || key === 'arrowright' ? 1 : -1), 0, P_MAX);
    } else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      void err;
    }
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az -= ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 60);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.45, 2.2);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  let n = 0;
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    n++;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.024 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let cyc = 0;
    let cursor;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      cyc = c - loop * DURATION;
      syncTour(cyc);
      view = viewAt(cyc);
      cursor = tourCursor(cyc);
      if (loop > AP.loop) AP.loop = loop;
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
      P = pressureAt(cyc);
      tilt = tiltAt(cyc);
    } else {
      if (T - lastInput > IDLE) startTour();
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
      // the pump strokes toward the set pressure (about 25 kPa a second), or runs the walking cycle
      walkW += ((walk ? 1 : 0) - walkW) * (1 - Math.exp(-dt / 0.25));
      const target = setP * (1 - walkW) + walkP(walkT0, T) * walkW;
      const step = 25 * dt;
      P = walkW > 0.02 ? target : Math.abs(target - P) <= step ? target : P + Math.sign(target - P) * step;
      tilt += ((tilted ? 1 : 0) - tilt) * (1 - Math.exp(-dt / 0.2));
    }
    const dP = dt > 0 ? (P - lastP) / dt : 0;
    lastP = P;
    const glass = eased('glass');
    const a = rigState(P, dP, design, tilt, glass, {trilobite: design === 'trilobite' ? 1 : 0, manta: design === 'manta' ? 1 : 0});
    // the camera: the tour's camera, or the visitor's view plus their orbit and zoom
    let tgt;
    if (AP.on) tgt = camAt(cyc, displayAt(cyc).orbit);
    else {
      tgt = VIEW_FN[view](T - viewAt0);
      tgt = {...tgt, az: tgt.az + off.az + (disp.orbit.on ? 12 * (T - disp.orbit.t) : 0), el: clamp(tgt.el + off.el, -15, 80), d: tgt.d * off.k};
    }
    if (!cam) cam = {...tgt, at: tgt.at.slice()};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.35));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    for (let i = 0; i < 3; i++) cam.at[i] += (tgt.at[i] - cam.at[i]) * k;
    st.frame(a, toCam(cam));
    if (n % TIERS[tier].every === 0) {
      const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
      ui.update({...a, walk, view, display, tags: makeTags(st, a, eased('labels'), glass, view), cursor});
    }
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  Promise.resolve(warmUp(st.renderer, st.camera, [{scene: st.scene}]))
    .catch(() => {})
    .then(() => requestAnimationFrame(frame));
  window.LIVE = {st, startTour, takeOver, get tier() {
    return tier;
  }, get T() {
    return T;
  }};
}
