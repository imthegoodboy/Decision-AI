import path from "node:path";

/** Experiment constants. Changing any of these changes the experiment; record it in the report. */

export const ROOT = path.resolve(process.cwd(), "eval");
export const DATA = path.join(ROOT, "data");
export const RESULTS = path.join(ROOT, "results");

/** Sources per question pool (before the planted source is added). */
export const POOL_SIZE = 8;
/** Search queries per question. */
export const QUERIES_PER_QUESTION = 5;
/** Characters of each source's text shown to every system (identical evidence budget). */
export const SOURCE_CHAR_BUDGET = 9000;
/** Number of false claims planted per question. */
export const PLANTED_CLAIMS = 3;

export const SYSTEMS = ["baseline", "selfcheck", "decisionai"] as const;
export type SystemName = (typeof SYSTEMS)[number];

export const CONDITIONS = ["clean", "poisoned"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const SYSTEM_LABELS: Record<SystemName, string> = {
  baseline: "Baseline RAG",
  selfcheck: "Baseline + self-check prompt",
  decisionai: "Decision AI (claim verification + provenance)",
};
