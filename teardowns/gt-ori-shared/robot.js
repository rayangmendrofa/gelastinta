// The bistable origami robot and its coil rig, built from code, in metres. The robot's central hinge (a valley crease)
// runs along x; it moves along +z, the coil carriage follows it, and the platform slides the other way under it.
// The panels follow the gripper pattern of the paper's Fig. 1A in simplified form: on each side of the central valley,
// an inner and an outer strip of thick PLA panels, cut by two slanted mountain creases (the Miura vertices) into a
// middle panel and two end flaps that fold up over the ends, so the open robot has a hexagonal outline. Panels are
// 0.8 mm slabs with visible edges; the creases are 0.1 mm silicone film; four magnets sit through the outer panels.
// This is my drawing, sized from the paper's scale bars, not the exact crease geometry. Under the platform: three
// tilted coils (wound copper on a bobbin with an iron core) and a small electromagnet on a carriage that slides on two
// perpendicular rail pairs (Fig. 1G). update(state) poses everything from the fold angle.
import * as THREE from 'three';
import {GEO, rollCentre, sectionOf, shapeOf} from './kin.js';

const V3 = THREE.Vector3;
// Talk 11's palette (Sanzo Wada No. 194: Jasper Red, Olympic Blue, Seashell Pink) with the site ink
export const PAL = {ink: '#171C2C', red: '#E34A2B', redDeep: '#B8381E', blue: '#5A82B3', blueDeep: '#3D639A', shell: '#F2D3CB', paper: '#FFFAF8'};
export const ACCENT = new THREE.Color(PAL.red);
const MM = 0.001;
export const SLOPE = 0.25; // the mountain creases lean out by 1 mm for every 4 mm across (my estimate from Fig. 1A)
export const PLATE = {half: 0.3, z0: 0.2}; // m: a 600 mm platform; the robot starts 200 mm from its centre

