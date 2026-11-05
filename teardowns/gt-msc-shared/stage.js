// The soft actuators' stage: a pale studio bench with a faint centimetre grid, soft shadows, no post effects (the page
// also has to run on a software renderer). frame(state, cam) poses the rig and draws one frame.
import * as THREE from 'three';
import {buildRig} from './rig.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#eef0f3', floor: '#e7eaee', line: '#d6dae1', shadow: '#3b4656'};

const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uF; uniform vec3 uL; uniform vec3 uBg; varying vec3 vW;
  void main(){
    vec2 g = abs(fract(vW.xz * 100.0 + 0.5) - 0.5) / fwidth(vW.xz * 100.0);
    float l = 1.0 - min(min(g.x, g.y), 1.0);
    vec2 G = abs(fract(vW.xz * 10.0 + 0.5) - 0.5) / fwidth(vW.xz * 10.0);
    float L = 1.0 - min(min(G.x, G.y), 1.0);
    vec3 col = mix(uF, uL, max(l * 0.35, L * 0.9));
    float d = length(vW.xz - vec2(0.08, 0.0));
    gl_FragColor = vec4(mix(col, uBg, 1.0 - smoothstep(0.9, 0.3, d)), 1.0);
  }`;

export function createRigStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.01, 10);

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e4e7ec');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(0.97, 0.98, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.2);
    box(3, 14, new V3(-12, 4, 6), 2.6);
    box(3, 14, new V3(12, 4, -4), 1.8);
    box(18, 2, new V3(0, 2, 14), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#c9ced6', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.95;
    pm.dispose();
  }
  const SUN_DIR = new V3(0.35, 0.85, 0.55).normalize();
  const sun = new THREE.DirectionalLight('#fffaf3', 2.0);
  sun.castShadow = true;
  const EXT = 0.4;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.2, far: 3});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.0012;
  sun.target.position.set(0.08, 0.08, 0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 1.4);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd3dc', 0.85));
  // a soft fill from the camera side so the black prints keep their shape
  const fill = new THREE.DirectionalLight('#f3f6ff', 0.55);
  fill.position.set(-0.6, 0.35, 1.2);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShaderMaterial({vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: {uF: {value: new THREE.Color(COL.floor)}, uL: {value: new THREE.Color(COL.line)}, uBg: {value: new THREE.Color(COL.bg)}}, toneMapped: false}),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({color: COL.shadow, opacity: 0.2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(shade);

  const H = buildRig();
  scene.add(H.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  /**
   * st: {phi {trilobite, manta} (rad), swell, tilted, stroke (m), flow, glass, show {trilobite, manta}}
   * cam: {tx, ty, tz, az, el, d (radians, metres), sx, sy}
   */
  const frame = (st, cam) => {
    H.update(st);
    camera.position.set(cam.tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), cam.ty + cam.d * Math.sin(cam.el), cam.tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  };
  const pv = new V3();
  /** a world point projected to the 1600 x 900 console */
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
  return {renderer, scene, camera, H, resize, frame, project, size, setQuality, V3, Matrix4: THREE.Matrix4};
}
