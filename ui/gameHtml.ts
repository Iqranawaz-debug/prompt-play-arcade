import type { GameSpec } from '../spec/schema';

/** The game page may run inline scripts and draw data: images, and nothing else: no network at all. */
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Build a complete, self-contained HTML document that runs `spec` with the bundled engine. */
export function buildGameHtml(spec: GameSpec, engineSrc: string): string {
  // Neither payload may close the <script> element it lives in.
  const specJson = JSON.stringify(spec).replace(/</g, '\\u003c');
  const engine = engineSrc.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escapeHtml(spec.title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:${spec.theme.background}}#game{width:100vw;height:100vh}</style>
</head>
<body>
<div id="game"></div>
<script>window.__GAME_SPEC__=${specJson};</script>
<script>${engine}</script>
</body>
</html>
`;
}

let engineSource: Promise<string> | undefined;

/** Fetch the prebuilt engine bundle once (built by `npm run build:engine`). */
export function loadEngineSource(): Promise<string> {
  engineSource ??= fetch('/engine.js').then((res) => {
    if (!res.ok) throw new Error('Engine bundle missing. Run "npm run build:engine".');
    return res.text();
  });
  engineSource.catch(() => (engineSource = undefined));
  return engineSource;
}
