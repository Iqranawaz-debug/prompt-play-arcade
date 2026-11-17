import './style.css';
import { fetchHealth, generateGame } from './api';
import { addGame, deleteGame, listGames, seedIfEmpty, type SavedGame } from './db';
import { renderLibrary } from './library';
import { GamePlayer } from './player';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('gen-form');
const promptBox = $<HTMLTextAreaElement>('prompt');
const generateBtn = $<HTMLButtonElement>('generate');
const genStatus = $('gen-status');
const genError = $('gen-error');
const providerStatus = $('provider-status');
const libraryList = $('library');
const stageTitle = $('stage-title');
const stageError = $('stage-error');

let activeId: string | undefined;

const showError = (el: HTMLElement, message?: string) => {
  el.hidden = !message;
  el.textContent = message ?? '';
};

const player = new GamePlayer($('stage-frame'), {
  onReady: () => showError(stageError),
  onError: (message) => showError(stageError, message),
});

async function refreshLibrary(): Promise<void> {
  renderLibrary(libraryList, await listGames(), activeId, { play, remix, remove });
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

function remix(game: SavedGame): void {
  promptBox.value = game.prompt;
  promptBox.focus();
  promptBox.setSelectionRange(promptBox.value.length, promptBox.value.length);
}

async function remove(game: SavedGame): Promise<void> {
  await deleteGame(game.id);
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
  generateBtn.textContent = busy ? 'Generating…' : 'Generate';
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
  const stopTimer = setBusy(true);
  try {
    const { spec, attempts } = await generateGame(prompt);
    const game = await addGame(prompt, spec);
    genStatus.textContent = `Created "${spec.title}"${attempts > 1 ? ` (after ${attempts} attempts)` : ''}.`;
    await play(game);
  } catch (err) {
    genStatus.textContent = '';
    showError(genError, (err as Error).message);
  } finally {
    stopTimer();
    setBusy(false);
  }
});

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
