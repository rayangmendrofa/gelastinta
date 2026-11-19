// The tank's stage: a pale studio floor with a faint 10 cm grid, a soft key light with shadows, an environment for the
// stainless steel, no post effects (the page also has to run on a laptop's built-in GPU).
import * as THREE from 'three';
import {buildTank} from './tank.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#f1f2ee', floor: '#e9ebe4', line: '#d6d9ce', shadow: '#2c3040'};

const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uF; uniform vec3 uL; uniform vec3 uBg; varying vec3 vW;
  void main(){
    vec2 q = vW.xz;
    vec2 G = abs(fract(q * 10.0 + 0.5) - 0.5) / fwidth(q * 10.0);
    float L = 1.0 - min(min(G.x, G.y), 1.0);
    vec3 col = mix(uF, uL, L * 0.8);
    float d = length(vW.xz);
    gl_FragColor = vec4(mix(col, uBg, 1.0 - (1.0 - smoothstep(0.9, 2.6, d))), 1.0);
  }`;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 30);
  {
    // a simple studio for reflections: bright softboxes overhead and to the sides, a darker floor
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e4e6e0');
    const panel = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.99, 0.97).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 1, 0);
      env.add(m);
    };
    panel(10, 10, new V3(0, 14, 2), 2.4);
    panel(3, 12, new V3(-11, 4, 5), 2.8);
    panel(3, 12, new V3(11, 4, -4), 1.9);
    panel(16, 2, new V3(0, 2, 13), 1.3);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#b9bdb2', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -1;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;
    scene.environmentIntensity = 1.0;
    pm.dispose();
  }
  const SUN_DIR = new V3(0.45, 0.95, 0.55).normalize();
  const sun = new THREE.DirectionalLight('#fffaf2', 2.2);
  sun.castShadow = true;
  const EXT = 0.9;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.2, far: 6});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.002;
  sun.target.position.set(0, 0.5, 0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 3);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd1c4', 0.8));
  const fill = new THREE.DirectionalLight('#eef2ff', 0.55);
  fill.position.set(-1.5, 0.8, 1.6);
  scene.add(fill);

  const floorMat = new THREE.ShaderMaterial({vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: {uF: {value: new THREE.Color(COL.floor)}, uL: {value: new THREE.Color(COL.line)}, uBg: {value: new THREE.Color(COL.bg)}}, toneMapped: false});
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({color: COL.shadow, opacity: 0.22, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(shade);

  const T = buildTank();
  scene.add(T.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  /** cam: {at:[x,y,z], az, el (deg), d (m), sx, sy (px shift of the picture)} */
  const frame = (s, time, dt, view, cam) => {
    T.update(s, time, dt, view);
    const az = (cam.az * Math.PI) / 180;
    const el = (cam.el * Math.PI) / 180;
    camera.position.set(cam.at[0] + cam.d * Math.cos(el) * Math.sin(az), cam.at[1] + cam.d * Math.sin(el), cam.at[2] + cam.d * Math.cos(el) * Math.cos(az));
    camera.lookAt(cam.at[0], cam.at[1], cam.at[2]);
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
  return {renderer, scene, camera, T, resize, frame, project, size, setQuality};
}
