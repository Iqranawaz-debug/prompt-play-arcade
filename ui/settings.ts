/** Per-viewer preferences, kept in localStorage (they never leave this browser). */
import { DEFAULT_KEYS, normalizeKeyMap, type KeyMap } from '../spec/controls';

export const THEMES = [
  { id: 'ember', name: 'Ember', swatch: ['#ffb454', '#8f80f5'] },
  { id: 'nebula', name: 'Nebula', swatch: ['#b9a3ff', '#5ec8ff'] },
  { id: 'ocean', name: 'Ocean', swatch: ['#5eead4', '#8f80f5'] },
  { id: 'rose', name: 'Rose', swatch: ['#ff8fa3', '#8f80f5'] },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];

export interface Settings {
  theme: ThemeId;
  /** Game sound effects on by default when a game starts (M still toggles in game). */
  gameSound: boolean;
  /** 'system' follows the OS reduced-motion setting. */
  motion: 'system' | 'full' | 'reduced';
  ambient: boolean;
  controller3d: boolean;
  ambient3d: boolean;
  /** Spotlight, holographic sheen and animated borders. */
  effects: boolean;
  previewHints: boolean;
  previewGlow: boolean;
  /** Render resolution of games: sharp uses more GPU on large screens. */
  previewQuality: 'sharp' | 'balanced';
  /** Remapped game keys. */
  keys: KeyMap;
}

export const DEFAULTS: Settings = {
  theme: 'ember',
  gameSound: true,
  motion: 'system',
  ambient: true,
  controller3d: true,
  ambient3d: true,
  effects: true,
  previewHints: true,
  previewGlow: true,
  previewQuality: 'sharp',
  keys: DEFAULT_KEYS,
};

const KEY = 'gg.settings.v1';
export const SETTINGS_EVENT = 'gg:settings';

function read(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const merged = { ...DEFAULTS, ...raw };
    if (!THEMES.some((t) => t.id === merged.theme)) merged.theme = DEFAULTS.theme;
    merged.keys = normalizeKeyMap(raw.keys);
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();

export const getSettings = (): Settings => current;

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked (private mode etc.): settings still apply for this visit.
  }
  applySettings();
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: current }));
}

const systemReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/** True when animations should be reduced, from the setting or (by default) the OS. */
export function motionReduced(): boolean {
  return current.motion === 'reduced' || (current.motion === 'system' && systemReduce.matches);
}

/** Reflect settings on <html> so CSS can follow them. */
export function applySettings(): void {
  const root = document.documentElement;
  root.dataset.theme = current.theme;
  root.dataset.motion = motionReduced() ? 'reduced' : 'full';
  root.classList.toggle('no-ambient', !current.ambient);
  root.classList.toggle('no-effects', !current.effects);
  root.classList.toggle('no-hints', !current.previewHints);
  root.classList.toggle('no-glow', !current.previewGlow);
}

/** Run `fn` now and whenever settings (or the OS motion preference) change. */
export function onSettings(fn: (s: Settings) => void): () => void {
  const handler = () => fn(current);
  window.addEventListener(SETTINGS_EVENT, handler);
  systemReduce.addEventListener('change', handler);
  fn(current);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, handler);
    systemReduce.removeEventListener('change', handler);
  };
}

systemReduce.addEventListener('change', applySettings);
