// The bistable origami robot and its coil rig, built from code, in metres. The robot's central hinge runs along x; it
// moves along +z (the floor slides the other way, so the robot and the coil carriage stay at the origin). Each half is
// an inner panel and an outer panel of printed PLA joined by silicone film, with end flaps that fold up over the ends;
// four magnets sit in the outer panels. This is my simplified drawing (sized from the paper's scale bars), not the
// exact crease pattern. Under the platform: three tilted coils and a small electromagnet on a carriage that slides on
// two perpendicular rails, as in the paper's Fig. 1G. update(state) poses everything from the fold angle.
import * as THREE from 'three';
import {D2R, GEO, rollCentre, sectionOf, shapeOf} from './kin.js';

const V3 = THREE.Vector3;
// Talk 11's palette (Sanzo Wada No. 194: Jasper Red, Olympic Blue, Seashell Pink) with the site ink
export const PAL = {ink: '#171C2C', red: '#E34A2B', redDeep: '#B8381E', blue: '#5A82B3', blueDeep: '#3D639A', shell: '#F2D3CB', paper: '#FFFAF8'};
export const ACCENT = new THREE.Color(PAL.red);
const MM = 0.001;

const box = (w, h, d, c = [0, 0, 0]) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(...c);
  return g;
};
/** a tapered flap in the panel plane: x from 0 to len (sign sx), across u from 0 to w (sign su), thickness down */
const flapGeo = (len, w, sx, su) => {
  const s = new THREE.Shape();
  const taper = 0.22 * w;
  s.moveTo(0, 0);
  s.lineTo(len, taper);
  s.lineTo(len, w - taper * 0.6);
  s.lineTo(0, w);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, {depth: GEO.t * MM, bevelEnabled: false});
  // shape x → x, shape y → u (local z), extrude → −y
  g.scale(MM * sx, MM * su, 1);
  g.rotateX(Math.PI / 2);
  // after rotateX(+90°): shape y → z, extrude depth (+z) → −y... flip so the slab hangs below the surface
  return g;
};

