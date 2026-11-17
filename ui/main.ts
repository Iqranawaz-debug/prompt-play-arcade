import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/overlays.css';
import type { GameSpec } from '../spec/schema';
import { GenerateFailure, enhancePrompt, fetchHealth, generateGame } from './api';
import { addGame, addVersion, currentVersionOf, deleteGame, listGames, markPlayed, restoreVersion, seedIfEmpty, setFavorite, type SavedGame } from './db';
import { createHistoryPanel } from './history';
import { decodeSpec, sharedFromHash } from './share';
import { createShareDialog } from './shareDialog';
import { createGameOptions } from './gameOptions';
import { GENRES } from './genre';
import { SORTS, filterCounts, queryGames, type LibraryFilter, type LibraryQuery, type LibrarySort } from './libraryQuery';
import { exportGame } from './export';
import { startAmbient } from './ambient';
import { createSettingsDrawer } from './drawer';
import { createNotificationCenter, notify } from './notifications';
import { createCommandPalette, type Command } from './palette';
import { THEMES, applySettings, getSettings, motionReduced, onSettings, updateSettings } from './settings';
import { setButtonLabel } from './icons';
import { renderLibrary } from './library';
import { GamePlayer } from './player';
import type { GameStatus } from '../engine/status';
import { StatusBox, describeProgress, progressFor } from './status';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('gen-form');
const promptBox = $<HTMLTextAreaElement>('prompt');
const promptLabel = $('prompt-label');
const generateBtn = $<HTMLButtonElement>('generate');
const genNote = $('gen-note');
const genError = $('gen-error');
const genErrorTitle = $('gen-error-title');
const genErrorText = $('gen-error-text');
const remixBanner = $('remix-banner');
const remixLabel = $('remix-label');
const modelChip = $('model-chip');
const libraryList = $('library');
const stageTitle = $('stage-title');
const stageError = $('stage-error');
const restartBtn = $<HTMLButtonElement>('restart');
const historyBtn = $<HTMLButtonElement>('history');
const shareBtn = $<HTMLButtonElement>('share');
const sharedBanner = $('shared-banner');
/** A game opened from a share link that is not (yet) in the library. */
let sharedSpec: GameSpec | undefined;
const fullscreenBtn = $<HTMLButtonElement>('fullscreen');
const promptCounter = $('prompt-counter');
const libraryCount = $('library-count');
const stageSub = $('stage-sub');
const stageEmpty = $('stage-empty');
const frameWrap = $('frame-wrap');
const ideaChips = [...document.querySelectorAll<HTMLButtonElement>('#idea-chips button')];

const gameOptions = createGameOptions($('game-options'));
const status = new StatusBox($('gen-status-box'), $('gen-phase'), $('gen-detail'), $('gen-progress'));
const DEFAULT_PLACEHOLDER = promptBox.placeholder;
let activeId: string | undefined;
/** When set, the prompt box describes changes to this game instead of a new idea. */
let remixTarget: SavedGame | undefined;
/** Aborts the generation in progress, if any. */
let inFlight: AbortController | undefined;
let modelName = 'the model';

function showGenError(title?: string, message?: string): void {
  genError.hidden = !title;
  genErrorTitle.textContent = title ?? '';
  genErrorText.textContent = message ?? '';
}

function showStageError(message?: string): void {
  stageError.hidden = !message;
  stageError.textContent = message ?? '';
}

const gameStatus = $('game-status');
const gameStats = $('game-stats');
const statScore = $('stat-score');
const statTarget = $('stat-target');
const statLivesFull = $('stat-lives-full');
const statLivesEmpty = $('stat-lives-empty');
const PHASE_LABEL = { idle: 'Idle', loading: 'Loading', intro: 'Ready', playing: 'Live', won: 'Won', lost: 'Game over' } as const;
let lastScore = 0;

/** Live HUD badges above the preview, fed by the running game (see engine/status.ts). */
function showGameStatus(s: GameStatus | 'loading' | undefined): void {
  const phase = s === undefined ? 'idle' : s === 'loading' ? 'loading' : s.phase;
  gameStatus.dataset.phase = phase;
  currentPhase = phase;
  gameStatus.textContent = PHASE_LABEL[phase];
  libraryList.querySelector('.game.active')?.setAttribute('data-phase', phase);
  gameStats.hidden = typeof s !== 'object';
  if (typeof s !== 'object') return;
  statScore.textContent = String(s.score);
  statTarget.textContent = s.target !== undefined ? ` / ${s.target}` : '';
  statLivesFull.textContent = '♥'.repeat(s.lives);
  statLivesEmpty.textContent = '♥'.repeat(Math.max(0, s.maxLives - s.lives));
  if (s.score > lastScore) {
    // Restart the bump animation on each gain.
    gameStats.classList.remove('bump');
    void gameStats.offsetWidth;
    gameStats.classList.add('bump');
  }
  lastScore = s.score;
}

