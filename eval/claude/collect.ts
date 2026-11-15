/**
 * Collects the study's raw outputs into the repository:
 *  - each agent's returned answer (exactly what the judge saw) → eval/data-claude/answers/<run>.md
 *  - tool-run artefacts (ledger, dossier, hash chain) → eval/data-claude/tool-runs/<run>/
 *  - per-run tool usage (compliance check) → eval/data-claude/agent-runs.json
 *
 *   node --import tsx eval/claude/collect.ts <workflow transcript dir> [<dir> ...]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCache } from "../lib/store";
import { CLAUDE_DATA } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string; dir: string };
const study = readCache<{ runs: Run[] }>(path.join(CLAUDE_DATA, "study.json"))!;
const byLabel = new Map(study.runs.map((r) => [`${r.questionId}:${r.system}:${r.condition}`, r]));

type Entry = { type: string; agentId?: string; label?: string; result?: unknown; toolsUsed?: unknown };
const records: Record<string, { runId: string; label: string; toolsUsed: unknown; answerChars: number; agentId: string }> = {};
const existing = readCache<typeof records>(path.join(CLAUDE_DATA, "agent-runs.json")) ?? {};
Object.assign(records, existing);

mkdirSync(path.join(CLAUDE_DATA, "answers"), { recursive: true });
for (const dir of process.argv.slice(2)) {
  const file = path.join(dir, "journal.jsonl");
  if (!existsSync(file)) {
    console.log(`no journal in ${dir}`);
    continue;
  }
  const entries = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry);
  const labelOf = new Map(entries.filter((e) => e.type === "started").map((e) => [e.agentId!, e.label!]));
  for (const e of entries.filter((x) => x.type === "result")) {
    const label = labelOf.get(e.agentId!);
    const run = label ? byLabel.get(label) : undefined;
    if (!run || typeof e.result !== "string" || !e.result.trim()) continue;
    writeFileSync(path.join(CLAUDE_DATA, "answers", `${run.runId}.md`), e.result.trim() + "\n");
    records[run.runId] = { runId: run.runId, label: label!, toolsUsed: e.toolsUsed ?? null, answerChars: e.result.length, agentId: e.agentId! };
    if (run.system === "tool") {
      const out = path.join(CLAUDE_DATA, "tool-runs", run.runId);
      mkdirSync(out, { recursive: true });
      for (const f of ["ledger.json", "dossier.json", "dossier-input.json", "audit.jsonl"]) {
        if (existsSync(path.join(run.dir, f))) copyFileSync(path.join(run.dir, f), path.join(out, f));
      }
    }
  }
}
writeFileSync(path.join(CLAUDE_DATA, "agent-runs.json"), JSON.stringify(records, null, 2));
const done = Object.keys(records).length;
console.log(`Collected ${done}/${study.runs.length} answers.`);
const missing = study.runs.filter((r) => !records[r.runId]).map((r) => `${r.runId}(${r.questionId}:${r.system}:${r.condition})`);
if (missing.length) console.log(`Missing: ${missing.join(", ")}`);
