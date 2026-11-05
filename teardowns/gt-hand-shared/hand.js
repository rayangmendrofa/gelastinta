// The BEng prosthetic hand built from code, in metres. The hand stands upright on a bench stand: the forearm socket
// holds the wrist servo, the printed palm holds five finger servos, and each finger is three printed phalanges on
// steel pins with a joint frame of radius ρ at every joint. A tendon runs from each servo horn up the palm side of its
// finger, over the joint frames, to a loop inside the fingertip. update(state) poses everything from the servo angles.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {D2R, DIGITS, P, PALM, tendonOf, thetaOf} from './kin.js';

const V3 = THREE.Vector3;
export const ACCENT = new THREE.Color('#2B44C8');
export const WRIST_Y = 0.17; // the wrist joint's height above the floor
// the thumb's long axis and the direction it bends, in the palm frame (tuned so a pinch meets the index tip)
export const THUMB = {axis: [-0.707, 0.707, 0], bend: [0.5, 0.5, 0.707]};
const TENDON = new THREE.Color('#f4f1ea');

const rbox = (w, h, d, r, c = [0, 0, 0], seg = 3) => {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  g.translate(...c);
  return g;
};
const cyl = (r, len, axis, c = [0, 0, 0], seg = 28, r2 = r) => {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(...c);
  return g;
};

