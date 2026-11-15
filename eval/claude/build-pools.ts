/**
 * Builds the shared source pools for the Claude-agent study without any model:
 * fixed queries → keyless web search → SSRF-guarded fetch → extraction.
 *
 *   node --conditions=react-server --import tsx eval/claude/build-pools.ts [--only id,id]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { mapLimit } from "@/lib/async";
import { makeId } from "@/lib/utils";
import { gatherSources } from "@/server/pipeline/gather";
import { POOL_SIZE, SOURCE_CHAR_BUDGET } from "../lib/config";
import { readCache, writeCache } from "../lib/store";
import { CLAUDE_DATA, type StudyQuestion, type StudyPool } from "./shared";

const questions: StudyQuestion[] = JSON.parse(readFileSync(path.join(process.cwd(), "eval", "claude", "questions.json"), "utf8"));
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(",") : null;

async function build(q: StudyQuestion): Promise<string> {
  const file = path.join(CLAUDE_DATA, "pools", `${q.id}.json`);
  if (readCache(file)) return `${q.id}: cached`;
  const runId = `study_${q.id}`;
  type Recorded = { provider: string; queries: { query: string; results: { url: string; title: string; snippet: string }[] }[] };
  const recorded = readCache<Recorded>(path.join(CLAUDE_DATA, "search", `${q.id}.json`));
  if (!recorded) throw new Error(`${q.id}: no recorded search results`);
  const gathered = await gatherSources({
    presearched: recorded.queries.map((rq) => ({
      query: rq.query,
      provider: recorded.provider,
      hits: rq.results.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet, publishedAt: null, provider: recorded.provider })),
    })),
    queries: q.queries.map((query) => ({ query, intent: "discover" as const, optionHint: null })),
    region: q.region === "Global" ? null : q.region,
    runId,
    decisionId: runId,
    newId: () => makeId("src"),
    maxSources: POOL_SIZE + 6,
  });
  const readable = gathered.sources.filter((s) => s.status === "read" && s.wordCount >= 150);
  const sources = readable.slice(0, POOL_SIZE).map((s) => ({ ...s, text: s.text.slice(0, SOURCE_CHAR_BUDGET) }));
  if (sources.length < 5) throw new Error(`${q.id}: only ${sources.length} readable sources`);
  const pool: StudyPool = { questionId: q.id, builtAt: new Date().toISOString(), queries: gathered.queries, sources };
  writeCache(file, pool);
  return `${q.id}: ${sources.length} sources (${sources.map((s) => s.domain).join(", ")})`;
}

async function main() {
  const selected = questions.filter((q) => !only || only.includes(q.id));
  const results = await mapLimit(selected, 3, async (q) => {
    try {
      return await build(q);
    } catch (err) {
      return `${q.id}: FAILED ${err instanceof Error ? err.message : String(err)}`;
    }
  });
  for (const r of results) console.log(r);
}

main();
