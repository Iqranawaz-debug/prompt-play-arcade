import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getSettings, motionReduced, onSettings } from './settings';

/**
 * Floating iridescent glass shapes behind the panels. Deliberately light: low render resolution (it sits behind
 * frosted glass anyway), 24fps cap that drops to 10fps while a game is being played, paused when hidden or off,
 * and a single still frame for reduced motion. Returns a cleanup function, or undefined without WebGL.
 */
export function mountAmbient3d(host: HTMLElement): (() => void) | undefined {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
  } catch {
    return undefined;
  }
  renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1) * 0.6);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.id = 'ambient-3d';
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 16);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-4, 6, 8);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.3));

  const glass = (tint: THREE.ColorRepresentation) =>
    new THREE.MeshPhysicalMaterial({
      color: tint,
      // Partly transmissive: fully clear glass reads as dark blobs when nothing bright sits behind it.
      transmission: 0.3,
      thickness: 1.2,
      roughness: 0.06,
      metalness: 0.1,
      ior: 1.45,
      iridescence: 1,
      iridescenceIOR: 1.35,
      clearcoat: 1,
      envMapIntensity: 1.6,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.9,
      attenuationColor: new THREE.Color(tint),
      attenuationDistance: 4,
    });

  // [geometry, x, y, z, scale, tint slot] with x/y as fractions of the visible half-width/height.
  const layout: [THREE.BufferGeometry, number, number, number, number, 'a' | 'b' | 'c'][] = [
    [new THREE.SphereGeometry(1, 48, 32), -0.86, 0.5, -1, 1.25, 'a'],
    [new THREE.OctahedronGeometry(1.1, 0), -0.62, -0.55, 0, 1.1, 'b'],
    [new THREE.TorusGeometry(0.8, 0.24, 24, 64), -0.9, -0.15, -2, 0.9, 'c'],
    [new THREE.BoxGeometry(1.4, 1.4, 1.4), 0.82, 0.62, -3, 1, 'c'],
    [new THREE.IcosahedronGeometry(1, 0), 0.88, -0.58, -1, 1.25, 'a'],
    [new THREE.SphereGeometry(0.6, 40, 24), 0.12, 0.8, -4, 0.9, 'b'],
    [new THREE.OctahedronGeometry(0.7, 0), 0.35, -0.85, -3, 0.9, 'a'],
  ];
  const materials = { a: glass('#ffb454'), b: glass('#8f80f5'), c: glass('#5b8def') };
  const meshes = layout.map(([geo, x, y, z, s, slot], i) => {
    const m = new THREE.Mesh(geo, materials[slot]);
    m.scale.setScalar(s);
    m.userData = { x, y, z, phase: i * 1.7, spin: 0.15 + (i % 3) * 0.08 };
    scene.add(m);
    return m;
  });

  /** Follow the theme: tint shapes with the current accent / secondary / blue tokens. */
  const applyTheme = () => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const tints = { a: read('--accent', '#ffb454'), b: read('--violet', '#8f80f5'), c: read('--blue', '#5b8def') };
    for (const slot of ['a', 'b', 'c'] as const) {
      materials[slot].color.set(tints[slot]);
      materials[slot].attenuationColor.set(tints[slot]);
      materials[slot].emissive.set(tints[slot]);
    }
  };

  const place = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const pose = (t: number) => {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    for (const m of meshes) {
      const { x, y, z, phase, spin } = m.userData as { x: number; y: number; z: number; phase: number; spin: number };
      m.position.set(x * halfW, y * halfH + Math.sin(t * 0.35 + phase) * 0.35, z);
      m.rotation.set(t * spin * 0.7 + phase, t * spin + phase, 0);
    }
  };

  let raf = 0;
  let last = 0;
  const clock = new THREE.Clock();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const busy = document.documentElement.classList.contains('game-running');
    if (now - last < (busy ? 100 : 42)) return;
    last = now;
    pose(clock.getElapsedTime());
    renderer.render(scene, camera);
  };
  const update = () => {
    cancelAnimationFrame(raf);
    const s = getSettings();
    const on = s.ambient3d && s.ambient && !document.hidden;
    renderer.domElement.hidden = !s.ambient3d;
    if (!on) return;
    if (motionReduced()) {
      pose(0);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }
  };

  place();
  const onResize = () => {
    place();
    if (motionReduced()) update();
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', update);
  const unsubscribe = onSettings(() => {
    applyTheme();
    update();
  });

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', update);
    unsubscribe();
    meshes.forEach((m) => m.geometry.dispose());
    Object.values(materials).forEach((m) => m.dispose());
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
