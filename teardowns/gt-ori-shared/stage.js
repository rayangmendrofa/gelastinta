// The robot's stage: a pale acrylic platform with a millimetre grid that slides under the robot at its speed, soft
// shadows and a contact shadow, a coloured spot where the coils' field is strongest (red one way, blue the other, like
// the paper's field maps), animated field lines rising from the electromagnet and an arrow for the field's direction
// whenever the coils are on, a dotted trail of where the robot has been, and the coil rig under the platform, seen
// through it when the camera pulls back. No post effects.
// frame(state, cam) poses the robot and draws one frame.
import * as THREE from 'three';
import {buildRobot, PLATE} from './robot.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#f6f1ee', floor: '#f3ece8', line: '#dccfca', shadow: '#2a2f45'};

const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uF; uniform vec3 uL; uniform vec3 uBg; uniform float uOff; uniform float uA; uniform float uPz; varying vec3 vW;
  void main(){
    vec2 q = vec2(vW.x, vW.z + uOff);
    vec2 g = abs(fract(q * 500.0 + 0.5) - 0.5) / fwidth(q * 500.0);
    float l = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 G = abs(fract(q * 100.0 + 0.5) - 0.5) / fwidth(q * 100.0);
    float L = 1.0 - min(min(G.x, G.y), 1.0);
    float fine = clamp(1.0 - fwidth(q.x * 500.0) * 1.2, 0.0, 1.0);
    vec3 col = mix(uF, uL, max(l * 0.3 * fine, L * 0.85));
    vec2 e = abs(vec2(vW.x, vW.z - uPz));
    float inside = 1.0 - step(0.3, max(e.x, e.y));
    float d = length(vW.xz);
    float far = smoothstep(0.12, 0.42, d);
    gl_FragColor = vec4(mix(col, uBg, far * 0.7), uA * inside);
  }`;
const SPOT_FRAG = /* glsl */ `uniform vec3 uC; uniform float uK; varying vec2 vU;
  void main(){ float r = length(vU - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 1.6) * uK; gl_FragColor = vec4(uC, a); }`;
const SPOT_VERT = /* glsl */ `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.002, 6);
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#ece7e3');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.98, 0.96).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.2);
    box(3, 14, new V3(-12, 4, 6), 2.6);
    box(3, 14, new V3(12, 4, -4), 1.8);
    box(18, 2, new V3(0, 2, 14), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#d4cdca', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.95;
    pm.dispose();
  }
  const SUN_DIR = new V3(0.35, 0.9, 0.4).normalize();
  const sun = new THREE.DirectionalLight('#fffaf3', 2.0);
  sun.castShadow = true;
  const EXT = 0.022;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.01, far: 0.3});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00002;
  sun.shadow.normalBias = 0.00003;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 0.003, 0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 0.12);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#d8d1ce', 0.85));
  const fill = new THREE.DirectionalLight('#f4f6ff', 0.55);
  fill.position.set(0.4, 0.3, 1.2);
  scene.add(fill);
  const under = new THREE.DirectionalLight('#fff4ea', 0.9);
  under.position.set(0.3, -0.2, 0.5);
  scene.add(under);

  const floorMat = new THREE.ShaderMaterial({vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, uniforms: {uF: {value: new THREE.Color(COL.floor)}, uL: {value: new THREE.Color(COL.line)}, uBg: {value: new THREE.Color(COL.bg)}, uOff: {value: 0}, uA: {value: 1}, uPz: {value: 0}}, toneMapped: false});
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 1;
  scene.add(floor);
  const spotMat = new THREE.ShaderMaterial({vertexShader: SPOT_VERT, fragmentShader: SPOT_FRAG, transparent: true, depthWrite: false, uniforms: {uC: {value: new THREE.Color('#E34A2B')}, uK: {value: 0}}, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4});
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), spotMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.00002;
  spot.renderOrder = 2;
  scene.add(spot);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.ShadowMaterial({color: COL.shadow, opacity: 0.22, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  shade.renderOrder = 3;
  scene.add(shade);

  // a soft contact shadow right under the robot, so it sits on the plate even where the sun's shadow is thin
  const CONTACT_FRAG = /* glsl */ `varying vec2 vU; void main(){ vec2 p = (vU - 0.5) * 2.0; float r = length(p * vec2(1.0, 1.25)); gl_FragColor = vec4(0.09, 0.11, 0.17, 0.32 * pow(max(0.0, 1.0 - r), 2.2)); }`;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.026), new THREE.ShaderMaterial({vertexShader: SPOT_VERT, fragmentShader: CONTACT_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6}));
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = 2;
  scene.add(contact);

  // field lines: dipole loops r = L sin²φ from the electromagnet's top, in 8 planes, dashes that flow with the field
  const fieldGroup = new THREE.Group();
  fieldGroup.position.y = -0.0095;
  scene.add(fieldGroup);
  const fieldMat = new THREE.LineDashedMaterial({color: '#E34A2B', dashSize: 0.0016, gapSize: 0.0011, transparent: true, opacity: 0, depthWrite: false});
  for (let az = 0; az < 8; az++) {
    for (const L of [0.026, 0.04, 0.056]) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const ph = 0.16 + (i / 60) * (Math.PI / 2 + 0.2);
        const r = L * Math.sin(ph) * Math.sin(ph);
        const a = (az / 8) * Math.PI * 2 + 0.2;
        pts.push(new V3(r * Math.sin(ph) * Math.cos(a), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(a)));
      }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fieldMat);
      l.computeLineDistances();
      l.renderOrder = 4;
      fieldGroup.add(l);
    }
  }
  // the field's direction above the robot: a shaft and a cone, up for one sign, down for the other
  const arrow = new THREE.Group();
  const arrowMat = new THREE.MeshStandardMaterial({color: '#E34A2B', roughness: 0.5, transparent: true, opacity: 0.9, emissive: new THREE.Color('#E34A2B'), emissiveIntensity: 0.25});
  arrow.add(new THREE.Mesh(new THREE.CylinderGeometry(0.00022, 0.00022, 0.0034, 12).translate(0, 0.0017, 0), arrowMat));
  arrow.add(new THREE.Mesh(new THREE.ConeGeometry(0.0007, 0.0016, 16).translate(0, 0.0042, 0), arrowMat));
  scene.add(arrow);
  // the trail: two rows of dots on the plate where the robot has been, fading with distance
  const NTR = 48;
  const SP_TR = 1.2; // mm between dots
  const trailMat = new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4});
  const trail = new THREE.InstancedMesh(new THREE.CircleGeometry(0.00028, 12).rotateX(-Math.PI / 2), trailMat, NTR * 2);
  trail.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NTR * 2 * 3), 3);
  trail.renderOrder = 2;
  trail.frustumCulled = false;
  scene.add(trail);
  const TR_C = new THREE.Color('#E34A2B');
  const TR_BG = new THREE.Color(COL.floor);
  const tm = new THREE.Matrix4();
  const tc = new THREE.Color();

  const R = buildRobot();
  scene.add(R.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const RED = new THREE.Color('#E34A2B');
  const BLUE = new THREE.Color('#5A82B3');
  /**
   * st: {th, roll, snap, cargo, dist (mm), field (mT, signed), xray 0..1}
   * cam: {tx, ty, tz, az, el, d (radians, metres), sx, sy}
   */
  const frame = (st, cam) => {
    const fk = Math.min(1, Math.abs(st.field) / 150);
    R.update({...st, glow: Math.pow(fk, 0.7)});
    floorMat.uniforms.uOff.value = (st.dist * 0.001) % 1;
    floorMat.uniforms.uA.value = 1 - 0.72 * st.xray;
    floorMat.uniforms.uPz.value = PLATE.z0 - st.dist * 0.001;
    // field lines and arrow: visible while the coils are on, flowing out of the pole for one sign and in for the other
    const on = Math.abs(st.field) > 0.5;
    fieldMat.color.copy(st.field >= 0 ? RED : BLUE);
    fieldMat.opacity = on ? Math.min(0.85, 0.22 + 0.75 * Math.pow(fk, 0.55)) * (1 - 0.5 * st.xray) : 0;
    fieldGroup.visible = on;
    const flow = (st.time ?? 0) * (0.004 + 0.01 * fk) * (st.field >= 0 ? -1 : 1);
    fieldMat.dashOffset = flow;
    arrow.visible = on && st.xray < 0.6;
    arrowMat.color.copy(st.field >= 0 ? RED : BLUE);
    arrowMat.emissive.copy(st.field >= 0 ? RED : BLUE);
    const ak = 0.45 + 0.4 * Math.sqrt(fk);
    arrow.scale.setScalar(ak);
    arrow.position.set(0, 0.0078, 0);
    arrow.rotation.set(st.field >= 0 ? 0 : Math.PI, 0, 0);
    if (st.field < 0) arrow.position.y += 0.005 * ak;
    // the trail: dots at every SP_TR mm the robot has passed, in two rows under its feet
    let n = 0;
    const last = Math.floor(st.dist / SP_TR) * SP_TR;
    for (let i = 0; i < NTR; i++) {
      const sm = last - i * SP_TR;
      const dz = (sm - st.dist) * 0.001;
      const ok = sm > 0.5 && st.dist - sm < 55;
      for (const x of [-0.0058, 0.0058]) {
        tm.makeTranslation(x, 0.00003, dz - 0.007);
        if (!ok) tm.makeScale(0, 0, 0);
        trail.setMatrixAt(n, tm);
        tc.copy(TR_C).lerp(TR_BG, Math.min(1, 0.25 + i / NTR));
        trail.setColorAt(n, tc);
        n++;
      }
    }
    trail.instanceMatrix.needsUpdate = true;
    trail.instanceColor.needsUpdate = true;
    contact.scale.set(st.th > 0.62 ? 0.6 : 1, 1, st.th > 0.62 ? 0.75 : 1);
    spotMat.uniforms.uC.value.copy(st.field >= 0 ? RED : BLUE);
    spotMat.uniforms.uK.value = Math.min(0.42, 0.1 + 0.5 * Math.pow(fk, 0.6)) * (Math.abs(st.field) > 0.5 ? 1 : 0);
    const big = Math.abs(st.field) > 40;
    spot.scale.setScalar(big ? 1.0 : 0.7);
    camera.position.set(cam.tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), cam.ty + cam.d * Math.sin(cam.el), cam.tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  };
  const pv = new V3();
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * 1600, (-pv.y * 0.5 + 0.5) * 900];
  };
  const setQuality = ({shadow}) => {
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  return {renderer, scene, camera, R, resize, frame, project, size, setQuality, V3};
}
