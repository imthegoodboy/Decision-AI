# Progress log

Context: built for the Apart Research AI x Epistemics Research Sprint (Track 2, Trust
Infrastructure). Submission deadline: Sun 15 Nov 2026 11:59 PM AoE (Mon 16 Nov 11:59 UTC).
The judged artefact is the PDF report; code, video and slides are optional extras.

## Status

| Area | State |
| --- | --- |
| Core platform, research pipeline, API, web UI | Done (typecheck, lint, 26 unit tests, `next build`) |
| Keyless search fallback (DuckDuckGo HTML) | Done; rate-limits quickly, so the study used a fixed recorded protocol instead |
| OpenAI-model experiment (`eval/run.ts`) | Written, not run: no OpenAI key available |
| **Claude-agent study (`eval/claude/`)** | Running: 12 questions × {baseline, self-check, tool} × {clean, poisoned} = 72 agent runs + 24 blinded judges |
| Provenance tool for agents (`eval/claude/tool.ts`) | Done; bundled to a single CLI per run |
| Demo import of real dossiers into the app | Done (`eval/claude/import-demo.ts`) |
| Report | Methods, related work, ethics appendix, Appendix B done; results pending real data |
| Video / slides | Recorder (`submission/video/record.mjs`) and slide template ready; narration pending results |

## Study pipeline (Claude agents)

1. `eval/claude/questions.json`: 12 questions, 3 fixed queries each.
2. Search agents ran the queries with Claude's web search and recorded results unedited → `eval/data-claude/search/`.
3. `build-pools.ts` fetched and extracted pages with our code → `eval/data-claude/pools/`.
4. Workflow `study-planted-sources` → `eval/data-claude/planted/` (3 known false claims each; synthetic, never published).
5. `prepare.ts --root <scratchpad>/study` → opaque run dirs, seeded planted position, judge blinding, bundled tool.
6. Workflow `decision-ai-study` (systems on Sonnet, judges on Opus) → answers in the journal, tool artefacts in run dirs, judgements in `eval/data-claude/judgements/`.
7. `collect.ts <journal dirs>` → `eval/data-claude/answers/`, `tool-runs/`, `agent-runs.json` (tool-usage compliance).
8. `aggregate.ts` → `eval/results/*.csv`; `eval/analysis.py` → `stats.json`, figures; `report/build.py` → PDF.

## Findings noted during the run
- In the pilot, capable baseline agents already flagged single planted pages; differences are expected to be smaller than in prior RAG-poisoning work.
- The metadata reliability prior rated a planted page above a genuine lab-testing site (68 vs 58). Earned reliability depends on which claims the agent records: a contradiction penalises the *cited* source. Symmetric attribution of conflicts is future work.

## Rules for this project
- Results are never typed by hand: report numbers are placeholders filled from `eval/results/stats.json`.
- No fabricated data or references. Sprint rules: made-up results or references can disqualify a project.

## PR log
- #1 `chore/scaffold-and-agent-docs`: scaffold, docs, env template.
- #2 `feat/core-platform` (stacked on #1): core platform, pipeline, API, UI, eval harnesses, report tooling.
