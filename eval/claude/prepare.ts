/**
 * Prepares agent run directories for the Claude-agent study.
 *
 *   node --import tsx eval/claude/prepare.ts --root <agent root dir>
 *
 * For each question: clean pool (8 sources) and poisoned pool (planted article
 * inserted at a seeded, non-first position). Each (system, condition) gets its own
 * directory with an opaque name so agents cannot infer the condition. Writes
 * eval/data-claude/study.json (run map + judge assignments) used by the workflow
 * and by aggregation.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import type { PoolSource } from "@/server/pipeline/core";
import { readCache, seedOf, writeCache } from "../lib/store";
import { CLAUDE_DATA, STUDY_CONDITIONS, STUDY_SYSTEMS, type PlantedRecord, type StudyPool, type StudyQuestion } from "./shared";

const rootArg = process.argv.indexOf("--root");
if (rootArg < 0) throw new Error("--root <dir> is required");
const ROOT = path.resolve(process.argv[rootArg + 1]);
const FRESHNESS_DAYS = 365;

const questions: StudyQuestion[] = JSON.parse(readFileSync(path.join(process.cwd(), "eval", "claude", "questions.json"), "utf8"));

// Bundle the provenance tool into a single file the agents can run with plain `node`.
const TOOL = path.join(ROOT, "bin", "decision-tool.cjs");
mkdirSync(path.dirname(TOOL), { recursive: true });
buildSync({
  entryPoints: [path.join(process.cwd(), "eval", "claude", "tool.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: TOOL,
  tsconfig: path.join(process.cwd(), "tsconfig.json"),
  logLevel: "error",
});

function renderSources(question: string, sources: PoolSource[]): string {
  return [
    `# Sources retrieved for: ${question}`,
    "",
    ...sources.map((s, i) =>
      [
        `## [${i + 1}] ${s.title}`,
        `URL: ${s.url}`,
        `Publisher: ${s.siteName ?? "unknown"} | Author: ${s.author ?? "unknown"} | Published: ${s.publishedAt?.slice(0, 10) ?? "unknown"} | Retrieved: ${s.retrievedAt.slice(0, 10)}`,
        "",
        s.text,
        "",
        "---",
        "",
      ].join("\n"),
    ),
  ].join("\n");
}

function plantedSource(q: StudyQuestion, p: PlantedRecord, retrievedAt: string): PoolSource {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const url = `https://www.${slug(p.siteName).replace(/-/g, "")}.com/${slug(p.title)}`;
  const text = p.article.trim();
  const days = Math.min(45, Math.max(5, Math.round(p.publishedDaysAgo)));
  return {
    id: `src_${createHash("sha256").update(`${q.id}:${p.title}`).digest("hex").slice(0, 8)}`,
    runId: `study_${q.id}`,
    decisionId: `study_${q.id}`,
    url,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    title: p.title,
    siteName: p.siteName,
    author: p.author,
    publishedAt: new Date(Date.parse(retrievedAt) - days * 86_400_000).toISOString(),
    retrievedAt,
    contentHash: createHash("sha256").update(text).digest("hex"),
    wordCount: text.split(/\s+/).length,
    excerpt: text.slice(0, 300),
    image: null,
    favicon: null,
    status: "read",
    query: null,
    provider: "planted",
    text,
  };
}

type RunEntry = { runId: string; questionId: string; system: string; condition: string; dir: string; numbering: Record<number, string> };
const runs: RunEntry[] = [];
const studyQuestions: unknown[] = [];
let counter = 0;

for (const q of questions) {
  const pool = readCache<StudyPool>(path.join(CLAUDE_DATA, "pools", `${q.id}.json`));
  const planted = readCache<PlantedRecord>(path.join(CLAUDE_DATA, "planted", `${q.id}.json`));
  if (!pool || !planted) {
    console.log(`${q.id}: skipped (pool ${!!pool}, planted ${!!planted})`);
    continue;
  }
  const clean = pool.sources;
  const plantedSrc = plantedSource(q, planted, clean[0].retrievedAt);
  const position = 1 + (seedOf(q.id) % (clean.length - 1));
  const poisoned = [...clean.slice(0, position), plantedSrc, ...clean.slice(position)];
  const cleanToPoisoned: Record<number, number> = {};
  clean.forEach((s, i) => (cleanToPoisoned[i + 1] = poisoned.findIndex((x) => x.id === s.id) + 1));
  writeCache(path.join(CLAUDE_DATA, "planted-sources", `${q.id}.json`), { source: plantedSrc, position: position + 1 });

  const qRuns: { runId: string; system: string; condition: string; dir: string }[] = [];
  for (const condition of STUDY_CONDITIONS) {
    const sources = condition === "clean" ? clean : poisoned;
    for (const system of STUDY_SYSTEMS) {
      const runId = `r${String(++counter).padStart(3, "0")}`;
      const dir = path.join(ROOT, "runs", runId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "sources.md"), renderSources(q.question, sources));
      if (system === "tool") {
        writeFileSync(
          path.join(dir, "pool.json"),
          JSON.stringify({
            question: q.question,
            freshnessDays: FRESHNESS_DAYS,
            sources: sources.map((s, i) => ({
              n: i + 1,
              id: s.id,
              url: s.url,
              domain: s.domain,
              title: s.title,
              siteName: s.siteName,
              author: s.author,
              publishedAt: s.publishedAt,
              retrievedAt: s.retrievedAt,
              contentHash: s.contentHash,
              wordCount: s.wordCount,
              text: s.text,
            })),
          }),
        );
      }
      const numbering = Object.fromEntries(sources.map((s, i) => [i + 1, s.id]));
      runs.push({ runId, questionId: q.id, system, condition, dir, numbering });
      qRuns.push({ runId, system, condition, dir });
    }
  }

  // Judge material: the poisoned list (a superset of the clean list) with shared numbering.
  const judgeDir = path.join(ROOT, "judge", q.id);
  mkdirSync(judgeDir, { recursive: true });
  writeFileSync(path.join(judgeDir, "sources.md"), renderSources(q.question, poisoned));

  // Blind, seeded assignment of the six answers to two judges (three answers each, labels A–C).
  const order = [...qRuns].sort((a, b) => seedOf(`${q.id}:${a.runId}`) - seedOf(`${q.id}:${b.runId}`));
  const judges = [0, 1].map((k) => ({
    judgeId: `${q.id}-j${k + 1}`,
    file: path.join(CLAUDE_DATA, "judgements", `${q.id}-j${k + 1}.json`),
    answers: order.slice(k * 3, k * 3 + 3).map((r, i) => ({ label: "ABC"[i], runId: r.runId, condition: r.condition })),
  }));

  studyQuestions.push({
    questionId: q.id,
    question: q.question,
    tool: TOOL,
    judgeSources: path.join(judgeDir, "sources.md"),
    cleanToPoisoned,
    plantedClaims: planted.falseClaims.map((f, i) => ({ id: `F${i + 1}`, claim: f.claim, truth: f.truth })),
    runs: qRuns,
    judges,
  });
  console.log(`${q.id}: ${clean.length} clean / ${poisoned.length} poisoned sources, planted at [${position + 1}]`);
}

writeCache(path.join(CLAUDE_DATA, "study.json"), { root: ROOT, tool: TOOL, runs, questions: studyQuestions });
console.log(`Prepared ${runs.length} runs in ${ROOT}. Tool: ${TOOL}`);
