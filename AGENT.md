# AGENT.md — working guide for AI agents and contributors

Decision AI is an evidence-based decision intelligence platform (Research Track 2 —
Trust Infrastructure). A user describes a decision in conversation; the system asks
follow-up questions, researches the web, extracts claims, **verifies each claim
against the exact passage it came from**, detects contradictions and uncertainty,
scores options against the user's own priorities and explains its recommendation.
Every step is written to a tamper-evident, hash-chained audit log.

Read this file first, then the docs in [`.agent/`](.agent/README.md).

## Golden rules

1. **No hard-coded decision content.** Options, criteria, weights, sources, scores and
   recommendations always come from the user, the web, or the model at runtime.
   Configuration lives in environment variables validated by `src/server/config/env.ts`.
2. **Evidence before prose.** Anything the UI presents as fact must trace to a claim
   that links to a source passage. Model interpretation is labelled as interpretation.
3. **Deterministic where possible.** Quote matching, reliability scoring, weighted
   ranking, confidence and the audit hash chain are plain TypeScript, not prompts.
4. **Server-only code stays in `src/server/`** (imports `server-only`). Code shared with
   the browser lives in `src/lib/` and must stay pure.
5. **Keep docs current.** When you change architecture, pipeline stages, env vars or the
   design system, update `AGENT.md` and the matching file in `.agent/` in the same PR,
   and add an entry to `.agent/progress.md`.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev server | `npm run dev` → http://localhost:3000 |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Everything CI runs | `npm run check && npm run build` |

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` before running.

## Repository map

```
src/
  app/                 Next.js 16 App Router (pages + route handlers under app/api)
  components/          React UI (ui/ primitives, workspace/, home/, lab/, shell/)
  lib/                 Isomorphic, pure: domain types, scoring, text matching, formatting
  server/
    config/            env validation
    ai/                OpenAI client wrapper (structured output, retries, usage)
    db/                libSQL client + schema migrations
    repositories/      persistence for decisions, messages, runs, sources, audit, evals
    research/          search providers, safe fetcher, HTML extraction, retrieval, images
    agents/            one module per reasoning step (intake, planner, verifier, …)
    pipeline/          research orchestrator emitting progress events
    audit/             SHA-256 hash chain
    evaluation/        baseline vs Decision AI experiment + metrics
.agent/                deeper docs for agents (architecture, pipeline, design, progress)
```

## Workflow

- Branch from `main` (`feat/…`, `fix/…`, `chore/…`), commit in small logical steps,
  push, open a PR with `gh pr create`, merge after `npm run check` passes.
- Commit messages: imperative subject line, body explains *why*.
- Never commit `.env*` (except `.env.example`) or the `data/` directory.

## Next.js 16 notes

This project uses Next.js 16 with `cacheComponents` enabled. Uncached reads (database,
`params`, `searchParams`) must sit inside `<Suspense>`; `export const dynamic` is not
available. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
