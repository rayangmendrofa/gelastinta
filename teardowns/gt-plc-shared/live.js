// The T-101 tank as a page you drive. One input: batch time. Everything in the scene and on the console reads the
// recorded batch at that time, so the tank, the lamps and the trend can never disagree. Play, speed, four views,
// glass and labels, a timeline to scrub, orbit and zoom. Left alone it runs a guided batch with a cursor that presses
// the buttons; a click, drag, wheel or key hands control over and 25 s of quiet hands it back.
import {warmUp} from '../kit/warm.js';
import {createConsole, DISPLAY, SPEEDS, VIEWS} from './console.js';
import {DURATION, sampleAt} from './data.js';
import {createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const TOUR_SPEED = 6;
const HOLD_END = 3.5;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const ss = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// camera for each view: target, azimuth and elevation in degrees, distance in metres, picture shift in px
const VIEW_CAM = {
  hero: {at: [0, 0.66, 0.04], az: 32, el: 16, d: 3.7, sx: 0, sy: 6},
  inside: {at: [0, 0.8, 0], az: 20, el: 24, d: 3.05, sx: 0, sy: 0},
  pump: {at: [0, 0.56, 0.24], az: 38, el: 15, d: 2.85, sx: 0, sy: 0},
  top: {at: [0, 0.8, 0.05], az: 8, el: 66, d: 3.1, sx: 0, sy: 0},
};
const TAGS = [
  ['xv101', 'XV-101'], ['xv102', 'XV-102'], ['m101', 'M-101'], ['e101', 'E-101'], ['xv103', 'XV-103'], ['p101', 'P-101'],
  ['lt101', 'LT-101'], ['tt101', 'TT-101'], ['lshh', 'LSHH 97 %'], ['lsl', 'LSL'],
];
// the guided batch: [cycle time s, button]. Batch time runs at TOUR_SPEED, so HEAT starts near 6.9 s and DRAIN near 22 s.
const TOUR_LEN = DURATION / TOUR_SPEED + HOLD_END;
const TOUR = [
  [1.0, 'glass'],
  [7.4, 'inside'],
  [17.6, 'hero'],
  [21.6, 'pump'],
  [26.0, 'top'],
  [27.6, 'glass'],
  [28.6, 'hero'],
];
const tourState = (c) => {
  const st = {view: 'hero', glass: 0};
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
  let bt = 0; // batch time
  let endHold = 0;
  let paused = false;
  let speed = 10;
  let view = 'hero';
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: 0, t: -9}]));
  disp.labels.on = 1;
  disp.glass.on = 1;
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
    speed = 10;
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
      if (v === 'inside') setDisp('glass', 1);
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  for (const k of DISPLAY)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      setDisp(k, disp[k].on ? 0 : 1);
    });
  for (const sp of SPEEDS)
    ui.btn['x' + sp].addEventListener('click', () => {
      takeOver();
      pulse('x' + sp);
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
    else if (key === 'g') ui.btn.glass.click();
    else if (key === 'l') ui.btn.labels.click();
    else if (key === 'v') ui.btn[VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]].click();
    else if (key === 'arrowright' || key === 'arrowleft') {
      takeOver();
      bt = clamp(bt + (key === 'arrowright' ? 5 : -5), 0, DURATION);
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
  const makeTags = (s, a, glass) =>
    TAGS.map(([k, label]) => {
      const on = k === 'e101' ? s.heat > 0.5 : s[k];
      // the heater and the thermowell sit inside the shell: only label them when the glass is on
      const hidden = (k === 'e101' || k === 'tt101' || k === 'lsl') && glass < 0.5 ? 1 - glass * 2 : 0;
      return {k, label, on, p: st.project(v3[k]), a: a * (1 - hidden)};
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
      setDisp('glass', ts.glass);
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
    const glass = eased('glass');
    const base = VIEW_CAM[view];
    const tgt = {...base, at: base.at.slice(), az: base.az + off.az + (AP.on ? 6 * Math.sin(T * 0.12) : 0), el: clamp(base.el + off.el, -10, 80), d: base.d * off.k};
    if (!cam) cam = {...tgt, at: tgt.at.slice()};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.45 : 0.3));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    for (let i = 0; i < 3; i++) cam.at[i] += (tgt.at[i] - cam.at[i]) * k;
    st.frame(s, T, dt, {glass}, cam);
    if (n % TIERS[tier].every === 0) {
      const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
      ui.update({
        ...s,
        paused: AP.on ? false : paused || bt >= DURATION,
        speed: AP.on ? -1 : speed,
        tags: makeTags(s, eased('labels'), glass),
        view,
        display,
        cursor,
      });
    }
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>GUIDED BATCH · CLICK TO TAKE OVER' : '▶ RESUME GUIDED BATCH';
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
