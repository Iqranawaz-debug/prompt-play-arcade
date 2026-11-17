/** Shared behaviour for drawers, the command palette and dialogs: scrim, Escape, focus trap, focus return. */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface Modal {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

let openCount = 0;

export function createModal(panel: HTMLElement, options: { onOpen?: () => void; onClose?: () => void; initialFocus?: () => HTMLElement | null } = {}): Modal {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.hidden = true;
  panel.hidden = true;
  panel.before(scrim);
  let returnTo: HTMLElement | null = null;
  let open = false;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      modal.close();
    } else if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const modal: Modal = {
    get isOpen() {
      return open;
    },
    open() {
      if (open) return;
      open = true;
      openCount++;
      returnTo = document.activeElement as HTMLElement | null;
      scrim.hidden = false;
      panel.hidden = false;
      document.documentElement.classList.add('modal-open');
      panel.addEventListener('keydown', onKey);
      options.onOpen?.();
      requestAnimationFrame(() => (options.initialFocus?.() ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus());
    },
    close() {
      if (!open) return;
      open = false;
      openCount--;
      scrim.hidden = true;
      panel.hidden = true;
      if (openCount === 0) document.documentElement.classList.remove('modal-open');
      panel.removeEventListener('keydown', onKey);
      options.onClose?.();
      returnTo?.focus?.();
    },
  };
  scrim.addEventListener('click', () => modal.close());
  return modal;
}

/** Small DOM helper used by the dynamic panels. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string; data?: Record<string, string>; attrs?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const { class: className, data, attrs, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(data ?? {})) node.dataset[k] = v;
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, v);
  for (const child of children) if (child) node.append(child);
  return node;
}
