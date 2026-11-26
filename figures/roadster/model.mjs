// My own derivation, redone from the Lecture 15 notes, of the flying car (Newton–Euler rigid body), cut down to the two demos and written
// from the lecture notes, not from the course code. Parameters are the course's published ones: m 1500 kg,
// J = diag(600, 2500, 2800) kg m², thrusters a = 1.4 m and b = 0.9 m from the centre, each vertical thruster up to mg,
// tyre friction mu = 1, fan suction up to 1.5 mg. Units: m, s, kg, N, rad.
export const M = 1500, GRAV = 9.81, IXX = 600, IYY = 2500, A = 1.4, B = 0.9, MU = 1.0, TMAX = M * GRAV;


// the mixer: collective Tc plus a roll twist tau. Nozzles can only push, so when one side would go negative it sits
// at zero and the other side takes the whole twist, which adds lift.
export function mix(Tc, tau) {
  const d = tau / B / 4;
  let hi = Tc / 4 + Math.abs(d), lo = Tc / 4 - Math.abs(d);
  if (lo < 0) { hi -= lo; lo = 0; }
  return d >= 0 ? [hi, lo, lo, hi] : [lo, hi, hi, lo];
}

// ---------------------------------------------------------------- the inverted half loop
// floor (z = 0) then a quarter circle (radius R) up to a vertical wall (length LV), a quarter circle onto the ceiling,
// then the ceiling (length LT) running back over the floor. s is distance along the track.
export const R = 6, LV = 4, LT = 6, LIN = 16, RIDE = 0.55;
const L1 = LIN, L2 = L1 + (Math.PI / 2) * R, L3 = L2 + LV, L4 = L3 + (Math.PI / 2) * R, L5 = L4 + LT;
export const TRACK_END = L5;
export const X0 = -LIN;
/** the track at s: point on the running surface, unit tangent, unit normal toward the surface, curvature */
export function trackAt(s) {
  if (s < L1) return {p: [X0 + s, 0], t: [1, 0], n: [0, -1], k: 0};
  if (s < L2) {
    const a = (s - L1) / R; // angle from the bottom
    return {p: [R * Math.sin(a), R - R * Math.cos(a)], t: [Math.cos(a), Math.sin(a)], n: [Math.sin(a), -Math.cos(a)], k: 1 / R};
  }
  if (s < L3) return {p: [R, R + (s - L2)], t: [0, 1], n: [1, 0], k: 0};
  if (s < L4) {
    const a = (s - L3) / R;
    return {p: [R * Math.cos(a), R + LV + R * Math.sin(a)], t: [-Math.sin(a), Math.cos(a)], n: [Math.cos(a), Math.sin(a)], k: 1 / R};
  }
  return {p: [-(s - L4), 2 * R + LV], t: [-1, 0], n: [0, 1], k: 0};
}
export const CEIL = 2 * R + LV;

/** wheel load W (N) the track must push with: centripetal need plus suction plus gravity across the track */
export const loadOf = (tr, v, S) => M * v * v * tr.k + S + M * (-GRAV * tr.n[1]);

// one step of the ramp demo. state {mode, s, v, x, z, vx, vz, th, w, phi, t, tAir, T:[4]}; S suction in N.
export function rampStep(st, S, dt, vWant = 11) {
  st.t += dt;
  st.T = [0, 0, 0, 0];
  if (st.mode === 'track') {
    const tr = trackAt(st.s);
    const W = loadOf(tr, st.v, S);
    st.W = W;
    if (W < 0 || st.s >= TRACK_END) {
      // the tyres lose the track: off we go, with the speed and turn rate we had
      st.mode = 'air';
      st.fell = st.s < TRACK_END;
      st.tAir = 0;
      st.vx = st.v * tr.t[0];
      st.vz = st.v * tr.t[1];
      st.w = st.v * tr.k;
      return st;
    }
    const ag = -GRAV * tr.t[1];
    const want = M * (2.5 * (vWant - st.v)) - M * ag;
    const F = Math.max(-MU * W, Math.min(MU * W, want));
    st.slip = Math.abs(want) > MU * W + 1;
    st.v += (F / M + ag) * dt;
    st.s += st.v * dt;
    if (st.s < 0) st.mode = 'done';
    const t2 = trackAt(Math.max(0, st.s));
    st.x = t2.p[0] - t2.n[0] * RIDE;
    st.z = t2.p[1] - t2.n[1] * RIDE;
    st.th = Math.atan2(t2.t[1], t2.t[0]);
    return st;
  }
  if (st.mode === 'air') {
    st.tAir += dt;
    st.W = 0;
    let az = -GRAV;
    if (!st.fell) {
      // planned exit: a half roll on the thrusters (minimum jerk, 0.8 s), then the collective brakes the fall
      const T0 = 0.1, TR = 0.8;
      const u = Math.min(1, Math.max(0, (st.tAir - T0) / TR));
      const ph = Math.PI * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
      const acc = u > 0 && u < 1 ? (Math.PI * (60 * u - 180 * u ** 2 + 120 * u ** 3)) / (TR * TR) : 0;
      st.phi = ph;
      const tau = IXX * acc; // roll torque from the four vertical thrusters, b (T1 + T4 - T2 - T3)
      const up = Math.cos(st.th) * Math.cos(ph); // body up, z part (pitch th about y, then roll)
      const h = st.z - RIDE;
      let Tc = 0;
      if (up > 0.25 && h > 0.05) {
        // fall freely until stopping in the height left needs 2.2 g, then brake to land at 1.5 m/s
        const need = (st.vz * st.vz - 1.5 * 1.5) / (2 * h) + GRAV;
        if (need > 2.2 * GRAV || st.braking) st.braking = true;
        if (st.braking) Tc = Math.min(4 * TMAX - Math.abs(tau) / B, Math.max(0, (M * need) / up));
      }
      st.T = mix(Tc, tau);
      az += ((st.T[0] + st.T[1] + st.T[2] + st.T[3]) * up) / M;
    } else st.th += st.w * dt;
    st.vz += az * dt;
    st.x += st.vx * dt;
    st.z += st.vz * dt;
    if (st.z <= RIDE) {
      st.z = RIDE;
      st.mode = 'done';
      st.vLand = st.vz;
    }
    return st;
  }
  return st;
}
export const rampStart = () => ({mode: 'track', s: 0, v: 11, x: X0, z: RIDE, vx: 0, vz: 0, th: 0, w: 0, phi: 0, t: 0, tAir: 0, T: [0, 0, 0, 0], W: 0});

