// The cold gas boost system as a page you drive. One input: burn time. Everything in the scene and on the console reads
// the modelled burn at that time, so the gas, the plumes and the gauges can never disagree. Play, speed, four views,
// cutaway and labels, a timeline to scrub, orbit and zoom. Left alone it runs a guided burn with a cursor that presses
// the buttons; a click, drag, wheel or key hands control over and 25 s of quiet hands it back.
import {warmUp} from '../kit/warm.js';
import {createConsole, DISPLAY, SPEEDS, SPK, VIEWS} from './console.js';
import {DURATION, sampleAt} from './data.js';
import {createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const TOUR_SPEED = 0.5;
const HOLD_END = 3.5;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const ss = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// camera for each view: target, azimuth and elevation in degrees, distance in metres, picture shift in px
// the car's back points to -z, the tank lies across the car along x; azimuth is measured from +z toward +x
const VIEW_CAM = {
  hero: {at: [0.1, 0.4, -0.55], az: 138, el: 20, d: 4.6, sx: 0, sy: 10},
  tank: {at: [0.18, 0.5, -0.02], az: 156, el: 30, d: 2.5, sx: 0, sy: 0},
  nozzle: {at: [0.2, 0.37, -1.0], az: 116, el: 12, d: 2.1, sx: 0, sy: 0},
  top: {at: [0.05, 0.36, -0.42], az: 180, el: 72, d: 3.7, sx: 0, sy: 40},
};
const TAGS = [
  ['copv', 'COPV 200 L'], ['carbon', 'CARBON OVERWRAP'], ['liner', 'ALUMINIUM LINER'], ['gas', 'N₂ GAS'],
  ['valve', 'TANK VALVE'], ['reg', 'REGULATOR 50 BAR'], ['nozzle', 'NOZZLE ×4'], ['plume', 'COLD JET'],
];
// the guided burn: [cycle time s, button]. Burn time runs at TOUR_SPEED, so the valve opens near 2 s and shuts near 12 s.
const TOUR_LEN = DURATION / TOUR_SPEED + HOLD_END;
const TOUR = [
  [0.8, 'cut'],
  [1.6, 'tank'],
  [5.4, 'nozzle'],
  [8.4, 'hero'],
  [11.0, 'top'],
  [13.4, 'tank'],
  [17.2, 'cut'],
  [18.4, 'hero'],
];
const tourState = (c) => {
  const st = {view: 'hero', cut: 0};
  for (const [t, b] of TOUR) {
    if (t > c) break;
    if (VIEWS.includes(b)) st.view = b;
    else st[b] = st[b] ? 0 : 1;
  }
  return st;
};

const CSS = `
html,body{background:#f1f2ee;overflow:hidden;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab;position:absolute;left:0;top:0;width:${W}px;height:${H}px}
#gl.drag{cursor:grabbing}
.bt{pointer-events:auto;cursor:pointer;user-select:none}
.bt:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:880px;top:30px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:28px;padding:0 13px;border:1px solid #e3e6ec;border-radius:5px;background:rgba(255,255,255,.95);color:#10131C;font:700 11px 'JetBrains Mono',monospace;letter-spacing:1.2px;white-space:nowrap;cursor:pointer;pointer-events:auto;user-select:none}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:#D9622B}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#6b7080;text-transform:uppercase;display:none}
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
  const st = createStage({canvas});
  const ui = createConsole(app);

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
  let T = 0; // wall time
  let bt = 0; // burn time
  let endHold = 0;
  let paused = false;
  let speed = 0.5;
  let view = 'hero';
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: 0, t: -9}]));
  disp.labels.on = 1;
  disp.cut.on = 1;
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  const eased = (k, dur = 0.7) => {
    const d = disp[k];
    const x = ss(d.t, d.t + dur, T);
    return d.on ? x : 1 - x;
  };
  const setDisp = (k, on) => {
    if (disp[k].on !== on) {
      disp[k].on = on;
      disp[k].t = T;
    }
  };
  const pulse = (k) => (ring = {t: T, x: ui.spots[k][0], y: ui.spots[k][1]});

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0};
  let lastInput = 0;
  let lastClick = -1;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    paused = false;
    lastClick = -1;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    speed = 0.5;
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
  const REST = [800, 700];
  const tourCursor = (c) => {
    // glide to each button 1 s before its press, press, then drift back toward the middle of the stage
    let from = REST;
    let fromT = 0;
    for (let i = 0; i < TOUR.length; i++) {
      const [t, b] = TOUR[i];
      const to = ui.spots[b];
      if (c < t) {
        const k = ss(Math.max(fromT, t - 1.1), t - 0.1, c);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        return {x: from[0] + (to[0] - from[0]) * e, y: from[1] + (to[1] - from[1]) * e, press: c > t - 0.12, ring: 0, ringX: 0, ringY: 0};
      }
      if (c < t + 0.55) {
        const rk = 1 - (c - t) / 0.55;
        return {x: to[0], y: to[1], press: c < t + 0.1, ring: rk, ringX: to[0], ringY: to[1]};
      }
      from = to;
      fromT = t + 0.55;
    }
    const k = ss(fromT, fromT + 1.4, c);
    return {x: from[0] + (REST[0] - from[0]) * k, y: from[1] + (REST[1] - from[1]) * k, press: false, ring: 0, ringX: 0, ringY: 0};
  };

  // ------------------------------------------------------------ controls
  for (const v of VIEWS)
    ui.btn[v].addEventListener('click', () => {
      takeOver();
      pulse(v);
      view = v;
      if (v === 'tank') setDisp('cut', 1);
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  for (const k of DISPLAY)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      setDisp(k, disp[k].on ? 0 : 1);
    });
  for (const sp of SPEEDS)
    ui.btn[SPK(sp)].addEventListener('click', () => {
      takeOver();
      pulse(SPK(sp));
      speed = sp;
    });
  ui.btn.play.addEventListener('click', () => {
    takeOver();
    pulse('play');
    if (bt >= DURATION) {
      bt = 0;
      endHold = 0;
      paused = false;
    } else paused = !paused;
  });
  {
    const {x: x0, w, y} = ui.TL;
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x0 - 10}px`, top: `${y - 26}px`, width: `${w + 20}px`, height: '56px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      bt = clamp((x - x0) / w, 0, 1) * DURATION;
      endHold = 0;
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
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ') ui.btn.play.click();
    else if (key === 'c') ui.btn.cut.click();
    else if (key === 'l') ui.btn.labels.click();
    else if (key === 'v') ui.btn[VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]].click();
    else if (key === 'arrowright' || key === 'arrowleft') {
      takeOver();
      bt = clamp(bt + (key === 'arrowright' ? 0.5 : -0.5), 0, DURATION);
      endHold = 0;
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
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -20, 70);
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
  const v3 = st.T.tags;
  const makeTags = (s, a, cut) =>
    TAGS.map(([k, label]) => {
      const flowing = s.flow > 0.05;
      const on = (k === 'valve' || k === 'nozzle' || k === 'plume' || k === 'reg') && flowing;
      // the liner and the gas sit inside the wrap: only label them when the cutaway is open; the jet only while it runs
      let hide = (k === 'liner' || k === 'gas') && cut < 0.8 ? 1 : 0;
      if (k === 'plume' && s.thrust < 1) hide = 1;
      const p = st.project(v3[k]);
      // a label never sits on a console panel
      if (p && (p[0] < 356 || p[0] > 1244) && p[1] > 104 && p[1] < 680) hide = 1;
      if (p && (p[1] > 770 || p[1] < 104)) hide = 1;
      return {k, label, on, p, a: a * (1 - hide)};
    });
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

    let cursor;
    if (AP.on) {
      const c = (T - AP.t0) % TOUR_LEN;
      if (c < lastClick) lastClick = -1;
      bt = Math.min(DURATION, c * TOUR_SPEED);
      const ts = tourState(c);
      view = ts.view;
      setDisp('cut', ts.cut);
      setDisp('labels', 1);
      for (const [t, b] of TOUR) if (t <= c && t > lastClick) {
        lastClick = t;
        if (VIEWS.includes(b)) Object.assign(off, {az: 0, el: 0, k: 1});
      }
      cursor = tourCursor(c);
    } else {
      if (T - lastInput > IDLE) startTour();
      if (!paused) {
        if (bt < DURATION) bt = Math.min(DURATION, bt + speed * dt);
        else if ((endHold += dt) > HOLD_END) {
          bt = 0;
          endHold = 0;
        }
      }
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    const s = sampleAt(bt);
    const cut = eased('cut', 1.4);
    const base = VIEW_CAM[view];
    const tgt = {...base, at: base.at.slice(), az: base.az + off.az + (AP.on ? 6 * Math.sin(T * 0.12) : 0), el: clamp(base.el + off.el, -10, 80), d: base.d * off.k};
    if (!cam) cam = {...tgt, at: tgt.at.slice()};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.45 : 0.3));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    for (let i = 0; i < 3; i++) cam.at[i] += (tgt.at[i] - cam.at[i]) * k;
    st.frame(s, T, dt, {cut}, cam);
    if (n % TIERS[tier].every === 0) {
      const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
      ui.update({
        ...s,
        paused: AP.on ? false : paused || bt >= DURATION,
        speed: AP.on ? -1 : speed,
        tags: makeTags(s, eased('labels'), cut),
        view,
        display,
        cursor,
      });
    }
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>GUIDED BURN · CLICK TO TAKE OVER' : '▶ RESUME GUIDED BURN';
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
  window.LIVE = {st, startTour, takeOver, seek: (t) => (bt = t), get tier() {
    return tier;
  }, get T() {
    return T;
  }};
}
