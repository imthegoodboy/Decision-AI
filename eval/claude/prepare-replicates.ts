/**
 * Adds a second, independent clean run for every (question, system): the
 * replicate measures how often an agent's recommendation changes between two
 * runs on the SAME clean sources. That run-to-run variability is the baseline
 * against which recommendation changes under the planted source are compared.
 *
 *   node --import tsx eval/claude/prepare-replicates.ts
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readCache, writeCache } from "../lib/store";
import { CLAUDE_DATA } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string; dir: string; numbering: Record<string, string> };
type Study = { root: string; tool: string; runs: Run[]; questions: { questionId: string; replicates?: { runId: string; system: string; condition: string; dir: string }[] }[] };

const file = path.join(CLAUDE_DATA, "study.json");
const study = readCache<Study>(file)!;
if (study.runs.some((r) => r.condition === "replicate")) {
  console.log("Replicates already prepared.");
  process.exit(0);
}
let counter = study.runs.length;
for (const q of study.questions) {
  q.replicates = [];
  for (const original of study.runs.filter((r) => r.questionId === q.questionId && r.condition === "clean")) {
    const runId = `r${String(++counter).padStart(3, "0")}`;
    const dir = path.join(study.root, "runs", runId);
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(original.dir, "sources.md"), path.join(dir, "sources.md"));
    if (existsSync(path.join(original.dir, "pool.json"))) copyFileSync(path.join(original.dir, "pool.json"), path.join(dir, "pool.json"));
    const rep: Run = { ...original, runId, condition: "replicate", dir };
    study.runs.push(rep);
    q.replicates.push({ runId, system: rep.system, condition: "replicate", dir });
  }
}
writeCache(file, study);
console.log(`Prepared ${study.runs.filter((r) => r.condition === "replicate").length} replicate runs.`);
