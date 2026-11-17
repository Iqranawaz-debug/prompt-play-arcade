import { runGame } from '../engine';
import { philosopherFishing } from '../spec/examples/philosopherFishing';

const parent = document.getElementById('game')!;
runGame(philosopherFishing, parent)
  .then((game) => {
    if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = game;
  })
  .catch((err: unknown) => {
    parent.textContent = `Could not start game: ${err instanceof Error ? err.message : String(err)}`;
  });
