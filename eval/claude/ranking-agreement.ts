/**
 * For every tool run: did the agent recommend the option ranked first by the
 * tool's deterministic, evidence-weighted ranking? Writes
 * eval/results/ranking-agreement.json (used by the analysis and the report).
 *
 *   node --import tsx eval/claude/ranking-agreement.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Dossier, Source } from "@/lib/domain";
import { rankOptions } from "@/lib/scoring";
import { RESULTS } from "../lib/config";
import { readCache } from "../lib/store";
import { CLAUDE_DATA } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string; dir: string };
const study = readCache<{ runs: Run[] }>(path.join(CLAUDE_DATA, "study.json"))!;
const rows: Record<string, unknown>[] = [];
for (const run of study.runs.filter((r) => r.system === "tool")) {
  const file = readCache<{ dossier: Dossier; sources: Source[] }>(path.join(CLAUDE_DATA, "tool-runs", run.runId, "dossier.json")) ?? readCache(path.join(run.dir, "dossier.json"));
  if (!file?.dossier?.recommendation) continue;
  const d = file.dossier;
  const ranked = rankOptions({ options: d.options, criteria: d.plan.criteria, scores: d.scores, claims: d.claims, sources: file.sources, contradictions: d.contradictions, freshnessDays: d.plan.freshnessDays });
  const name = (id: string) => d.options.find((o) => o.id === id)?.name ?? id;
  rows.push({
    run: run.runId,
    question: run.questionId,
    condition: run.condition,
    recommended: name(d.recommendation.optionId),
    rankedFirst: name(ranked[0].optionId),
    agrees: d.recommendation.optionId === ranked[0].optionId,
    margin: Math.round((ranked[0].total - (ranked[1]?.total ?? 0)) * 10) / 10,
  });
}
const by = (cond: string) => rows.filter((r) => r.condition === cond);
const summary = {
  runs: rows.length,
  agreement: rows.filter((r) => r.agrees).length / rows.length,
  agreementByCondition: Object.fromEntries(["clean", "poisoned", "replicate"].map((c) => [c, by(c).length ? by(c).filter((r) => r.agrees).length / by(c).length : null])),
  rows,
};
writeFileSync(path.join(RESULTS, "ranking-agreement.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ runs: summary.runs, agreement: summary.agreement, byCondition: summary.agreementByCondition }));
for (const r of rows) if (!r.agrees) console.log(`${r.question} ${r.condition}: recommended ${r.recommended}, ranked first ${r.rankedFirst} (margin ${r.margin})`);
