/**
 * Ambient starfield behind the UI: a few dozen tiny particles that twinkle and drift upward.
 * Cheap by design: capped at 30fps, paused while the tab is hidden, a single still frame for reduced motion.
 */

import { getSettings, motionReduced, onSettings } from './settings';

interface Star {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  twinkle: number;
  color: string;
}

const COLORS = ['255, 255, 255', '255, 255, 255', '255, 205, 150', '190, 180, 255', '160, 195, 255'];
const FRAME_MS = 1000 / 30;

export function startAmbient(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let stars: Star[] = [];
  let width = 0;
  let height = 0;
  let raf = 0;
  let last = 0;

  const seed = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(110, (width * height) / 16000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.4 + Math.random() ** 2 * 1.4,
      speed: 4 + Math.random() * 10, // px per second, upward
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.6 + Math.random() * 1.6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  };

  const draw = (t: number, dt: number) => {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      s.y -= (s.speed * dt) / 1000;
      if (s.y < -4) {
        s.y = height + 4;
        s.x = Math.random() * width;
      }
      const alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(s.phase + (t / 1000) * s.twinkle));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.color}, ${alpha})`;
      ctx.fill();
      if (s.r > 1.25) {
        // The biggest stars get a faint halo.
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color}, ${alpha * 0.12})`;
        ctx.fill();
      }
    }
  };

  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - last < FRAME_MS) return;
    const dt = last ? Math.min(100, t - last) : 0;
    last = t;
    draw(t, dt);
  };

  const run = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (!getSettings().ambient) return; // hidden by Settings: draw nothing
    if (motionReduced() || document.hidden) draw(performance.now(), 0);
    else raf = requestAnimationFrame(loop);
  };

  seed();
  const onResize = () => {
    seed();
    if (motionReduced()) draw(performance.now(), 0);
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', run);
  const unsubscribe = onSettings(run);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', run);
    unsubscribe();
  };
}