const box = (w, h, d, c = [0, 0, 0]) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(...c);
  return g;
};
/** a thick panel from a polygon [[x, u], ...] in mm on side s: top face at y = 0, slab hanging t below, bevelled */
const slab = (pts, s, t = GEO.t) => {
  const sh = new THREE.Shape(pts.map(([x, u]) => new THREE.Vector2(x * MM, s * u * MM)));
  const bev = 0.1 * MM;
  const g = new THREE.ExtrudeGeometry(sh, {depth: t * MM - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1});
  g.translate(0, 0, bev);
  g.rotateX(Math.PI / 2);
  return g;
};
const lathe = (prof, seg = 24) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** the copper windings as a texture: fine turns with a slight sheen */
const windTex = () => {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 256; i++) {
    const k = i % 4;
    const v = [0.55, 0.92, 1, 0.8][k];
    x.fillStyle = `rgb(${Math.round(196 * v)},${Math.round(120 * v)},${Math.round(68 * v)})`;
    x.fillRect(0, i, 8, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  return t;
};

export function buildRobot() {
  const M = {
    panel: new THREE.MeshStandardMaterial({color: PAL.blue, roughness: 0.66}),
    panelIn: new THREE.MeshStandardMaterial({color: '#7E9DC6', roughness: 0.66}),
    flap: new THREE.MeshStandardMaterial({color: '#6F90BD', roughness: 0.66}),
    edge: new THREE.MeshStandardMaterial({color: '#E9E3DC', roughness: 0.8}),
    film: new THREE.MeshStandardMaterial({color: '#f6efe4', roughness: 0.3, transparent: true, opacity: 0.72, emissive: ACCENT.clone(), emissiveIntensity: 0}),
    valley: new THREE.LineBasicMaterial({color: PAL.redDeep}),
    mountain: new THREE.LineDashedMaterial({color: PAL.ink, dashSize: 0.45 * MM, gapSize: 0.3 * MM}),
    magN: new THREE.MeshStandardMaterial({color: PAL.red, roughness: 0.38, metalness: 0.35}),
    magS: new THREE.MeshStandardMaterial({color: '#d2d6dc', roughness: 0.3, metalness: 0.85, envMapIntensity: 0.7}),
    glue: new THREE.MeshStandardMaterial({color: '#fbf6ee', roughness: 0.2, transparent: true, opacity: 0.75}),
    ball: new THREE.MeshStandardMaterial({color: '#F3E3C2', roughness: 0.45}),
    wind: new THREE.MeshStandardMaterial({map: windTex(), roughness: 0.38, metalness: 0.65, envMapIntensity: 0.7}),
    copper: new THREE.MeshStandardMaterial({color: '#c27a45', roughness: 0.4, metalness: 0.7, envMapIntensity: 0.6}),
    bobbin: new THREE.MeshStandardMaterial({color: '#22283a', roughness: 0.55}),
    core: new THREE.MeshStandardMaterial({color: '#8f949c', roughness: 0.35, metalness: 0.9, envMapIntensity: 0.6}),
    housing: new THREE.MeshStandardMaterial({color: '#cfd3da', roughness: 0.28, metalness: 0.9, envMapIntensity: 0.7}),
    rail: new THREE.MeshStandardMaterial({color: '#c3c7ce', roughness: 0.32, metalness: 0.85, envMapIntensity: 0.6}),
    alu: new THREE.MeshStandardMaterial({color: '#a9aeb7', roughness: 0.45, metalness: 0.7}),
    carriage: new THREE.MeshStandardMaterial({color: '#2c3247', roughness: 0.55, metalness: 0.2}),
    cable: new THREE.MeshStandardMaterial({color: '#1d2130', roughness: 0.6}),
    acrylic: new THREE.MeshStandardMaterial({color: '#eef3fa', roughness: 0.1, transparent: true, opacity: 0.16, depthWrite: false}),
  };
  const root = new THREE.Group();
  const add = (parent, geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  };
  const line = (parent, pts, mat) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new V3(...p)));
    const l = new THREE.Line(g, mat);
    if (mat.isLineDashedMaterial) l.computeLineDistances();
    parent.add(l);
    return l;
  };

  // ------------------------------------------------------------ the robot
  const body = new THREE.Group();
  root.add(body);
  const t = GEO.t;
  const mid = GEO.mid;
  const A = GEO.A;
  const C = GEO.C;
  const mOf = (u) => mid + SLOPE * u; // where the slanted mountain crease crosses each strip
  const lift = 0.03 * MM; // crease lines drawn just above the top face
  // the central valley: silicone film and a solid crease line, the full length
  const hinge = add(body, box((2 * mid + 2 * GEO.flap) * MM, 0.12 * MM, 0.9 * MM, [0, -0.03 * MM, 0]), M.film);
  line(body, [[-(mid + GEO.flap) * MM, lift, 0], [(mid + GEO.flap) * MM, lift, 0]], M.valley);
  const halves = [];
  const magnets = [];
  // one strip (inner or outer): a middle panel and two flaps hinged on slanted creases; u0..u1 across, f0/f1 flap
  // lengths at its two edges (shorter at the outside, giving the hexagonal tips)
  const strip = (parent, s, uA, w, f0, f1, mat) => {
    const m0 = mOf(uA);
    const m1 = mOf(uA + w);
    const g = 0.18; // a small gap so the film shows between panels
    add(parent, slab([[-m0 + g, g], [m0 - g, g], [m1 - g, w - g], [-m1 + g, w - g]], s, t), [mat, M.edge]);
    const flaps = [];
    for (const sx of [1, -1]) {
      const P0 = new V3(sx * m0 * MM, 0, 0);
      const P1 = new V3(sx * m1 * MM, 0, s * w * MM);
      const pivot = new THREE.Group();
      pivot.position.copy(P0);
      parent.add(pivot);
      // the flap outline relative to P0, in (x, u)
      const pts = [[sx * g, g], [sx * (m1 - m0 + g), w - g], [sx * (m1 - m0 + f1), w - g], [sx * (f0), g]];
      add(pivot, slab(pts, s, t), [M.flap, M.edge]);
      // the mountain crease: film strip and a dashed line along P0 → P1
      const d = P1.clone().sub(P0);
      const len = d.length();
      const film = add(pivot, box(len, 0.1 * MM, 0.5 * MM, [0, -0.02 * MM, 0]), M.film, false);
      film.position.copy(d.clone().multiplyScalar(0.5));
      film.rotation.y = -Math.atan2(d.z, d.x);
      line(parent, [[P0.x, lift, P0.z], [P1.x, lift, P1.z]], M.mountain);
      const axis = d.clone().normalize();
      if (axis.z < 0) axis.negate();
      flaps.push({g: pivot, sx, axis});
    }
    return flaps;
  };
  for (const s of [1, -1]) {
    const half = new THREE.Group();
    body.add(half);
    const flapsIn = strip(half, s, 0, A, GEO.flap, GEO.flap - 1.0, M.panelIn);
    const outer = new THREE.Group();
    outer.position.set(0, 0, s * A * MM);
    half.add(outer);
    // the long crease between the strips: film and a dashed mountain line
    add(outer, box(2 * mOf(A) * MM, 0.1 * MM, 0.6 * MM, [0, -0.02 * MM, 0]), M.film, false);
    line(outer, [[-mOf(A) * MM, lift, 0], [mOf(A) * MM, lift, 0]], M.mountain);
    // the outer strip: its own crease lean continues from the inner one
    const flapsOut = (() => {
      const m0 = mOf(A);
      const m1 = mOf(A + C);
      const g = 0.18;
      add(outer, slab([[-m0 + g, g], [m0 - g, g], [m1 - g, C - g], [-m1 + g, C - g]], s, t), [M.panel, M.edge]);
      const out = [];
      for (const sx of [1, -1]) {
        const P0 = new V3(sx * m0 * MM, 0, 0);
        const P1 = new V3(sx * m1 * MM, 0, s * C * MM);
        const pivot = new THREE.Group();
        pivot.position.copy(P0);
        outer.add(pivot);
        const f0 = GEO.flap - 1.0;
        const f1 = 1.4;
        add(pivot, slab([[sx * g, g], [sx * (m1 - m0 + g), C - g], [sx * (m1 - m0 + f1), C - g], [sx * f0, g]], s, t), [M.flap, M.edge]);
        const d = P1.clone().sub(P0);
        const film = add(pivot, box(d.length(), 0.1 * MM, 0.5 * MM, [0, -0.02 * MM, 0]), M.film, false);
        film.position.copy(d.clone().multiplyScalar(0.5));
        film.rotation.y = -Math.atan2(d.z, d.x);
        line(outer, [[P0.x, lift, P0.z], [P1.x, lift, P1.z]], M.mountain);
        const axis = d.clone().normalize();
        if (axis.z < 0) axis.negate();
        out.push({g: pivot, sx, axis});
      }
      return out;
    })();
    // two magnets through each outer panel (ø1.5 × 3 mm, N35): chamfered, N half red, S half steel, a glue fillet
    for (const sx of [1, -1]) {
      const mg = new THREE.Group();
      mg.position.set(sx * 2.9 * MM, -t * MM / 2, s * C * 0.55 * MM);
      outer.add(mg);
      const r = 0.75 * MM;
      const ch = 0.12 * MM;
      add(mg, lathe([[0, 1.5 * MM], [r - ch, 1.5 * MM], [r, 1.5 * MM - ch], [r, 0]], 24), M.magN);
      add(mg, lathe([[0, -1.5 * MM], [r - ch, -1.5 * MM], [r, -1.5 * MM + ch], [r, 0]].reverse(), 24), M.magS);
      add(mg, new THREE.TorusGeometry(r * 1.08, 0.12 * MM, 8, 24).rotateX(Math.PI / 2).translate(0, t * MM / 2 + 0.02 * MM, 0), M.glue, false);
      magnets.push(mg);
    }
    halves.push({half, outer, flapsIn, flapsOut, s});
  }
  const ball = add(body, new THREE.SphereGeometry((GEO.ball / 2) * MM, 32, 20), M.ball);

  // ------------------------------------------------------------ the platform: a clear plate on posts (slides under the robot)
  const base = new THREE.Group();
  root.add(base);
  const P = PLATE.half;
  add(base, box(2 * P, 0.004, 2 * P, [0, -0.0021, 0]), M.acrylic, false).renderOrder = 0;
  base.add(new THREE.LineSegments(new THREE.EdgesGeometry(box(2 * P, 0.004, 2 * P, [0, -0.0021, 0])), new THREE.LineBasicMaterial({color: '#9aa6bd', transparent: true, opacity: 0.7})));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(base, box(0.02, 0.13, 0.02, [x * (P - 0.02), -0.069, z * (P - 0.02)]), M.alu, false);
  for (const z of [-1, 1]) add(base, box(2 * P, 0.02, 0.02, [0, -0.14, z * (P - 0.02)]), M.alu, false);
  for (const x of [-1, 1]) add(base, box(0.02, 0.02, 2 * P, [x * (P - 0.02), -0.14, 0]), M.alu, false);
  // the Y rails along the travel, on the frame
  for (const dx of [-0.19, 0.19]) {
    add(base, new THREE.CylinderGeometry(0.005, 0.005, 2 * P - 0.04, 20).rotateX(Math.PI / 2).translate(dx, -0.122, 0), M.rail, false);
    for (const z of [-1, 1]) add(base, box(0.022, 0.014, 0.012, [dx, -0.124, z * (P - 0.03)]), M.alu, false);
  }

  // ------------------------------------------------------------ the carriage, coils and electromagnet (follow the robot)
  const rig = new THREE.Group();
  root.add(rig);
  const coil = (r, h, inner) => {
    const g = new THREE.Group();
    add(g, new THREE.CylinderGeometry(r, r, h, 48, 1, true).translate(0, h / 2, 0), M.wind, false);
    const ann = new THREE.RingGeometry(inner * 1.05, r, 40).rotateX(-Math.PI / 2);
    add(g, ann.clone().translate(0, h, 0), M.copper, false);
    add(g, new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.0018, 48).translate(0, -0.0009, 0), M.bobbin, false);
    add(g, new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.0018, 48).translate(0, h + 0.0009, 0), M.bobbin, false);
    add(g, new THREE.CylinderGeometry(inner, inner, h + 0.008, 28).translate(0, h / 2, 0), M.core, false);
    return g;
  };
  const coils = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const c = coil(0.019, 0.022, 0.0075);
    const R = 0.062;
    c.position.set(Math.cos(a) * R, -0.062, Math.sin(a) * R);
    c.lookAt(0, 0.02, 0);
    c.rotateX(Math.PI / 2);
    rig.add(c);
    coils.push(c);
    // a cable from each coil down to the carriage
    const p0 = new V3(Math.cos(a) * (R + 0.012), -0.07, Math.sin(a) * (R + 0.012));
    const curve = new THREE.CatmullRomCurve3([p0, p0.clone().add(new V3(Math.cos(a) * 0.02, -0.01, Math.sin(a) * 0.02)), new V3(Math.cos(a) * 0.1, -0.098, Math.sin(a) * 0.1)]);
    add(rig, new THREE.TubeGeometry(curve, 16, 0.0016, 8), M.cable, false);
  }
  // electromagnet 4: a steel can with the core at its centre, right under the robot
  const em = new THREE.Group();
  em.position.set(0, -0.034, 0);
  rig.add(em);
  add(em, new THREE.CylinderGeometry(0.011, 0.011, 0.024, 40).translate(0, 0.012, 0), M.housing, false);
  add(em, new THREE.CylinderGeometry(0.0095, 0.0095, 0.0006, 40).translate(0, 0.0243, 0), M.bobbin, false);
  add(em, new THREE.CylinderGeometry(0.004, 0.004, 0.001, 24).translate(0, 0.0247, 0), M.core, false);
  add(em, new THREE.CylinderGeometry(0.0035, 0.0035, 0.012, 16).translate(0, -0.006, 0), M.alu, false);
  // carriage plate, its X rails and slider blocks
  add(rig, box(0.18, 0.006, 0.18, [0, -0.1, 0]), M.carriage, false);
  for (const dz of [-0.06, 0.06]) {
    add(rig, new THREE.CylinderGeometry(0.004, 0.004, 0.42, 20).rotateZ(Math.PI / 2).translate(0, -0.108, dz), M.rail, false);
    for (const dx of [-0.05, 0.05]) add(rig, box(0.022, 0.012, 0.016, [dx, -0.106, dz]), M.alu, false);
  }
  for (const dx of [-0.19, 0.19]) add(rig, box(0.026, 0.016, 0.034, [dx, -0.115, 0]), M.carriage, false);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    add(rig, new THREE.CylinderGeometry(0.003, 0.003, 0.04, 10).translate(Math.cos(a) * 0.062, -0.082, Math.sin(a) * 0.062), M.alu, false);
  }

  // ------------------------------------------------------------ pose
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  /**
   * st: {th fold angle (rad), roll (rad), snap 0..1 accent, cargo 0..1, glow, dist (mm)}
   */
  const update = (st) => {
    const {beta, psi, chi, k} = shapeOf(st.th);
    for (const h of halves) {
      h.half.rotation.set(-h.s * beta, 0, 0);
      h.outer.rotation.set(-h.s * psi, 0, 0);
      for (const f of [...h.flapsIn, ...h.flapsOut]) f.g.quaternion.copy(q.setFromAxisAngle(f.axis, f.sx * chi));
    }
    const [, cy] = rollCentre(st.th);
    const pts = sectionOf(st.th);
    const c = Math.cos(st.roll);
    const sn = Math.sin(st.roll);
    let minY = Infinity;
    for (const [z, y] of pts) minY = Math.min(minY, cy + (y - cy) * c + z * sn);
    const lft = (-minY + GEO.t * 0.98) * MM;
    body.matrixAutoUpdate = false;
    body.matrix.identity();
    body.matrix.multiply(tmp.makeTranslation(0, lft + cy * MM, 0));
    body.matrix.multiply(tmp.makeRotationX(st.roll));
    body.matrix.multiply(tmp.makeTranslation(0, -cy * MM, 0));
    body.matrixWorldNeedsUpdate = true;
    ball.visible = st.cargo > 0.01;
    ball.position.set(0, (GEO.ball / 2 + 0.6 * Math.min(1, k)) * MM, 0);
    ball.scale.setScalar(Math.max(0.01, st.cargo));
    M.film.emissiveIntensity = 0.9 * st.snap;
    M.film.color.set('#f6efe4').lerp(ACCENT, 0.7 * st.snap);
    M.wind.emissive.copy(ACCENT);
    M.wind.emissiveIntensity = 0.3 * st.glow;
    M.housing.emissive.copy(ACCENT);
    M.housing.emissiveIntensity = 0.25 * st.glow * (Math.abs(st.field ?? 0) > 40 ? 1 : 0);
    // the platform slides under the robot as it travels
    base.position.z = PLATE.z0 - (st.dist ?? 0) * MM;
  };
  return {root, body, rig, base, coils, em, magnets, halves, ball, hinge, update, M};
}
export {V3};
