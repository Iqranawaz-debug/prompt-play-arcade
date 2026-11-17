# Game Generator

Describe a game in words. An LLM designs it as a JSON spec (with SVG sprites), and a fixed Phaser engine
plays it in a sandboxed iframe. Games are saved locally in IndexedDB.

## Run

```bash
npm install
cp .env.example .env   # then set LLM_API_KEY (Gemini) and/or FALLBACK_API_KEY (Groq, Mistral, ...)
npm run dev            # engine watcher + Vite (http://localhost:5173) + API proxy (127.0.0.1:8787)
```

Without a key the two built-in example games still play; only Generate/Remix need the server.

| Script | What it does |
| --- | --- |
| `npm run dev` | Everything for development |
| `npm test` | Vitest unit tests |
| `npm run build` | Typecheck, build `public/engine.js`, then the app into `dist/` |
| `npm start` | Serve `dist/` and the API from the Express server |

## How it fits together

- `spec/`: the Zod `GameSpecSchema` (the only contract between the LLM and the engine) plus two example specs.
- `generator/`: provider adapters (native Gemini, any OpenAI-compatible API, with fallback), the system prompt
  (JSON Schema plus both examples), and the validate-and-retry loop (up to 2 retries with the Zod errors sent back).
- `server/`: a small Express proxy. API keys stay here, read from `.env`.
- `engine/`: the Phaser runtime. It rasterises the SVG sprites, then handles controls, spawning, movement
  behaviors, collisions, score, win/lose and Web Audio sound effects. It is bundled into one script, `public/engine.js`.
- `ui/`: prompt box, IndexedDB library (Play / Remix / Export / Delete) and the sandboxed player.

Each game runs in an `<iframe sandbox="allow-scripts">` from a `srcdoc` document with a CSP that blocks all network
access. **Export** downloads that same document as one standalone `.html` file that works offline.

In game: arrow keys/WASD or drag to move, Space or click to start, M to toggle sound.
