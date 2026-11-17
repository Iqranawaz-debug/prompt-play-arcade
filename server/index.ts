import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { providerFromEnv } from '../generator/config';
import { GenerationError, generateFromIdea } from '../generator/generate';
import { ProviderError } from '../generator/providers';

if (existsSync('.env')) process.loadEnvFile('.env');

const provider = providerFromEnv(process.env);
const app = express();
app.use(express.json({ limit: '256kb' }));

const GenerateBody = z.object({ prompt: z.string().trim().min(3).max(2000) });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: provider?.name ?? null });
});

app.post('/api/generate', async (req, res) => {
  if (!provider) {
    res.status(503).json({ error: 'No LLM provider configured. Copy .env.example to .env and set LLM_API_KEY.' });
    return;
  }
  const body = GenerateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Send { "prompt": "..." } with 3-2000 characters.' });
    return;
  }
  const started = Date.now();
  try {
    const { spec, attempts } = await generateFromIdea(provider, body.data.prompt);
    console.log(`[generate] "${spec.title}" in ${attempts} attempt(s), ${Date.now() - started}ms`);
    res.json({ spec, attempts });
  } catch (err) {
    const status = err instanceof GenerationError ? 422 : err instanceof ProviderError ? 502 : 500;
    console.error('[generate] failed:', (err as Error).message);
    res.status(status).json({ error: (err as Error).message });
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