export function buildHand() {
  const MAT = {
    print: new THREE.MeshStandardMaterial({color: '#25282e', roughness: 0.62, metalness: 0.05}),
    cover: new THREE.MeshStandardMaterial({color: '#2b2f36', roughness: 0.58, metalness: 0.05}),
    frame: new THREE.MeshStandardMaterial({color: '#b9bec6', roughness: 0.42, metalness: 0.75, envMapIntensity: 0.55}),
    pin: new THREE.MeshStandardMaterial({color: '#d6d9de', roughness: 0.35, metalness: 0.85, envMapIntensity: 0.6}),
    tip: new THREE.MeshStandardMaterial({color: '#eeece6', roughness: 0.7, metalness: 0}),
    servo: new THREE.MeshStandardMaterial({color: '#3d5f8c', roughness: 0.5, metalness: 0.1}),
    servoTop: new THREE.MeshStandardMaterial({color: '#2f4a6e', roughness: 0.5, metalness: 0.1}),
    horn: new THREE.MeshStandardMaterial({color: '#f2f2ee', roughness: 0.45, metalness: 0, emissive: ACCENT.clone(), emissiveIntensity: 0}),
    socket: new THREE.MeshStandardMaterial({color: '#3a3f47', roughness: 0.55, metalness: 0.15}),
    stand: new THREE.MeshStandardMaterial({color: '#9aa1aa', roughness: 0.5, metalness: 0.35}),
    board: new THREE.MeshStandardMaterial({color: '#1f6f78', roughness: 0.55, metalness: 0.05}),
    chip: new THREE.MeshStandardMaterial({color: '#1d2126', roughness: 0.45, metalness: 0.2}),
    wire: new THREE.MeshStandardMaterial({color: '#2b2f36', roughness: 0.6}),
    wireR: new THREE.MeshStandardMaterial({color: '#c4513a', roughness: 0.6}),
  };
  const root = new THREE.Group(); // the bench: stand, socket, boards (does not turn)
  const hand = new THREE.Group(); // turns with the wrist servo about the forearm axis (y)
  hand.position.set(0, WRIST_Y, 0);
  root.add(hand);
  const add = (parent, geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // every digit gets its own material copies, so isolate and glass can fade one digit at a time
  const dm = DIGITS.map(() => ({print: MAT.print.clone(), frame: MAT.frame.clone(), pin: MAT.pin.clone(), tip: MAT.tip.clone(), tendon: new THREE.MeshStandardMaterial({color: TENDON.clone(), roughness: 0.5, emissive: ACCENT.clone(), emissiveIntensity: 0})}));

  // ------------------------------------------------------------ the bench stand and the forearm socket
  add(root, rbox(0.16, 0.012, 0.12, 0.004, [0, 0.006, 0]), MAT.stand);
  add(root, cyl(0.009, 0.08, 'y', [0, 0.05, -0.02]), MAT.stand);
  add(root, rbox(0.05, 0.012, 0.03, 0.003, [0, 0.092, -0.02]), MAT.stand);
  add(root, cyl(0.031, 0.07, 'y', [0, WRIST_Y - 0.045, 0], 40, 0.034), MAT.socket); // the socket, as on an arm stump
  add(root, cyl(0.0345, 0.008, 'y', [0, WRIST_Y - 0.006, 0], 48), MAT.frame); // the wrist bearing ring
  // the wrist servo inside the socket (seen in glass mode through the socket's open front)
  const wristServo = new THREE.Group();
  wristServo.position.set(0, WRIST_Y - 0.04, 0);
  root.add(wristServo);
  add(wristServo, rbox(0.0228, 0.0122, 0.0225, 0.0015), MAT.servo);
  add(wristServo, cyl(0.007, 0.002, 'y', [0, 0.0072, 0], 28), MAT.horn);
  // the boards on the bench: the Arduino Mega and the EMG sensor board, wired to the hand
  const brd = new THREE.Group();
  brd.position.set(0.15, 0, 0.05);
  brd.rotation.y = -0.5;
  root.add(brd);
  add(brd, rbox(0.1016, 0.0016, 0.0533, 0.001, [0, 0.0128, 0]), MAT.board); // Arduino Mega: 101.6 x 53.3 mm
  for (const s of [-1, 1]) add(brd, rbox(0.004, 0.003, 0.08, 0.0005, [s * 0.003, 0.016, 0]).rotateY(Math.PI / 2).translate(0, 0, s * 0.024), MAT.chip);
  add(brd, rbox(0.014, 0.0025, 0.014, 0.0006, [0.006, 0.0148, 0.002]), MAT.chip);
  add(brd, rbox(0.016, 0.011, 0.012, 0.001, [-0.045, 0.019, -0.012]), MAT.pin); // USB socket
  for (const [x, z] of [[-0.046, -0.022], [0.046, -0.022], [-0.046, 0.022], [0.046, 0.022]]) add(brd, cyl(0.003, 0.012, 'y', [x, 0.006, z], 12), MAT.stand);
  const emg = new THREE.Group();
  emg.position.set(0.14, 0, -0.06);
  emg.rotation.y = -0.2;
  root.add(emg);
  add(emg, rbox(0.03, 0.0016, 0.025, 0.001, [0, 0.0108, 0]), MAT.board);
  add(emg, rbox(0.008, 0.002, 0.006, 0.0005, [0.004, 0.0126, 0]), MAT.chip);
  for (const [x, z] of [[-0.012, -0.009], [0.012, -0.009], [-0.012, 0.009], [0.012, 0.009]]) add(emg, cyl(0.002, 0.01, 'y', [x, 0.005, z], 10), MAT.stand);
  // a cable from the Mega to the socket, one from the EMG board to the Mega
  const cable = (pts, mat, r = 0.0018) => add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p))), 48, r, 8, false), mat);
  cable([[0.106, 0.016, 0.07], [0.07, 0.03, 0.07], [0.03, 0.05, 0.03], [0.02, WRIST_Y - 0.07, 0.018]], MAT.wire, 0.0024);
  cable([[0.15, 0.014, -0.045], [0.16, 0.02, -0.01], [0.17, 0.018, 0.02]], MAT.wireR);

  // ------------------------------------------------------------ the palm: a printed back, a cover on the palm side
  const palm = new THREE.Group();
  hand.add(palm);
  const PY = PALM.h / 2 + 0.004;
  add(palm, rbox(PALM.w, PALM.h, 0.016, 0.006, [0, PY, -0.007]), MAT.print); // the back plate
  const coverMat = MAT.cover;
  const cover = add(palm, rbox(PALM.w - 0.002, PALM.h - 0.004, 0.013, 0.005, [0, PY, 0.0085]), coverMat);
  add(palm, rbox(0.048, 0.012, 0.03, 0.004, [0, 0.004, -0.0005]), MAT.print); // the wrist block
  add(palm, cyl(0.0015, PALM.w + 0.004, 'x', [0, 0.098, 0], 12), MAT.pin); // the knuckle bar through the MCP joints
  // the finger servos stand side by side behind the cover, shafts toward the palm side
  const servos = [];
  DIGITS.forEach((d, i) => {
    const g = new THREE.Group();
    if (d.thumb) {
      g.position.set(-0.026, 0.026, -0.0035);
      g.rotation.z = 0.45;
    } else g.position.set(d.base[0], 0.05, -0.0035);
    palm.add(g);
    add(g, rbox(0.0122, 0.0228, 0.0185, 0.0012), MAT.servo);
    add(g, rbox(0.0122, 0.0325, 0.0024, 0.0006, [0, 0, 0.004]), MAT.servoTop); // mounting tabs
    add(g, cyl(0.0045, 0.004, 'z', [0, 0.006, 0.011], 24), MAT.servoTop);
    const horn = add(g, cyl(P.hornR, 0.0018, 'z', [0, 0, 0], 40), MAT.horn.clone());
    horn.position.set(0, 0.006, 0.0138);
    const arm = add(g, rbox(0.003, 0.012, 0.0014, 0.0006, [0, 0.004, 0]), horn.material);
    arm.position.copy(horn.position).add(new V3(0, 0, 0.0012));
    servos.push({g, horn, arm, digit: i});
  });

  // ------------------------------------------------------------ the digits
  const digits = DIGITS.map((d, di) => {
    const M = dm[di];
    const base = new THREE.Group();
    base.position.set(...d.base);
    if (d.thumb) {
      // the thumb comes off the side of the palm, turned so it closes across toward the index and middle tips
      // its long axis points up and out to the side; its bend (local +z) points across and out of the palm
      const y = new V3(...THUMB.axis).normalize();
      const z0 = new V3(...THUMB.bend);
      const z = z0.sub(y.clone().multiplyScalar(z0.dot(y))).normalize();
      const x = new V3().crossVectors(y, z);
      base.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    } else base.rotation.z = (d.splay || 0) * D2R;
    palm.add(base);
    if (d.thumb) add(base, rbox(0.02, 0.022, 0.017, 0.006, [0, -0.008, 0]), M.print); // the thumb's metacarpal mount
    const joints = [];
    let parent = base;
    d.L.forEach((l, k) => {
      const j = new THREE.Group();
      if (k > 0) j.position.y = d.L[k - 1];
      parent.add(j);
      // the joint frames (side plates, radius ρ), the pin through them
      for (const s of [-1, 1]) add(j, cyl(P.rho, 0.0014, 'x', [s * 0.0088, 0, 0], 28), M.frame);
      add(j, cyl(0.0011, 0.02, 'x', [0, 0, 0], 10), M.pin);
      // the printed phalanx, a little narrower toward the tip
      const w = 0.0158 - 0.0012 * k - (d.key === 'little' ? 0.0016 : 0);
      const dz = 0.0135 - 0.0008 * k;
      const len = l - 0.0026;
      add(j, rbox(w, len, dz, 0.0035, [0, 0.0013 + len / 2, -0.0004]), M.print);
      // the grey links on the back of each phalanx, as on the printed fingers
      add(j, rbox(0.004, len * 0.7, 0.0016, 0.0007, [0, len * 0.5, -dz / 2 - 0.0004]), M.frame);
      if (k === d.L.length - 1) add(j, rbox(w + 0.0018, l * 0.84, dz + 0.002, 0.0042, [0, 0.0016 + l * 0.42 + 0.0012, -0.0004], 4), M.tip); // the white fingertip cover
      joints.push(j);
      parent = j;
    });
    // the tendon: one thin rod per span, re-laid every frame between points on the palm side of the frames
    const spans = [];
    const tendonSeg = new THREE.CylinderGeometry(0.00065, 0.00065, 1, 6);
    tendonSeg.translate(0, 0.5, 0);
    const nSpans = d.L.length * 2 + 2;
    for (let s = 0; s < nSpans; s++) {
      const m = new THREE.Mesh(tendonSeg, M.tendon);
      m.castShadow = true;
      palm.add(m);
      spans.push(m);
    }
    return {d, base, joints, spans, M};
  });

  // ------------------------------------------------------------ pose
  const tmp = new V3();
  const up = new V3(0, 1, 0);
  const q = new THREE.Quaternion();
  const toPalm = new THREE.Matrix4();
  const layTendon = (dg, servo) => {
    // all points in the palm group's frame
    palm.updateMatrixWorld(true);
    toPalm.copy(palm.matrixWorld).invert();
    const pts = [];
    const hornW = servo.horn.getWorldPosition(new V3());
    const hp = hornW.applyMatrix4(toPalm);
    pts.push(hp.clone().add(new V3(P.hornR * 0.95, 0, 0.0004)));
    // up the palm to the guide just under the knuckle bar
    const b = dg.base.position;
    if (dg.d.thumb) pts.push(new V3(b.x + 0.006, b.y - 0.002, 0.0115));
    else pts.push(new V3(b.x, 0.09, 0.0125));
    dg.joints.forEach((j, k) => {
      const l = dg.d.L[k];
      const before = new V3(0, -0.0035, P.rho + 0.0006);
      const after = new V3(0, 0.0035, P.rho + 0.0006);
      // "before" sits in the parent's frame (it does not turn with this joint), "after" turns with it
      const par = j.parent;
      par.updateMatrixWorld(true);
      pts.push(before.add(j.position).applyMatrix4(par.matrixWorld).applyMatrix4(toPalm));
      pts.push(after.applyMatrix4(j.matrixWorld).applyMatrix4(toPalm));
      if (k === dg.joints.length - 1) pts.push(new V3(0, l * 0.62, P.rho * 0.55).applyMatrix4(j.matrixWorld).applyMatrix4(toPalm));
    });
    dg.spans.forEach((m, s) => {
      const a = pts[s];
      const c = pts[s + 1];
      if (!a || !c) {
        m.visible = false;
        return;
      }
      m.visible = true;
      tmp.subVectors(c, a);
      const len = tmp.length();
      m.position.copy(a);
      q.setFromUnitVectors(up, tmp.normalize());
      m.quaternion.copy(q);
      m.scale.set(1, Math.max(1e-4, len), 1);
    });
  };
  const setFade = (m, g) => {
    const tr = g > 0.01;
    if (m.transparent !== tr) {
      m.transparent = tr;
      m.needsUpdate = true;
    }
    m.opacity = 1 - 0.86 * g;
    m.depthWrite = g < 0.5;
  };
  /**
   * st: {phi[5] servo angles (deg), wrist (deg), accent[5] 0..1, ghost[5] 0..1 per digit, glass 0..1}
   */
  const update = (st) => {
    hand.rotation.y = -st.wrist * D2R;
    digits.forEach((dg, i) => {
      const th = thetaOf(tendonOf(st.phi[i]));
      dg.joints.forEach((j) => (j.rotation.x = th * D2R));
      const a = st.accent[i];
      dg.M.tendon.color.copy(TENDON).lerp(ACCENT, a);
      dg.M.tendon.emissiveIntensity = 0.45 * a;
      for (const m of [dg.M.print, dg.M.frame, dg.M.pin, dg.M.tip]) setFade(m, st.ghost[i]);
      setFade(dg.M.tendon, st.ghost[i] * 0.6);
    });
    servos.forEach((s) => {
      const i = s.digit;
      // the horn turns with the servo; the arm on it shows the angle
      s.horn.rotation.z = -st.phi[i] * D2R;
      s.arm.rotation.z = -st.phi[i] * D2R;
      s.horn.material.emissiveIntensity = 0.5 * st.accent[i];
      s.horn.material.color.set('#f2f2ee').lerp(ACCENT, st.accent[i]);
    });
    setFade(coverMat, 0.93 * st.glass);
    cover.visible = st.glass < 0.995;
    hand.updateMatrixWorld(true);
    digits.forEach((dg, i) => layTendon(dg, servos[i]));
  };
  return {root, hand, palm, digits, servos, update, MAT};
}

/** a world point on a digit: joint k (0 = MCP) or the tip (k = number of phalanges), for tags */
export function digitPoint(H, i, k) {
  const dg = H.digits[i];
  const n = dg.joints.length;
  const j = dg.joints[Math.min(k, n - 1)];
  const p = k >= n ? new V3(0, dg.d.L[n - 1] * 0.96, 0) : new V3(0, 0, 0);
  return p.applyMatrix4(j.matrixWorld);
}
