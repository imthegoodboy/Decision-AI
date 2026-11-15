/**
 * Converts the replicate workflow's return value (blind canonical-option extraction
 * over 9 answers per question) into eval/data-claude/recommendations.json:
 *   { questionId: { baseline|selfcheck|decisionai: { clean, poisoned, replicate } } }
 *
 *   node --import tsx eval/claude/recommendations.ts <workflow-result.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCache } from "../lib/store";
import { CLAUDE_DATA } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string };
const study = readCache<{ runs: Run[] }>(path.join(CLAUDE_DATA, "study.json"))!;
const runById = new Map(study.runs.map((r) => [r.runId, r]));
const SYSTEM: Record<string, string> = { baseline: "baseline", selfcheck: "selfcheck", tool: "decisionai" };

type Item = { id: string; labels: { label: string; run: string }[]; extracted: { label: string; canonicalOption: string }[] | null };
const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const items: Item[] = Array.isArray(raw) ? raw : raw.result ?? raw;

const out: Record<string, Record<string, Record<string, string>>> = {};
const replicateRuns: Record<string, string> = {};
for (const q of items) {
  if (!q?.extracted) {
    console.log(`${q?.id}: no extraction`);
    continue;
  }
  for (const { label, run } of q.labels) {
    const r = runById.get(run);
    const ex = q.extracted.find((e) => e.label.trim().toUpperCase() === label);
    if (!r || !ex) continue;
    ((out[q.id] ??= {})[SYSTEM[r.system]] ??= {})[r.condition] = ex.canonicalOption.trim();
    if (r.condition === "replicate") replicateRuns[run] = ex.canonicalOption.trim();
  }
}
writeFileSync(path.join(CLAUDE_DATA, "recommendations.json"), JSON.stringify(out, null, 2));
console.log(`Wrote recommendations for ${Object.keys(out).length} questions (${Object.keys(replicateRuns).length} replicate runs).`);
