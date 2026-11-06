// The Hail Mary's stage: a pale paper studio in Talk 04's colours, a faint polar grid under the spin plane (rings every
// 10 m, so the 78 m and 26 m circles can be read), drifting specks that stream past while the engines push, soft light
// and no post effects (the page also has to run on a software renderer). frame(state, cam) poses and draws one frame.
import * as THREE from 'three';
import {buildShip, PAL} from './ship.js';

const V3 = THREE.Vector3;
export const COL = {bg: '#FEF8F3', grid: '#E9DCD0', grid2: '#DCCBBB'};
export const GRID_Y = -16;

const GRID_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GRID_FRAG = /* glsl */ `uniform vec3 uBg; uniform vec3 uL; uniform vec3 uL2; varying vec3 vW;
  void main(){
    float r = length(vW.xz);
    float f = r / 10.0;
    float w = fwidth(f);
    float ring = 1.0 - min(abs(fract(f + 0.5) - 0.5) / max(w, 1e-4), 1.0);
    float f5 = r / 50.0;
    float w5 = fwidth(f5);
    float ring5 = 1.0 - min(abs(fract(f5 + 0.5) - 0.5) / max(w5, 1e-4), 1.0);
    float a = atan(vW.z, vW.x) / 6.2831853 * 24.0;
    float wa = fwidth(a);
    float spoke = (1.0 - min(abs(fract(a + 0.5) - 0.5) / max(wa, 1e-4), 1.0)) * step(10.0, r);
    vec3 col = mix(uBg, uL, max(ring * 0.75, spoke * 0.35));
    col = mix(col, uL2, ring5 * 0.9);
    float fade = 1.0 - smoothstep(60.0, 190.0, r);
    gl_FragColor = vec4(mix(uBg, col, fade), 1.0);
  }`;

export function createShipStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 3000);
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#efe6dc');
    const panel = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.98, 0.95).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(12, 12, new V3(0, 14, 2), 2.2);
    panel(3, 14, new V3(-12, 4, 6), 2.4);
    panel(3, 14, new V3(12, 4, -4), 1.7);
    panel(18, 2, new V3(0, -6, 14), 1.2);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#fff7ef', 2.1);
  sun.position.set(40, 90, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#ffffff', '#e2d4c6', 0.95));
  const fill = new THREE.DirectionalLight('#f2f4ff', 0.55);
  fill.position.set(-60, 20, -40);
  scene.add(fill);

  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.ShaderMaterial({vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, uniforms: {uBg: {value: new THREE.Color(COL.bg)}, uL: {value: new THREE.Color(COL.grid)}, uL2: {value: new THREE.Color(COL.grid2)}}, toneMapped: false}),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = GRID_Y;
  scene.add(grid);

  // specks that stream past while the ship is pushed forward (a fixed scatter, wrapped in a 160 m box)
  const NS = 900;
  const base = new Float32Array(NS * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < NS; i++) {
    base[i * 3] = (rnd() - 0.5) * 160;
    base[i * 3 + 1] = (rnd() - 0.5) * 70;
    base[i * 3 + 2] = (rnd() - 0.5) * 120;
  }
  const specks = new THREE.BufferGeometry();
  const pos = new Float32Array(NS * 3);
  specks.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const speckMat = new THREE.PointsMaterial({color: PAL.taupe, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0});
  const speckPts = new THREE.Points(specks, speckMat);
  speckPts.frustumCulled = false;
  scene.add(speckPts);

  const S = buildShip();
  scene.add(S.root);

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
   * st: the ship state (see ship.js update) plus travel (m flown under thrust, for the specks) and specks 0..1
   * cam: {tx, ty, tz, az, el, d (radians, metres), sx, sy}
   */
  const frame = (st, cam) => {
    S.update(st);
    const off = st.travel % 160;
    for (let i = 0; i < NS; i++) {
      let x = base[i * 3] - off;
      x = ((((x + 80) % 160) + 160) % 160) - 80;
      pos[i * 3] = x;
      pos[i * 3 + 1] = base[i * 3 + 1];
      pos[i * 3 + 2] = base[i * 3 + 2];
    }
    specks.attributes.position.needsUpdate = true;
    speckMat.opacity = 0.7 * st.specks;
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
  const setQuality = () => {};
  return {renderer, scene, camera, S, resize, frame, project, size, setQuality, V3};
}
