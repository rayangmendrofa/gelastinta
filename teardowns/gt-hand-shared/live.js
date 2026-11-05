// The prosthetic hand as a page you drive: the film's hand, stage and console in real time. The muscle flex slider is
// the one input (hold the space bar to flex fully); the grip buttons pick which fingers follow, the filter button
// switches the EMG smoothing, the wrist button turns the palm; three views, glass, labels, orbit and an isolate button
// per finger; drag to orbit, scroll to zoom. Left alone it plays the film's script as an auto tour with the operator's
// cursor, looped; a click, drag, wheel or key hands control to the visitor, 25 s of quiet hands it back.
import {warmUp} from '../kit/warm.js';
import {createConsole, DISPLAY, ISO, VIEWS} from './console.js';
import {camAt, digitView, displayAt, DURATION, filmHandAt, filterAt, flexAt, handState, histories, isoAt, makeCursor, makeTags, modeAt, ss, targetsOf, toCam, viewAt, VIEW_FN, wristGoalAt} from './film.js';
import {commandAt, DIGITS, MODE_KEYS, P, servoStep} from './kin.js';
import {createHandStage} from './stage.js';

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
  const st = createHandStage({canvas});
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
  let flex = 0;
  let held = false; // the space bar: a full flex while held
  let filtered = true;
  let mode = 'power';
  let wristGoal = 0;
  let view = 'hero';
  let viewAt0 = 0;
  const phi = DIGITS.map(() => 0);
  const dphi = DIGITS.map(() => 0);
  let wrist = 0;
  let wristRate = 0;
  const iso = {cur: 0, prev: 0, t0: -9};
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  // the flex history (time, level) so the EMG and its filter can look back
  const HIST = [];
  const flexFn = (tt) => {
    if (!HIST.length) return 0;
    let lo = 0;
    let hi = HIST.length - 1;
    if (tt <= HIST[0][0]) return HIST[0][1];
    if (tt >= HIST[hi][0]) return HIST[hi][1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (HIST[m][0] <= tt) lo = m;
      else hi = m;
    }
    const [t0, f0] = HIST[lo];
    const [t1, f1] = HIST[hi];
    return f0 + (f1 - f0) * ((tt - t0) / (t1 - t0 || 1));
  };
  const FILT = [];
  const filtFn = (tt) => {
    for (let i = FILT.length - 1; i >= 0; i--) if (FILT[i][0] <= tt) return FILT[i][1];
    return true;
  };
  const eased = (k, dur = 0.7) => {
    const d = disp[k];
    const x = ss(d.t, d.t + dur, T);
    return d.on ? x : 1 - x;
  };
  const pulse = (k) => (ring = {t: T, x: ui.spots[k][0], y: ui.spots[k][1]});
  const setIso = (n) => {
    if (n === iso.cur) return;
    iso.prev = iso.cur;
    iso.cur = n;
    iso.t0 = T;
    viewAt0 = T;
  };
  const setFilter = (v) => {
    if (v === filtered) return;
    filtered = v;
    FILT.push([T, v]);
  };

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    held = false;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    view = viewAt(cyc);
    viewAt0 = T;
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
  // the tour's toggles land in the same state the visitor drives, so a takeover keeps them
  const syncTour = (cyc) => {
    const want = displayAt(cyc);
    for (const k of DISPLAY) {
      if (disp[k].on !== want[k]) {
        disp[k].on = want[k];
        disp[k].t = T;
      }
    }
    setIso(isoAt(cyc).cur);
    mode = modeAt(cyc);
    setFilter(filterAt(cyc));
    wristGoal = wristGoalAt(cyc);
    flex = flexAt(cyc);
  };

  // ------------------------------------------------------------ controls
  for (const v of VIEWS)
    ui.btn[v].addEventListener('click', () => {
      takeOver();
      pulse(v);
      setIso(0);
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
  ISO.forEach((k, n) =>
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      setIso(n);
      Object.assign(off, {az: 0, el: 0, k: 1});
    }),
  );
  for (const k of MODE_KEYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      mode = k;
    });
  ui.btn.filter.addEventListener('click', () => {
    takeOver();
    pulse('filter');
    setFilter(!filtered);
  });
  ui.btn.wrist.addEventListener('click', () => {
    takeOver();
    pulse('wrist');
    wristGoal = wristGoal > 90 ? 0 : 180;
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
  slider(ui.SP.x, ui.SP.w, ui.P6 + 52, (k) => (flex = Math.round(k * 100) / 100));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key >= '0' && key <= '5') ui.btn[ISO[Number(key)]].click();
    else if (key === ' ') {
      takeOver();
      held = true;
    } else if (key === 'g') ui.btn.glass.click();
    else if (key === 'l') ui.btn.labels.click();
    else if (key === 'o') ui.btn.orbit.click();
    else if (key === 'e') ui.btn.filter.click();
    else if (key === 'w') ui.btn.wrist.click();
    else if (key === 'p') ui.btn[MODE_KEYS[(MODE_KEYS.indexOf(mode) + 1) % MODE_KEYS.length]].click();
    else if (key === 'v') ui.btn[VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]].click();
    else if (key === 'arrowup' || key === 'arrowright' || key === 'arrowdown' || key === 'arrowleft') {
      takeOver();
      flex = clamp(Math.round((flex + (key === 'arrowup' || key === 'arrowright' ? 0.05 : -0.05)) * 100) / 100, 0, 1);
    } else return;
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    if (e.key === ' ') held = false;
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
  const pt = (k) => st.point(k - 1, 1).toArray();
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
    let a;
    const isoK = ss(iso.t0, iso.t0 + 0.8, T);
    const glass = eased('glass');
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
      // the tour shows the film's own servo angles, and the live servos follow them for a smooth takeover
      a = filmHandAt(cyc, {cur: iso.cur, prev: iso.prev, k: isoK}, glass);
      a.phi.forEach((v, i) => (phi[i] = v));
      wrist = a.wrist;
    } else {
      if (T - lastInput > IDLE) startTour();
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    const f = held ? 1 : flex;
    HIST.push([T, f]);
    while (HIST.length > 2 && HIST[0][0] < T - 4) HIST.shift();
    const cmd = AP.on ? null : commandAt(flexFn, T, filtered);
    if (!AP.on) {
      const tg = targetsOf(cmd, mode);
      for (let i = 0; i < phi.length; i++) {
        const p0 = phi[i];
        phi[i] = servoStep(phi[i], tg[i], dt);
        dphi[i] = dt > 0 ? (phi[i] - p0) / dt : 0;
      }
      const w0 = wrist;
      wrist = servoStep(wrist, wristGoal, dt, P.wristSpeed);
      wristRate = dt > 0 ? (wrist - w0) / dt : 0;
      a = handState(phi.slice(), dphi.slice(), wrist, wristRate, {cur: iso.cur, prev: iso.prev, k: isoK}, glass);
    }
    const cmdNow = cmd ?? commandAt(flexFn, T, filtered);
    // the camera: the tour's camera, or the visitor's view (or isolated finger) plus their orbit and zoom
    let tgt;
    if (AP.on) tgt = camAt(cyc, pt, displayAt(cyc).orbit);
    else {
      const since = T - viewAt0;
      tgt = iso.cur ? digitView(iso.cur, pt(iso.cur), since) : VIEW_FN[view](since);
      tgt = {...tgt, az: tgt.az + off.az + (disp.orbit.on ? 14 * (T - disp.orbit.t) : 0), el: clamp(tgt.el + off.el, -15, 80), d: tgt.d * off.k};
    }
    if (!cam) cam = {...tgt, at: tgt.at.slice()};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.35));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    for (let i = 0; i < 3; i++) cam.at[i] += (tgt.at[i] - cam.at[i]) * k;
    st.frame(a, toCam(cam));
    if (n % TIERS[tier].every === 0) {
      const shownIso = iso.cur || (isoK < 1 ? iso.prev : 0);
      const tagK = iso.cur ? ss(iso.t0 + 0.9, iso.t0 + 1.5, T) : 1 - isoK;
      const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
      const Hs = histories(flexFn, filtFn, T, 56);
      ui.update({
        ...a,
        target: targetsOf(cmdNow, mode),
        cmd: cmdNow,
        flex: f,
        rawHist: Hs.raw,
        cmdHist: Hs.cmd,
        filtered,
        mode,
        wristGoal,
        tags: makeTags(st, a, eased('labels'), glass, shownIso, tagK),
        view,
        display,
        iso: iso.cur,
        cursor,
      });
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
  // every shader compiles at once before the first frame (kit/warm.js)
  Promise.resolve(warmUp(st.renderer, st.camera, [{scene: st.scene}]))
    .catch(() => {})
    .then(() => requestAnimationFrame(frame));
  window.LIVE = {st, startTour, takeOver, get tier() {
    return tier;
  }, get T() {
    return T;
  }};
}
