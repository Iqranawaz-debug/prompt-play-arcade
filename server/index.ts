import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { GameSpecSchema } from '../spec/schema';
import { providerFromEnv } from '../generator/config';
import { generateFromIdea, generateRemix, type GenerateEvent, type GenerateOptions } from '../generator/generate';

if (existsSync('.env')) process.loadEnvFile('.env');

const provider = providerFromEnv(process.env);
const app = express();
app.use(express.json({ limit: '256kb' }));

/** `base` is set when remixing: the prompt then describes changes to that spec. */
const GenerateBody = z.object({ prompt: z.string().trim().min(3).max(2000), base: GameSpecSchema.optional() });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: provider?.name ?? null, label: provider?.label ?? null });
});

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
  const options: GenerateOptions = { signal: cancel.signal, onProgress: (p) => send({ type: 'status', ...p }) };
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
      send({ type: 'error', message: (err as Error).message });
    }
  } finally {
    res.end();
  }
});

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
