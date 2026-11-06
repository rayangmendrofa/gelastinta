// The Hail Mary built from code, in metres: an original drawing of the ship the book describes, not a copy of the
// film's design. Two halves on two Zylon cables:
//   the crew compartment (control room in the nose, lab, dormitory) sits in a fork that carries its two hinges and
//   the cable ends, so it can turn over 180 degrees without touching anything;
//   the rear half: a storage drum with the two cable spools on its front face, six Astrophage fuel tanks around a
//   frame, and the spin drives at the back.
// Local frames: both halves point along +x from their hub face (the crew forward, the rear backward, so the rear's
// geometry lies on -x). update(state) places the halves on the spin circle, pays out the cables, turns the crew
// compartment on its hinges and sizes the gravity arrow beside the person standing in the lab.
import * as THREE from 'three';
import {clamp, D2R} from './kin.js';

const V3 = THREE.Vector3;
const GLASS = new THREE.Color('#9FB6D8');
// Talk 04's palette (Sanzo Wada No. 179 with the site blue): paper, ink, blue, red, taupe
export const PAL = {paper: '#FEF8F3', ink: '#29120F', blue: '#2B44C8', red: '#D9452B', taupe: '#8F7F74', hull: '#F2E9DF', hull2: '#E3D6C8', dark: '#4A3A33'};

const cylX = (r, len, x0, seg = 40, r2 = r) => {
  // a cylinder along +x from x0 to x0 + len, radius r at x0 and r2 at the far end
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
  g.rotateZ(-Math.PI / 2);
  g.translate(x0 + len / 2, 0, 0);
  return g;
};
const box = (w, h, d, c) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(...c);
  return g;
};
const ringX = (r, tube, x) => {
  const g = new THREE.TorusGeometry(r, tube, 8, 56);
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
};

