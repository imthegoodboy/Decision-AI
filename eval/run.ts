/**
 * Experiment runner: baseline vs self-check vs Decision AI, clean vs poisoned.
 *
 *   npm run eval -- [--only tech-01,fin-02] [--limit 3] [--parallel 3]
 *
 * Every step is cached under eval/data/, so the run can be interrupted and
 * resumed, and every intermediate artefact can be inspected.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { mapLimit } from "@/lib/async";
import { CONDITIONS, POOL_SIZE, QUERIES_PER_QUESTION, ROOT, SYSTEMS, type Condition, type SystemName } from "./lib/config";
import { judgeAnswer, type Judgement } from "./lib/judge";
import { generatePlanted, poisonedSources, type PlantedSource } from "./lib/planted";
import { buildPool, type Pool, type Question } from "./lib/pool";
import { cached, dataPath, seedOf } from "./lib/store";
import { runSystem, type SystemOutput } from "./lib/systems";

process.env.RESEARCH_MAX_QUERIES ??= String(QUERIES_PER_QUESTION);
process.env.RESEARCH_MAX_SOURCES ??= String(POOL_SIZE + 4);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const questions: Question[] = JSON.parse(readFileSync(path.join(ROOT, "questions.json"), "utf8"));
const only = arg("only")?.split(",").map((s) => s.trim());
const limit = Number(arg("limit") ?? questions.length);
const parallel = Number(arg("parallel") ?? 3);
const selected = questions.filter((q) => !only || only.includes(q.id)).slice(0, limit);

function log(q: Question, msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${q.id.padEnd(10)} ${msg}`);
}

async function runQuestion(q: Question) {
  const pool = await cached<Pool>(dataPath("pools", `${q.id}.json`), async () => {
    log(q, "building source pool (plan → search → fetch)");
    return buildPool(q);
  });
  log(q, `pool: ${pool.sources.length} sources, ${pool.plan.criteria.length} criteria`);

  const planted = await cached<PlantedSource>(dataPath("planted", `${q.id}.json`), async () => {
    log(q, "generating planted source");
    return generatePlanted(q, pool);
  });

  const poolFor = (condition: Condition) =>
    condition === "clean" ? pool.sources : poisonedSources(pool.sources, planted.source, seedOf(q.id));

  for (const condition of CONDITIONS) {
    const sources = poolFor(condition);
    await Promise.all(
      SYSTEMS.map(async (system: SystemName) => {
        const output = await cached<SystemOutput>(dataPath("answers", `${q.id}.${system}.${condition}.json`), async () => {
          log(q, `running ${system} (${condition})`);
          const out = await runSystem(system, q, pool, sources);
          if (out.error) throw new Error(`${system}/${condition}: ${out.error}`);
          return out;
        });
        await cached<Judgement>(dataPath("judgements", `${q.id}.${system}.${condition}.json`), async () => {
          log(q, `judging ${system} (${condition})`);
          return judgeAnswer({ question: q.question, output, sources, planted: condition === "poisoned" ? planted : null });
        });
      }),
    );
  }
  log(q, "done");
}

async function main() {
  console.log(`Running ${selected.length} questions × ${SYSTEMS.length} systems × ${CONDITIONS.length} conditions (parallel ${parallel})`);
  const failures: { id: string; error: string }[] = [];
  await mapLimit(selected, parallel, async (q) => {
    try {
      await runQuestion(q);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failures.push({ id: q.id, error });
      log(q, `FAILED: ${error}`);
    }
  });
  console.log(`\nFinished. ${selected.length - failures.length} succeeded, ${failures.length} failed.`);
  for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
  if (failures.length) process.exitCode = 1;
}

main();
