// Density matrix model of the paper's photonic quantum walk (Wang, Xiao, Longhi and Xue,
// Nature Communications 2026, doi:10.1038/s41467-026-78483-z). Written from the equations
// in the paper's Results and Methods; no data or code from the paper is used.
//
// One step: U = S C(theta) M
//   M  : coin |1> (vertical polarisation) keeps amplitude sqrt(1 - gamma)   (loss)
//   C  : exp(i theta sigma_y) = [[cos, sin], [-sin, cos]]                   (coin)
//   S  : coin |0> steps right (x+1), coin |1> steps left (x-1)              (shift)
// Dephasing (strength eta) acts on the coin before U:
//   rho -> (1 - eta) rho + eta * (coin diagonal part of rho)
// Amplitude damping (strength mu), Kraus K0 = diag(1, sqrt(1-mu)), K1 = sqrt(mu)|0><1|,
//   order 'before': rho -> sum_i S C M K_i rho K_i^+ M^+ C^+ S^+
//   order 'after' : rho -> sum_i S C K_i M rho M^+ K_i^+ C^+ S^+
// Start: x = 0, coin (|0> + i|1>)/sqrt(2). Probabilities are renormalised every step,
// as the paper does for its plotted distributions.

export function walk({ steps = 8, theta = Math.PI / 4, gamma = 0, eta = 0, mu = 0, order = 'before', L } = {}) {
  L = L || steps + 1;
  const N = 2 * L + 1, D = 2 * N;
  let re = new Float64Array(D * D), im = new Float64Array(D * D);
  const ix = (x, c) => 2 * (x + L) + c;
  // initial state
  const a = [[ix(0, 0), 1 / Math.SQRT2, 0], [ix(0, 1), 0, 1 / Math.SQRT2]];
  for (const [i, ar, ai] of a) for (const [j, br, bi] of a) {
    // psi_i * conj(psi_j)
    re[i * D + j] = ar * br + ai * bi;
    im[i * D + j] = ai * br - ar * bi;
  }
  const g = Math.sqrt(1 - gamma);
  const co = Math.cos(theta), si = Math.sin(theta);
  const out = { P: [], n: [], norm: [], L };

  const record = () => {
    const p = new Float64Array(N);
    let tot = 0;
    for (let x = 0; x < N; x++) { p[x] = re[(2 * x) * D + 2 * x] + re[(2 * x + 1) * D + 2 * x + 1]; tot += p[x]; }
    let n = 0;
    for (let x = 0; x < N; x++) { p[x] /= tot; n += (x - L) * p[x]; }
    out.P.push(Array.from(p)); out.n.push(n); out.norm.push(tot);
  };
  // apply a real coin matrix A (2x2, same on every site): rho -> A rho A^T
  const coin = (A) => {
    const [a00, a01, a10, a11] = A;
    for (let j = 0; j < D; j++) for (let x = 0; x < N; x++) {
      const i0 = (2 * x) * D + j, i1 = i0 + D;
      const r0 = re[i0], r1 = re[i1], m0 = im[i0], m1 = im[i1];
      re[i0] = a00 * r0 + a01 * r1; re[i1] = a10 * r0 + a11 * r1;
      im[i0] = a00 * m0 + a01 * m1; im[i1] = a10 * m0 + a11 * m1;
    }
    for (let i = 0; i < D; i++) for (let x = 0; x < N; x++) {
      const j0 = i * D + 2 * x, j1 = j0 + 1;
      const r0 = re[j0], r1 = re[j1], m0 = im[j0], m1 = im[j1];
      re[j0] = r0 * a00 + r1 * a01; re[j1] = r0 * a10 + r1 * a11;
      im[j0] = m0 * a00 + m1 * a01; im[j1] = m0 * a10 + m1 * a11;
    }
  };
  const dephase = (e) => {
    if (!e) return;
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) if ((i & 1) !== (j & 1)) { re[i * D + j] *= 1 - e; im[i * D + j] *= 1 - e; }
  };
  const damp = (m) => {
    if (!m) return;
    const s = Math.sqrt(1 - m);
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const i0 = 2 * x, i1 = i0 + 1, j0 = 2 * y, j1 = j0 + 1;
      re[i0 * D + j0] += m * re[i1 * D + j1]; im[i0 * D + j0] += m * im[i1 * D + j1];
      re[i0 * D + j1] *= s; im[i0 * D + j1] *= s;
      re[i1 * D + j0] *= s; im[i1 * D + j0] *= s;
      re[i1 * D + j1] *= 1 - m; im[i1 * D + j1] *= 1 - m;
    }
  };
  const shift = () => {
    const nr = new Float64Array(D * D), ni = new Float64Array(D * D);
    const to = (k) => { const x = (k >> 1) - L, c = k & 1, x2 = x + (c ? -1 : 1); return (x2 < -L || x2 > L) ? -1 : ix(x2, c); };
    for (let i = 0; i < D; i++) { const i2 = to(i); if (i2 < 0) continue;
      for (let j = 0; j < D; j++) { const j2 = to(j); if (j2 < 0) continue; nr[i2 * D + j2] = re[i * D + j]; ni[i2 * D + j2] = im[i * D + j]; } }
    re = nr; im = ni;
  };
  record();
  for (let t = 0; t < steps; t++) {
    dephase(eta);
    if (order === 'before') damp(mu);
    coin([1, 0, 0, g]);                // M, the loss
    if (order === 'after') damp(mu);
    coin([co, si, -si, co]);           // C(theta)
    shift();                           // S
    record();
  }
  return out;
}

// Closed forms from the paper (theta in radians): Eq. (1) coherent, Eq. (2) fully dephased,
// Eq. (3) full amplitude damping applied after the loss.
export const vCoh = (g, th) => { const s = Math.sqrt(1 - g), c = Math.cos(th); return (1 + s) * c / Math.sqrt(4 * s + (1 - s) * (1 - s) * c * c); };
export const vInc = (g, th) => { const c2 = Math.cos(th) ** 2, s2 = Math.sin(th) ** 2; return g * c2 / Math.sqrt(4 * (1 - g) * s2 * s2 + g * g * c2 * c2); };
export const vDampAfter = (g, th) => { const c2 = Math.cos(th) ** 2, s2 = Math.sin(th) ** 2; return (c2 - (1 - g) * s2) / (1 - g * s2); };

// least squares slope of n(t) over steps t0..t1
export function slope(n, t0, t1) {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
  for (let t = t0; t <= t1; t++) { sx += t; sy += n[t]; sxx += t * t; sxy += t * n[t]; k++; }
  return (k * sxy - sx * sy) / (k * sxx - sx * sx);
}