export function buildRobot() {
  const M = {
    panel: new THREE.MeshStandardMaterial({color: PAL.blue, roughness: 0.62, metalness: 0}),
    panelIn: new THREE.MeshStandardMaterial({color: '#7C9CC4', roughness: 0.62}),
    flap: new THREE.MeshStandardMaterial({color: '#6E91BE', roughness: 0.62}),
    film: new THREE.MeshStandardMaterial({color: '#f4efe6', roughness: 0.35, transparent: true, opacity: 0.78, emissive: ACCENT.clone(), emissiveIntensity: 0}),
    magN: new THREE.MeshStandardMaterial({color: PAL.red, roughness: 0.4, metalness: 0.3}),
    magS: new THREE.MeshStandardMaterial({color: '#cfd3d8', roughness: 0.35, metalness: 0.8, envMapIntensity: 0.6}),
    ball: new THREE.MeshStandardMaterial({color: '#F3E3C2', roughness: 0.45}),
    copper: new THREE.MeshStandardMaterial({color: '#b8733f', roughness: 0.42, metalness: 0.7, envMapIntensity: 0.6}),
    core: new THREE.MeshStandardMaterial({color: '#41454e', roughness: 0.5, metalness: 0.5}),
    rail: new THREE.MeshStandardMaterial({color: '#b9bcc3', roughness: 0.4, metalness: 0.75, envMapIntensity: 0.5}),
    carriage: new THREE.MeshStandardMaterial({color: '#2c3247', roughness: 0.55, metalness: 0.2}),
  };
  const root = new THREE.Group();
  const add = (parent, geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ the robot
  const body = new THREE.Group(); // lifted and rolled each frame
  root.add(body);
  const t = GEO.t * MM;
  const mid = GEO.mid * MM;
  const flapL = GEO.flap * MM;
  // the central hinge film, the full length of the robot
  const hinge = add(body, box((2 * GEO.mid + 1.2 * GEO.flap) * MM, 0.12 * MM, 0.9 * MM, [0, -0.03 * MM, 0]), M.film);
  const halves = [];
  const magnets = [];
  for (const s of [1, -1]) {
    const half = new THREE.Group();
    body.add(half);
    // inner panel: x ∈ [−mid, mid], local z from 0 to s·A, hanging t below the surface
    const A = GEO.A * MM;
    const C = GEO.C * MM;
    add(half, box(2 * mid, t, A - 0.3 * MM, [0, -t / 2, s * (A / 2 + 0.15 * MM)]), M.panelIn);
    const flapsIn = [];
    for (const sx of [1, -1]) {
      const fp = new THREE.Group();
      fp.position.set(sx * mid, 0, 0);
      half.add(fp);
      const g = flapGeo(GEO.flap - 0.3, GEO.A - 0.3, sx, s);
      g.translate(sx * 0.3 * MM, 0, s * 0.15 * MM);
      add(fp, g, M.flap);
      add(fp, box(0.5 * MM, 0.1 * MM, A - 0.4 * MM, [sx * 0.15 * MM, -0.02 * MM, s * A / 2]), M.film);
      flapsIn.push({g: fp, sx});
    }
    // the crease to the outer panel
    const outer = new THREE.Group();
    outer.position.set(0, 0, s * A);
    half.add(outer);
    add(outer, box(2 * mid, 0.1 * MM, 0.6 * MM, [0, -0.02 * MM, 0]), M.film);
    add(outer, box(2 * mid, t, C - 0.3 * MM, [0, -t / 2, s * (C / 2 + 0.15 * MM)]), M.panel);
    const flapsOut = [];
    for (const sx of [1, -1]) {
      const fp = new THREE.Group();
      fp.position.set(sx * mid, 0, 0);
      outer.add(fp);
      const g = flapGeo(GEO.flap - 0.3, GEO.C - 0.3, sx, s);
      g.translate(sx * 0.3 * MM, 0, s * 0.15 * MM);
      add(fp, g, M.panel);
      add(fp, box(0.5 * MM, 0.1 * MM, C - 0.4 * MM, [sx * 0.15 * MM, -0.02 * MM, s * C / 2]), M.film);
      flapsOut.push({g: fp, sx});
    }
    // two magnets through each outer panel: N half red, S half steel
    for (const sx of [1, -1]) {
      const mg = new THREE.Group();
      mg.position.set(sx * 2.9 * MM, -t / 2, s * C * 0.55);
      outer.add(mg);
      const r = (0.75 * MM);
      add(mg, new THREE.CylinderGeometry(r, r, 1.5 * MM, 20).translate(0, 0.75 * MM, 0), M.magN);
      add(mg, new THREE.CylinderGeometry(r, r, 1.5 * MM, 20).translate(0, -0.75 * MM, 0), M.magS);
      magnets.push(mg);
    }
    halves.push({half, outer, flapsIn, flapsOut, s});
  }
  // the cargo: a 4 mm sphere
  const ball = add(body, new THREE.SphereGeometry((GEO.ball / 2) * MM, 32, 20), M.ball);

  // ------------------------------------------------------------ the coil rig under the platform (not to fine detail)
  const rig = new THREE.Group();
  root.add(rig);
  const coil = (r, h, inner) => {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, {depth: h, bevelEnabled: true, bevelSize: r * 0.04, bevelThickness: r * 0.04, bevelSegments: 2, curveSegments: 40});
    geo.rotateX(-Math.PI / 2);
    add(g, geo, M.copper, false);
    add(g, new THREE.CylinderGeometry(inner * 0.92, inner * 0.92, h * 1.12, 28).translate(0, h / 2, 0), M.core, false);
    return g;
  };
  const coils = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const c = coil(0.019, 0.022, 0.008);
    const R = 0.062;
    c.position.set(Math.cos(a) * R, -0.058, Math.sin(a) * R);
    c.lookAt(0, 0.02, 0);
    c.rotateX(Math.PI / 2);
    rig.add(c);
    coils.push(c);
  }
  const em = coil(0.011, 0.024, 0.0045);
  em.position.set(0, -0.034, 0);
  // the platform the robot works on: a clear plate, seen as an edge when the camera pulls back
  const plate = new THREE.Mesh(box(0.34, 0.004, 0.34, [0, -0.0021, 0]), new THREE.MeshStandardMaterial({color: '#e9eef6', roughness: 0.2, transparent: true, opacity: 0.18, depthWrite: false}));
  plate.renderOrder = 0;
  rig.add(plate);
  rig.add(new THREE.LineSegments(new THREE.EdgesGeometry(box(0.34, 0.004, 0.34, [0, -0.0021, 0])), new THREE.LineBasicMaterial({color: '#9aa6bd', transparent: true, opacity: 0.6})));
  rig.add(em);
  // carriage plate, the X rail that carries it, the long Y rail along the travel
  add(rig, box(0.16, 0.006, 0.16, [0, -0.072, 0]), M.carriage, false);
  for (const dz of [-0.06, 0.06]) add(rig, new THREE.CylinderGeometry(0.004, 0.004, 0.42, 16).rotateZ(Math.PI / 2).translate(0, -0.082, dz), M.rail, false);
  for (const dx of [-0.19, 0.19]) add(rig, new THREE.CylinderGeometry(0.005, 0.005, 2.4, 16).rotateX(Math.PI / 2).translate(dx, -0.092, 0), M.rail, false);
  for (const dx of [-0.19, 0.19]) add(rig, box(0.02, 0.012, 0.03, [dx, -0.085, 0]), M.carriage, false);

  // ------------------------------------------------------------ pose
  const tmp = new THREE.Matrix4();
  /**
   * st: {th fold angle (rad), roll (rad), snap 0..1 accent, cargo 0..1, glow}
   */
  const update = (st) => {
    const {beta, psi, chi, k} = shapeOf(st.th);
    for (const h of halves) {
      h.half.rotation.set(-h.s * beta, 0, 0);
      h.outer.rotation.set(-h.s * psi, 0, 0);
      for (const f of [...h.flapsIn, ...h.flapsOut]) f.g.rotation.set(0, 0, f.sx * chi);
    }
    // roll about the section's centre, then lift so the lowest corner touches the floor
    const [, cy] = rollCentre(st.th);
    const pts = sectionOf(st.th);
    const c = Math.cos(st.roll);
    const sn = Math.sin(st.roll);
    let minY = Infinity;
    for (const [z, y] of pts) {
      const yy = cy + (y - cy) * c + z * sn;
      minY = Math.min(minY, yy);
    }
    const lift = (-minY + GEO.t * 0.98) * MM;
    body.matrixAutoUpdate = false;
    body.matrix.identity();
    body.matrix.multiply(tmp.makeTranslation(0, lift + cy * MM, 0));
    body.matrix.multiply(tmp.makeRotationX(st.roll));
    body.matrix.multiply(tmp.makeTranslation(0, -cy * MM, 0));
    body.matrixWorldNeedsUpdate = true;
    // the ball rides on the tray, squeezed up a little as the panels close round it
    ball.visible = st.cargo > 0.01;
    ball.position.set(0, (GEO.ball / 2 + 0.6 * Math.min(1, k)) * MM, 0);
    ball.scale.setScalar(Math.max(0.01, st.cargo));
    M.film.emissiveIntensity = 0.9 * st.snap;
    M.film.color.set('#f4efe6').lerp(ACCENT, 0.7 * st.snap);
    M.copper.emissive = M.copper.emissive || new THREE.Color();
    M.copper.emissive.copy(ACCENT);
    M.copper.emissiveIntensity = 0.35 * st.glow;
  };
  return {root, body, rig, coils, em, magnets, halves, ball, hinge, update, M};
}
export {V3, D2R};
