// A cold gas boost system in 3D, sized like the Roadster Thrust trim as Tesla described it: a 200 L composite overwrapped
// pressure vessel (COPV) of nitrogen at 10,000 psi feeding four rear nozzles. Tesla has published no drawings, so the
// layout and wall thicknesses here are illustrative: an aluminium liner (240 mm inside radius, 785 mm of straight wall
// gives 200 L), a hoop wound carbon layer on the straight part, helical carbon layers over everything, a polar boss with
// the tank valve, a regulator, a manifold and four converging diverging nozzles (8.3 mm throat, 20 mm exit, the sizes
// that make the model burn last 5 s at 50 bar). update(s) poses everything from one burn in data.js.
import * as THREE from 'three';

const V2 = THREE.Vector2;
const V3 = THREE.Vector3;
export const RI = 0.24; // liner inside radius (m)
const LIN = 0.006; // liner wall
const HOOP = 0.009; // hoop carbon
const HEL = 0.008; // helical carbon
export const LC = 0.785; // straight wall length
export const Y = 0.5; // tank axis height
const XE = LC / 2; // end of the straight wall
export const NOZ = [-0.42, -0.14, 0.14, 0.42]; // nozzle x positions
export const ZN = -0.86; // nozzle exit plane (the car's rear)
export const YN = 0.36;

// carbon tow textures drawn on a canvas: hoop lines go round the tank, helical lines cross at about 25 degrees
function towTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1c1f26';
  g.fillRect(0, 0, 512, 512);
  if (kind === 'hoop') {
    for (let y = 0; y < 512; y += 8) {
      g.fillStyle = y % 16 ? '#2b2f39' : '#343946';
      g.fillRect(0, y, 512, 6);
    }
  } else {
    g.lineWidth = 9;
    for (const s of [1, -1]) {
      g.strokeStyle = s > 0 ? 'rgba(70,76,92,.9)' : 'rgba(52,57,70,.9)';
      for (let x = -1024; x < 1024; x += 22) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + s * 512 * 0.47, 512);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// the cutaway: every layer loses its upper front quarter, each from a different x, so the wall reads as a staircase
const CUT_Y = Y;
// (the upper quarter that faces the back of the car, toward the nozzles and the camera), each layer over a window from
// x0 to X1, so the domes stay whole and the three layers step down like a staircase at the x0 end
const X1 = 0.36;
const cutPlanes = (x0) => [new THREE.Plane(new V3(0, -1, 0), CUT_Y), new THREE.Plane(new V3(0, 0, 1), 0), new THREE.Plane(new V3(-1, 0, 0), x0), new THREE.Plane(new V3(1, 0, 0), -X1)];
const X0 = {helical: -0.4, hoop: -0.22, liner: -0.04};
const PLANES = {helical: cutPlanes(X0.helical), hoop: cutPlanes(X0.hoop), liner: cutPlanes(X0.liner)};

const mat = {
  liner: new THREE.MeshStandardMaterial({color: '#cfd4dc', metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide}),
  linerIn: new THREE.MeshStandardMaterial({color: '#aab1bc', metalness: 0.8, roughness: 0.45, side: THREE.BackSide}),
  hoop: new THREE.MeshStandardMaterial({map: towTexture('hoop'), metalness: 0.25, roughness: 0.42, side: THREE.DoubleSide}),
  helical: new THREE.MeshPhysicalMaterial({map: towTexture('helical'), metalness: 0.2, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, side: THREE.DoubleSide}),
  steel: new THREE.MeshStandardMaterial({color: '#c9ced6', metalness: 0.85, roughness: 0.3}),
  steelDark: new THREE.MeshStandardMaterial({color: '#8d939c', metalness: 0.8, roughness: 0.42}),
  ink: new THREE.MeshStandardMaterial({color: '#1b1f2a', metalness: 0.3, roughness: 0.55}),
  body: new THREE.MeshStandardMaterial({color: '#2b2f38', metalness: 0.5, roughness: 0.4}),
  pan: new THREE.MeshStandardMaterial({color: '#3a3f4a', metalness: 0.3, roughness: 0.6}),
  tag: new THREE.MeshStandardMaterial({color: '#FDC57E', roughness: 0.5}),
  nozzle: new THREE.MeshStandardMaterial({color: '#b9bfc8', metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide}),
  plume: new THREE.MeshBasicMaterial({color: '#8fb6e8', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide}),
  core: new THREE.MeshBasicMaterial({color: '#5d8fd6', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide}),
  lampOn: new THREE.MeshStandardMaterial({color: '#2e9e6b', emissive: new THREE.Color('#2e9e6b'), emissiveIntensity: 0.9}),
  lampOff: new THREE.MeshStandardMaterial({color: '#9aa0aa', roughness: 0.6}),
};
mat.liner.clippingPlanes = PLANES.liner;
mat.linerIn.clippingPlanes = PLANES.liner;
mat.hoop.clippingPlanes = PLANES.hoop;
mat.helical.clippingPlanes = PLANES.helical;
for (const k of ['liner', 'linerIn', 'hoop', 'helical']) {
  mat[k].clipIntersection = true;
  mat[k].clipShadows = true;
}
export const MAT = mat;
function dotTexture(soft) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(soft ? 0.2 : 0.62, soft ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,1)');
  r.addColorStop(soft ? 1 : 0.8, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cyl = (r, h, m, seg = 32) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const at = (o, x, y, z) => (o.position.set(x, y, z), o);
const shadow = (o) => (o.traverse((c) => c.isMesh && ((c.castShadow = true), (c.receiveShadow = true))), o);

// a capsule profile (radius r) along the lathe's y axis, from -XE - r to +XE + r, optionally only the straight part
function capsule(r, {straight = false, polar = 0.055} = {}) {
  const p = [];
  if (!straight) {
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * (Math.PI / 2);
      p.push(new V2(Math.max(polar, r * Math.sin(a)), -XE - r * Math.cos(a)));
    }
  } else p.push(new V2(r, -XE));
  if (!straight) {
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * (Math.PI / 2);
      p.push(new V2(Math.max(polar, r * Math.cos(a)), XE + r * Math.sin(a)));
    }
  } else p.push(new V2(r, XE));
  return p;
}
// a solid shell between two capsule radii, lathed and turned so its axis runs along x
function shell(r0, r1, m, opts) {
  const outer = capsule(r1, opts);
  const inner = capsule(r0, opts).reverse();
  const g = new THREE.LatheGeometry(outer.concat(inner, [outer[0]]), 96);
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.y = Y;
  return mesh;
}
function pipe(points, r, m) {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 18), m);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(c);
    if (i > 0) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10), m), a.x, a.y, a.z));
  }
  return g;
}

