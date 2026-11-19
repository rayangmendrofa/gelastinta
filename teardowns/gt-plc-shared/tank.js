// T-101 in 3D: a 40 L stainless batch tank on a skid, with its two inlet valves, agitator, immersion heater, level and
// temperature transmitters, two level switches, outlet valve and drain pump. The project gives volumes, flows and
// power but no drawing of the vessel, so the proportions are illustrative: 360 mm inside diameter and 400 mm of
// straight wall hold about 40 L. update(s) poses everything from the recorded batch (level, temperature, heater power
// and the five outputs), so nothing on screen is keyframed by hand.
import * as THREE from 'three';

const V2 = THREE.Vector2;
const V3 = THREE.Vector3;
export const R = 0.18; // inside radius (m)
export const Y0 = 0.62; // top of the dished bottom, start of the straight wall
export const HW = 0.4; // straight wall height
export const DISH = 0.07; // dish depth
export const YTOP = Y0 + HW;
const WALL = 0.006;
// liquid height for a level reading: the transmitter spans the dish plus the straight wall
export const levelY = (pct) => Y0 - DISH + (Math.max(0, pct) / 100) * (HW + DISH);

const mat = {
  steel: new THREE.MeshStandardMaterial({color: '#c9ced6', metalness: 0.85, roughness: 0.32}),
  steelDark: new THREE.MeshStandardMaterial({color: '#8d939c', metalness: 0.8, roughness: 0.42}),
  frame: new THREE.MeshStandardMaterial({color: '#4a5263', metalness: 0.35, roughness: 0.55}),
  ink: new THREE.MeshStandardMaterial({color: '#1b1f2a', metalness: 0.3, roughness: 0.55}),
  rubber: new THREE.MeshStandardMaterial({color: '#2a2d33', metalness: 0.0, roughness: 0.8}),
  motor: new THREE.MeshStandardMaterial({color: '#e7e9ee', metalness: 0.2, roughness: 0.45}),
  pipe: new THREE.MeshStandardMaterial({color: '#d6dae1', metalness: 0.75, roughness: 0.3}),
  glass: new THREE.MeshPhysicalMaterial({color: '#dfe8f5', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide}),
  shellOut: new THREE.MeshStandardMaterial({color: '#d3d8df', metalness: 0.85, roughness: 0.28, transparent: true, opacity: 1, side: THREE.FrontSide}),
  liquid: new THREE.MeshPhysicalMaterial({color: '#7fb0ee', metalness: 0, roughness: 0.15, transmission: 0, transparent: true, opacity: 0.66, depthWrite: false, clearcoat: 0.6}),
  surf: new THREE.MeshPhysicalMaterial({color: '#9cc2f2', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.8, clearcoat: 1, side: THREE.DoubleSide}),
  stream: new THREE.MeshStandardMaterial({color: '#8fb8f0', roughness: 0.2, transparent: true, opacity: 0.85}),
  heater: new THREE.MeshStandardMaterial({color: '#7b4b33', metalness: 0.6, roughness: 0.4, emissive: new THREE.Color('#ff5a1f'), emissiveIntensity: 0}),
  lampOn: new THREE.MeshStandardMaterial({color: '#2e9e6b', emissive: new THREE.Color('#2e9e6b'), emissiveIntensity: 0.9}),
  lampOff: new THREE.MeshStandardMaterial({color: '#9aa0aa', roughness: 0.6}),
  tag: new THREE.MeshStandardMaterial({color: '#f6c945', roughness: 0.5}),
};
export const MAT = mat;

const cyl = (r, h, m, seg = 32) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const at = (o, x, y, z) => (o.position.set(x, y, z), o);
const shadow = (o) => (o.traverse((c) => c.isMesh && ((c.castShadow = true), (c.receiveShadow = true))), o);

// a pipe through points with rounded bends
function pipe(points, r, m) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), m);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(c);
    if (i > 0) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), m), a.x, a.y, a.z));
  }
  return g;
}
// a flange ring on a pipe axis
function flange(pos, axis, r, m) {
  const f = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 28), m);
  f.position.copy(pos);
  f.quaternion.setFromUnitVectors(new V3(0, 1, 0), axis.clone().normalize());
  return f;
}
// an on/off valve with a pneumatic actuator; the indicator disc turns and lights when open
function valve(pos, axis, label) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), mat.steel);
  body.scale.set(1.25, 1, 1);
  g.add(body);
  const yoke = cyl(0.008, 0.05, mat.steelDark);
  yoke.position.y = 0.045;
  g.add(yoke);
  const act = cyl(0.032, 0.05, mat.ink);
  act.position.y = 0.095;
  g.add(act);
  const ind = new THREE.Group();
  ind.position.y = 0.123;
  const disc = cyl(0.026, 0.006, mat.lampOff);
  const bar = box(0.05, 0.008, 0.012, mat.tag);
  bar.position.y = 0.006;
  ind.add(disc, bar);
  g.add(ind);
  g.userData = {ind, disc, label, k: 0};
  return g;
}

