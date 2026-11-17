import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/overlays.css';
import './styles/effects.css';
import type { GameSpec } from '../spec/schema';
import { GenerateFailure, enhancePrompt, fetchHealth, generateGame } from './api';
import { addGame, addVersion, currentVersionOf, deleteGame, listGames, listPlays, markPlayed, recordPlay, restoreVersion, seedIfEmpty, setFavorite, type SavedGame } from './db';
import { compact, personalBest } from './stats';
import { createStatsPanel } from './statsPanel';
import { createHistoryPanel } from './history';
import type { StudioContext } from './studio/context';
import { createStoryboard } from './studio/storyboard';
import { keyLabel } from '../spec/controls';
import { createCharacterCreator } from './studio/character';
import { createDebugger } from './studio/debugger';
import { createSoundDesigner } from './studio/sound';
import { createPhysicsSettings } from './studio/physics';
import { createAnimationStudio } from './studio/animation';
import { createLevelEditor } from './studio/levelEditor';
import { aiLevelPanel } from './studio/levelDesigner';
import { createLogicBuilder } from './studio/logic';
import { aiRulePanel } from './studio/ruleWriter';
import { createSavesDialog } from './savesDialog';
import type { SaveState } from '../spec/saveState';
import { createAssetStudio } from './studio/assets';
import { STUDIO_ICONS, createMenu, type MenuItem } from './menu';
import { decodeSpec, sharedFromHash } from './share';
import { createShareDialog } from './shareDialog';
import { createGameOptions } from './gameOptions';
import { GENRES } from './genre';
import { SORTS, filterCounts, queryGames, type LibraryFilter, type LibraryQuery, type LibrarySort } from './libraryQuery';
import { exportGame } from './export';
import { startAmbient } from './ambient';
import { startSpotlight } from './effects';
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
const savesBtn = $<HTMLButtonElement>('saves');
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
  document.documentElement.classList.toggle('game-running', phase === 'playing');
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
  void trackRound(s);
}

// ---------- Personal stats: record finished rounds of library games ----------
const statBestWrap = $('stat-best-wrap');
const statBest = $('stat-best');
let roundStartedAt: number | undefined;
let lastPhaseSeen: string | undefined;

async function showBest(gameId: string | undefined): Promise<void> {
  const best = gameId ? personalBest(await listPlays(), gameId) : 0;
  statBestWrap.hidden = !gameId || best === 0;
  statBest.textContent = compact(best);
}

async function trackRound(s: GameStatus): Promise<void> {
  if (s.phase === lastPhaseSeen) return;
  lastPhaseSeen = s.phase;
  if (s.phase === 'playing') {
    roundStartedAt = Date.now();
    return;
  }
  if ((s.phase !== 'won' && s.phase !== 'lost') || roundStartedAt === undefined) return;
  const durationMs = Date.now() - roundStartedAt;
  roundStartedAt = undefined;
  const game = allGames.find((g) => g.id === activeId);
  if (!game) return; // shared games that were not saved are not tracked
  const previousBest = personalBest(await listPlays(), game.id);
  await recordPlay({ gameId: game.id, title: game.title, result: s.phase, score: s.score, durationMs, endedAt: Date.now() });
  if (s.score > previousBest && previousBest > 0) notify('success', 'New personal best!', `${compact(s.score)} in "${game.title}" (was ${compact(previousBest)}).`);
  await showBest(game.id);
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
    keys: getSettings().keys,
  }),
);