const player = new GamePlayer(
  $('stage-frame'),
  {
    onReady: () => showStageError(),
    onError: (message) => showStageError(message),
    onStatus: (s) => showGameStatus(s),
    onShortcut: () => palette.open(),
  },
  () => ({
    // Muted if sound is off in Settings, or this game was generated as a quiet game.
    muted: !getSettings().gameSound || allGames.find((g) => g.id === activeId)?.options?.sound === false,
    maxZoom: getSettings().previewQuality === 'balanced' ? 1.25 : undefined,
  }),
);

/** Keep the preview chrome in step with the player: buttons, empty state, glow and heading. */
function syncStageButtons(): void {
  restartBtn.disabled = !player.loaded;
  historyBtn.disabled = !player.loaded || !activeId;
  shareBtn.disabled = !player.loaded;
  sharedBanner.hidden = !sharedSpec || !player.loaded;
  const versions = allGames.find((g) => g.id === activeId)?.versions?.length ?? 0;
  setButtonLabel(historyBtn, versions > 1 ? `History · ${versions}` : 'History');
  fullscreenBtn.disabled = !player.loaded || !document.fullscreenEnabled;
  setButtonLabel(fullscreenBtn, player.isFullscreen ? 'Exit fullscreen' : 'Fullscreen');
  stageEmpty.hidden = player.loaded;
}

/** Tint the preview's heading and ambient glow with the game's own theme (or the app accents when empty). */
function setStageInfo(game?: { title: string; spec: GameSpec }): void {
  stageTitle.textContent = game?.title ?? 'No game selected';
  stageSub.textContent = game?.spec.description || 'Preview';
  stageSub.title = game?.spec.description ?? '';
  frameWrap.style.setProperty('--glow-a', game?.spec.theme.primary ?? 'var(--accent)');
  frameWrap.style.setProperty('--glow-b', game?.spec.theme.accent ?? 'var(--violet)');
}

// ---------- AI prompt enhancer ----------
const enhanceBtn = $<HTMLButtonElement>('enhance');
const enhanceNote = $('enhance-note');
let beforeEnhance: string | undefined;
let enhancing: AbortController | undefined;

async function enhance(): Promise<void> {
  const idea = promptBox.value.trim();
  if (idea.length < 3 || enhancing || inFlight) return;
  const controller = new AbortController();
  enhancing = controller;
  showGenError();
  enhanceNote.hidden = true;
  enhanceBtn.classList.add('working');
  setButtonLabel(enhanceBtn, 'Enhancing…');
  promptBox.disabled = true;
  updateCounter();
  try {
    const better = await enhancePrompt(idea, gameOptions.get(), controller.signal);
    beforeEnhance = promptBox.value;
    promptBox.value = better;
    enhanceNote.hidden = false;
    notify('success', 'Prompt enhanced', 'Review it, tweak anything, then Generate.');
  } catch (err) {
    if (!controller.signal.aborted) {
      const title = err instanceof GenerateFailure ? err.title : 'Could not enhance the prompt';
      showGenError(title, (err as Error).message);
    }
  } finally {
    enhancing = undefined;
    enhanceBtn.classList.remove('working');
    setButtonLabel(enhanceBtn, 'Enhance');
    promptBox.disabled = Boolean(inFlight);
    updateCounter();
    promptBox.focus();
  }
}

enhanceBtn.addEventListener('click', () => void enhance());
$('enhance-undo').addEventListener('click', () => {
  if (beforeEnhance !== undefined) promptBox.value = beforeEnhance;
  beforeEnhance = undefined;
  enhanceNote.hidden = true;
  updateCounter();
  promptBox.focus();
});

function updateCounter(): void {
  const n = promptBox.value.length;
  promptCounter.textContent = `${n} / ${promptBox.maxLength}`;
  promptCounter.classList.toggle('near-limit', n > promptBox.maxLength * 0.9);
  form.classList.toggle('has-prompt', promptBox.value.trim().length >= 3);
  enhanceBtn.disabled = promptBox.value.trim().length < 3 || Boolean(enhancing) || Boolean(inFlight);
}

