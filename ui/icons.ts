/** Inline stroke icons (static, trusted markup). 16px, inherit colour via currentColor. */
const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
  remix: svg('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>'),
  download: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
} as const;

/** A button with an icon and a text label (the label lives in a span so it can change without losing the icon). */
export function iconButton(icon: string, label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.innerHTML = `${icon}<span class="btn-label"></span>`;
  b.querySelector('.btn-label')!.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

export function setButtonLabel(button: HTMLElement, label: string): void {
  const span = button.querySelector('.btn-label');
  if (span) span.textContent = label;
  else button.textContent = label;
}