export function buildTank() {
  const root = new THREE.Group();
  const tags = {}; // world anchors for labels

  // ---------------------------------------------------------- skid: base frame and legs
  const skid = new THREE.Group();
  const L = 0.62;
  for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
    skid.add(at(box(0.04, Y0 - 0.02, 0.04, mat.frame), x, (Y0 - 0.02) / 2, z));
    skid.add(at(cyl(0.035, 0.012, mat.rubber), x, 0.006, z));
  }
  for (const s of [-1, 1]) {
    skid.add(at(box(L, 0.04, 0.04, mat.frame), 0, 0.14, s * 0.24));
    skid.add(at(box(0.04, 0.04, L, mat.frame), s * 0.24, 0.14, 0));
    skid.add(at(box(L, 0.03, 0.03, mat.frame), 0, Y0 - 0.06, s * 0.24));
    skid.add(at(box(0.03, 0.03, L, mat.frame), s * 0.24, Y0 - 0.06, 0));
  }
  // a nameplate
  const plate = box(0.12, 0.05, 0.004, mat.tag);
  plate.position.set(0, 0.14, 0.262);
  skid.add(plate);
  root.add(shadow(skid));

  // ---------------------------------------------------------- the vessel: shell (lathed), glass sleeve for the cutaway
  const prof = [];
  const ro = R + WALL;
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    prof.push(new V2(Math.max(0.001, ro * Math.sin(a)), Y0 - (DISH + WALL) * Math.cos(a)));
  }
  prof.push(new V2(ro, YTOP));
  prof.push(new V2(ro + 0.02, YTOP));
  prof.push(new V2(ro + 0.02, YTOP + 0.016));
  prof.push(new V2(0.001, YTOP + 0.016));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), mat.shellOut);
  const glassProf = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    glassProf.push(new V2(Math.max(0.001, ro * Math.sin(a)), Y0 - (DISH + WALL) * Math.cos(a)));
  }
  glassProf.push(new V2(ro, YTOP));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(glassProf, 72), mat.glass);
  glass.renderOrder = 5;
  // lid: a flat flange on top, always steel
  const lid = new THREE.Group();
  lid.add(at(cyl(ro + 0.022, 0.018, mat.steel, 72), 0, YTOP + 0.009, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lid.add(at(cyl(0.006, 0.012, mat.steelDark, 10), Math.cos(a) * (ro + 0.012), YTOP + 0.024, Math.sin(a) * (ro + 0.012)));
  }
  const vessel = new THREE.Group();
  vessel.add(shell, glass, lid);
  root.add(shadow(vessel));
  glass.castShadow = false;

  // ---------------------------------------------------------- the liquid: dish part and column, plus a rippling top
  const liq = new THREE.Group();
  const dishProf = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    dishProf.push(new V2(Math.max(0.001, (R - 0.002) * Math.sin(a)), Y0 - (DISH - 0.002) * Math.cos(a)));
  }
  const dish = new THREE.Mesh(new THREE.LatheGeometry(dishProf, 64), mat.liquid);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.002, R - 0.002, 1, 64, 1, true), mat.liquid);
  const SEG = 48;
  const RINGS = 14;
  const surfGeo = new THREE.CircleGeometry(R - 0.002, SEG, 0, Math.PI * 2);
  {
    // a polar grid for the ripples
    const pos = [];
    const idx = [];
    pos.push(0, 0, 0);
    for (let r = 1; r <= RINGS; r++) for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rr = ((R - 0.002) * r) / RINGS;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    }
    for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
    for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
      const a = 1 + (r - 1) * SEG + s;
      const b = 1 + (r - 1) * SEG + ((s + 1) % SEG);
      const c = 1 + r * SEG + s;
      const d = 1 + r * SEG + ((s + 1) % SEG);
      idx.push(a, b, c, b, d, c);
    }
    surfGeo.setIndex(idx);
    surfGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    surfGeo.deleteAttribute('uv');
    surfGeo.deleteAttribute('normal');
    surfGeo.computeVertexNormals();
  }
  const surf = new THREE.Mesh(surfGeo, mat.surf);
  const base = Float32Array.from(surfGeo.attributes.position.array);
  liq.add(dish, col, surf);
  liq.renderOrder = 2;
  root.add(liq);

  // ---------------------------------------------------------- agitator: motor on the lid, shaft, pitched blade impeller
  const ag = new THREE.Group();
  const mot = new THREE.Group();
  mot.add(at(cyl(0.055, 0.13, mat.motor), 0, YTOP + 0.11, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const fin = box(0.004, 0.11, 0.012, mat.motor);
    fin.position.set(Math.cos(a) * 0.058, YTOP + 0.11, Math.sin(a) * 0.058);
    fin.rotation.y = -a;
    mot.add(fin);
  }
  mot.add(at(cyl(0.06, 0.02, mat.steelDark), 0, YTOP + 0.035, 0));
  mot.add(at(cyl(0.035, 0.03, mat.ink), 0, YTOP + 0.19, 0));
  const tb = box(0.05, 0.04, 0.04, mat.ink);
  tb.position.set(0.07, YTOP + 0.13, 0);
  mot.add(tb);
  ag.add(mot);
  const spin = new THREE.Group();
  spin.add(at(cyl(0.007, YTOP - (Y0 - 0.02), mat.steel, 16), 0, (YTOP + Y0 - 0.02) / 2, 0));
  spin.add(at(cyl(0.018, 0.03, mat.steel, 20), 0, Y0 + 0.0, 0));
  for (let i = 0; i < 4; i++) {
    const blade = box(0.09, 0.004, 0.032, mat.steel);
    blade.position.set(Math.cos((i * Math.PI) / 2) * 0.06, Y0, Math.sin((i * Math.PI) / 2) * 0.06);
    blade.rotation.y = -(i * Math.PI) / 2;
    blade.rotation.x = Math.PI / 4;
    spin.add(blade);
  }
  ag.add(spin);
  root.add(shadow(ag));
  tags.m101 = new V3(0.07, YTOP + 0.2, 0);

  // ---------------------------------------------------------- immersion heater: a ring coil near the bottom
  const pts = [];
  const TURNS = 2.6;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    const a = u * TURNS * Math.PI * 2;
    const rr = 0.135 - 0.035 * u;
    pts.push(new V3(Math.cos(a) * rr, Y0 - 0.025 + 0.012 * Math.sin(a * 0.5), Math.sin(a) * rr));
  }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.0065, 10), mat.heater);
  // terminal box outside on the wall
  const hbox = new THREE.Group();
  hbox.add(at(box(0.07, 0.07, 0.05, mat.ink), 0, 0, 0));
  hbox.add(at(cyl(0.01, 0.05, mat.steelDark), 0, 0, -0.04));
  hbox.children[1].rotation.x = Math.PI / 2;
  hbox.position.set(0, Y0 + 0.02, -(R + 0.05));
  root.add(shadow(coil), shadow(hbox));
  const heatLight = new THREE.PointLight('#ff6a2a', 0, 0.6, 2);
  heatLight.position.set(0, Y0 - 0.01, 0);
  root.add(heatLight);
  tags.e101 = new V3(0, Y0 + 0.02, -(R + 0.08));

  // ---------------------------------------------------------- inlets A and B: pipe, valve, nozzle through the lid
  const inA = new V3(-0.1, YTOP, 0.06);
  const inB = new V3(0.1, YTOP, 0.06);
  const pA = [new V3(-0.62, YTOP + 0.14, 0.06), new V3(-0.1, YTOP + 0.14, 0.06), new V3(-0.1, YTOP + 0.02, 0.06)];
  const pB = [new V3(0.62, YTOP + 0.14, 0.06), new V3(0.1, YTOP + 0.14, 0.06), new V3(0.1, YTOP + 0.02, 0.06)];
  root.add(shadow(pipe(pA, 0.013, mat.pipe)), shadow(pipe(pB, 0.013, mat.pipe)));
  root.add(flange(new V3(-0.62, YTOP + 0.14, 0.06), new V3(1, 0, 0), 0.026, mat.steelDark));
  root.add(flange(new V3(0.62, YTOP + 0.14, 0.06), new V3(1, 0, 0), 0.026, mat.steelDark));
  const vA = valve(new V3(-0.36, YTOP + 0.14, 0.06), new V3(1, 0, 0), 'XV-101');
  const vB = valve(new V3(0.36, YTOP + 0.14, 0.06), new V3(1, 0, 0), 'XV-102');
  root.add(shadow(vA), shadow(vB));
  tags.xv101 = new V3(-0.36, YTOP + 0.3, 0.06);
  tags.xv102 = new V3(0.36, YTOP + 0.3, 0.06);
  // falling streams
  const streamGeo = new THREE.CylinderGeometry(0.009, 0.006, 1, 14, 1, true);
  streamGeo.translate(0, -0.5, 0);
  const sA = new THREE.Mesh(streamGeo, mat.stream);
  const sB = new THREE.Mesh(streamGeo, mat.stream);
  sA.position.copy(inA);
  sB.position.copy(inB);
  root.add(sA, sB);
  const splashA = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 24), mat.surf);
  const splashB = splashA.clone();
  splashA.rotation.x = splashB.rotation.x = Math.PI / 2;
  root.add(splashA, splashB);

  // ---------------------------------------------------------- outlet: bottom nozzle, XV-103, drain pump P-101
  const pO = [new V3(0, Y0 - DISH - 0.005, 0), new V3(0, 0.3, 0), new V3(0, 0.3, 0.2), new V3(0, 0.3, 0.42)];
  root.add(shadow(pipe(pO, 0.014, mat.pipe)));
  const vO = valve(new V3(0, 0.3, 0.12), new V3(0, 0, 1), 'XV-103');
  vO.rotation.set(0, -Math.PI / 2, 0);
  root.add(shadow(vO));
  tags.xv103 = new V3(0, 0.46, 0.12);
  const pump = new THREE.Group();
  pump.position.set(0, 0.3, 0.42);
  const vol = cyl(0.06, 0.05, mat.steel, 40);
  vol.rotation.x = Math.PI / 2;
  pump.add(vol);
  const pm = cyl(0.045, 0.12, mat.motor, 32);
  pm.rotation.x = Math.PI / 2;
  pm.position.z = 0.09;
  pump.add(pm);
  const fan = new THREE.Group();
  fan.position.z = 0.155;
  for (let i = 0; i < 6; i++) {
    const b = box(0.07, 0.008, 0.004, mat.tag);
    b.rotation.z = (i * Math.PI) / 6;
    fan.add(b);
  }
  pump.add(fan);
  const outP = pipe([new V3(0.06, 0.3, 0.42), new V3(0.34, 0.3, 0.42), new V3(0.34, 0.06, 0.42)], 0.012, mat.pipe);
  outP.position.set(0, 0, 0);
  root.add(shadow(outP));
  pump.add(at(box(0.16, 0.02, 0.2, mat.frame), 0, -0.07, 0.04));
  root.add(shadow(pump));
  tags.p101 = new V3(0, 0.4, 0.5);

  // ---------------------------------------------------------- instruments
  const inst = new THREE.Group();
  // LT-101 radar level transmitter on the lid
  const lt = new THREE.Group();
  lt.add(at(cyl(0.022, 0.05, mat.steel), 0, 0.025, 0));
  lt.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 16), mat.motor), 0, 0.07, 0));
  lt.add(at(box(0.05, 0.03, 0.02, mat.ink), 0, 0.07, 0.04));
  lt.position.set(-0.08, YTOP + 0.016, -0.1);
  inst.add(lt);
  tags.lt101 = new V3(-0.08, YTOP + 0.14, -0.1);
  // TT-101 thermowell through the wall, head outside
  const tt = new THREE.Group();
  const well = cyl(0.006, 0.14, mat.steel, 12);
  well.rotation.z = Math.PI / 2;
  well.position.x = -0.05;
  tt.add(well);
  tt.add(at(cyl(0.024, 0.03, mat.motor), 0.04, 0, 0));
  tt.children[1].rotation.z = Math.PI / 2;
  tt.position.set(-(R + 0.04), Y0 + 0.08, 0.0);
  inst.add(tt);
  tags.tt101 = new V3(-(R + 0.09), Y0 + 0.12, 0);
  // LSHH-101 high and LSL-101 low switches on the wall
  const sw = (y, name) => {
    const g = new THREE.Group();
    g.add(at(cyl(0.016, 0.05, mat.motor), 0, 0, 0));
    g.children[0].rotation.z = Math.PI / 2;
    g.add(at(box(0.03, 0.03, 0.03, mat.ink), 0.03, 0, 0));
    g.position.set(R + 0.03, y, 0.0);
    inst.add(g);
    return g;
  };
  sw(Y0 + HW * 0.97 - 0.01, 'LSHH');
  sw(Y0 - 0.02, 'LSL');
  tags.lshh = new V3(R + 0.08, Y0 + HW * 0.97, 0);
  tags.lsl = new V3(R + 0.08, Y0 - 0.02, 0);
  root.add(shadow(inst));

  // level marks on the glass: recipe A 35 %, B 70 %, interlock 95 %
  const marks = new THREE.Group();
  for (const [pct, c] of [[35, '#2b44c8'], [70, '#2b44c8'], [95, '#c8323c']]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(ro + 0.0015, 0.0012, 6, 96, Math.PI * 0.55), new THREE.MeshBasicMaterial({color: c}));
    m.rotation.x = Math.PI / 2;
    m.rotation.z = Math.PI * 0.2;
    m.position.y = levelY(pct);
    marks.add(m);
  }
  root.add(marks);

  // ---------------------------------------------------------- pose from the batch
  const cold = new THREE.Color('#7fb0ee');
  const warm = new THREE.Color('#f0a46b');
  const tmp = new THREE.Color();
  let spinA = 0;
  let spinW = 0;
  let fanA = 0;
  let fanW = 0;
  const update = (s, time, dt, view) => {
    const y = levelY(s.level);
    const has = s.level > 0.3;
    dish.visible = has;
    const top = Math.max(Y0, y);
    col.visible = y > Y0 + 0.001;
    col.scale.y = Math.max(0.001, top - Y0);
    col.position.y = Y0 + (top - Y0) / 2;
    surf.visible = has;
    surf.position.y = y;
    const r = y < Y0 ? (R - 0.002) * Math.sqrt(Math.max(0.02, 1 - Math.pow((Y0 - y) / (DISH - 0.002), 2))) : R - 0.002;
    surf.scale.set(r / (R - 0.002), 1, r / (R - 0.002));
    // colour by temperature, 20 to 50 degC
    const k = Math.min(1, Math.max(0, (s.temp - 20) / 28));
    tmp.copy(cold).lerp(warm, k);
    mat.liquid.color.copy(tmp);
    mat.surf.color.copy(tmp).offsetHSL(0, -0.05, 0.08);
    mat.stream.color.copy(cold);
    // agitator speed eases up and down; ripples follow it and the inflow
    spinW += ((s.m101 ? 9 : 0) - spinW) * (1 - Math.exp(-dt / 0.8));
    spinA += spinW * dt;
    spin.rotation.y = spinA;
    const p = surfGeo.attributes.position.array;
    const amp = 0.0025 * (spinW / 9) + (s.xv101 || s.xv102 ? 0.0012 : 0) + 0.0003;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i];
      const z = base[i + 2];
      const rr = Math.hypot(x, z) / R;
      const a = Math.atan2(z, x);
      let h = amp * Math.sin(rr * 14 - time * 5 + a * 2) * rr;
      h += (spinW / 9) * 0.006 * rr * rr; // the vortex lifts the rim a little
      p[i + 1] = h;
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.computeVertexNormals();
    // heater glow
    const hk = Math.min(1, s.heat / 100);
    mat.heater.emissiveIntensity = 0.15 + hk * 1.6;
    heatLight.intensity = hk * 0.9;
    // valves: indicator turns 90 degrees and lights green when open
    for (const [v, on] of [[vA, s.xv101], [vB, s.xv102], [vO, s.xv103]]) {
      v.userData.k += ((on ? 1 : 0) - v.userData.k) * (1 - Math.exp(-dt / 0.25));
      v.userData.ind.rotation.y = v.userData.k * (Math.PI / 2);
      v.userData.disc.material = v.userData.k > 0.5 ? mat.lampOn : mat.lampOff;
    }
    // streams from the inlet nozzles to the surface
    for (const [st, sp, on, src] of [[sA, splashA, s.xv101, inA], [sB, splashB, s.xv102, inB]]) {
      st.visible = on;
      sp.visible = on && has;
      const len = Math.max(0.02, src.y - Math.max(y, Y0 - DISH));
      st.scale.y = len;
      sp.position.set(src.x, Math.max(y, Y0 - DISH) + 0.003, src.z);
      const pulse = 1 + 0.25 * Math.sin(time * 18 + src.x * 40);
      sp.scale.set(pulse, pulse, 1);
    }
    // pump coupling fan
    fanW += ((s.p101 ? 30 : 0) - fanW) * (1 - Math.exp(-dt / 0.4));
    fanA += fanW * dt;
    fan.rotation.z = fanA;
    // glass view: the steel shell fades out so the inside shows
    const g = view.glass;
    mat.shellOut.opacity = 1 - 0.92 * g;
    mat.shellOut.transparent = g > 0.01;
    mat.shellOut.depthWrite = g < 0.5;
    glass.visible = g > 0.05;
    marks.visible = g > 0.3;
  };
  return {root, tags, update};
}