export function buildShip() {
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({color: c, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.6, ...o});
  const M = {
    hull: mat(PAL.hull),
    hull2: mat(PAL.hull2),
    dark: mat(PAL.dark, {roughness: 0.5}),
    ink: mat(PAL.ink, {roughness: 0.5}),
    blue: mat(PAL.blue, {roughness: 0.45}),
    red: mat(PAL.red, {roughness: 0.5}),
    tank: mat('#E8DCCD', {roughness: 0.4, metalness: 0.15}),
    glass: mat('#9DB2C9', {roughness: 0.2, metalness: 0.1}),
    floor: mat('#B9A08A'),
    skin: mat('#E7D2BE'),
    cable: new THREE.MeshStandardMaterial({color: PAL.blue, roughness: 0.5}),
  };
  // the crew compartment's skin fades to glass so the decks and the person show
  const crewSkin = [M.hull, M.hull2];
  const edges = [];
  const outline = (mesh, o = 0.5) => {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), new THREE.LineBasicMaterial({color: PAL.ink, transparent: true, opacity: o}));
    mesh.add(e);
    edges.push(e);
    return mesh;
  };
  const mesh = (g, m, parent, ol = 0.45) => {
    const x = new THREE.Mesh(g, m);
    parent.add(x);
    if (ol) outline(x, ol);
    return x;
  };

  const root = new THREE.Group();
  // ------------------------------------------------------------ crew compartment: the fork, then the body
  const crew = new THREE.Group();
  root.add(crew);
  const HUB = 0.6; // the fork's back plate
  const PIV = 7.8; // the hinge axis, at the compartment's middle
  const R = 3.5; // hull radius
  mesh(cylX(3.0, HUB, 0, 40), M.hull2, crew);
  const forkArms = [];
  for (const z of [-4.2, 4.2]) {
    forkArms.push(mesh(box(PIV - 0.3, 0.7, 0.5, [HUB + (PIV - 0.3) / 2 - 0.15, 0, z]), M.hull2, crew));
    mesh(box(0.5, 0.7, Math.abs(z) - 2.6, [HUB * 0.5, 0, (z + Math.sign(z) * 2.6) / 2]), M.hull2, crew);
  }
  const hinges = [];
  for (const z of [-4.0, 4.0]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.9, 32), M.dark);
    h.rotation.x = Math.PI / 2;
    h.position.set(PIV, 0, z);
    crew.add(h);
    outline(h, 0.5);
    hinges.push(h);
  }
  // cable eyes on the plate
  const eyeCrew = [-2.0, 2.0].map((z) => {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 20), M.dark);
    e.rotation.y = Math.PI / 2;
    e.position.set(-0.1, 0, z);
    crew.add(e);
    return e;
  });

  const body = new THREE.Group(); // turns about z through the hinge axis
  body.position.set(PIV, 0, 0);
  crew.add(body);
  const B0 = -7; // the body's aft end, relative to the hinge
  const skin = [];
  const sk = (g, i = 0) => {
    const m = mesh(g, crewSkin[i].clone(), body, 0.5);
    m.userData.c0 = m.material.color.clone();
    m.material.transparent = true;
    skin.push(m);
    return m;
  };
  sk(cylX(R, 4.0, B0, 48), 0); // dormitory
  sk(cylX(R, 4.4, B0 + 4.0, 48), 1); // lab
  sk(cylX(R, 2.8, B0 + 8.4, 48, 2.8), 0); // control room
  sk(cylX(2.8, 1.8, B0 + 11.2, 40, 1.1), 1); // nose
  for (const x of [B0, B0 + 4.0, B0 + 8.4]) mesh(ringX(R + 0.04, 0.09, x), M.dark, body, 0);
  // the control room's window band
  const win = mesh(cylX(3.0, 0.6, B0 + 10.2, 40, 2.86), M.glass, body, 0.35);
  win.scale.set(1, 1.02, 1.02);
  // the airlock on the lab's side
  const lock = mesh(cylX(0.9, 1.6, -0.8, 24), M.hull2, body, 0.45);
  lock.rotation.y = Math.PI / 2;
  lock.position.set(B0 + 6.2, 0, -R + 0.2);
  lock.userData.c0 = lock.material.color.clone();
  lock.material.transparent = true;
  skin.push(lock);
  // the decks inside: a floor at the aft end of each room (under thrust "down" is aft)
  const floors = [B0 + 0.25, B0 + 4.2, B0 + 8.6].map((x) => mesh(cylX(R - 0.18, 0.12, x, 40), M.floor, body, 0.6));
  // a person standing in the lab: feet on the lab floor, head towards the nose
  const person = new THREE.Group();
  person.position.set(B0 + 4.32, -0.6, 0.6);
  body.add(person);
  const cap = (r, len, x, z = 0) => {
    const g = new THREE.CapsuleGeometry(r, len, 4, 12);
    g.rotateZ(-Math.PI / 2);
    g.translate(x, 0, z);
    return g;
  };
  mesh(cap(0.11, 0.7, 0.46, -0.13), M.skin, person, 0.5);
  mesh(cap(0.11, 0.7, 0.46, 0.13), M.skin, person, 0.5);
  mesh(cap(0.2, 0.5, 1.13), M.ink, person, 0.5);
  mesh(cap(0.08, 0.5, 1.12, -0.32), M.skin, person, 0.5);
  mesh(cap(0.08, 0.5, 1.12, 0.32), M.skin, person, 0.5);
  mesh(new THREE.SphereGeometry(0.14, 16, 12).translate(1.66, 0, 0), M.skin, person, 0.5);
  // the gravity arrow beside the person: points at the floor, 1.4 m long per g
  const arrow = new THREE.Group();
  arrow.position.set(B0 + 4.32 + 1.8, -0.6, -0.9);
  body.add(arrow);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 12).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), M.red);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 16).rotateZ(Math.PI / 2), M.red);
  arrow.add(shaft, head);

  // ------------------------------------------------------------ rear half (its geometry on -x from its hub face)
  const rear = new THREE.Group();
  root.add(rear);
  const RR = 3.6;
  mesh(cylX(3.2, 0.8, -0.8, 40), M.hull2, rear); // hub face
  mesh(cylX(RR, 5.4, -6.2, 48), M.hull, rear); // storage drum
  for (const x of [-0.8, -3.5, -6.2]) mesh(ringX(RR + 0.04, 0.09, x), M.dark, rear, 0);
  // the two cable spools on the hub face (drums turning about y)
  const spools = [-2.0, 2.0].map((z) => {
    const g = new THREE.Group();
    g.position.set(0.55, 0, z);
    rear.add(g);
    const drum = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 28), M.blue, g, 0.5);
    for (const y of [-0.62, 0.62]) mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 28).translate(0, y, 0), M.dark, g, 0.4);
    // a stripe so you can see it turn
    mesh(box(0.08, 1.12, 0.3, [0.74, 0, 0]), M.paper ?? M.hull, drum, 0);
    void drum;
    return g;
  });
  for (const z of [-2.0, 2.0]) mesh(box(1.1, 1.6, 0.25, [0.5, 0, z + Math.sign(z) * 0.62]), M.hull2, rear, 0.4);
  // the fuel section: a frame and six Astrophage tanks
  const FX0 = -6.2;
  const FL = 17;
  mesh(box(FL, 1.0, 1.0, [FX0 - FL / 2, 0, 0]), M.dark, rear, 0.4);
  const tanks = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const t = mesh(cylX(1.55, FL - 0.6, FX0 - FL + 0.3, 32), M.tank, rear, 0.4);
    t.position.set(0, Math.cos(a) * 3.1, Math.sin(a) * 3.1);
    tanks.push(t);
  }
  for (const x of [FX0 - 0.3, FX0 - FL / 2, FX0 - FL + 0.3]) mesh(ringX(4.75, 0.16, x), M.dark, rear, 0);
  // the spin drives: an engine block and three drive bells
  const EX = FX0 - FL;
  mesh(cylX(3.4, 2.6, EX - 2.6, 40, 3.8), M.hull2, rear);
  const bells = [];
  const plumes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const y = Math.cos(a) * 2.0;
    const z = Math.sin(a) * 2.0;
    const b = mesh(cylX(1.35, 2.2, EX - 4.8, 32, 0.7), M.dark, rear, 0.5);
    b.position.set(0, y, z);
    bells.push(b);
    // the drive's light (Astrophage spin drives shine in the infrared; drawn red so you can see it)
    const pm = new THREE.MeshBasicMaterial({color: PAL.red, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide});
    const pl = new THREE.Mesh(cylX(0.15, 9, EX - 13.8, 24, 1.25), pm);
    pl.geometry.translate(0, 0, 0);
    pl.position.set(0, y, z);
    pl.renderOrder = 2;
    rear.add(pl);
    plumes.push(pl);
  }
  const eyeRear = spools.map((g) => g.position.clone().add(new V3(0.0, 0, 0)));

  // ------------------------------------------------------------ the two cables (drawn 6x thicker than a real tether)
  const cables = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 10, 1), M.cable);
    root.add(m);
    return m;
  });
  // the spin circles and the centre of mass (in the spin plane, y = 0)
  const ring = (r, c, dash) => {
    const pts = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(new V3(Math.cos(a), 0, Math.sin(a)));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({color: c, dashSize: dash, gapSize: dash * 0.8, transparent: true, opacity: 0, scale: 1}));
    l.computeLineDistances();
    root.add(l);
    return l;
  };
  const pathCrew = ring(1, PAL.blue, 0.012);
  const pathRear = ring(1, PAL.taupe, 0.03);
  const com = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshBasicMaterial({color: PAL.blue, transparent: true, opacity: 0}));
  root.add(com);

  const up = new V3(0, 1, 0);
  const tmpA = new V3();
  const tmpB = new V3();
  const q = new THREE.Quaternion();
  /**
   * st: {d, theta (radians, the spin angle), flip (degrees), rCrew, rRear, thrust 0..1, gDown (g felt by the person),
   *      downDir (+1 aft under thrust, +1 to the floor after the flip, 0 weightless), glass 0..1, paths 0..1, spool (turns)}
   */
  const update = (st) => {
    const c = Math.cos(st.theta);
    const s = Math.sin(st.theta);
    // the cable direction u from the rear half to the crew compartment: (c, 0, s)
    crew.position.set(c * st.rCrew, 0, s * st.rCrew);
    crew.rotation.set(0, -st.theta, 0);
    rear.position.set(-c * st.rRear, 0, -s * st.rRear);
    rear.rotation.set(0, -st.theta, 0);
    body.rotation.set(0, 0, st.flip * D2R);
    for (const g of spools) g.rotation.y = st.spool * Math.PI * 2;
    // cables: from each spool to the matching eye on the crew plate
    root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      tmpA.copy(eyeRear[i]).applyMatrix4(rear.matrixWorld);
      tmpB.copy(eyeCrew[i].position).applyMatrix4(crew.matrixWorld);
      const len = tmpA.distanceTo(tmpB);
      const m = cables[i];
      m.visible = len > 0.05;
      m.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      m.scale.set(1, Math.max(0.01, len), 1);
      q.setFromUnitVectors(up, tmpB.clone().sub(tmpA).normalize());
      m.quaternion.copy(q);
    }
    // glass: the crew compartment's skin fades
    const op = 1 - 0.8 * st.glass;
    for (const m of skin) {
      m.material.opacity = op;
      m.material.depthWrite = st.glass < 0.5;
      m.material.color.copy(m.userData.c0).lerp(GLASS, st.glass);
      m.children.forEach((e) => (e.material.opacity = 0.5 + 0.3 * st.glass));
    }
    // the person and the arrow show through the glass only
    person.visible = st.glass > 0.05;
    for (const f of floors) f.visible = st.glass > 0.05;
    const gl = clamp(st.gDown, 0, 3);
    arrow.visible = st.glass > 0.05 && gl > 0.03;
    const L = Math.max(0.05, gl * 1.4);
    shaft.scale.set(L, 1, 1);
    head.position.set(-L - 0.18, 0, 0);
    // the drives' light
    for (const p of plumes) p.material.opacity = 0.42 * st.thrust;
    for (const b of bells) b.material.emissive?.set(PAL.red).multiplyScalar(0.35 * st.thrust);
    // the spin circles
    pathCrew.scale.setScalar(Math.max(0.01, st.rCrew));
    pathRear.scale.setScalar(Math.max(0.01, st.rRear));
    pathCrew.material.opacity = 0.85 * st.paths;
    pathRear.material.opacity = 0.85 * st.paths;
    com.material.opacity = st.paths * clamp((st.d - 20) / 20, 0, 1);
  };
  /** world points the camera and the labels use */
  const points = () => {
    root.updateMatrixWorld(true);
    const w = (o, v) => v.clone().applyMatrix4(o.matrixWorld);
    return {
      crewMid: w(body, new V3(-1, 0, 0)),
      lab: w(body, new V3(-2.8, 0, 0)),
      nose: w(body, new V3(6.5, 0, 0)),
      hinge: w(crew, new V3(PIV, 0, 4.4)),
      crewHub: w(crew, new V3(0.3, 0, 0)),
      spool: w(rear, new V3(0.9, 0, 2.0)),
      rearHub: w(rear, new V3(0, 0, 0)),
      rearMid: w(rear, new V3(-14, 0, 0)),
      tanks: w(rear, new V3(-14, 4.8, 0)),
      drives: w(rear, new V3(-27, 0, 0)),
      cableMid: (() => {
        const a = w(rear, new V3(0.55, 0, 2.0));
        const b = w(crew, new V3(-0.1, 0, 2.0));
        return a.add(b).multiplyScalar(0.5);
      })(),
      arrow: w(arrow, new V3(0, 0, 0)),
      person: w(person, new V3(1.7, 0, 0)),
      com: new V3(0, 0, 0),
    };
  };
  return {root, crew, rear, body, person, arrow, cables, spools, update, points, edges};
}
