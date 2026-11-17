import { getSettings, motionReduced } from './settings';

/**
 * Cursor spotlight: one pointermove listener feeds --mx/--my (px) and --px (0..1) to the card or glass panel under
 * the pointer, and CSS paints the light. Nothing runs per frame and nothing happens when effects are off.
 */
export function startSpotlight(): void {
  let target: HTMLElement | null = null;
  let frame = 0;
  let last: PointerEvent | undefined;

  const apply = () => {
    frame = 0;
    if (!last) return;
    const el = (last.target as Element | null)?.closest<HTMLElement>('.game, .glass.panel, .kpi, .history-item') ?? null;
    if (target && target !== el) target.classList.remove('lit');
    target = el;
    if (!el || !getSettings().effects || motionReduced()) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${last.clientX - r.left}px`);
    el.style.setProperty('--my', `${last.clientY - r.top}px`);
    el.style.setProperty('--px', ((last.clientX - r.left) / r.width).toFixed(3));
    el.classList.add('lit');
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => target?.classList.remove('lit'));
}
