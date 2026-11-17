import './style.css';
import { GenerateFailure, fetchHealth, generateGame } from './api';
import { addGame, deleteGame, listGames, seedIfEmpty, type SavedGame } from './db';
import { exportGame } from './export';
import { renderLibrary } from './library';
import { GamePlayer } from './player';
import { StatusBox, describeProgress } from './status';

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

const status = new StatusBox($('gen-status-box'), $('gen-phase'), $('gen-detail'));
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

const player = new GamePlayer($('stage-frame'), {
  onReady: () => showStageError(),
  onError: (message) => showStageError(message),
});

function syncStageButtons(): void {
  restartBtn.disabled = !player.loaded;
  fullscreenBtn.disabled = !player.loaded || !document.fullscreenEnabled;
  fullscreenBtn.textContent = player.isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
}

async function refreshLibrary(): Promise<void> {
  renderLibrary(libraryList, await listGames(), activeId, { play, remix, exportHtml, remove });
}

async function play(game: SavedGame): Promise<void> {
  activeId = game.id;
  stageTitle.textContent = game.title;
  showStageError();
  await refreshLibrary();
  libraryList.querySelector('.game.active')?.scrollIntoView({ block: 'nearest' });
  try {
    await player.play(game.spec);
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
  generateBtn.textContent = buttonLabel(false);
}

function remix(game: SavedGame): void {
  setRemixTarget(game);
  promptBox.value = '';
  promptBox.focus();
}

async function exportHtml(game: SavedGame): Promise<void> {
  try {
    await exportGame(game.spec);
  } catch (err) {
    showGenError('Export failed', (err as Error).message);
  }
}

async function remove(game: SavedGame): Promise<void> {
  await deleteGame(game.id);
  if (remixTarget?.id === game.id) setRemixTarget(undefined);
  if (activeId === game.id) {
    activeId = undefined;
    player.stop();
    stageTitle.textContent = 'No game selected';
    syncStageButtons();
  }
  await refreshLibrary();
}

function setBusy(busy: boolean): void {
  generateBtn.disabled = busy;
  promptBox.disabled = busy;
  remixBanner.querySelector('button')!.disabled = busy;
  generateBtn.textContent = buttonLabel(busy);
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
        status.set(phase, detail);
      },
    });
    const game = base
      ? await addGame(`Remix of "${base.title}": ${prompt}`, spec, base.id)
      : await addGame(prompt, spec);
    genNote.textContent = `Created "${spec.title}"${attempts > 1 ? ` after ${attempts} attempts` : ''}.`;
    promptBox.value = '';
    setRemixTarget(undefined);
    await play(game);
  } catch (err) {
    if (controller.signal.aborted) genNote.textContent = 'Cancelled.';
    else if (err instanceof GenerateFailure) showGenError(err.title, err.message);
    else showGenError(base ? 'Remix failed' : 'Generation failed', (err as Error).message);
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

async function init(): Promise<void> {
  syncStageButtons();
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
  modelChip.classList.toggle('warn', !health?.label);
}

init().catch((err) => showGenError('Could not start', (err as Error).message));
