# Research and verification pipeline

Orchestrated by `src/server/pipeline/research-pipeline.ts`. Each stage emits progress
events (streamed to the UI as NDJSON) and audit events (hash-chained).

| # | Stage | Kind | Output |
| --- | --- | --- | --- |
| 1 | **Plan** | LLM (main) | Criteria with weights derived from user priorities, search queries with intents, freshness window |
| 2 | **Search** | Provider | Candidate URLs, deduplicated, at most 2 per domain |
| 3 | **Read** | Code | Fetched pages → readable text, title, publisher, author, published date, image, favicon, SHA-256 |
| 4 | **Assess sources** | LLM (fast) + code | Source kind and perspective (LLM); reliability score from transparent signals (code) |
| 5 | **Identify options** | LLM (main) | 3–6 candidates that satisfy the user's constraints, plus any the user named |
| 6 | **Deepen** | Provider + code | Targeted searches for options with thin evidence; option images |
| 7 | **Extract claims** | LLM (fast) | Atomic factual claims tied to an option, a criterion, a source and a verbatim quote |
| 8 | **Verify claims** | Code + LLM (fast) | Quote located in source text; best passages retrieved (BM25 + embeddings); judge rules supported / partial / unsupported / contradicted, with corroborating and conflicting sources |
| 9 | **Contradictions** | LLM (fast) | Conflicting statements across sources, with which side is more credible and why |
| 10 | **Score** | LLM (main) + code | 0–10 per option × criterion using verified claims only; weighted ranking and confidence in code |
| 11 | **Recommend** | LLM (main) | Recommendation for the top-ranked option, reasons with claim references, trade-offs, uncertainties |
| 12 | **Seal** | Code | Metrics, dossier SHA-256 written to audit chain |

## Verification statuses

- **supported** — the cited passage states the claim.
- **partial** — the passage supports part of the claim, or the quote could not be located verbatim.
- **unsupported** — the passage does not support the claim.
- **contradicted** — another source with equal or higher reliability states the opposite.

Only supported and partial claims may be used as evidence for scores and recommendations.

## Reliability signals (deterministic)

HTTPS, identifiable publisher, author present, published date present, content age vs the
decision's freshness window, primary/official source for the option, independent review,
user-generated or retailer content, thin content, fetch failure (snippet only). Each
signal contributes a documented weight; the UI shows every signal.

## Confidence

Option confidence combines evidence coverage (share of criteria backed by verified
claims), support rate, average source reliability, freshness and unresolved
contradictions. The formula lives in `src/lib/scoring.ts` and is unit tested.