/** Latest library contents (unfiltered), also used by the command palette. */
let allGames: SavedGame[] = [];

// ---------- Smart library: search, filters, sort (remembered per browser) ----------
const librarySearch = $<HTMLInputElement>('library-search');
const librarySort = $<HTMLSelectElement>('library-sort');
const libraryFilters = $('library-filters');
const LIBRARY_KEY = 'gg.library.v1';
const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: '★ Favorites' },
  { id: 'recent', label: 'Recently played' },
  ...GENRES.map((g) => ({ id: g.id as LibraryFilter, label: g.name })),
];
const libQuery: LibraryQuery = (() => {
  const fallback: LibraryQuery = { search: '', filter: 'all', sort: 'newest' };
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}') as Partial<LibraryQuery>;
    return {
      search: '',
      filter: FILTERS.some((f) => f.id === saved.filter) ? saved.filter! : fallback.filter,
      sort: SORTS.some((x) => x.id === saved.sort) ? saved.sort! : fallback.sort,
    };
  } catch {
    return fallback;
  }
})();
librarySort.append(...SORTS.map((x) => new Option(x.name, x.id)));
librarySort.value = libQuery.sort;

function setLibQuery(patch: Partial<LibraryQuery>): void {
  Object.assign(libQuery, patch);
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ filter: libQuery.filter, sort: libQuery.sort }));
  } catch {
    // not persisted; still applies now
  }
  renderLibraryView();
}

let currentPhase = 'idle';

function renderLibraryView(): void {
  const shown = queryGames(allGames, libQuery);
  const counts = filterCounts(allGames, libQuery.search);
  const filtered = libQuery.search.trim() !== '' || libQuery.filter !== 'all';
  libraryCount.textContent = filtered ? `${shown.length} of ${allGames.length}` : allGames.length === 1 ? '1 game' : `${allGames.length} games`;

  libraryFilters.replaceChildren(
    ...FILTERS.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = f.label;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(counts[f.id] ?? 0);
      b.append(count);
      b.setAttribute('aria-pressed', String(libQuery.filter === f.id));
      b.disabled = (counts[f.id] ?? 0) === 0 && libQuery.filter !== f.id && f.id !== 'all';
      b.addEventListener('click', () => setLibQuery({ filter: f.id }));
      return b;
    }),
  );

  renderLibrary(
    libraryList,
    shown,
    activeId,
    { play, remix, exportHtml, remove, toggleFavorite },
    allGames.length > 0
      ? { message: 'No games match your search and filters.', action: { label: 'Clear filters', run: () => ((librarySearch.value = ''), setLibQuery({ search: '', filter: 'all' })) } }
      : undefined,
  );
  libraryList.querySelector('.game.active')?.setAttribute('data-phase', currentPhase);
}

async function refreshLibrary(): Promise<void> {
  allGames = await listGames();
  renderLibraryView();
}

async function toggleFavorite(game: SavedGame): Promise<void> {
  await setFavorite(game.id, !game.favorite);
  await refreshLibrary();
}

let searchTimer: number | undefined;
librarySearch.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => setLibQuery({ search: librarySearch.value }), 80);
});
librarySort.addEventListener('change', () => setLibQuery({ sort: librarySort.value as LibrarySort }));

async function play(game: SavedGame): Promise<void> {
  activeId = game.id;
  sharedSpec = undefined;
  setStageInfo(game);
  showStageError();
  await markPlayed(game.id);
  await refreshLibrary();
  libraryList.querySelector('.game.active')?.scrollIntoView({ block: 'nearest' });
  try {
    lastScore = 0;
    await player.play(game.spec);
    // play() resolves once the frame is inserted, before the game inside it can report its first status.
    showGameStatus('loading');
  } catch (err) {
    showStageError((err as Error).message);
  }
  syncStageButtons();
}

function buttonLabel(busy: boolean): string {
  if (busy) return remixTarget ? 'Remixing…' : 'Generating…';
  return remixTarget ? 'Remix' : 'Generate';
}

function setRemixTarget(game: SavedGame | undefined): void {
  remixTarget = game;
  remixBanner.hidden = !game;
  remixLabel.textContent = game ? `Remixing "${game.title}"` : '';
  promptLabel.textContent = game ? 'What should change?' : 'Describe a game';
  promptBox.placeholder = game ? 'e.g. make it night time and add a shark that chases you' : DEFAULT_PLACEHOLDER;
  form.classList.toggle('remixing', Boolean(game));
  setButtonLabel(generateBtn, buttonLabel(false));
}

