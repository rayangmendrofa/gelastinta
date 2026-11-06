// The hair clip fish built from code, in metres. The fish points along +x with its head at the front; a slim stand
// holds it above the floor of the studio. The printed head carries the battery, the Bluetooth board and the servo; the
// servo turns the centre of the clip through a silicone seal. The clip is a riveted PETG ribbon folded into a twisted
// loop: drawn as two strips that bow apart, follow the body's bend and twist the other way after every snap. The tail
// fin is riveted to the clip's end. update(state) poses everything from the clip state and the body angles.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {D2R} from './kin.js';

const V3 = THREE.Vector3;
// Talk 07's palette (Sanzo Wada No. 201: Olive, Grenadine Pink, Cobalt Green) with the site ink
export const PAL = {ink: '#252413', olive: '#837E31', oliveDark: '#5B5939', pink: '#F48067', green: '#96D1AA', greenDeep: '#4F9A72', paper: '#FEF9F7'};
export const ACCENT = new THREE.Color(PAL.pink);
export const FISH_Y = 0.13; // the fish's centre line above the floor
// the body plan along x (m): the head, the clip loop, the fin (front to back, 215 mm in all)
export const PLAN = {nose: 0.108, headBack: 0.012, clipEnd: -0.074, finTip: -0.107};
export const N = 28; // segments along the clip

const rbox = (w, h, d, r, c = [0, 0, 0]) => {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  g.translate(...c);
  return g;
};
const cyl = (r, len, axis, c = [0, 0, 0], seg = 24, r2 = r) => {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(...c);
  return g;
};

