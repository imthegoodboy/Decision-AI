# Architecture

## Layers

```
Browser (React 19 client components)
   │  fetch / NDJSON streams
   ▼
Route handlers  src/app/api/**            thin: parse input (zod), call a service, map errors
   │
   ▼
Agents + pipeline  src/server/agents, src/server/pipeline
   │        │
   │        ├── AI gateway        src/server/ai/openai.ts   (OpenAI Responses API, structured output)
   │        ├── Research          src/server/research/**    (search providers, safe fetch, extraction,
   │        │                                                 passage retrieval, image resolution)
   │        └── Audit             src/server/audit/**       (SHA-256 hash chain)
   ▼
Repositories  src/server/repositories/**  (libSQL; JSON columns validated with zod on read)
   ▼
libSQL database  (file:./data/decision-ai.db locally, libsql:// remote in production)
```

Shared, pure code in `src/lib/` (domain types, weighted scoring, quote matching,
formatting) is imported by both the server and the browser so the client can
re-rank options instantly when the user moves a priority slider.

## Data model

| Table | Purpose |
| --- | --- |
| `decisions` | One decision workspace: title, status, structured decision profile (JSON) |
| `messages` | Conversation turns; assistant turns may carry follow-up questions and citations |
| `research_runs` | One row per research run; holds the plan and the sealed dossier (JSON) |
| `sources` | Every fetched page: URL, metadata, extracted text, SHA-256 content hash, reliability |
| `audit_events` | Append-only, hash-chained event log per decision |
| `evaluations` | Baseline vs Decision AI experiment runs and their metrics |

The **dossier** (options, criteria, claims with verification, contradictions,
uncertainties, scores, recommendation, metrics) is stored as a JSON document on the
run, and its SHA-256 is written to the audit chain when the run is sealed. Verifying the
audit chain therefore also detects edits to the dossier.

## Request flows

1. **Create decision** `POST /api/decisions` → stores the first user message, runs the
   intake agent, returns the decision with follow-up questions.
2. **Converse** `POST /api/decisions/:id/messages` → before research: intake agent
   (updates profile, asks questions, reports readiness). After research: analyst agent
   (answers from evidence, re-weights criteria, or triggers deeper research).
3. **Research** `POST /api/decisions/:id/research` → streams NDJSON progress events
   from the pipeline; the run continues server-side even if the client disconnects.
4. **Weights** `PUT /api/decisions/:id/weights` → persists user priority changes and logs
   them to the audit chain; ranking itself is recomputed client-side from `src/lib/scoring.ts`.
5. **Audit** `GET /api/decisions/:id/audit` → events plus a full chain verification.
6. **Report** `GET /api/decisions/:id/report` → Markdown export of the decision.
7. **Evaluation** `POST /api/evaluations` → runs baseline and Decision AI on the same
   sources and scores both with the same verifier.
8. **System** `GET /api/system` → configuration health and the models the key can use.

## External services

| Service | Used for | Configured by |
| --- | --- | --- |
| OpenAI Responses API | All reasoning, structured output, optional web search | `OPENAI_*` |
| OpenAI Embeddings | Semantic passage retrieval for verification | `OPENAI_EMBEDDING_MODEL` |
| Tavily / Brave / Serper | Web + image search (optional, faster, richer) | `*_API_KEY`, `SEARCH_PROVIDER` |
| Any public web page | Source documents (fetched with SSRF guard + size/time limits) | `RESEARCH_*` |
| Wikipedia REST API | Fallback image for well-known entities | none |
