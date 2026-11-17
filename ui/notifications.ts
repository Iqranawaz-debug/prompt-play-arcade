import { timeAgo } from './library';
import { h } from './modal';

export type NoteKind = 'success' | 'error' | 'info';

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  body?: string;
  at: number;
  read: boolean;
}

const KEY = 'gg.notifications.v1';
const MAX = 30;

const ICON: Record<NoteKind, string> = {
  success: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  error: '<path d="M12 8v5"/><path d="M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>',
  info: '<path d="M12 11v6"/><path d="M12 7.5h.01"/><circle cx="12" cy="12" r="9"/>',
};
const icon = (kind: NoteKind) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[kind]}</svg>`;

function load(): Note[] {
  try {
    const notes = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Note[];
    return Array.isArray(notes) ? notes.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

let notes = load();
const listeners = new Set<() => void>();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Storage blocked: notifications still work for this visit.
  }
  listeners.forEach((fn) => fn());
}

let toastHost: HTMLElement | undefined;

/** Record an event in the notification center and show a short toast. */
export function notify(kind: NoteKind, title: string, body?: string): void {
  notes = [{ id: crypto.randomUUID(), kind, title, body, at: Date.now(), read: false }, ...notes].slice(0, MAX);
  save();
  if (!toastHost) return;
  const toast = h('div', { class: `toast ${kind}`, attrs: { role: kind === 'error' ? 'alert' : 'status' } });
  toast.innerHTML = icon(kind);
  toast.append(h('div', { class: 'toast-text' }, h('strong', { textContent: title }), body ? h('span', { textContent: body }) : null));
  toastHost.append(toast);
  window.setTimeout(() => {
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 250);
  }, kind === 'error' ? 6000 : 3500);
}

export const unreadCount = (): number => notes.filter((n) => !n.read).length;

/** The bell button, its unread badge and the dropdown list. */
export function createNotificationCenter(button: HTMLButtonElement, badge: HTMLElement, panel: HTMLElement, toasts: HTMLElement): void {
  toastHost = toasts;

  const list = h('ul', { class: 'notif-list' });
  const markRead = h('button', { type: 'button', class: 'ghost', textContent: 'Mark all read' });
  const clear = h('button', { type: 'button', class: 'ghost', textContent: 'Clear' });
  panel.append(h('header', { class: 'notif-head' }, h('strong', { textContent: 'Notifications' }), h('div', {}, markRead, clear)), list);

  const render = () => {
    const unread = unreadCount();
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    button.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    if (notes.length === 0) {
      list.replaceChildren(h('li', { class: 'notif-empty', textContent: "You're all caught up." }));
      return;
    }
    list.replaceChildren(
      ...notes.map((n) => {
        const li = h('li', { class: `notif ${n.kind}${n.read ? '' : ' unread'}` });
        const ic = h('span', { class: 'notif-icon' });
        ic.innerHTML = icon(n.kind);
        li.append(ic, h('div', { class: 'notif-text' }, h('strong', { textContent: n.title }), n.body ? h('span', { textContent: n.body }) : null, h('time', { textContent: timeAgo(n.at) })));
        return li;
      }),
    );
  };

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      render();
      // Seen now: mark read after showing them as unread once.
      notes = notes.map((n) => ({ ...n, read: true }));
      save();
    }
  };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden !== false);
  });
  markRead.addEventListener('click', () => {
    notes = notes.map((n) => ({ ...n, read: true }));
    save();
    render();
  });
  clear.addEventListener('click', () => {
    notes = [];
    save();
    render();
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });

  listeners.add(() => {
    const unread = unreadCount();
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : String(unread);
  });
  render();
}
