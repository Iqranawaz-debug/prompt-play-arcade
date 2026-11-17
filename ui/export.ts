import type { GameSpec } from '../spec/schema';
import { buildGameHtml, loadEngineSource } from './gameHtml';

export const fileNameFor = (title: string): string =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'game'}.html`;

/** Download the game as one standalone .html file that runs offline in any browser. */
export async function exportGame(spec: GameSpec): Promise<void> {
  const html = buildGameHtml(spec, await loadEngineSource());
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(spec.title);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
