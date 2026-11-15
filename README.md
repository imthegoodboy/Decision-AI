# Decision AI

**Evidence-based decision support with claim-level verification and provenance.**
By **Nikhil Sharma**, for the [Apart Research AI x Epistemics Research Sprint](https://apartresearch.com/sprints/ai-x-epistemics-research-sprint-2026-11-13-to-2026-11-15) (November 2026), Track 2: Trust Infrastructure.

**Report:** [Flagged but Still Followed: Planted Sources Steer AI Decision Support Even When Agents Dispute Them](report/Decision-AI-report.pdf)

## Key findings

From 108 agent runs on 12 real decisions with identical live-web sources, with and without a planted false article:

- **Attribution is at ceiling.** About 98% of cited claims are supported in every condition. With full sources, agents already cite faithfully.
- **The tool stops agents repeating planted lies.** No tool-using answer stated a planted falsehood as fact, compared with 25% of baseline answers.
- **Flagged but still followed.**
  - Every condition flagged the planted claims. Yet recommendations moved toward the attacker in 50% of cases, against 14% between two clean runs (p < 0.001).
  - The tool reduced this steering but did not remove it.
- **Metadata reliability is gameable.** A fake page with an author, a publisher and a date outscored most genuine pages. Reliability earned through cross-source verification halved its advantage.

Ask a question like *"Which phone should I buy under ₹20,000?"*. Decision AI asks the follow-up questions that change the answer, researches the live web, and builds its recommendation **only from claims it has verified**:

- each claim is bound to a **verbatim quote** in a fetched page, and the quote is located in the stored text by deterministic code;
- an entailment judge checks the claim against the passage, and **cross-checks it against every other source** for corroboration or contradiction;
- source reliability is split into a **metadata prior** (cheap to fake) and a track record **earned through verification** (hard to fake);
- options are ranked by a transparent weighted score that **re-ranks instantly** when you move a priority slider;
- every step is recorded in a **SHA-256 hash-chained audit log**, and each research dossier is sealed into the chain, so tampering with stored evidence is detectable.

The research question, from Track 2: *when an AI system uses a reliability or provenance tool, does its behaviour and accuracy actually improve?* The `eval/` harness answers it with a controlled experiment. See the report in [`report/`](report/).

## Quick start

Requirements: Node.js 22+ (24 recommended) and an OpenAI API key.

```bash
npm install
cp .env.example .env.local      # then set OPENAI_API_KEY
npm run dev                     # http://localhost:3000
```

Every setting (models, search providers, limits, database) is an environment variable documented in [`.env.example`](.env.example). With only `OPENAI_API_KEY` set, web search runs through the OpenAI Responses API `web_search` tool. Adding `TAVILY_API_KEY`, `BRAVE_API_KEY` or `SERPER_API_KEY` adds faster search and image search. Data is stored in a local libSQL file by default; set `DATABASE_URL=libsql://…` to use a remote database.

## Using the app

1. **Describe the decision.** The intake agent builds a decision profile and asks a few targeted questions as tappable cards.
2. **Start research.** Watch the live pipeline: searches, pages read with their reliability, candidate options, and a verification ledger where each claim is stamped *supported*, *partial*, *unsupported* or *contradicted*.
3. **Explore the dossier:**
   - **Overview:** the recommendation, reasons with claim citations, trade-offs, and when to choose something else.
   - **Compare:** priority sliders and the evidence matrix.
   - **Evidence:** every claim with its quote, passage and provenance.
   - **Sources:** every reliability signal.
   - **Conflicts & gaps:** contradictions between sources and the remaining uncertainties.
   - **Audit:** a one-click integrity check of the hash chain.
4. **Follow up.** Ask questions, challenge the recommendation, change priorities in plain language, or ask for deeper research. Export a Markdown report.

## Reproducing the experiment

The study reported in `report/` uses **Claude agents** as the AI under test (no OpenAI key needed). The pieces are in `eval/claude/`:

1. `questions.json`: 12 decision questions with 3 fixed search queries each. Search results were recorded unedited in `eval/data-claude/search/`.
2. `node --conditions=react-server --import tsx eval/claude/build-pools.ts`: fetches and extracts the pages into `eval/data-claude/pools/`.
3. Planted articles: `eval/data-claude/planted/`. These are synthetic, closed corpus, never published, and each lists its 3 false claims.
4. `node --import tsx eval/claude/prepare.ts --root <dir>`: creates the per-run directories and bundles the provenance tool (`eval/claude/tool.ts` → `decision-tool.cjs`).
5. The agent runs: fresh Claude agents for baseline, self-check and tool, each on a clean and a poisoned pool. Blinded judge agents then evaluate the answers. The prompts are in `.agent/progress.md` and in the workflow script described there.
6. `collect.ts`, then `aggregate.ts`, then `python eval/analysis.py`, then `python report/build.py`.

All raw outputs are committed: answers, tool ledgers with hash chains, judge decisions, and per-item metrics.

An equivalent fully automated harness for OpenAI models is in `eval/run.ts`:

```bash
npm run eval                      # 30 questions × 3 systems × clean/poisoned (resumable; cached in eval/data)
npm run eval -- --only tech-01    # a single question
npm run eval:aggregate            # → eval/results/items.csv, reliability.csv, human-audit-sample.csv
python -m pip install matplotlib numpy scipy
npm run eval:analyze              # → eval/results/stats.json, table1.md, report/figures/*.png
python report/build.py            # → report/Decision-AI-report.pdf (all numbers filled from stats.json)
```

| Piece | Where |
| --- | --- |
| Questions (6 domains × 5) | `eval/questions.json` |
| Shared source pools (live web, content-hashed) | `eval/data/pools/` |
| Planted articles + ground-truth false claims (synthetic, never published) | `eval/data/planted/` |
| System outputs / judge decisions | `eval/data/answers/`, `eval/data/judgements/` |
| Systems: baseline RAG, self-check prompt, Decision AI | `eval/lib/systems.ts` |
| Independent judge | `eval/lib/judge.ts` |

## Architecture

```
src/
  app/                 Next.js 16 App Router: pages + route handlers (app/api)
  components/          UI (ledger-style evidence views, live pipeline, dossier tabs)
  lib/                 Pure, shared: domain schemas (zod), ranking & confidence,
                       quote matching, BM25, reliability signals
  server/
    ai/openai.ts       OpenAI Responses API: strict structured output, web search, embeddings
    agents/            intake, planner, sources, options, claims, verifier, synthesis, analyst
    pipeline/          gather (search→fetch→extract), core (verification), research-pipeline (app)
    research/          search providers, SSRF-guarded fetch, extraction, retrieval, images
    audit/             SHA-256 hash chain + dossier sealing
    repositories/      libSQL persistence
eval/                  experiment harness, judge, aggregation, analysis
report/                report template, sections, figures, build script
.agent/                architecture, pipeline, design-system, conventions, ADRs, progress
```

Design choices are recorded in [`.agent/decisions.md`](.agent/decisions.md). The pipeline is documented stage by stage in [`.agent/pipeline.md`](.agent/pipeline.md).

## Quality checks

```bash
npm run check    # typecheck + lint + unit tests (scoring, quote matching, BM25, hash chain)
npm run build
```

## Prior work disclosure

All code in this repository was written during the sprint (15–16 November 2026); see the commit history. It uses open-source libraries listed in `package.json`.

## Responsible use

Decision AI is a decision-support tool, not an authority. It can be wrong: it shows its evidence, confidence and uncertainty so that you can check before acting. It is not financial, medical or legal advice. See Appendix A of the report for limitations and dual-use considerations.