function remix(game: SavedGame): void {
  setRemixTarget(game);
  promptBox.value = '';
  updateCounter();
  promptBox.focus();
}

async function exportHtml(game: SavedGame): Promise<void> {
  try {
    await exportGame(game.spec);
    notify('success', 'Export completed', `"${game.title}" saved as a standalone .html file.`);
  } catch (err) {
    showGenError('Export failed', (err as Error).message);
    notify('error', 'Export failed', (err as Error).message);
  }
}

async function remove(game: SavedGame): Promise<void> {
  await deleteGame(game.id);
  notify('info', 'Game deleted', `"${game.title}" was removed from your library.`);
  if (remixTarget?.id === game.id) setRemixTarget(undefined);
  if (activeId === game.id) {
    activeId = undefined;
    player.stop();
    setStageInfo();
    syncStageButtons();
  }
  await refreshLibrary();
}

function setBusy(busy: boolean): void {
  generateBtn.disabled = busy;
  promptBox.disabled = busy;
  remixBanner.querySelector('button')!.disabled = busy;
  for (const chip of ideaChips) chip.disabled = busy;
  gameOptions.setDisabled(busy);
  enhanceBtn.disabled = busy || promptBox.value.trim().length < 3;
  if (busy) enhanceNote.hidden = true;
  setButtonLabel(generateBtn, buttonLabel(busy));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (inFlight) return;
  const prompt = promptBox.value.trim();
  if (prompt.length < 3) {
    showGenError('Add a bit more detail', 'Describe your game in a few more words.');
    return;
  }
  showGenError();
  genNote.textContent = '';
  const base = remixTarget;
  const controller = new AbortController();
  inFlight = controller;
  setBusy(true);
  status.start(base ? 'Remixing…' : 'Generating…', `Asking ${modelName}`);
  try {
    const chosen = gameOptions.get();
    const { spec, attempts } = await generateGame(prompt, base?.spec, {
      options: chosen,
      signal: controller.signal,
      onStatus: (p) => {
        const { phase, detail } = describeProgress(p, modelName);
        status.set(phase, detail, progressFor(p));
      },
    });
    // A remix becomes the next version of the same game (or a new game if the original was deleted meanwhile).
    const versioned = base ? await addVersion(base.id, spec, prompt) : undefined;
    const game =
      versioned ??
      (base ? await addGame(`Remix of "${base.title}": ${prompt}`, spec, { remixOf: base.id }) : await addGame(prompt, spec, { options: chosen }));
    const tries = attempts > 1 ? ` after ${attempts} attempts` : '';
    if (versioned) {
      const n = currentVersionOf(versioned);
      genNote.textContent = `Saved version ${n} of "${spec.title}"${tries}.`;
      notify('success', `Version ${n} saved`, `"${spec.title}": ${prompt}`);
    } else {
      genNote.textContent = `Created "${spec.title}"${tries}.`;
      notify('success', base ? 'Remix ready' : 'Game generated successfully', `"${spec.title}" is ready to play.`);
    }
    promptBox.value = '';
    updateCounter();
    setRemixTarget(undefined);
    await play(game);
  } catch (err) {
    if (controller.signal.aborted) {
      genNote.textContent = 'Cancelled.';
      notify('info', 'Generation cancelled');
    } else {
      const title = err instanceof GenerateFailure ? err.title : base ? 'Remix failed' : 'Generation failed';
      showGenError(title, (err as Error).message);
      notify('error', title, (err as Error).message);
    }
  } finally {
    inFlight = undefined;
    status.stop();
    setBusy(false);
  }
});

$('gen-cancel').addEventListener('click', () => inFlight?.abort());
$('gen-error-close').addEventListener('click', () => showGenError());
$('remix-cancel').addEventListener('click', () => setRemixTarget(undefined));

restartBtn.addEventListener('click', () => {
  showStageError();
  player.restart().catch((err: Error) => showStageError(err.message));
});
fullscreenBtn.addEventListener('click', () => {
  player.toggleFullscreen().catch((err: Error) => showStageError(`Fullscreen unavailable: ${err.message}`));
});
document.addEventListener('fullscreenchange', syncStageButtons);

promptBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
});
promptBox.addEventListener('input', updateCounter);