export function buildCopv() {
  const root = new THREE.Group();
  const tags = {};

  // ---------------------------------------------------------- the car around it: floor pan, rear bulkhead, diffuser, wheels
  const car = new THREE.Group();
  car.add(at(box(2.0, 0.03, 1.7, mat.pan), 0, 0.2, -0.05));
  car.add(at(box(2.0, 0.26, 0.04, mat.pan), 0, 0.34, 0.8));
  car.add(at(box(1.6, 0.06, 0.05, mat.body), 0, 0.48, ZN + 0.02));
  for (const x of [-0.78, 0.78]) car.add(at(box(0.05, 0.27, 0.05, mat.body), x, 0.35, ZN + 0.02));
  for (let i = 0; i < 5; i++) car.add(at(box(0.012, 0.09, 0.32, mat.body), -0.6 + i * 0.3, 0.17, ZN + 0.18));
  for (const x of [-1.0, 1.0]) {
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 18, 48), mat.ink);
    tyre.rotation.y = Math.PI / 2;
    car.add(at(tyre, x, 0.36, -0.35));
    const rim = cyl(0.25, 0.16, mat.steelDark, 40);
    rim.rotation.z = Math.PI / 2;
    car.add(at(rim, x, 0.36, -0.35));
  }
  root.add(shadow(car));

  // ---------------------------------------------------------- the COPV: liner, hoop layer, helical layers, cradle straps
  const tank = new THREE.Group();
  const liner = shell(RI, RI + LIN, mat.liner);
  const linerIn = shell(RI - 0.0005, RI, mat.linerIn);
  const hoop = shell(RI + LIN, RI + LIN + HOOP, mat.hoop, {straight: true});
  const helical = shell(RI + LIN + 0.0005, RI + LIN + HOOP + HEL, mat.helical, {polar: 0.062});
  hoop.material.map.repeat.set(24, 1);
  helical.material.map.repeat.set(3, 1);
  tank.add(liner, linerIn, hoop, helical);
  // two steel straps round the tank on saddle blocks bolted to the floor pan
  const RO = RI + LIN + HOOP + HEL;
  for (const x of [-0.3, 0.3]) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(RO + 0.008, 0.008, 10, 72), mat.steelDark);
    strap.rotation.y = Math.PI / 2;
    tank.add(at(strap, x, Y, 0));
    tank.add(at(box(0.06, Y - RO - 0.2, 0.3, mat.steelDark), x, (Y - RO + 0.215) / 2 + 0.01, 0));
  }
  root.add(shadow(tank));
  tags.copv = new V3(-0.62, Y + RO * 0.7, -RO * 0.7);
  tags.liner = new V3(0.34, Y + RI * 0.7, -RI * 0.55);
  tags.carbon = new V3(-0.26, Y + RO * 0.72, -RO * 0.68);

  // ---------------------------------------------------------- the gas: points inside the liner, as many as there is gas
  const NG = 1100;
  const gp = new Float32Array(NG * 3);
  const gb = new Float32Array(NG * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < NG; i++) {
    let x, yy, z;
    do {
      x = (rnd() * 2 - 1) * (XE + RI);
      yy = (rnd() * 2 - 1) * RI;
      z = (rnd() * 2 - 1) * RI;
      const ex = Math.max(0, Math.abs(x) - XE);
      if (ex * ex + yy * yy + z * z < (RI - 0.02) * (RI - 0.02)) break;
    } while (true);
    gb[i * 3] = x;
    gb[i * 3 + 1] = Y + yy;
    gb[i * 3 + 2] = z;
  }
  gp.set(gb);
  const gasGeo = new THREE.BufferGeometry();
  gasGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const gasMat = new THREE.PointsMaterial({color: '#f0a46b', map: dotTexture(false), size: 0.034, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false});
  const gas = new THREE.Points(gasGeo, gasMat);
  root.add(gas);
  tags.gas = new V3(0.42, Y + 0.02, -0.06);

  // ---------------------------------------------------------- boss, tank valve, regulator, manifold
  const xb = XE + RI + HEL + 0.01;
  const boss = new THREE.Group();
  const bossC = cyl(0.068, 0.07, mat.steel, 32);
  bossC.rotation.z = Math.PI / 2;
  boss.add(at(bossC, xb, Y, 0));
  const vbody = box(0.11, 0.1, 0.1, mat.steel);
  boss.add(at(vbody, xb + 0.09, Y, 0));
  const sol = cyl(0.034, 0.09, mat.ink, 24);
  boss.add(at(sol, xb + 0.09, Y + 0.095, 0));
  const lamp = cyl(0.016, 0.01, mat.lampOff, 16);
  boss.add(at(lamp, xb + 0.09, Y + 0.145, 0));
  root.add(shadow(boss));
  tags.valve = new V3(xb + 0.09, Y + 0.2, 0);
  // high pressure line to the regulator behind the tank
  const xr = xb + 0.09;
  root.add(shadow(pipe([new V3(xr, Y - 0.05, 0), new V3(xr, Y - 0.12, 0), new V3(xr, Y - 0.12, -0.42)], 0.011, mat.steel)));
  const reg = new THREE.Group();
  reg.add(at(box(0.12, 0.12, 0.14, mat.steel), 0, 0, 0));
  const bonnet = cyl(0.045, 0.1, mat.steelDark, 24);
  reg.add(at(bonnet, 0, 0.11, 0));
  const dial = cyl(0.045, 0.012, new THREE.MeshStandardMaterial({color: '#f4f2ec', roughness: 0.5}), 32);
  dial.rotation.z = Math.PI / 2;
  reg.add(at(dial, 0.066, 0.0, 0));
  const needle = box(0.003, 0.034, 0.004, mat.ink);
  needle.geometry.translate(0, 0.016, 0);
  const nh = new THREE.Group();
  nh.position.set(0.074, 0, 0);
  nh.rotation.y = Math.PI / 2;
  nh.add(needle);
  reg.add(nh);
  reg.position.set(xr, Y - 0.12, -0.49);
  root.add(shadow(reg));
  tags.reg = new V3(xr, Y + 0.08, -0.49);
  // manifold across the back, then down to the nozzle row
  root.add(shadow(pipe([new V3(xr, Y - 0.12, -0.56), new V3(xr, Y - 0.12, -0.64), new V3(xr, YN, -0.64), new V3(NOZ[0], YN, -0.64)], 0.016, mat.steel)));
  for (const x of NOZ) root.add(shadow(pipe([new V3(x, YN, -0.64), new V3(x, YN, -0.72)], 0.012, mat.steel)));

  // ---------------------------------------------------------- four nozzles: chamber, throat, bell, cut in half to show the shape
  const nzProf = [];
  const RC = 0.03;
  const RT = 0.0083;
  const RE = 0.02;
  const L1 = 0.05;
  const L2 = 0.09;
  for (let i = 0; i <= 12; i++) nzProf.push(new V2(RC + 0.004, (i / 12) * 0.03));
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const r = RT + (RC - RT) * (0.5 + 0.5 * Math.cos(u * Math.PI));
    nzProf.push(new V2(r + 0.004, 0.03 + u * L1));
  }
  for (let i = 1; i <= 20; i++) {
    const u = i / 20;
    nzProf.push(new V2(RT + (RE - RT) * Math.sqrt(u) + 0.0025, 0.03 + L1 + u * L2));
  }
  const NL = 0.03 + L1 + L2;
  const nzGeo = new THREE.LatheGeometry(nzProf, 40, 0, Math.PI * 2);
  const nzCut = new THREE.LatheGeometry(nzProf, 40, Math.PI, Math.PI);
  const nozzles = [];
  const plumes = [];
  const cores = [];
  for (const x of NOZ) {
    const g = new THREE.Group();
    const full = new THREE.Mesh(nzGeo, mat.nozzle);
    const half = new THREE.Mesh(nzCut, mat.nozzle);
    g.add(full, half);
    g.rotation.x = -Math.PI / 2; // lathe y axis points along -z, out of the car's back
    g.position.set(x, YN, -0.72);
    root.add(shadow(g));
    nozzles.push({g, full, half});
    // plume: a long soft cone and a short bright core from the exit plane
    const pl = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 28, 1, true), mat.plume);
    pl.geometry.translate(0, 0.5, 0);
    pl.rotation.x = -Math.PI / 2;
    pl.position.set(x, YN, -0.72 - NL);
    root.add(pl);
    plumes.push(pl);
    const co = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18, 1, true), mat.core);
    co.geometry.translate(0, 0.5, 0);
    co.rotation.x = -Math.PI / 2;
    co.position.copy(pl.position);
    root.add(co);
    cores.push(co);
  }
  tags.nozzle = new V3(NOZ[3], YN + 0.09, -0.8);
  // condensation fog: puffs that drift back from the nozzles and grow
  const NF = 360;
  const fp = new Float32Array(NF * 3);
  const fs = new Float32Array(NF * 4);
  for (let i = 0; i < NF; i++) {
    fs[i * 4] = rnd();
    fs[i * 4 + 1] = (rnd() - 0.5) * 2;
    fs[i * 4 + 2] = (rnd() - 0.5) * 2;
    fs[i * 4 + 3] = Math.floor(rnd() * 4);
  }
  const fogGeo = new THREE.BufferGeometry();
  fogGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const fogMat = new THREE.PointsMaterial({color: '#b9c9dd', map: dotTexture(true), size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false});
  const fog = new THREE.Points(fogGeo, fogMat);
  root.add(fog);
  tags.plume = new V3(0, YN + 0.12, ZN - 0.9);

  // ---------------------------------------------------------- pose from the burn
  const warm = new THREE.Color('#f0a46b');
  const cold = new THREE.Color('#7fb0ee');
  const M0 = 98.94;
  let vk = 0;
  let age = 0;
  const update = (s, time, dt, view) => {
    const cut = view.cut;
    // the cutaway: planes slide in from far away so the layers open one after another
    const far = 3;
    PLANES.helical[2].constant = X0.helical + (1 - cut) * far;
    PLANES.hoop[2].constant = X0.hoop + (1 - Math.min(1, cut * 1.2)) * far;
    PLANES.liner[2].constant = X0.liner + (1 - Math.min(1, cut * 1.4)) * far;
    for (const n of nozzles) {
      n.full.visible = cut < 0.5;
      n.half.visible = cut >= 0.5;
    }
    // gas: fewer points as the mass falls, colour by temperature, jiggle faster when warm
    const frac = Math.max(0, s.mass / M0);
    gasGeo.setDrawRange(0, Math.round(NG * frac));
    const k = Math.min(1, Math.max(0, (20 - s.temp) / 140));
    gasMat.color.copy(warm).lerp(cold, k);
    gas.visible = cut > 0.35;
    gasMat.opacity = 0.85 * Math.min(1, (cut - 0.35) / 0.4);
    const sp = Math.sqrt(Math.max(60, s.temp + 273.15) / 293);
    for (let i = 0; i < NG; i++) {
      const j = i * 3;
      gp[j] = gb[j] + 0.006 * Math.sin(time * 9 * sp + i * 1.7);
      gp[j + 1] = gb[j + 1] + 0.006 * Math.sin(time * 8 * sp + i * 2.3);
      gp[j + 2] = gb[j + 2] + 0.006 * Math.cos(time * 10 * sp + i * 0.9);
    }
    gasGeo.attributes.position.needsUpdate = true;
    // the valve lamp and the regulator needle (0 to 100 bar dial)
    vk += ((s.flow > 0.05 ? 1 : 0) - vk) * (1 - Math.exp(-dt / 0.08));
    lamp.material = vk > 0.5 ? mat.lampOn : mat.lampOff;
    nh.rotation.x = -2.3 + (Math.min(100, s.flow > 0.05 ? 50 : 0) / 100) * 4.6 * Math.min(1, vk * 1.1);
    // plumes: length and brightness follow the thrust (6.3 kN at most)
    const f = Math.max(0, s.thrust / 6.3);
    for (let i = 0; i < 4; i++) {
      const len = 0.05 + 1.25 * f * (1 + 0.03 * Math.sin(time * 37 + i));
      plumes[i].scale.set(0.02 + 0.11 * f, len, 0.02 + 0.11 * f);
      cores[i].scale.set(0.016 + 0.02 * f, 0.02 + 0.32 * f, 0.016 + 0.02 * f);
      plumes[i].visible = cores[i].visible = f > 0.01;
    }
    mat.plume.opacity = 0.3 * f;
    mat.core.opacity = 0.5 * f;
    // fog: puffs ride back along the plumes while the gas flows, and hang a moment after
    age = f > 0.01 ? Math.min(age + dt * 3, 1) : Math.max(0, age - dt * 0.6);
    for (let i = 0; i < NF; i++) {
      const ph = (fs[i * 4] + time * 0.9) % 1;
      const x = NOZ[fs[i * 4 + 3]];
      const d = ph * 1.6;
      fp[i * 3] = x + fs[i * 4 + 1] * 0.06 * (0.3 + d);
      fp[i * 3 + 1] = YN + fs[i * 4 + 2] * 0.05 * (0.3 + d) + d * 0.05;
      fp[i * 3 + 2] = -0.72 - NL - 0.15 - d;
    }
    fogGeo.attributes.position.needsUpdate = true;
    fogMat.opacity = 0.42 * age;
    fog.visible = age > 0.01;
  };
  return {root, tags, update};
}
