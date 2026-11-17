import { createModal, h, type Modal } from './modal';

export interface Command {
  id: string;
  title: string;
  group: string;
  /** Extra words to match, e.g. "dark colours" for a theme. */
  keywords?: string;
  /** Right-aligned hint, e.g. a shortcut or "Current". */
  hint?: string;
  disabled?: boolean;
  run(): void;
}

/** Score how well `query` matches `text`: substring beats in-order letters; 0 means no match. */
export function matchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at === 0) return 100;
  if (at > 0) return 80 - Math.min(40, at) + (t[at - 1] === ' ' ? 10 : 0);
  let i = 0;
  let gaps = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    else if (i > 0) gaps++;
    if (i === q.length) return Math.max(1, 30 - gaps);
  }
  return 0;
}

/** Ctrl/Cmd+K command palette. `getCommands` is called each time it opens, so the list is always current. */
export function createCommandPalette(host: HTMLElement, getCommands: () => Command[]): Modal {
  const input = h('input', {
    type: 'text',
    placeholder: 'Type a command or search your games…',
    autocomplete: 'off',
    spellcheck: false,
    attrs: { role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-label': 'Command' },
  });
  const list = h('ul', { id: 'palette-list', class: 'palette-list', attrs: { role: 'listbox' } });
  const panel = h(
    'div',
    { class: 'palette glass', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' } },
    h('div', { class: 'palette-search' }, searchIcon(), input, h('kbd', { textContent: 'Esc' })),
    list,
    h(
      'footer',
      { class: 'palette-foot' },
      h('span', {}, h('kbd', { textContent: '↑' }), h('kbd', { textContent: '↓' }), ' navigate'),
      h('span', {}, h('kbd', { textContent: 'Enter' }), ' run'),
    ),
  );
  host.append(panel);

  let commands: Command[] = [];
  let visible: Command[] = [];
  let active = 0;

  const render = () => {
    const q = input.value;
    visible = commands
      .map((c) => ({ c, score: Math.max(matchScore(q, c.title), matchScore(q, `${c.group} ${c.keywords ?? ''}`) * 0.6) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => (q.trim() ? b.score - a.score : 0))
      .map((x) => x.c);
    active = Math.min(active, Math.max(0, visible.length - 1));
    if (visible.length === 0) {
      list.replaceChildren(h('li', { class: 'palette-empty', textContent: 'No matching commands' }));
      input.removeAttribute('aria-activedescendant');
      return;
    }
    let lastGroup = '';
    const items: HTMLElement[] = [];
    visible.forEach((c, i) => {
      if (!input.value.trim() && c.group !== lastGroup) {
        items.push(h('li', { class: 'palette-group', textContent: c.group, attrs: { role: 'presentation' } }));
        lastGroup = c.group;
      }
      const li = h(
        'li',
        {
          id: `cmd-${i}`,
          class: `palette-item${i === active ? ' active' : ''}${c.disabled ? ' disabled' : ''}`,
          attrs: { role: 'option', 'aria-selected': String(i === active), 'aria-disabled': String(Boolean(c.disabled)) },
        },
        h('span', { class: 'palette-title', textContent: c.title }),
        c.hint ? h('span', { class: 'palette-hint', textContent: c.hint }) : null,
      );
      li.addEventListener('mousemove', () => {
        if (active !== i) {
          active = i;
          render();
        }
      });
      li.addEventListener('click', () => run(i));
      items.push(li);
    });
    list.replaceChildren(...items);
    input.setAttribute('aria-activedescendant', `cmd-${active}`);
    list.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  };

  const run = (i: number) => {
    const cmd = visible[i];
    if (!cmd || cmd.disabled) return;
    modal.close();
    cmd.run();
  };

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (visible.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(active);
    }
  });

  const modal = createModal(panel, {
    onOpen: () => {
      commands = getCommands();
      input.value = '';
      active = 0;
      render();
    },
    initialFocus: () => input,
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal.isOpen) modal.close();
      else modal.open();
    }
  });
  return modal;
}

function searchIcon(): SVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  return wrap.firstElementChild as SVGElement;
}