// "Try an idea" chips in the empty state fill the prompt box with a new-game idea.
for (const chip of ideaChips) {
  chip.addEventListener('click', () => {
    setRemixTarget(undefined);
    promptBox.value = chip.dataset.idea ?? '';
    updateCounter();
    promptBox.focus();
  });
}

applySettings();
createNotificationCenter($<HTMLButtonElement>('open-notifications'), $('notif-count'), $('notif-panel'), $('toasts'));

/** Everything the command palette can do, built from current state each time it opens. */
function commands(): Command[] {
  const current = allGames.find((g) => g.id === activeId);
  const settings = getSettings();
  const list: Command[] = [
    {
      id: 'new', group: 'Create', title: 'Create new game', hint: 'Describe it', keywords: 'generate prompt start',
      run: () => {
        setRemixTarget(undefined);
        promptBox.focus();
        promptBox.select();
      },
    },
    {
      id: 'generate', group: 'Create', title: 'Generate from the current prompt', hint: 'Ctrl+Enter', keywords: 'make build',
      disabled: promptBox.value.trim().length < 3 || Boolean(inFlight),
      run: () => form.requestSubmit(),
    },
    {
      id: 'enhance', group: 'Create', title: 'Enhance prompt with AI', keywords: 'improve expand describe better idea',
      disabled: promptBox.value.trim().length < 3 || Boolean(inFlight) || Boolean(enhancing) || Boolean(remixTarget),
      run: () => void enhance(),
    },
    {
      id: 'remix', group: 'Create', title: current ? `Remix "${current.title}"` : 'Remix the current game', keywords: 'change edit modify',
      disabled: !current,
      run: () => current && remix(current),
    },
    {
      id: 'library', group: 'Navigate', title: 'Open library', hint: 'Search', keywords: 'games list browse search find',
      run: () => {
        libraryList.scrollTo({ top: 0, behavior: 'smooth' });
        librarySearch.focus();
        librarySearch.select();
      },
    },
    {
      id: 'favorites', group: 'Navigate', title: 'Show favorite games', keywords: 'star starred library',
      run: () => setLibQuery({ filter: 'favorites' }),
    },
    {
      id: 'recent', group: 'Navigate', title: 'Show recently played games', keywords: 'history library last',
      run: () => setLibQuery({ filter: 'recent' }),
    },
    { id: 'notifications', group: 'Navigate', title: 'Show notifications', keywords: 'bell alerts', run: () => $('open-notifications').click() },
    { id: 'settings', group: 'Settings', title: 'Manage settings', hint: 'Customize', keywords: 'preferences options customize', run: () => settingsDrawer.open() },
    ...THEMES.map<Command>((t) => ({
      id: `theme-${t.id}`, group: 'Theme', title: `Switch theme: ${t.name}`, keywords: 'colour color appearance accent',
      hint: settings.theme === t.id ? 'Current' : undefined,
      run: () => {
        updateSettings({ theme: t.id });
        notify('info', `Theme: ${t.name}`);
      },
    })),
    {
      id: 'sound', group: 'Settings', title: settings.gameSound ? 'Turn game sound off' : 'Turn game sound on', keywords: 'audio mute volume', hint: 'Next play',
      run: () => updateSettings({ gameSound: !settings.gameSound }),
    },
    {
      id: 'motion', group: 'Settings', title: motionReduced() ? 'Use full motion' : 'Reduce motion', keywords: 'animation accessibility',
      run: () => updateSettings({ motion: motionReduced() ? 'full' : 'reduced' }),
    },
    { id: 'export', group: 'Current game', title: current ? `Export "${current.title}"` : 'Export game', hint: '.html', keywords: 'download save file', disabled: !current, run: () => current && exportHtml(current) },
    {
      id: 'history', group: 'Current game', title: current ? `Version history of "${current.title}"` : 'Version history', keywords: 'versions restore undo previous remix',
      hint: current?.versions && current.versions.length > 1 ? `${current.versions.length} versions` : undefined,
      disabled: !current, run: () => current && historyPanel.open(current),
    },
    {
      id: 'share', group: 'Current game', title: 'Share this game', hint: 'Link or file', keywords: 'link send copy portfolio export',
      disabled: !player.loaded, run: () => shareBtn.click(),
    },
    { id: 'restart', group: 'Current game', title: 'Restart game', keywords: 'reload again replay', disabled: !player.loaded, run: () => restartBtn.click() },
    { id: 'fullscreen', group: 'Current game', title: 'Toggle fullscreen', keywords: 'full screen expand', disabled: !player.loaded, run: () => fullscreenBtn.click() },
    ...allGames.map<Command>((g) => ({
      id: `play-${g.id}`, group: 'Games', title: `Play "${g.title}"`, keywords: g.prompt, hint: g.id === activeId ? 'Playing' : undefined,
      run: () => void play(g),
    })),
  ];
  return list;
}

