# Architecture decision records

## ADR-001 — Next.js 16 full-stack app

One deployable unit: React UI plus route handlers for the API. Streaming responses run
on the Node.js runtime. `cacheComponents` stays enabled (framework default); pages that
read the database do so inside `<Suspense>`.

## ADR-002 — OpenAI via the official SDK and Responses API

The client asked for OpenAI. We use `openai` directly (Responses API) for structured
output (`zodTextFormat`, strict JSON schema) and the built-in `web_search` tool, which
lets the app research the web with only an OpenAI key. Two configurable models: a main
model for reasoning-heavy steps and a fast model for high-volume extraction/verification.

## ADR-003 — libSQL for storage

`@libsql/client` runs against a local file with zero setup and against a remote
libSQL/Turso database in production by changing `DATABASE_URL`. Schema is created by
idempotent migrations at first connection, so there is no separate migration step.

## ADR-004 — Verification is hybrid, not prompt-only

A model judging its own citations is not enough. Quote location, passage retrieval,
reliability scoring, weighted ranking, confidence and the audit chain are deterministic
code. The model is used for language understanding (does this passage entail this
claim?) and always sees the exact passage text.

## ADR-005 — Pluggable search providers

Search is behind a `SearchProvider` interface. `auto` mode prefers dedicated search APIs
(Tavily, Brave, Serper) when keys exist and falls back to OpenAI web search, so the app
works with one key but improves with more. Providers are tried in order on failure.

## ADR-006 — Tamper-evident audit as a hash chain

Each audit event stores `hash = SHA-256(prevHash ‖ seq ‖ type ‖ canonical JSON payload ‖ timestamp)`.
Verification recomputes the chain and the sealed dossier hash and reports the first break.
