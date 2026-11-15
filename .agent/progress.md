# Progress log

Context: built for the Apart Research AI x Epistemics Research Sprint (Track 2, Trust
Infrastructure). Submission deadline: Sun 15 Nov 2026 11:59 PM AoE (Mon 16 Nov 11:59 UTC).
The judged artefact is the PDF report; code, video and slides are optional extras.

## Status

| Area | State |
| --- | --- |
| Scaffold, agent docs, env template | Done |
| Core platform (domain schemas, scoring, text/quote matching, audit chain, storage, OpenAI wrapper) | Done, 26 unit tests |
| Research pipeline (search, safe fetch, extraction, retrieval, claims, verification, reliability, synthesis) | Done |
| API routes (decisions, messages, NDJSON research stream, weights, audit, sources, report, system) | Done |
| Web UI (home, workspace, live ledger, dossier tabs, settings) | In progress |
| Evaluation harness (`eval/`) | Written; needs `OPENAI_API_KEY` to run |
| Analysis + figures (`eval/analysis.py`) | Written; runs on real results only |
| Report (`report/template.html`, `build.py`, sections) | Methods, related work (26 verified refs), ethics appendix written; results pending the real run |
| Submission pack (`submission/`) | Checklist + video script written; slides and image pending |

## Rules for this project
- Results are never typed by hand: report numbers are placeholders filled from `eval/results/stats.json`.
- No fabricated data or references. Sprint rules: made-up results or references can disqualify a project.

## PR log
- #1 `chore/scaffold-and-agent-docs`: scaffold, docs, env template.
- `feat/core-platform` (stacked on #1): core platform, pipeline, API, eval harness, report tooling.
