// The hair clip fish as a page you drive: the film's fish, stage and console in real time. The tail beat slider is the
// one input; play pauses the fish, slow motion runs time ten times slower, the medium button swaps water for air (the
// snap time); four views, glass head, labels and orbit; drag to orbit, scroll to zoom. Left alone it plays the film's
// script as an auto tour with the operator's cursor, looped; a click, drag, wheel or key hands control to the
// visitor, 25 s of quiet hands it back.
import {warmUp} from '../kit/warm.js';
import {createConsole, DISPLAY, VIEWS} from './console.js';
import {beatAt, camAt, displayAt, distAt, DURATION, fAt, fishState, makeCursor, makeTags, mediumAt, slowAt, ss, tailHistory, tauOf, toCam, viewAt, VIEW_FN} from './film.js';
import {P, speedOf} from './kin.js';
import {createFishStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const CSS = `
html,body{background:#f3f4ef;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.bt{pointer-events:auto;cursor:pointer;user-select:none}
.bt:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:112px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:28px;padding:0 13px;border:1px solid #e4e5da;border-radius:5px;background:rgba(255,255,255,.95);color:#252413;font:700 11px 'JetBrains Mono',monospace;letter-spacing:1.2px;white-space:nowrap;cursor:pointer;pointer-events:auto;user-select:none}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:#F48067}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#7e8466;text-transform:uppercase;display:none}
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
  const st = createFishStage({canvas});
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
  let f = 1;
  let B = 0; // beat phase
  let dist = 0;
  let paused = false;
  let slowOn = false;
  let slowK = 1; // eased time scale
  let medium = 'water';
  let view = 'hero';
  let viewAt0 = 0;
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  let cam = null;
  let ring = {t: -9, x: 0, y: 0};
  // the beat phase over the last couple of seconds, so the tail chart can look back
  const HB = [];
  const beatBack = (tt) => {
    if (!HB.length) return B;
    if (tt <= HB[0][0]) return HB[0][1];
    for (let i = HB.length - 1; i > 0; i--) {
      if (HB[i - 1][0] <= tt) {
        const [t0, b0] = HB[i - 1];
        const [t1, b1] = HB[i];
        return b0 + (b1 - b0) * ((tt - t0) / (t1 - t0 || 1));
      }
    }
    return HB[0][1];
  };
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
    paused = false;
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
  const syncTour = (cyc) => {
    const want = displayAt(cyc);
    for (const k of DISPLAY) {
      if (disp[k].on !== want[k]) {
        disp[k].on = want[k];
        disp[k].t = T;
      }
    }
    f = fAt(cyc);
    medium = mediumAt(cyc);
    slowK = slowAt(cyc);
    slowOn = slowK < 0.55;
    B = beatAt(cyc);
    dist = distAt(cyc);
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
  ui.btn.play.addEventListener('click', () => {
    takeOver();
    pulse('play');
    paused = !paused;
  });
  ui.btn.slow.addEventListener('click', () => {
    takeOver();
    pulse('slow');
    slowOn = !slowOn;
  });
  ui.btn.medium.addEventListener('click', () => {
    takeOver();
    pulse('medium');
    medium = medium === 'air' ? 'water' : 'air';
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
  const setF = (v) => (f = Math.round(clamp(v, P.fMin, P.fMax) * 10) / 10);
  slider(ui.SP.x, ui.SP.w, ui.P6 + 52, (k) => setF(P.fMin + k * (P.fMax - P.fMin)));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ') ui.btn.play.click();
    else if (key === 's') ui.btn.slow.click();
    else if (key === 'm') ui.btn.medium.click();
    else if (key === 'g') ui.btn.glass.click();
    else if (key === 'l') ui.btn.labels.click();
    else if (key === 'o') ui.btn.orbit.click();
    else if (key === 'v') ui.btn[VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]].click();
    else if (key === 'arrowup' || key === 'arrowright' || key === 'arrowdown' || key === 'arrowleft') {
      takeOver();
      setF(f + (key === 'arrowup' || key === 'arrowright' ? 0.1 : -0.1));
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
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 70);
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
    } else {
      if (T - lastInput > IDLE) startTour();
      slowK += ((slowOn ? 0.1 : 1) - slowK) * (1 - Math.exp(-dt / 0.15));
      if (!paused) {
        B += f * slowK * dt;
        dist += speedOf(f) * slowK * dt;
      }
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    HB.push([T, B]);
    while (HB.length > 2 && HB[0][0] < T - 2) HB.shift();
    const tau = tauOf(medium);
    const glass = eased('glass');
    const a = fishState(B, f, tau, slowK, glass, dist);
    // the camera: the tour's camera, or the visitor's view plus their orbit and zoom
    let tgt;
    if (AP.on) tgt = camAt(cyc, displayAt(cyc).orbit);
    else {
      const since = T - viewAt0;
      tgt = VIEW_FN[view](since);
      tgt = {...tgt, az: tgt.az + off.az + (disp.orbit.on ? 14 * (T - disp.orbit.t) : 0), el: clamp(tgt.el + off.el, -15, 85), d: tgt.d * off.k};
    }
    if (!cam) cam = {...tgt, at: tgt.at.slice()};
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.35));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    for (let i = 0; i < 3; i++) cam.at[i] += (tgt.at[i] - cam.at[i]) * k;
    st.frame(a, toCam(cam));
    if (n % TIERS[tier].every === 0) {
      const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
      ui.update({
        ...a,
        tailHist: tailHistory(beatBack, T, f, tau),
        medium,
        paused: AP.on ? false : paused,
        tags: makeTags(st, a, eased('labels'), glass),
        view,
        display,
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
  Promise.resolve(warmUp(st.renderer, st.camera, [{scene: st.scene}]))
    .catch(() => {})
    .then(() => requestAnimationFrame(frame));
  window.LIVE = {st, startTour, takeOver, get tier() {
    return tier;
  }, get T() {
    return T;
  }};
}