const palette = createCommandPalette($('overlays'), commands);

// ---------- Version history ----------
const historyPanel = createHistoryPanel($('overlays'), async (game, n) => {
  const restored = await restoreVersion(game.id, n);
  if (!restored) return;
  notify('success', `Restored version ${n}`, `"${restored.title}" is back to version ${n}.`);
  await play(restored);
});
// ---------- Sharing ----------
const shareDialog = createShareDialog($('overlays'));
const currentSpec = () => sharedSpec ?? allGames.find((g) => g.id === activeId)?.spec;
shareBtn.addEventListener('click', () => {
  const spec = currentSpec();
  if (spec) void shareDialog.open(spec);
});

/** Play a game from a share link without adding it to the library. */
async function playShared(spec: GameSpec): Promise<void> {
  activeId = undefined;
  sharedSpec = spec;
  setStageInfo({ title: spec.title, spec });
  showStageError();
  renderLibraryView();
  try {
    lastScore = 0;
    await player.play(spec);
    showGameStatus('loading');
  } catch (err) {
    showStageError((err as Error).message);
  }
  syncStageButtons();
}

async function openSharedFromHash(): Promise<void> {
  const encoded = sharedFromHash();
  if (!encoded) return;
  try {
    const spec = await decodeSpec(encoded);
    await playShared(spec);
    notify('info', 'Shared game opened', `"${spec.title}" is playing. Save it to keep it.`);
  } catch (err) {
    showStageError((err as Error).message);
    notify('error', 'Could not open shared game', (err as Error).message);
  }
}
window.addEventListener('hashchange', () => void openSharedFromHash());

$('save-shared').addEventListener('click', async () => {
  if (!sharedSpec) return;
  const game = await addGame(`Shared game: ${sharedSpec.title}`, sharedSpec);
  history.replaceState(null, '', location.pathname + location.search);
  notify('success', 'Saved to library', `"${game.title}" is now in your library.`);
  await play(game);
});

historyBtn.addEventListener('click', () => {
  const game = allGames.find((g) => g.id === activeId);
  if (game) historyPanel.open(game);
});
$('open-palette').addEventListener('click', () => palette.open());
const settingsDrawer = createSettingsDrawer($('overlays'));
$('open-settings').addEventListener('click', () => settingsDrawer.open());

async function init(): Promise<void> {
  startAmbient($<HTMLCanvasElement>('ambient-stars'));
  // The 3D controller is code-split: Three.js loads in the background after the UI is up.
  // The 3D controller is code-split: Three.js loads in the background, only if enabled in Settings.
  let unmount3d: (() => void) | undefined;
  onSettings((s) => {
    const holder = $('empty-3d');
    if (s.controller3d && !unmount3d) {
      unmount3d = () => {}; // reserve while loading
      import('./controller3d')
        .then(({ mountController }) => {
          if (!getSettings().controller3d) return void (unmount3d = undefined);
          unmount3d = mountController(holder);
          holder.parentElement!.classList.toggle('has-3d', Boolean(unmount3d));
        })
        .catch(() => (unmount3d = undefined));
    } else if (!s.controller3d && unmount3d) {
      unmount3d();
      unmount3d = undefined;
      holder.parentElement!.classList.remove('has-3d');
    }
  });
  syncStageButtons();
  setStageInfo();
  updateCounter();
  await seedIfEmpty();
  await refreshLibrary();
  await openSharedFromHash();
  const health = await fetchHealth();
  if (health?.label) modelName = health.label;
  modelChip.textContent = !health ? 'Server offline' : (health.label ?? 'No API key');
  modelChip.title = !health
    ? 'Saved games still play. Start the server with "npm run dev" to generate.'
    : health.provider
      ? `Provider: ${health.provider}`
      : 'Add LLM_API_KEY to .env to generate games.';
  modelChip.classList.toggle('ok', Boolean(health?.label));
  modelChip.classList.toggle('warn', Boolean(health) && !health?.label);
  modelChip.classList.toggle('offline', !health);
}

init().catch((err) => showGenError('Could not start', (err as Error).message));
