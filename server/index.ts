import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { GameSpecSchema, SpriteSchema, formatIssues } from '../spec/schema';
import { GameOptionsSchema } from '../spec/gameOptions';
import { providerFromEnv } from '../generator/config';
import { GenerationError, generateFromIdea, generateRemix, type GenerateEvent, type GenerateOptions } from '../generator/generate';
import { ProviderError, isQuotaError, isTransientStatus, type ChatProvider } from '../generator/providers';
import { AskError } from '../generator/ask';
import { debugGame, makeCharacter, makeStoryboard, redrawSprite } from '../generator/tools';
import { enhanceIdea } from '../generator/enhance';

if (existsSync('.env')) process.loadEnvFile('.env');

const provider = providerFromEnv(process.env);
const app = express();
app.use(express.json({ limit: '256kb' }));

/** `base` is set when remixing: the prompt then describes changes to that spec. */
const GenerateBody = z.object({
  prompt: z.string().trim().min(3).max(2000),
  base: GameSpecSchema.optional(),
  /** Genre, difficulty, duration, style and sound chosen before generating (new games only). */
  options: GameOptionsSchema.optional(),
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: provider?.name ?? null, label: provider?.label ?? null });
});

/** Shared plumbing for the AI tool endpoints: provider check, input validation, cancel on disconnect, readable errors. */
function toolRoute<B extends z.ZodType>(path: string, body: B, run: (data: z.infer<B>, p: ChatProvider, signal: AbortSignal) => Promise<unknown>): void {
  app.post(path, async (req, res) => {
    if (!provider) {
      res.status(503).json({ error: 'No LLM provider configured. Copy .env.example to .env and set LLM_API_KEY.' });
      return;
    }
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid request:
${formatIssues(parsed.error)}` });
      return;
    }
    const cancel = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) cancel.abort(new Error('cancelled by client'));
    });
    const started = Date.now();
    try {
      res.json(await run(parsed.data, provider, cancel.signal));
      console.log(`[${path}] ok in ${Date.now() - started}ms`);
    } catch (err) {
      if (cancel.signal.aborted) return;
      const failure = describeFailure(err, provider.label);
      console.error(`[${path}] failed:`, (err as Error).message);
      const status = err instanceof ProviderError ? 502 : err instanceof AskError ? 422 : 500;
      res.status(status).json({ error: failure.message, title: failure.title });
    }
  });
}

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Rewrite a short idea into a richer game description. */
toolRoute('/api/enhance', z.object({ prompt: z.string().trim().min(3).max(2000), options: GameOptionsSchema.optional() }), async (b, p, signal) => ({
  prompt: await enhanceIdea(p, b.prompt, b.options, signal),
}));

/** Storyboard (story, characters, levels, objectives, obstacles, win/lose) before generating. */
toolRoute('/api/storyboard', z.object({ prompt: z.string().trim().min(3).max(2000), options: GameOptionsSchema.optional() }), (b, p, signal) =>
  makeStoryboard(p, b.prompt, b.options, signal),
);

/** Character from a description of appearance, personality, abilities and movement. */
toolRoute('/api/character', z.object({ description: z.string().trim().min(3).max(1200), background: Hex }), (b, p, signal) =>
  makeCharacter(p, b.description, b.background, signal),
);

/** Diagnose a reported problem against the game's spec and propose a fixed spec. */
toolRoute('/api/debug', z.object({ spec: GameSpecSchema, problem: z.string().trim().min(3).max(1200) }), (b, p, signal) =>
  debugGame(p, b.spec, b.problem, signal),
);

/** Redraw one sprite (Asset Studio). */
toolRoute('/api/sprite', z.object({ sprite: SpriteSchema, change: z.string().trim().min(3).max(600), background: Hex }), async (b, p, signal) => ({
  sprite: await redrawSprite(p, b.sprite, b.change, b.background, signal),
}));

app.post('/api/generate', async (req, res) => {
  if (!provider) {
    res.status(503).json({ error: 'No LLM provider configured. Copy .env.example to .env and set LLM_API_KEY.' });
    return;
  }
  const body = GenerateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Send { "prompt": "..." } with 3-2000 characters, plus an optional valid "base" spec.' });
    return;
  }
  // From here on, progress is streamed as one JSON object per line.
  res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  const send = (event: GenerateEvent) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  // If the browser cancels or goes away, stop paying for the model call.
  const cancel = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      cancel.abort(new Error('cancelled by client'));
      console.log('[generate] cancelled by client');
    }
  });

  const started = Date.now();
  const options: GenerateOptions = { signal: cancel.signal, onProgress: (p) => send({ type: 'status', ...p }), game: body.data.options };
  try {
    const { prompt, base } = body.data;
    const { spec, attempts } = base
      ? await generateRemix(provider, base, prompt, options)
      : await generateFromIdea(provider, prompt, options);
    console.log(`[generate] "${spec.title}" in ${attempts} attempt(s), ${Date.now() - started}ms`);
    send({ type: 'done', spec, attempts });
  } catch (err) {
    if (!cancel.signal.aborted) {
      console.error('[generate] failed:', (err as Error).message);
      send({ type: 'error', ...describeFailure(err, provider.label) });
    }
  } finally {
    res.end();
  }
});

/** Turn a failure into a title and message a person can act on. */
function describeFailure(err: unknown, model: string): { title: string; message: string } {
  if (err instanceof ProviderError) {
    if (isQuotaError(err)) {
      return {
        title: `${model} quota used up`,
        message:
          'Your API key has reached its usage quota (HTTP 429), so the model refuses new requests until it resets ' +
          '(free-tier keys usually reset daily). Check your limits with the provider, wait for the reset, or set ' +
          'FALLBACK_API_KEY in .env to switch to another provider automatically. Saved games still play.' +
          (err.detail ? `

Provider said: ${err.detail}` : ''),
      };
    }
    if (isTransientStatus(err.status)) {
      return {
        title: `${model} is busy right now`,
        message:
          `The model is overloaded (HTTP ${err.status}) and still was after a few automatic retries. ` +
          'This usually clears within a minute, so try again shortly. To switch models automatically next time, ' +
          'set FALLBACK_API_KEY in .env.' +
          (err.detail ? `\n\nProvider said: ${err.detail}` : ''),
      };
    }
    if (err.status === 401 || err.status === 403) {
      return { title: 'API key rejected', message: `Check LLM_API_KEY in .env (HTTP ${err.status}).${err.detail ? `\n\n${err.detail}` : ''}` };
    }
    return { title: 'The model request failed', message: err.detail ?? err.message };
  }
  if (err instanceof GenerationError) {
    return { title: 'The model could not produce a valid game', message: err.message };
  }
  if (err instanceof AskError) {
    return { title: 'The model could not produce a valid answer', message: err.message };
  }
  return { title: 'Generation failed', message: (err as Error).message };
}

// Serve the built UI in production (`npm run build && npm start`).
const dist = resolve('dist');
if (existsSync(dist)) app.use(express.static(dist));

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  res.status(400).json({ error: (err as Error).message });
};
app.use(onError);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, '127.0.0.1', () => {
  console.log(`[server] http://127.0.0.1:${port}  provider: ${provider?.name ?? 'none (set LLM_API_KEY in .env)'}`);
});