export function buildFish() {
  const M = {
    head: new THREE.MeshStandardMaterial({color: PAL.olive, roughness: 0.55, metalness: 0.05}),
    headIn: new THREE.MeshStandardMaterial({color: PAL.oliveDark, roughness: 0.6}),
    eye: new THREE.MeshStandardMaterial({color: PAL.ink, roughness: 0.3}),
    battery: new THREE.MeshStandardMaterial({color: '#3b3d40', roughness: 0.5}),
    label: new THREE.MeshStandardMaterial({color: PAL.paper, roughness: 0.6}),
    board: new THREE.MeshStandardMaterial({color: PAL.greenDeep, roughness: 0.55}),
    chip: new THREE.MeshStandardMaterial({color: '#1d2126', roughness: 0.45, metalness: 0.2}),
    servo: new THREE.MeshStandardMaterial({color: '#2f3a4f', roughness: 0.5, metalness: 0.1}),
    horn: new THREE.MeshStandardMaterial({color: '#f2f0ea', roughness: 0.45, emissive: ACCENT.clone(), emissiveIntensity: 0}),
    seal: new THREE.MeshStandardMaterial({color: '#f6c9bd', roughness: 0.6, transparent: true, opacity: 0.85}),
    clip: new THREE.MeshStandardMaterial({color: '#d9d2ae', roughness: 0.35, metalness: 0, transparent: true, opacity: 0.94, side: THREE.DoubleSide, emissive: ACCENT.clone(), emissiveIntensity: 0}),
    fin: new THREE.MeshStandardMaterial({color: PAL.green, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.92}),
    steel: new THREE.MeshStandardMaterial({color: '#cfd3d8', roughness: 0.35, metalness: 0.85, envMapIntensity: 0.6}),
    stand: new THREE.MeshStandardMaterial({color: '#a6a48e', roughness: 0.5, metalness: 0.3}),
    wire: new THREE.MeshStandardMaterial({color: '#c4513a', roughness: 0.6}),
  };
  const root = new THREE.Group();
  const fish = new THREE.Group();
  fish.position.y = FISH_Y;
  root.add(fish);
  const add = (parent, geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ the stand
  add(root, cyl(0.045, 0.008, 'y', [0.04, 0.004, 0], 40), M.stand);
  add(root, cyl(0.0035, FISH_Y - 0.03, 'y', [0.04, 0.008 + (FISH_Y - 0.03) / 2, 0], 12), M.stand);
  add(root, rbox(0.02, 0.006, 0.012, 0.002, [0.04, FISH_Y - 0.024, 0]), M.stand);

  // ------------------------------------------------------------ the head: a printed shell, open at the back
  const head = new THREE.Group();
  fish.add(head);
  {
    // a streamlined shell: a sphere stretched along x, its back third cut off where the clip leaves
    const g = new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI);
    g.scale(0.05, 0.029, 0.0225);
    g.translate(0.058, 0.003, 0);
    const shell = add(head, g, M.head);
    shell.userData.shell = true;
    for (const s of [-1, 1]) {
      const e = add(head, new THREE.SphereGeometry(0.0042, 16, 10), M.eye);
      e.position.set(0.09, 0.011, s * 0.0152);
      e.userData.shell = true;
      e.scale.set(1, 1, 0.5);
    }
    // a small dorsal ridge and two side fins on the head, as printed
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.03, 0);
    fin.quadraticCurveTo(0.012, 0.012, -0.004, 0.016);
    fin.lineTo(0, 0);
    const fg = new THREE.ExtrudeGeometry(fin, {depth: 0.0016, bevelEnabled: false});
    fg.translate(0.03, 0.031, -0.0008);
    add(head, fg, M.head);
    for (const s of [-1, 1]) {
      const pg = new THREE.ExtrudeGeometry(fin, {depth: 0.0014, bevelEnabled: false});
      pg.scale(0.8, 0.8, 1);
      pg.rotateX(s * Math.PI / 2.4);
      pg.translate(0.05, -0.016, s * 0.016);
      add(head, pg, M.head);
    }
  }
  // inside the head: battery at the front, the board above it, the servo at the back driving the clip
  const inside = new THREE.Group();
  fish.add(inside);
  add(inside, rbox(0.04, 0.02, 0.016, 0.003, [0.06, -0.008, 0]), M.battery);
  add(inside, rbox(0.03, 0.0204, 0.0162, 0.0005, [0.064, -0.008, 0]), M.label);
  add(inside, rbox(0.032, 0.0016, 0.018, 0.0006, [0.058, 0.0085, 0]), M.board);
  add(inside, rbox(0.008, 0.0022, 0.008, 0.0006, [0.052, 0.0102, 0.002]), M.chip);
  add(inside, rbox(0.006, 0.0018, 0.004, 0.0005, [0.066, 0.0101, -0.004]), M.chip);
  const servo = new THREE.Group();
  servo.position.set(0.026, 0.0, 0);
  inside.add(servo);
  add(servo, rbox(0.0228, 0.0225, 0.0122, 0.0015), M.servo); // a mini servo, its shaft pointing back (−x) is shown as a vertical horn
  const horn = new THREE.Group();
  horn.position.set(-0.004, 0.0135, 0);
  servo.add(horn);
  add(horn, cyl(0.0042, 0.002, 'y', [0, 0, 0], 28), M.horn);
  add(horn, rbox(0.0028, 0.0016, 0.016, 0.0006, [0, 0.0006, 0]), M.horn);
  // the drive: a shaft from the servo back through the silicone seal to the clip's centre
  add(inside, cyl(0.0016, 0.03, 'x', [0.004, 0.0, 0], 12), M.steel);
  add(inside, cyl(0.0068, 0.006, 'x', [PLAN.headBack + 0.002, 0, 0], 24, 0.0075), M.seal);
  // two thin wires from the battery to the board
  for (const [dz, mat] of [[0.004, M.wire], [-0.004, M.chip]]) add(inside, cyl(0.0006, 0.02, 'x', [0.048, 0.006, dz], 6), mat);

  // ------------------------------------------------------------ the clip: two strips, re-laid every frame
  const strips = [];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((N + 1) * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    const m = add(fish, g, M.clip);
    m.frustumCulled = false;
    strips.push({g, pos, m});
  }
  const rivetF = add(fish, cyl(0.0022, 0.03, 'y', [0, 0, 0], 16), M.steel); // where the clip meets the shaft
  const rivetT = add(fish, cyl(0.0019, 0.012, 'y', [0, 0, 0], 16), M.steel); // the rivet at the tail
  // ------------------------------------------------------------ the fin: a forked tail, film thin
  const finG = (() => {
    const s = new THREE.Shape();
    const L = PLAN.clipEnd - PLAN.finTip; // 33 mm long
    s.moveTo(0, 0.006);
    s.bezierCurveTo(-L * 0.4, 0.012, -L * 0.8, 0.03, -L * 1.05, 0.05);
    s.quadraticCurveTo(-L * 0.78, 0.018, -L * 0.72, 0);
    s.quadraticCurveTo(-L * 0.78, -0.018, -L * 1.05, -0.05);
    s.bezierCurveTo(-L * 0.8, -0.03, -L * 0.4, -0.012, 0, -0.006);
    s.lineTo(0, 0.006);
    const g = new THREE.ShapeGeometry(s, 24);
    return g;
  })();
  const finPivot = new THREE.Group();
  fish.add(finPivot);
  const fin = add(finPivot, finG, M.fin);
  const finRay = new THREE.MeshStandardMaterial({color: PAL.greenDeep, roughness: 0.5});
  for (const a of [-0.55, -0.25, 0.25, 0.55]) {
    const r = add(finPivot, cyl(0.0005, 0.03, 'x', [-0.015, 0, 0], 6), finRay);
    r.rotation.z = a * 0.6;
  }
  void fin;

  // ------------------------------------------------------------ pose
  const mid = Array.from({length: N + 1}, () => new V3());
  const tan = Array.from({length: N + 1}, () => new V3());
  const setFade = (m, g) => {
    const tr = g > 0.01 || m === M.clip || m === M.fin || m === M.seal;
    if (m.transparent !== tr) {
      m.transparent = tr;
      m.needsUpdate = true;
    }
    if (m === M.head || m === M.eye) {
      m.opacity = 1 - 0.85 * g;
      m.depthWrite = g < 0.5;
    }
  };
  /**
   * st: {phi(s) body angle (rad) at s 0..1 along the clip and fin, x clip state, snap 0..1 accent, servo (rad), glass 0..1}
   */
  const update = (st) => {
    // the midline: from the back of the head, segments of equal length turning by the body angle
    const L = PLAN.headBack - PLAN.clipEnd;
    const ds = L / N;
    let px = PLAN.headBack, pz = 0;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = st.phi(s * 0.78); // the clip spans the first 78 % of the bending length; the fin the rest
      mid[i].set(px, 0, pz);
      tan[i].set(-Math.cos(a), 0, Math.sin(a));
      px -= ds * Math.cos(a);
      pz += ds * Math.sin(a);
    }
    // the strips: bowed apart into a loop, twisted one way or the other by the clip's state
    const tw = Math.max(-1, Math.min(1, st.x)) * 26 * D2R;
    strips.forEach((sp, k) => {
      const sgn = k === 0 ? 1 : -1;
      for (let i = 0; i <= N; i++) {
        const s = i / N;
        const bow = 0.011 * Math.sin(Math.PI * s) + 0.002;
        const h = 0.0068 * (1 - 0.3 * Math.sin(Math.PI * s)); // half the strip height
        const twist = tw * Math.sin(Math.PI * s) * sgn;
        // the side normal of the midline
        const nx = tan[i].z, nz = -tan[i].x;
        const yc = sgn * bow;
        const off = Math.sin(twist) * h;
        const yy = Math.cos(twist) * h;
        for (const [j, e] of [[0, -1], [1, 1]]) {
          const o = (i * 2 + j) * 3;
          sp.pos[o] = mid[i].x + nx * off * e;
          sp.pos[o + 1] = yc + yy * e;
          sp.pos[o + 2] = mid[i].z + nz * off * e + sgn * 0.0006;
        }
      }
      sp.g.attributes.position.needsUpdate = true;
      sp.g.computeVertexNormals();
      sp.g.computeBoundingSphere();
    });
    rivetF.position.set(mid[0].x, 0, mid[0].z);
    rivetT.position.set(mid[N].x, 0, mid[N].z);
    // the fin on the clip's end, turned by the tail's own angle
    finPivot.position.set(mid[N].x, 0, mid[N].z);
    finPivot.rotation.set(0, st.phi(1), 0);
    // the servo horn turns with the drive
    horn.rotation.y = st.servo;
    const a = st.snap;
    M.clip.emissiveIntensity = 0.55 * a;
    M.clip.color.set('#d9d2ae').lerp(ACCENT, 0.6 * a);
    M.horn.emissiveIntensity = 0.4 * st.drive;
    setFade(M.head, st.glass);
    head.visible = st.glass < 0.995;
    for (const m of [M.eye]) setFade(m, st.glass);
    void setFade;
  };
  return {root, fish, update, mid, M, servo, horn};
}
