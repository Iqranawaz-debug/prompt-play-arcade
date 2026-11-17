import { h } from './modal';

export interface MenuItem {
  label: string;
  hint: string;
  icon: string;
  run(): void;
  disabled?: () => boolean;
}

/** A small accessible dropdown menu (role=menu): click or Enter/↓ opens, arrows move, Escape closes. */
export function createMenu(button: HTMLButtonElement, panel: HTMLElement, items: MenuItem[]): void {
  let buttons: HTMLButtonElement[] = [];

  const close = (focusButton = false) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
  };
  const open = (focusIndex = 0) => {
    buttons = items.map((item) => {
      const b = h('button', { type: 'button', class: 'menu-item', attrs: { role: 'menuitem' } });
      b.innerHTML = item.icon;
      b.append(h('span', { class: 'menu-text' }, h('strong', { textContent: item.label }), h('span', { textContent: item.hint })));
      b.disabled = item.disabled?.() ?? false;
      b.addEventListener('click', () => {
        close();
        item.run();
      });
      return b;
    });
    panel.replaceChildren(...buttons);
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    buttons.filter((b) => !b.disabled)[focusIndex]?.focus();
  };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) open();
    else close();
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && panel.hidden) {
      e.preventDefault();
      open();
    }
  });
  panel.addEventListener('keydown', (e) => {
    const enabled = buttons.filter((b) => !b.disabled);
    const i = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      enabled[(i + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node)) close();
  });
}

const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const STUDIO_ICONS = {
  character: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  assets: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/>'),
  sound: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  debug: svg('<path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 0 1 6 0v1.1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9M6 13H2M22 13h-4M3 21l3.5-2.5M21 21l-3.5-2.5M3 6l3.5 2.5M21 6l-3.5 2.5"/>'),
  logic: svg('<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3a3 3 0 0 0 3 3H14"/>'),
  levels: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h6v-4h6V7h6"/>'),
  animation: svg('<rect x="2" y="5" width="14" height="14" rx="3"/><path d="M19 8v8M22 10v4"/><path d="M7 10l4 2-4 2z"/>'),
  physics: svg('<circle cx="12" cy="5" r="3"/><path d="M12 8v4M5 21h14M8 17l4-5 4 5"/>'),
  controls: svg('<rect x="2" y="6" width="20" height="12" rx="6"/><path d="M7 10v4M5 12h4M15 11h.01M18 13h.01"/>'),
};
