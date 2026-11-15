import "server-only";
import { z } from "zod";
import { QueryIntent, type DecisionProfile, type ResearchPlan } from "@/lib/domain";
import { makeId } from "@/lib/utils";
import { structured } from "../ai/openai";
import { env } from "../config/env";

const PlanOutput = z.object({
  decisionType: z.string().describe("Short label for the kind of decision"),
  criteria: z
    .array(
      z.object({
        name: z.string().describe("2–4 word criterion name, e.g. 'Battery life'"),
        description: z.string().describe("What is measured and what 'better' means for this user"),
        weight: z.number().describe("Relative importance 0–100 for THIS user"),
        origin: z.enum(["user", "inferred"]).describe("'user' if the user stated it, else 'inferred'"),
      }),
    )
    .describe("4–7 criteria that will decide between options"),
  queries: z
    .array(
      z.object({
        query: z.string().describe("A web search query a careful researcher would type"),
        intent: QueryIntent,
        optionHint: z.string().nullable(),
      }),
    )
    .describe("Diverse queries: discover options, specifications, independent reviews, pricing, known problems"),
  freshnessDays: z.number().describe("How recent information must be for this decision, in days"),
  region: z.string().nullable().describe("Country or region the research should focus on, if any"),
  rationale: z.string().describe("One or two sentences on the research strategy"),
});

export async function planResearch(input: {
  profile: DecisionProfile;
  question: string;
  focus?: string | null;
  signal?: AbortSignal;
}): Promise<ResearchPlan> {
  const maxQueries = env().RESEARCH_MAX_QUERIES;
  const today = new Date().toISOString().slice(0, 10);
  const out = await structured({
    tier: "main",
    name: "research_plan",
    schema: PlanOutput,
    signal: input.signal,
    system: [
      "You plan web research for an evidence-based decision assistant.",
      `Today is ${today}. Plan at most ${maxQueries} search queries.`,
      "Criteria must reflect the user's stated priorities first (origin 'user'), then what experts would add (origin 'inferred').",
      "Weights express this user's priorities, not generic importance. Stated must-haves get the highest weights.",
      "Queries must be specific (include budget, region, year where relevant) and cover: discovering candidate options,",
      "official specifications, independent reviews or rankings, prices in the user's market, and known problems or complaints.",
      "If the user named specific options, include queries for each of them.",
      "freshnessDays: fast-moving markets (phones, laptops, prices) ~180–365; slow-changing ones (universities, policies) ~730–1460.",
    ].join("\n"),
    input: [
      `Decision: ${input.question}`,
      `Profile: ${JSON.stringify(input.profile)}`,
      input.focus ? `Additional focus requested by the user: ${input.focus}` : "",
    ].join("\n"),
  });

  const total = out.criteria.reduce((s, c) => s + Math.max(0, c.weight), 0) || 1;
  return {
    decisionType: out.decisionType,
    criteria: out.criteria.slice(0, 7).map((c) => ({
      id: makeId("crit"),
      name: c.name,
      description: c.description,
      weight: Math.round((Math.max(0, c.weight) / total) * 100),
      origin: c.origin,
    })),
    queries: dedupeQueries(out.queries).slice(0, maxQueries),
    freshnessDays: Math.round(Math.min(3650, Math.max(7, out.freshnessDays))),
    region: out.region,
    rationale: out.rationale,
  };
}

function dedupeQueries<T extends { query: string }>(qs: T[]): T[] {
  const seen = new Set<string>();
  return qs.filter((q) => {
    const k = q.query.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
