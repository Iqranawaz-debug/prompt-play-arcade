import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { motionReduced, onSettings } from './settings';

/**
 * A small glossy 3D game controller that floats and slowly turns, for the empty preview state.
 * Built from primitives (no model files). Renders only while visible; one still pose for reduced motion.
 * Returns a cleanup function, or undefined if WebGL is unavailable (the SVG illustration stays instead).
 */
export function mountController(host: HTMLElement): (() => void) | undefined {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return undefined;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.35, 8.2);
  camera.lookAt(0, -0.1, 0);

  // Lights: warm key from the top left, violet rim from behind, soft blue fill.
  scene.add(new THREE.AmbientLight(0x8090c0, 0.35));
  const key = new THREE.DirectionalLight(0xffd2a0, 2.2);
  key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(0x8f80f5, 3.2);
  rim.position.set(4, 2, -4);
  const fill = new THREE.PointLight(0x5b8def, 12, 12);
  fill.position.set(2.5, -2, 3);
  scene.add(key, rim, fill);

  const controller = buildController();
  scene.add(controller);

  // Soft contact shadow that shrinks as the controller floats up.
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.75;
  scene.add(shadow);

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  // Gentle tilt toward the pointer while it is over the empty state.
  const target = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  const area = host.closest('.empty-state') ?? host;
  const onPointer = (e: Event) => {
    const p = e as PointerEvent;
    const r = (area as HTMLElement).getBoundingClientRect();
    target.x = ((p.clientX - r.left) / r.width - 0.5) * 0.5;
    target.y = ((p.clientY - r.top) / r.height - 0.5) * 0.3;
  };
  const onLeave = () => ((target.x = 0), (target.y = 0));
  area.addEventListener('pointermove', onPointer);
  area.addEventListener('pointerleave', onLeave);

  const clock = new THREE.Clock();
  let raf = 0;
  let visible = true;

  const pose = (t: number) => {
    tilt.x += (target.x - tilt.x) * 0.06;
    tilt.y += (target.y - tilt.y) * 0.06;
    const float = Math.sin(t * 0.9) * 0.14;
    controller.position.y = float;
    controller.rotation.set(0.38 + Math.sin(t * 0.5) * 0.06 + tilt.y, Math.sin(t * 0.35) * 0.5 + tilt.x, Math.sin(t * 0.6) * 0.05);
    const s = 1 - float * 0.6;
    shadow.scale.set(s, s, 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.75 - float;
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    pose(clock.getElapsedTime());
    renderer.render(scene, camera);
  };
  const update = () => {
    cancelAnimationFrame(raf);
    const shown = visible && !document.hidden && host.offsetParent !== null;
    if (!shown) return;
    if (motionReduced()) {
      pose(0);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  io.observe(host);
  const ro = new ResizeObserver(() => {
    resize();
    update();
  });
  ro.observe(host);
  document.addEventListener('visibilitychange', update);
  const unsubscribe = onSettings(update);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', update);
    unsubscribe();
    area.removeEventListener('pointermove', onPointer);
    area.removeEventListener('pointerleave', onLeave);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    envTexture.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/** The controller: a bevelled, clear-coated body with a D-pad, face buttons, sticks and a glowing light bar. */
function buildController(): THREE.Group {
  const group = new THREE.Group();

  const outline = new THREE.Shape();
  outline.moveTo(-1.1, 0.75);
  outline.lineTo(1.1, 0.75);
  outline.quadraticCurveTo(1.78, 0.75, 1.98, 0.02);
  outline.bezierCurveTo(2.18, -0.82, 1.92, -1.38, 1.46, -1.32);
  outline.quadraticCurveTo(1.16, -1.27, 0.9, -0.76);
  outline.lineTo(-0.9, -0.76);
  outline.quadraticCurveTo(-1.16, -1.27, -1.46, -1.32);
  outline.bezierCurveTo(-1.92, -1.38, -2.18, -0.82, -1.98, 0.02);
  outline.quadraticCurveTo(-1.78, 0.75, -1.1, 0.75);
  const bodyGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.16,
    bevelSegments: 10,
    curveSegments: 48,
  });
  bodyGeo.translate(0, 0.28, -0.21);
  const body = new THREE.Mesh(
    bodyGeo,
    new THREE.MeshPhysicalMaterial({ color: 0x232b42, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18 }),
  );
  group.add(body);

  const front = 0.43; // z of the front face, so controls sit on it
  const glow = (color: number, intensity = 0.45) =>
    new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.25, clearcoat: 1 });

  // D-pad (left): an orange cross.
  const dpadMat = glow(0xffb454, 0.35);
  for (const [w, h] of [
    [0.62, 0.2],
    [0.2, 0.62],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), dpadMat);
    bar.position.set(-1.18, 0.33, front + 0.02);
    group.add(bar);
  }

  // Face buttons (right): a diamond of glowing caps.
  const cap = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 32);
  const buttons: [number, number, number][] = [
    [1.18, 0.6, 0x8f80f5],
    [1.44, 0.34, 0xffb454],
    [0.92, 0.34, 0x5b8def],
    [1.18, 0.08, 0xe9edf4],
  ];
  for (const [x, y, color] of buttons) {
    const b = new THREE.Mesh(cap, glow(color, color === 0xe9edf4 ? 0.15 : 0.55));
    b.rotation.x = Math.PI / 2;
    b.position.set(x, y, front + 0.03);
    group.add(b);
  }

  // Thumbsticks.
  const stickBase = new THREE.CylinderGeometry(0.24, 0.27, 0.1, 40);
  const stickTop = new THREE.SphereGeometry(0.22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const stickMat = new THREE.MeshPhysicalMaterial({ color: 0x151a28, roughness: 0.6, clearcoat: 0.4 });
  for (const x of [-0.56, 0.56]) {
    const base = new THREE.Mesh(stickBase, stickMat);
    base.rotation.x = Math.PI / 2;
    base.position.set(x, -0.3, front + 0.02);
    const top = new THREE.Mesh(stickTop, stickMat);
    top.rotation.x = Math.PI / 2;
    top.scale.set(1, 1, 0.5);
    top.position.set(x, -0.3, front + 0.07);
    group.add(base, top);
  }

  // Light bar across the top: the signature orange-to-violet glow.
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.9, 6, 16), glow(0xff9a52, 1.4));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.8, front - 0.02);
  group.add(bar);

  group.scale.setScalar(1.08);
  return group;
}

/** Radial soft-shadow texture for the floor plane. */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 32, 0, 128, 32, 128);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.setTransform(1, 0, 0, 0.25, 0, 24);
  ctx.fillStyle = g;
  ctx.fillRect(0, -96, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
