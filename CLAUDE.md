# Game Generator — Project Rules

## What this is
A local-first browser game generator. The user describes a game in text; an LLM
returns a JSON game spec (including SVG sprites); a fixed Phaser engine runs that
spec inside a sandboxed iframe. Games are saved in IndexedDB.

## Stack
- Vite + TypeScript (frontend)
- Phaser 3 (fixed game engine)
- Zod (spec schema + validation)
- Dexie (IndexedDB persistence)
- A tiny Node/Express proxy (server side, holds API keys)

## Core rules
- **The LLM never writes game code.** It only outputs a JSON spec, which must be
  validated by the Zod schema before the engine ever sees it.
- **Provider adapter:** configurable `baseURL` + key + model. Gemini is the
  default; an OpenAI-compatible fallback (e.g. Groq, Mistral) must also work.
- **Keys live only in `.env`, server side.** Never ship keys to the browser,
  never commit `.env`.
- **Validation retry:** if a spec fails Zod validation, retry up to 2 times,
  sending the Zod error back to the LLM so it can correct the spec.

## Working style
- Make small commits after each working slice.
- Run the app and/or tests before saying something is done.
- Keep files small and strongly typed.
- No unnecessary dependencies — justify anything beyond the stack above.
