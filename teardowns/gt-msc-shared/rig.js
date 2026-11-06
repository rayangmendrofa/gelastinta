// The MSc soft actuators built from code, in metres. A bench test rig as in the thesis's bending tests: the soft limb
// is clamped at its root in front of a 10 mm grid board and fed through a tube by the servo bellows pump (servo, worm
// gear, rotating disk, bellows in a chamber). Off to the side stands the robot body with six trilobite limbs on the
// same pressure. update(state) poses everything from the chamber pressure.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BELLOWS, D2R, DESIGNS, TILT} from './kin.js';

const V3 = THREE.Vector3;
export const ACCENT = new THREE.Color('#2B44C8');
export const RIG = {clamp: [-0.07, 0.11, 0], robot: [0.36, 0, 0.02], pump: [-0.17, 0, 0.0]};

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
const shadowed = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const GRID_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GRID_FRAG = /* glsl */ `uniform vec2 uSize; varying vec2 vUv;
  void main(){
    vec2 p = vUv * uSize * 100.0;
    vec2 g = abs(fract(p + 0.5) - 0.5) / fwidth(p);
    float l = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 q = p / 5.0;
    vec2 G = abs(fract(q + 0.5) - 0.5) / fwidth(q);
    float L = 1.0 - min(min(G.x, G.y), 1.0);
    vec3 col = mix(vec3(0.985, 0.985, 0.975), vec3(0.62, 0.68, 0.76), max(l * 0.55, L * 0.95));
    gl_FragColor = vec4(col, 1.0);
  }`;

/** one soft limb of a design: segments of the base, chambers on top, water inside each chamber */
export function buildLimb(design, mats, {lite = false} = {}) {
  const root = new THREE.Group();
  const N = design.n;
  const isManta = design.key === 'manta';
  const SUB = lite ? 1 : 2; // base strips per chamber
  const strips = [];
  const chambers = [];
  const segL = design.L / (N * SUB);
  const chordAt = (x) => (isManta ? design.chord + (design.tip - design.chord) * (x / design.L) : design.width);
  for (let k = 0; k < N * SUB; k++) {
    const g = new THREE.Group();
    root.add(g);
    const x0 = k * segL;
    const w = chordAt(x0 + segL / 2);
    const th = isManta ? 0.004 : design.base;
    const m = shadowed(new THREE.Mesh(rbox(segL * 1.08, th, w, Math.min(0.0018, th / 2.2), [segL / 2, -th / 2, isManta ? w / 2 - design.chord / 2 : 0], 2), mats.silicone));
    g.add(m);
    if (!isManta && !lite && k % SUB === 0) g.add(shadowed(new THREE.Mesh(rbox(0.006, 0.004, 0.022, 0.0012, [segL, -th - 0.002, 0], 2), mats.silicone))); // the small feet
    strips.push({g, x0});
  }
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    root.add(g);
    const xc = (i + 0.5) * (design.L / N);
    let shell;
    let water;
    if (isManta) {
      const len = design.chamberLs[i];
      shell = new THREE.Mesh(rbox(design.chamberW, 0.007, len, 0.002, [0, 0.0035, 0], 2), mats.silicone);
      water = new THREE.Mesh(rbox(design.chamberW * 0.5, 0.0045, len * 0.8, 0.0012, [0, 0.0025, 0], 2), mats.water);
      shell.position.z = -design.chord / 2 + chordAt(xc) - len / 2 - 0.004;
      water.position.z = shell.position.z;
    } else {
      // a bellows ridge across the limb: 15 mm long, 20 mm wide, on a full width web
      shell = new THREE.Mesh(rbox(design.chamberL * 0.92, 0.015, design.width * 0.92, 0.0045, [0, 0.0075, 0], 3), mats.silicone);
      water = new THREE.Mesh(rbox(design.chamberL * 0.55, 0.0105, design.chamberW, 0.003, [0, 0.0062, 0], 2), mats.water);
    }
    shadowed(shell);
    water.renderOrder = 2;
    g.add(shell, water);
    chambers.push({g, xc, shell, water});
  }
  // the root cap with the fluid inlet
  const cap = new THREE.Group();
  root.add(cap);
  if (isManta) {
    cap.add(shadowed(new THREE.Mesh(rbox(0.012, 0.012, design.chord * 0.6, 0.004, [-0.006, -0.0005, 0]), mats.cap)));
  } else {
    cap.add(shadowed(new THREE.Mesh(rbox(0.014, 0.024, design.width + 0.004, 0.006, [-0.007, 0.006, 0]), mats.cap)));
  }
  cap.add(shadowed(new THREE.Mesh(cyl(0.0035, 0.012, 'x', [-0.018, 0.004, 0], 16), mats.nipple)));

  const M = new THREE.Matrix4();
  const R = new THREE.Matrix4();
  /** place a frame at arc length s along a bend of total angle phi (bending down, toward -y) */
  const frameAt = (s, phi, out) => {
    const k = phi / design.L;
    const th = k * s;
    const x = Math.abs(k) < 1e-6 ? s : Math.sin(th) / k;
    const y = Math.abs(k) < 1e-6 ? 0 : -(1 - Math.cos(th)) / k;
    out.makeRotationZ(-th);
    out.setPosition(x, y, 0);
    return out;
  };
  /** phi: total bend (rad); swell 0..1 of rest; tilted: chambers lean 30 degrees toward the tip */
  const update = (phi, swell, tilted) => {
    for (const s of strips) {
      frameAt(s.x0, phi, M);
      s.g.matrix.copy(M);
      s.g.matrixAutoUpdate = false;
      s.g.matrixWorldNeedsUpdate = true;
    }
    for (const c of chambers) {
      frameAt(c.xc, phi, M);
      R.makeRotationZ(tilted ? -TILT * D2R : 0);
      c.g.matrix.copy(M).multiply(R);
      c.g.matrixAutoUpdate = false;
      c.g.matrixWorldNeedsUpdate = true;
      const sx = 1 + 0.28 * swell;
      const sy = 1 + 0.42 * swell;
      c.shell.scale.set(sx, sy, 1 + 0.18 * swell);
      c.water.scale.set(Math.max(0.05, swell * 1.6) * sx, Math.max(0.1, 0.3 + swell) * sy, 1 + 0.15 * swell);
      c.water.visible = swell > 0.004;
    }
  };
  update(0, 0, true);
  return {root, update, frameAt};
}