/** Keep the preview chrome in step with the player: buttons, empty state, glow and heading. */
function syncStageButtons(): void {
  restartBtn.disabled = !player.loaded;
  historyBtn.disabled = !player.loaded || !activeId;
  savesBtn.disabled = !player.loaded || !activeId;
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
const storyboardBtn = $<HTMLButtonElement>('storyboard');
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
  storyboardBtn.disabled = enhanceBtn.disabled;
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

async function play(game: SavedGame, resume?: SaveState): Promise<void> {
  activeId = game.id;
  sharedSpec = undefined;
  setStageInfo(game);
  showStageError();
  await markPlayed(game.id);
  await refreshLibrary();
  libraryList.querySelector('.game.active')?.scrollIntoView({ block: 'nearest' });
  try {
    lastScore = 0;
    roundStartedAt = undefined;
    lastPhaseSeen = undefined;
    void showBest(game.id);
    await player.play(game.spec, { resume });
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
  storyboardBtn.disabled = enhanceBtn.disabled;
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

/** Key hints under the preview follow the player's bindings. */
onSettings(({ keys }) => {
  const kbd = (code: string) => `<kbd>${keyLabel(code).replace(/[<>&]/g, '')}</kbd>`;
  $('stage-hint').innerHTML =
    `<span>${kbd(keys.left[0])} ${kbd(keys.right[0])} or drag to move</span>` +
    `<span>${kbd(keys.up[0])} jump in platformers</span>` +
    `<span>${kbd(keys.start[0])} to start</span><span>${kbd(keys.sound[0])} sound</span>`;
});
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
      id: 'storyboard', group: 'Create', title: 'Plan a storyboard first', keywords: 'story characters levels plan design objectives',
      disabled: promptBox.value.trim().length < 3 || Boolean(inFlight) || Boolean(remixTarget),
      run: () => storyboardTool.open(promptBox.value.trim()),
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
    { id: 'assets', group: 'Studio', title: 'Asset Studio', keywords: 'sprites colours colors theme images art redraw upload svg', disabled: !current, run: () => assetTool.open() },
    { id: 'logic-builder', group: 'Studio', title: 'Logic Builder', keywords: 'rules logic events triggers when then visual scripting', disabled: !current, run: () => logicTool.open() },
    { id: 'level-editor', group: 'Studio', title: 'Level Editor', keywords: 'map tiles walls levels world generator procedural maze', disabled: !current, run: () => levelTool.open() },
    { id: 'animation-studio', group: 'Studio', title: 'Animation Studio', keywords: 'animate frames motion sprite bob walk', disabled: !current, run: () => animationTool.open() },
    { id: 'physics-settings', group: 'Studio', title: 'Physics Settings', keywords: 'gravity jump platformer movement speed friction', disabled: !current, run: () => physicsTool.open() },
    { id: 'sound-designer', group: 'Studio', title: 'Sound Designer', keywords: 'music audio sfx soundtrack effects', disabled: !current, run: () => soundTool.open() },
    { id: 'debug', group: 'Studio', title: 'Debug this game', keywords: 'bug problem broken fix help not working', disabled: !current, run: () => debugTool.open() },
    { id: 'character', group: 'Studio', title: 'Character Creator', keywords: 'hero player sprite create design avatar', run: () => characterTool.open() },
    { id: 'stats', group: 'Navigate', title: 'Stats & personal bests', keywords: 'leaderboard high score scores playtime trophy', run: () => void statsPanel.open() },
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
    { id: 'save-state', group: 'Current game', title: 'Save game state', hint: 'Keep this round', keywords: 'save progress checkpoint quicksave', disabled: !player.loaded || currentPhase !== 'playing', run: () => void savesTool.saveNow() },
    { id: 'open-saves', group: 'Current game', title: 'Load a saved game', keywords: 'saves load resume continue checkpoint', disabled: !player.loaded || !activeId, run: () => void savesTool.open() },
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
    roundStartedAt = undefined;
    lastPhaseSeen = undefined;
    void showBest(undefined);
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

// ---------- Studio tools ----------
const studio: StudioContext = {
  current: () => allGames.find((g) => g.id === activeId),
  async applyVersion(spec, note) {
    if (!activeId) return;
    const game = await addVersion(activeId, spec, note);
    if (!game) return;
    notify('success', `Version ${currentVersionOf(game)} saved`, `"${game.title}": ${note}`);
    await play(game);
  },
  setPrompt(text) {
    setRemixTarget(undefined);
    promptBox.value = text;
    updateCounter();
    promptBox.focus();
  },
  generate: () => form.requestSubmit(),
  gameOptions: () => gameOptions.get(),
};
const storyboardTool = createStoryboard($('overlays'), studio);
storyboardBtn.addEventListener('click', () => storyboardTool.open(promptBox.value.trim()));
const characterTool = createCharacterCreator($('overlays'), studio);
const debugTool = createDebugger($('overlays'), studio);
const soundTool = createSoundDesigner($('overlays'), studio);
const assetTool = createAssetStudio($('overlays'), studio);
const physicsTool = createPhysicsSettings($('overlays'), studio);
const animationTool = createAnimationStudio($('overlays'), studio);
const levelTool = createLevelEditor($('overlays'), studio, aiLevelPanel);
const logicTool = createLogicBuilder($('overlays'), studio, aiRulePanel);
const noGame = () => !studio.current();

/** Studio menu entries; later tools add themselves here. */
const studioItems: MenuItem[] = [
  { label: 'Character Creator', hint: 'Describe a hero; get a sprite and stats', icon: STUDIO_ICONS.character, run: () => characterTool.open() },
  { label: 'Asset Studio', hint: 'Colours and sprites: resize, redraw, upload', icon: STUDIO_ICONS.assets, run: () => assetTool.open(), disabled: noGame },
  { label: 'Logic Builder', hint: 'When / If / Then rules that change the game as you play', icon: STUDIO_ICONS.logic, run: () => logicTool.open(), disabled: noGame },
  { label: 'Level Editor', hint: 'Paint maps, generate worlds, design levels with AI', icon: STUDIO_ICONS.levels, run: () => levelTool.open(), disabled: noGame },
  { label: 'Animation Studio', hint: 'Idle and move motions, AI-drawn frames', icon: STUDIO_ICONS.animation, run: () => animationTool.open(), disabled: noGame },
  { label: 'Physics Settings', hint: 'Movement, gravity, jumping; make it a platformer', icon: STUDIO_ICONS.physics, run: () => physicsTool.open(), disabled: noGame },
  { label: 'Sound Designer', hint: 'Background music and collision sounds', icon: STUDIO_ICONS.sound, run: () => soundTool.open(), disabled: noGame },
  { label: 'Debug this game', hint: 'Describe a problem; get a diagnosis and fix', icon: STUDIO_ICONS.debug, run: () => debugTool.open(), disabled: noGame },
];
createMenu($<HTMLButtonElement>('studio'), $('studio-menu'), studioItems);

// ---------- Stats ----------
const statsPanel = createStatsPanel($('overlays'), () => allGames);
$('open-stats').addEventListener('click', () => void statsPanel.open());

const savesTool = createSavesDialog($('overlays'), {
  current: () => allGames.find((g) => g.id === activeId),
  playing: () => currentPhase === 'playing',
  snapshot: () => player.snapshot(),
  resume: (game, state) => play(game, state),
});
savesBtn.addEventListener('click', () => void savesTool.open());

historyBtn.addEventListener('click', () => {
  const game = allGames.find((g) => g.id === activeId);
  if (game) historyPanel.open(game);
});
$('open-palette').addEventListener('click', () => palette.open());
const settingsDrawer = createSettingsDrawer($('overlays'));
$('open-settings').addEventListener('click', () => settingsDrawer.open());

async function init(): Promise<void> {
  startAmbient($<HTMLCanvasElement>('ambient-stars'));
  startSpotlight();
  // 3D ambient objects: also code-split, loaded only while enabled in Settings.
  let unmountAmbient3d: (() => void) | undefined;
  onSettings((st) => {
    const host = document.querySelector<HTMLElement>('.ambient')!;
    if (st.ambient3d && !unmountAmbient3d) {
      unmountAmbient3d = () => {};
      import('./ambient3d')
        .then(({ mountAmbient3d }) => {
          if (!getSettings().ambient3d) return void (unmountAmbient3d = undefined);
          unmountAmbient3d = mountAmbient3d(host);
        })
        .catch(() => (unmountAmbient3d = undefined));
    } else if (!st.ambient3d && unmountAmbient3d) {
      unmountAmbient3d();
      unmountAmbient3d = undefined;
    }
  });
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

init()
  .catch((err) => showGenError('Could not start', (err as Error).message))
  // Marks startup as finished (library loaded, server checked); handy for automated checks.
  .finally(() => (document.documentElement.dataset.ready = 'true'));
