import { GameSpecSchema, type GameSpec } from '../spec/schema';

export interface Health {
  ok: boolean;
  provider: string | null;
}

export async function fetchHealth(): Promise<Health | undefined> {
  try {
    const res = await fetch('/api/health');
    return res.ok ? ((await res.json()) as Health) : undefined;
  } catch {
    return undefined;
  }
}

/** Ask the local proxy to generate a spec. The server already validated it; we re-check on arrival. */
export async function generateGame(prompt: string, signal?: AbortSignal): Promise<{ spec: GameSpec; attempts: number }> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal,
    });
  } catch {
    throw new Error('Could not reach the local server. Is "npm run dev" running?');
  }
  const data = (await res.json().catch(() => ({}))) as { spec?: unknown; attempts?: number; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
  return { spec: GameSpecSchema.parse(data.spec), attempts: data.attempts ?? 1 };
}