export function buildRig() {
  const MAT = {
    silicone: new THREE.MeshPhysicalMaterial({color: '#e8ecee', roughness: 0.42, metalness: 0, transmission: 0, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color('#ffffff')}),
    water: new THREE.MeshStandardMaterial({color: ACCENT.clone(), roughness: 0.25, metalness: 0, emissive: ACCENT.clone(), emissiveIntensity: 0.25, transparent: true, opacity: 0.92}),
    cap: new THREE.MeshStandardMaterial({color: '#f1efe9', roughness: 0.5}),
    nipple: new THREE.MeshStandardMaterial({color: '#FDC57E', roughness: 0.45}),
    rig: new THREE.MeshStandardMaterial({color: '#9aa1aa', roughness: 0.5, metalness: 0.35}),
    clamp: new THREE.MeshStandardMaterial({color: '#3a3f47', roughness: 0.5, metalness: 0.2}),
    servo: new THREE.MeshStandardMaterial({color: '#e2c05c', roughness: 0.5}),
    housing: new THREE.MeshPhysicalMaterial({color: '#dfe7ec', roughness: 0.2, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false}),
    bellows: new THREE.MeshStandardMaterial({color: '#d4d8de', roughness: 0.45}),
    gear: new THREE.MeshStandardMaterial({color: '#b9bec6', roughness: 0.4, metalness: 0.7}),
    tube: new THREE.MeshPhysicalMaterial({color: '#cfe0ee', roughness: 0.25, transparent: true, opacity: 0.75}),
    body: new THREE.MeshStandardMaterial({color: '#6b717b', roughness: 0.55, metalness: 0.2}),
    plate: new THREE.MeshStandardMaterial({color: '#c9ced6', roughness: 0.6}),
    board: new THREE.MeshStandardMaterial({color: '#1f6f78', roughness: 0.55}),
    violet: new THREE.MeshStandardMaterial({color: '#A36AA5', roughness: 0.5}),
  };
  const root = new THREE.Group();
  const add = (parent, geo, mat, pos) => {
    const m = shadowed(new THREE.Mesh(geo, mat));
    if (pos) m.position.set(...pos);
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ the bench rig: base plate, post, clamp, grid board
  add(root, rbox(0.34, 0.01, 0.13, 0.003, [-0.02, 0.005, -0.005]), MAT.rig);
  add(root, rbox(0.016, RIG.clamp[1] + 0.01, 0.03, 0.003, [RIG.clamp[0] - 0.02, (RIG.clamp[1] + 0.01) / 2, 0]), MAT.rig);
  add(root, rbox(0.034, 0.04, 0.05, 0.004, [RIG.clamp[0] - 0.014, RIG.clamp[1] + 0.006, 0]), MAT.clamp);
  for (const s of [-1, 1]) add(root, cyl(0.003, 0.012, 'y', [RIG.clamp[0] - 0.014, RIG.clamp[1] + 0.032, s * 0.016], 12), MAT.gear);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.ShaderMaterial({vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, uniforms: {uSize: {value: new THREE.Vector2(0.3, 0.2)}}}));
  board.position.set(0.0, 0.11, -0.06);
  board.receiveShadow = true;
  root.add(board);
  add(root, rbox(0.304, 0.204, 0.006, 0.002, [0.0, 0.11, -0.064]), MAT.rig);
  for (const x of [-0.13, 0.13]) add(root, rbox(0.012, 0.012, 0.05, 0.002, [x, 0.006, -0.04]), MAT.rig);

  // ------------------------------------------------------------ the two limbs, clamped at the rig's root
  const limbs = {};
  for (const k of Object.keys(DESIGNS)) {
    const L = buildLimb(DESIGNS[k], MAT);
    L.root.position.set(RIG.clamp[0], RIG.clamp[1] + (k === 'manta' ? 0.004 : 0), 0);
    root.add(L.root);
    limbs[k] = L;
  }

  // ------------------------------------------------------------ the servo bellows pump (Figure 6), on the bench to the left
  const pump = new THREE.Group();
  pump.position.set(...RIG.pump);
  root.add(pump);
  add(pump, rbox(0.04, 0.03, 0.022, 0.002, [0, 0.025, 0]), MAT.servo); // the servo
  add(pump, rbox(0.054, 0.003, 0.022, 0.001, [0, 0.033, 0]), MAT.servo); // its tabs
  const worm = add(pump, cyl(0.0045, 0.028, 'x', [0, 0.046, 0.0], 16), MAT.gear); // the worm
  const disk = add(pump, cyl(0.016, 0.004, 'z', [0, 0.062, 0.006], 36), MAT.gear); // gear to rotation disk
  add(pump, rbox(0.05, 0.006, 0.05, 0.002, [0, 0.072, 0]), MAT.clamp); // the cover plate
  const HB = 0.078; // the bellows chamber's floor
  add(pump, cyl(BELLOWS.d / 2 + 0.006, 0.06, 'y', [0, HB + 0.03, 0], 40), MAT.housing); // the bellows chamber (clear)
  add(pump, cyl(BELLOWS.d / 2 + 0.007, 0.004, 'y', [0, HB + 0.062, 0], 40), MAT.clamp);
  const bellows = new THREE.Group();
  bellows.position.set(0, HB, 0);
  pump.add(bellows);
  const ribs = [];
  for (let i = 0; i < 8; i++) {
    const r = add(bellows, new THREE.TorusGeometry(BELLOWS.d / 2 - 0.002, 0.0028, 8, 32).rotateX(Math.PI / 2), MAT.bellows);
    ribs.push(r);
  }
  const pusher = add(bellows, cyl(BELLOWS.d / 2 - 0.004, 0.004, 'y', [0, 0, 0], 32), MAT.gear);
  const pumpWater = add(pump, cyl(BELLOWS.d / 2 - 0.004, 1, 'y', [0, 0.5, 0], 32), MAT.water); // the water above the bellows, in the chamber
  pumpWater.material = MAT.water.clone();
  pumpWater.material.opacity = 0.55;
  const outlet = [RIG.pump[0], RIG.pump[1] + HB + 0.066, RIG.pump[2]];
  add(root, cyl(0.0035, 0.01, 'y', [outlet[0], outlet[1], outlet[2]], 12), MAT.nipple);
  // the tube from the pump outlet up and over to the limb's inlet
  const inlet = new V3(RIG.clamp[0] - 0.036, RIG.clamp[1] + 0.004, 0);
  const tubePts = [new V3(outlet[0], outlet[1] + 0.004, outlet[2]), new V3(outlet[0], outlet[1] + 0.03, 0.01), new V3(outlet[0] + 0.05, outlet[1] + 0.035, 0.035), new V3(inlet.x - 0.02, inlet.y + 0.02, 0.03), new V3(inlet.x - 0.004, inlet.y, 0.002)];
  add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tubePts), 64, 0.003, 10, false), MAT.tube);
  const flowMat = MAT.water.clone();
  const flow = add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tubePts), 64, 0.0016, 8, false), flowMat);
  // the controller board beside the pump
  const brd = new THREE.Group();
  brd.position.set(-0.17, 0, 0.075);
  root.add(brd);
  add(brd, rbox(0.052, 0.0016, 0.028, 0.0008, [0, 0.0128, 0]), MAT.board);
  add(brd, rbox(0.018, 0.003, 0.025, 0.0006, [-0.008, 0.0152, 0]), MAT.clamp);
  for (const [x, z] of [[-0.022, -0.01], [0.022, -0.01], [-0.022, 0.01], [0.022, 0.01]]) add(brd, cyl(0.002, 0.012, 'y', [x, 0.006, z], 10), MAT.rig);

  // ------------------------------------------------------------ the robot body (prototype layout), six trilobite limbs
  const robot = new THREE.Group();
  robot.position.set(...RIG.robot);
  root.add(robot);
  const RS = 0.62; // the robot drawn at 62% so it sits on the same bench (the limbs keep the same bend)
  robot.scale.setScalar(RS);
  add(robot, cyl(0.12, 0.012, 'y', [0, 0.04, 0], 64), MAT.plate);
  add(robot, rbox(0.15, 0.05, 0.08, 0.006, [0, 0.085, 0]), MAT.body);
  add(robot, rbox(0.12, 0.012, 0.06, 0.003, [0, 0.114, 0]), MAT.board);
  for (const s of [-1, 1]) add(robot, rbox(0.04, 0.02, 0.012, 0.003, [0.075 * s, 0.07, 0]), MAT.violet);
  const robotLimbs = [];
  for (const sz of [-1, 1])
    for (const xi of [-1, 0, 1]) {
      const h = new THREE.Group();
      h.position.set(xi * 0.06, 0.07, sz * 0.05);
      h.rotation.y = sz > 0 ? -Math.PI / 2 - xi * 0.35 : Math.PI / 2 + xi * 0.35;
      robot.add(h);
      add(h, cyl(0.024, 0.036, 'x', [0.018, 0, 0], 28), MAT.body); // the bellows housing
      add(h, cyl(0.026, 0.006, 'x', [0.038, 0, 0], 28), MAT.clamp);
      const L = buildLimb(DESIGNS.trilobite, MAT, {lite: true});
      L.root.position.set(0.05, 0.0, 0);
      L.root.rotation.z = -0.3;
      h.add(L.root);
      robotLimbs.push(L);
    }

  // ------------------------------------------------------------ pose
  const update = (st) => {
    for (const k of Object.keys(limbs)) {
      limbs[k].root.visible = st.show[k] > 0.5;
      limbs[k].update(st.phi[k], st.swell, st.tilted);
    }
    for (const L of robotLimbs) L.update(st.phi.trilobite, st.swell, st.tilted);
    // the pump: the disk turns, the worm spins, the bellows is pushed up by the stroke (drawn 4x so it reads)
    const s = st.stroke * 4;
    disk.rotation.z = -st.stroke * 120;
    worm.rotation.x = st.stroke * 900;
    const h = BELLOWS.len;
    pusher.position.y = 0.004 + s;
    ribs.forEach((r, i) => {
      r.position.y = 0.006 + s + (i / (ribs.length - 1)) * (h - s);
    });
    const top = HB + 0.006 + h;
    const wTop = HB + 0.058;
    pumpWater.scale.y = Math.max(0.001, wTop - top);
    pumpWater.position.y = top;
    flowMat.emissiveIntensity = 0.25 + 0.9 * st.flow;
    flowMat.opacity = 0.35 + 0.6 * Math.min(1, st.swell * 2);
    // glass: the silicone turns see through so the water in the chambers shows
    const g = st.glass;
    MAT.silicone.transparent = g > 0.01;
    MAT.silicone.opacity = 1 - 0.72 * g;
    MAT.silicone.depthWrite = g < 0.5;
    MAT.water.emissiveIntensity = 0.2 + 0.5 * g;
  };
  return {root, update, limbs, robot, MAT, inlet, outlet: new V3(...outlet)};
}
