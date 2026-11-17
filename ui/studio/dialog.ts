import { createModal, h, type Modal } from '../modal';

export interface ToolDialog {
  modal: Modal;
  body: HTMLElement;
  footer: HTMLElement;
  setTitle(title: string, subtitle?: string): void;
  /** Show a spinner with a message and a Cancel button; returns the AbortSignal for the request. */
  busy(message: string): AbortSignal;
  error(title: string, message: string): void;
}

let count = 0;

/** Shared shell for studio tools: title, scrollable body, footer actions, busy and error states. */
export function createToolDialog(host: HTMLElement, wide = true): ToolDialog {
  const id = `tool-title-${++count}`;
  const title = h('h2', { id });
  const sub = h('p', { class: 'history-sub' });
  const close = h('button', { type: 'button', class: 'close', textContent: '×', attrs: { 'aria-label': 'Close' } });
  const body = h('div', { class: 'dialog-body' });
  const footer = h('div', { class: 'tool-actions dialog-foot' });
  const panel = h(
    'div',
    { class: `dialog glass tool-dialog${wide ? ' wide' : ''}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id } },
    h('header', { class: 'drawer-head' }, h('div', {}, title, sub), close),
    body,
    footer,
  );
  host.append(panel);
  let controller: AbortController | undefined;
  const modal = createModal(panel, { onClose: () => controller?.abort() });
  close.addEventListener('click', () => modal.close());

  return {
    modal,
    body,
    footer,
    setTitle(t, s) {
      title.textContent = t;
      sub.textContent = s ?? '';
      sub.hidden = !s;
    },
    busy(message) {
      controller?.abort();
      controller = new AbortController();
      const cancel = h('button', { type: 'button', class: 'ghost', textContent: 'Cancel' });
      const c = controller;
      cancel.addEventListener('click', () => c.abort());
      body.replaceChildren(h('div', { class: 'tool-status busy-state' }, h('span', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }), h('span', { textContent: message, attrs: { role: 'status' } })));
      footer.replaceChildren(cancel);
      return controller.signal;
    },
    error(t, message) {
      body.replaceChildren(h('div', { class: 'alert', attrs: { role: 'alert' } }, h('div', { class: 'alert-body' }, h('strong', { textContent: t }), h('p', { textContent: message }))));
      footer.replaceChildren();
    },
  };
}

/** Labelled form field helper. */
export function field(label: string, control: HTMLElement, wide = false): HTMLElement {
  return h('label', { class: `tool-field${wide ? ' span-2' : ''}` }, h('span', { textContent: label }), control);
}

export const textarea = (value: string, rows = 2, max = 700) => h('textarea', { value, rows, maxLength: max });
export const input = (value: string, max = 60) => h('input', { type: 'text', value, maxLength: max });
