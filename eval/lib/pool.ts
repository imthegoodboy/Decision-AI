import { emptyProfile, type DecisionProfile, type ResearchPlan } from "@/lib/domain";
import { makeId } from "@/lib/utils";
import { planResearch } from "@/server/agents/planner";
import type { PoolSource } from "@/server/pipeline/core";
import { gatherSources } from "@/server/pipeline/gather";
import { POOL_SIZE, SOURCE_CHAR_BUDGET } from "./config";

export type Question = { id: string; domain: string; region: string; question: string };

export type Pool = {
  questionId: string;
  builtAt: string;
  profile: DecisionProfile;
  plan: ResearchPlan;
  queries: { query: string; provider: string | null; results: number; errors: string[] }[];
  sources: PoolSource[];
};

export function profileFor(q: Question): DecisionProfile {
  return {
    ...emptyProfile(),
    goal: q.question,
    locale: { country: q.region === "Global" ? null : q.region, currency: null },
    context: [q.question],
  };
}

/** Plans queries, searches the live web, fetches and extracts pages. Shared by every system. */
export async function buildPool(q: Question): Promise<Pool> {
  const profile = profileFor(q);
  const plan = await planResearch({ profile, question: q.question });
  const runId = `eval_${q.id}`;
  const gathered = await gatherSources({
    queries: plan.queries,
    region: plan.region ?? (q.region === "Global" ? null : q.region),
    runId,
    decisionId: runId,
    newId: () => makeId("src"),
    maxSources: POOL_SIZE + 4, // fetch a few spares; unreadable pages are dropped below
  });
  const readable = gathered.sources.filter((s) => s.status === "read" && s.wordCount >= 150);
  const sources = readable.slice(0, POOL_SIZE).map((s) => ({ ...s, text: s.text.slice(0, SOURCE_CHAR_BUDGET) }));
  if (sources.length < 4) throw new Error(`Only ${sources.length} readable sources for ${q.id}`);
  return { questionId: q.id, builtAt: new Date().toISOString(), profile, plan, queries: gathered.queries, sources };
}
