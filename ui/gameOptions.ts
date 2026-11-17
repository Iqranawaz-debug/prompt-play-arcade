import { DEFAULT_OPTIONS, DIFFICULTIES, DURATIONS, GENRES, STYLES, GameOptionsSchema, type GameOptions } from '../spec/gameOptions';
import { h } from './modal';

const KEY = 'gg.genOptions.v1';

function load(): GameOptions {
  try {
    const parsed = GameOptionsSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    return parsed.success ? parsed.data : { ...DEFAULT_OPTIONS };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

const nameOf = (list: readonly { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id;

export function summarize(o: GameOptions): string {
  return [nameOf(GENRES, o.genre), nameOf(DIFFICULTIES, o.difficulty), nameOf(DURATIONS, o.duration), nameOf(STYLES, o.style), o.sound ? 'Sound on' : 'Quiet'].join(' · ');
}

export interface GameOptionsControl {
  get(): GameOptions;
  set(patch: Partial<GameOptions>): void;
  setVisible(visible: boolean): void;
  setDisabled(disabled: boolean): void;
}

/** "Game settings" row under the prompt: a one-line summary that expands into the choices. */
export function createGameOptions(host: HTMLElement): GameOptionsControl {
  let options = load();
  const controls: HTMLButtonElement[] = [];
  const renders: (() => void)[] = [];

  const summary = h('span', { class: 'options-summary' });
  const toggle = h(
    'button',
    { type: 'button', class: 'options-toggle', attrs: { 'aria-expanded': 'false', 'aria-controls': 'options-body' } },
    h('span', { class: 'options-label', textContent: 'Game settings' }),
    summary,
    h('span', { class: 'chevron', attrs: { 'aria-hidden': 'true' } }),
  );
  const body = h('div', { id: 'options-body', class: 'options-body', hidden: true });

  const update = (patch: Partial<GameOptions>) => {
    options = { ...options, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(options));
    } catch {
      // not remembered; still used now
    }
    summary.textContent = summarize(options);
    renders.forEach((r) => r());
  };

  const group = <K extends 'genre' | 'difficulty' | 'duration' | 'style'>(
    key: K,
    label: string,
    items: readonly { id: string; name: string; hint?: string }[],
    kind: 'chips' | 'segmented',
  ) => {
    const box = h('div', { class: kind === 'chips' ? 'option-chips' : 'segmented', attrs: { role: 'radiogroup', 'aria-label': label } });
    for (const item of items) {
      const b = h('button', { type: 'button', textContent: item.name, title: item.hint ?? '', attrs: { role: 'radio' } });
      b.addEventListener('click', () => update({ [key]: item.id } as Partial<GameOptions>));
      renders.push(() => b.setAttribute('aria-checked', String(options[key] === item.id)));
      controls.push(b);
      box.append(b);
    }
    return h('div', { class: 'option-field' }, h('span', { class: 'option-name', textContent: label }), box);
  };

  const sound = h('button', { type: 'button', class: 'switch', attrs: { role: 'switch', 'aria-label': 'Sound effects' } }, h('span', { class: 'knob' }));
  sound.addEventListener('click', () => update({ sound: !options.sound }));
  renders.push(() => sound.setAttribute('aria-checked', String(options.sound)));
  controls.push(sound);

  body.append(
    group('genre', 'Genre', GENRES, 'chips'),
    h('div', { class: 'option-pair' }, group('difficulty', 'Difficulty', DIFFICULTIES, 'segmented'), group('duration', 'Duration', DURATIONS, 'segmented')),
    group('style', 'Visual style', STYLES, 'chips'),
    h('div', { class: 'option-field inline' }, h('span', { class: 'option-name', textContent: 'Sound effects' }), sound),
  );
  host.append(toggle, body);

  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  update({});

  return {
    get: () => ({ ...options }),
    set: (patch) => update(patch),
    setVisible: (visible) => (host.hidden = !visible),
    setDisabled: (disabled) => controls.forEach((c) => (c.disabled = disabled)),
  };
}