// ---------------------------------------------------------------- the kickflip over five cars
export const KICK = {x0: 2, x1: 6, h: 1.6}; // wedge, about 22 degrees
export const PARKED = [0, 1, 2, 3, 4].map((k) => ({x: 17 + 4.5 * k, h: k % 2 ? 2.6 : 1.3, w: 4.2}));
export function kickflip({v0 = 16, TR = 1.8, HOLD = 0.8, dt = 0.002} = {}) {
  const ang = Math.atan2(KICK.h, KICK.x1 - KICK.x0);
  const out = [];
  let x = -12, y = 0, z = RIDE, vx = v0, vy = 0, vz = 0, phi = 0, t = 0, mode = 'road', tAir = 0, pitch = 0;
  let minGap = 9;
  let braking = false;
  while (t < 6) {
    let T = [0, 0, 0, 0];
    if (mode === 'road') {
      x += vx * dt;
      if (x >= KICK.x0) {
        const s = Math.min(1, (x - KICK.x0) / (KICK.x1 - KICK.x0));
        z = RIDE + s * KICK.h;
        pitch = ang;
        if (s >= 1) {
          mode = 'air';
          vx = v0 * Math.cos(ang);
          vz = v0 * Math.sin(ang);
        }
      }
    } else if (mode === 'air') {
      tAir += dt;
      pitch += (-pitch) * Math.min(1, dt * 1.5);
      const T0 = 0.12;
      const u = Math.min(1, Math.max(0, (tAir - T0) / TR));
      phi = 2 * Math.PI * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
      const acc = u > 0 && u < 1 ? (2 * Math.PI * (60 * u - 180 * u ** 2 + 120 * u ** 3)) / (TR * TR) : 0;
      const tau = IXX * acc;
      const c = Math.cos(phi);
      // collective: only push while the thrusters point mostly down, and only enough to hold the climb rate we have
      let Tc = 0;
      if (c > 0.5) Tc = Math.min(4 * TMAX - Math.abs(tau) / B, (HOLD * M * GRAV) / c);
      if (u >= 1 && z > RIDE + 0.05) {
        const need = vz < 0 ? (vz * vz - 1) / (2 * (z - RIDE)) + GRAV : 0;
        if (need > 2.2 * GRAV) braking = true;
        Tc = braking ? Math.min(4 * TMAX, Math.max(0, (M * need) / c)) : 0;
      }
      T = mix(Tc, tau);
      const sum = T.reduce((a, b) => a + b, 0);
      // body up after a roll phi about the x axis: (0, -sin phi, cos phi)
      vy += ((-Math.sin(phi) * sum) / M) * dt;
      vz += ((Math.cos(phi) * sum) / M - GRAV) * dt;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      for (const p of PARKED) if (Math.abs(x - p.x) < p.w / 2 + 2.25) minGap = Math.min(minGap, z - 1.17 - p.h);
      if (u >= 1 && z <= RIDE) {
        z = RIDE;
        mode = 'land';
        out.landV = vz;
        vz = 0;
      }
    } else {
      x += vx * dt;
      vx = Math.max(0, vx - 8 * dt);
    }
    t += dt;
    if (Math.round(t / dt) % 10 === 0) out.push([+t.toFixed(3), +x.toFixed(3), +y.toFixed(3), +z.toFixed(3), +phi.toFixed(4), +pitch.toFixed(4), ...T.map((q) => Math.round(q))]);
  }
  out.minGap = minGap;
  return out;
}
