# Conventions

## TypeScript

- Strict mode. No `any` in new code; use `unknown` and narrow with zod.
- Domain types are inferred from zod schemas in `src/lib/domain.ts` so runtime
  validation and static types never drift.
- Prefer small pure functions in `src/lib/` that can be unit tested.

## Server code

- Everything under `src/server/` starts with `import "server-only"`.
- Route handlers stay thin: validate input with zod, call one service, return JSON or a
  stream. Errors go through `src/server/http.ts` so the client always receives
  `{ error: { code, message } }` with a sensible status.
- LLM calls go through `src/server/ai/openai.ts` → `structured()` (strict JSON schema
  from zod) or `text()`. Never call the SDK directly from an agent.
- Prompts live next to their agent. They state the contract, forbid invented facts and
  require verbatim quotes where evidence is involved.

## Configuration

- No literals for keys, models, limits or URLs in code. Add new settings to
  `src/server/config/env.ts` and `.env.example` together.

## Persistence

- Repositories own SQL. JSON columns are parsed with the zod schema of the domain type.
- Every state change that matters for trust (messages, research steps, weights,
  verification results) is appended to the audit chain via `src/server/audit`.

## UI

- Client components only where interaction requires it.
- Tokens from `globals.css` via Tailwind theme variables; no ad-hoc hex values.
- Copy is sentence case, plain verbs, and names things by what users understand.

## Testing

- Vitest for pure logic: scoring, quote matching, chunking, BM25, hash chain, URL safety,
  HTML extraction, metrics.
- `npm run check` must pass before a PR is merged.
