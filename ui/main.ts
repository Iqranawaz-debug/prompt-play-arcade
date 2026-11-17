import './style.css';
import { fetchHealth, generateGame } from './api';
import { addGame, deleteGame, listGames, seedIfEmpty, type SavedGame } from './db';
import { exportGame } from './export';
import { renderLibrary } from './library';
import { GamePlayer } from './player';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('gen-form');
const promptBox = $<HTMLTextAreaElement>('prompt');
const promptLabel = $('prompt-label');
const generateBtn = $<HTMLButtonElement>('generate');
const genStatus = $('gen-status');
const genError = $('gen-error');
const remixBanner = $('remix-banner');
const remixLabel = $('remix-label');
const providerStatus = $('provider-status');
const libraryList = $('library');
const stageTitle = $('stage-title');
const stageError = $('stage-error');

const DEFAULT_PLACEHOLDER = promptBox.placeholder;
let activeId: string | undefined;
/** When set, the prompt box describes changes to this game instead of a new idea. */
let remixTarget: SavedGame | undefined;

const showError = (el: HTMLElement, message?: string) => {
  el.hidden = !message;
  el.textContent = message ?? '';
};

const player = new GamePlayer($('stage-frame'), {
  onReady: () => showError(stageError),
  onError: (message) => showError(stageError, message),
});

async function refreshLibrary(): Promise<void> {
  renderLibrary(libraryList, await listGames(), activeId, { play, remix, exportHtml, remove });
}

async function play(game: SavedGame): Promise<void> {
  activeId = game.id;
  stageTitle.textContent = game.title;
  showError(stageError);
  await refreshLibrary();
  try {
    await player.play(game.spec);
  } catch (err) {
    showError(stageError, (err as Error).message);
  }
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
    showError(genError, (err as Error).message);
  }
}

async function remove(game: SavedGame): Promise<void> {
  await deleteGame(game.id);
  if (remixTarget?.id === game.id) setRemixTarget(undefined);
  if (activeId === game.id) {
    activeId = undefined;
    player.stop();
    stageTitle.textContent = 'No game selected';
  }
  await refreshLibrary();
}

function setBusy(busy: boolean): () => void {
  generateBtn.disabled = busy;
  promptBox.disabled = busy;
  generateBtn.classList.toggle('loading', busy);
  generateBtn.textContent = buttonLabel(busy);
  if (!busy) return () => {};
  const started = Date.now();
  const tick = () => (genStatus.textContent = `Designing your game… ${Math.round((Date.now() - started) / 1000)}s`);
  tick();
  const timer = window.setInterval(tick, 1000);
  return () => window.clearInterval(timer);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptBox.value.trim();
  if (prompt.length < 3) {
    showError(genError, 'Describe your game in a few more words.');
    return;
  }
  showError(genError);
  const base = remixTarget;
  const stopTimer = setBusy(true);
  try {
    const { spec, attempts } = await generateGame(prompt, base?.spec);
    const game = base
      ? await addGame(`Remix of "${base.title}": ${prompt}`, spec, base.id)
      : await addGame(prompt, spec);
    genStatus.textContent = `Created "${spec.title}"${attempts > 1 ? ` (after ${attempts} attempts)` : ''}.`;
    promptBox.value = '';
    setRemixTarget(undefined);
    await play(game);
  } catch (err) {
    genStatus.textContent = '';
    showError(genError, (err as Error).message);
  } finally {
    stopTimer();
    setBusy(false);
  }
});

$('remix-cancel').addEventListener('click', () => setRemixTarget(undefined));

promptBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
});

async function init(): Promise<void> {
  await seedIfEmpty();
  await refreshLibrary();
  const health = await fetchHealth();
  providerStatus.textContent = !health
    ? 'Server offline: saved games still play'
    : health.provider
      ? `Model: ${health.provider}`
      : 'No API key: add one to .env to generate';
  providerStatus.classList.toggle('warn', !health?.provider);
}

init().catch((err) => showError(genError, (err as Error).message));
