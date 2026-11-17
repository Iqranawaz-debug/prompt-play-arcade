import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/overlays.css';
import type { GameSpec } from '../spec/schema';
import { GenerateFailure, fetchHealth, generateGame } from './api';
import { addGame, deleteGame, listGames, seedIfEmpty, type SavedGame } from './db';
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
const fullscreenBtn = $<HTMLButtonElement>('fullscreen');
const promptCounter = $('prompt-counter');
const libraryCount = $('library-count');
const stageSub = $('stage-sub');
const stageEmpty = $('stage-empty');
const frameWrap = $('frame-wrap');
const ideaChips = [...document.querySelectorAll<HTMLButtonElement>('#idea-chips button')];

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
  () => ({ muted: !getSettings().gameSound, maxZoom: getSettings().previewQuality === 'balanced' ? 1.25 : undefined }),
);

/** Keep the preview chrome in step with the player: buttons, empty state, glow and heading. */
function syncStageButtons(): void {
  restartBtn.disabled = !player.loaded;
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

function updateCounter(): void {
  const n = promptBox.value.length;
  promptCounter.textContent = `${n} / ${promptBox.maxLength}`;
  promptCounter.classList.toggle('near-limit', n > promptBox.maxLength * 0.9);
  form.classList.toggle('has-prompt', promptBox.value.trim().length >= 3);
}

/** Latest library contents, for the command palette. */
let allGames: SavedGame[] = [];

async function refreshLibrary(): Promise<void> {
  const games = await listGames();
  allGames = games;
  libraryCount.textContent = games.length === 1 ? '1 game' : `${games.length} games`;
  renderLibrary(libraryList, games, activeId, { play, remix, exportHtml, remove });
}

async function play(game: SavedGame): Promise<void> {
  activeId = game.id;
  setStageInfo(game);
  showStageError();
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
    const { spec, attempts } = await generateGame(prompt, base?.spec, {
      signal: controller.signal,
      onStatus: (p) => {
        const { phase, detail } = describeProgress(p, modelName);
        status.set(phase, detail, progressFor(p));
      },
    });
    const game = base
      ? await addGame(`Remix of "${base.title}": ${prompt}`, spec, base.id)
      : await addGame(prompt, spec);
    genNote.textContent = `Created "${spec.title}"${attempts > 1 ? ` after ${attempts} attempts` : ''}.`;
    notify('success', base ? 'Remix ready' : 'Game generated successfully', `"${spec.title}" is ready to play.`);
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
      id: 'remix', group: 'Create', title: current ? `Remix "${current.title}"` : 'Remix the current game', keywords: 'change edit modify',
      disabled: !current,
      run: () => current && remix(current),
    },
    {
      id: 'library', group: 'Navigate', title: 'Open library', keywords: 'games list browse',
      run: () => {
        const first = libraryList.querySelector<HTMLButtonElement>('.game button.primary');
        libraryList.scrollTo({ top: 0, behavior: 'smooth' });
        first?.focus();
      },
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
