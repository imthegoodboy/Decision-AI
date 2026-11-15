import "server-only";
import { z } from "zod";
import { UncertaintyKind, type Claim, type Criterion, type DecisionOption, type DecisionProfile } from "@/lib/domain";
import type { RankedOption } from "@/lib/scoring";
import { structured } from "../ai/openai";
import { EVIDENCE_RULES } from "./prompts";

/** Contradiction finding, criterion scoring and the final recommendation. */

type ClaimView = Pick<Claim, "id" | "text" | "sourceId" | "optionId" | "criterionId"> & { status: string; reliability: number };

function claimLine(c: ClaimView): string {
  return `[${c.id}] (${c.status}; source ${c.sourceId}, reliability ${c.reliability}) ${c.text}`;
}

/* ───────────────────────────── Contradictions ───────────────────────────── */

const ContradictionOutput = z.object({
  contradictions: z.array(
    z.object({
      option: z.string().nullable().describe("Option name, or null if general"),
      topic: z.string().describe("What the sources disagree about, e.g. 'Battery capacity'"),
      claimIds: z.array(z.string()).describe("Ids of the conflicting claims (at least two, from different sources)"),
      assessment: z.string().describe("Which side is more credible and why (reliability, recency, primary source), or why it is unresolved"),
      favoredClaimId: z.string().nullable(),
      severity: z.enum(["high", "medium", "low"]).describe("high if it could change the recommendation"),
    }),
  ),
});

export async function findContradictions(input: {
  options: DecisionOption[];
  claims: ClaimView[];
  signal?: AbortSignal;
}) {
  const relevant = input.claims.filter((c) => c.status !== "unsupported");
  if (relevant.length < 2) return [];
  const out = await structured({
    tier: "fast",
    name: "contradictions",
    schema: ContradictionOutput,
    signal: input.signal,
    system: [
      "Find genuine contradictions between claims from DIFFERENT sources about the same option and attribute.",
      "Ignore differences explained by variant, region, configuration or date; ignore claims from the same source.",
      "Do not invent contradictions. An empty list is a valid answer.",
    ].join("\n"),
    input: input.options
      .map((o) => {
        const lines = relevant.filter((c) => c.optionId === o.id).map(claimLine);
        return lines.length ? `Option: ${o.name}\n${lines.join("\n")}` : "";
      })
      .filter(Boolean)
      .join("\n\n"),
  });
  const claimById = new Map(input.claims.map((c) => [c.id, c]));
  return out.contradictions
    .map((c) => ({ ...c, claimIds: c.claimIds.filter((id) => claimById.has(id)) }))
    .filter((c) => new Set(c.claimIds.map((id) => claimById.get(id)!.sourceId)).size >= 2);
}

/* ───────────────────────────── Scoring ───────────────────────────── */

const ScoreOutput = z.object({
  scores: z.array(
    z.object({
      option: z.string().describe("Exact option name"),
      criterion: z.string().describe("Exact criterion name"),
      score: z.number().nullable().describe("0–10 for this user, or null if the claims do not cover it"),
      rationale: z.string().describe("One sentence grounded in the cited claims"),
      claimIds: z.array(z.string()).describe("Ids of the verified claims this score relies on"),
    }),
  ),
});

export async function scoreOptions(input: {
  profile: DecisionProfile;
  criteria: Criterion[];
  options: DecisionOption[];
  claims: ClaimView[];
  signal?: AbortSignal;
}) {
  const usable = input.claims.filter((c) => c.status === "supported" || c.status === "partial");
  const out = await structured({
    tier: "main",
    name: "criterion_scores",
    schema: ScoreOutput,
    signal: input.signal,
    system: [
      "Score each option on each criterion from 0 (very poor for this user) to 10 (excellent for this user).",
      "Use ONLY the verified claims listed. Cite the claim ids you used. If no claim covers a pair, return score null.",
      "Scores are relative to the user's needs and budget, and comparable across options.",
      "Return one entry for every option × criterion pair.",
      EVIDENCE_RULES,
    ].join("\n"),
    input: [
      `User profile: ${JSON.stringify(input.profile)}`,
      `Criteria:\n${input.criteria.map((c) => `- ${c.name}: ${c.description}`).join("\n")}`,
      `Options: ${input.options.map((o) => o.name).join(" | ")}`,
      `Verified claims:\n${usable.map(claimLine).join("\n")}`,
    ].join("\n\n"),
  });
  const optionByName = byName(input.options);
  const criterionByName = byName(input.criteria);
  const validClaims = new Set(usable.map((c) => c.id));
  return out.scores.flatMap((s) => {
    const option = optionByName(s.option);
    const criterion = criterionByName(s.criterion);
    if (!option || !criterion) return [];
    return [
      {
        optionId: option.id,
        criterionId: criterion.id,
        score: s.score == null ? null : Math.max(0, Math.min(10, s.score)),
        rationale: s.rationale,
        claimIds: s.claimIds.filter((id) => validClaims.has(id)),
      },
    ];
  });
}

/* ───────────────────────────── Recommendation ───────────────────────────── */

const RecommendationOutput = z.object({
  headline: z.string().describe("One sentence recommendation naming the option"),
  summary: z.string().describe("2–4 sentences: why this option for this user, and how confident the evidence allows us to be"),
  reasons: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })).describe("3–5 reasons, each backed by claim ids"),
  tradeoffs: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })).describe("What the user gives up"),
  alternatives: z.array(z.object({ option: z.string(), when: z.string() })).describe("When another option would be the better choice"),
  caveats: z.array(z.string()).describe("Conflicts or gaps the user should know before deciding"),
  nextSteps: z.array(z.string()).describe("Concrete checks the user can do before committing"),
  uncertainties: z.array(
    z.object({
      kind: UncertaintyKind,
      text: z.string(),
      option: z.string().nullable(),
      impact: z.enum(["high", "medium", "low"]),
      howToResolve: z.string().nullable(),
    }),
  ),
});

export async function recommend(input: {
  question: string;
  profile: DecisionProfile;
  criteria: Criterion[];
  options: DecisionOption[];
  ranked: RankedOption[];
  claims: ClaimView[];
  contradictions: { topic: string; assessment: string; option: string | null }[];
  signal?: AbortSignal;
}) {
  const nameOf = new Map(input.options.map((o) => [o.id, o.name]));
  const leader = input.ranked[0];
  const usable = input.claims.filter((c) => c.status === "supported" || c.status === "partial");
  const out = await structured({
    tier: "main",
    name: "recommendation",
    schema: RecommendationOutput,
    signal: input.signal,
    system: [
      "You write the recommendation of an evidence-based decision assistant.",
      `Recommend the top-ranked option (${nameOf.get(leader.optionId)}); the ranking was computed from verified evidence and the user's weights.`,
      "If the lead is narrow or confidence is low, say so plainly. Never overstate certainty.",
      "Every reason and trade-off must cite claim ids from the verified claims list. Only cite listed ids.",
      "Separate facts (from claims) from your interpretation. Be concise and concrete.",
      "uncertainties: assumptions you made about the user, incomplete evidence, unknowns, outdated or single-source facts.",
      EVIDENCE_RULES,
    ].join("\n"),
    input: [
      `Decision: ${input.question}`,
      `User profile: ${JSON.stringify(input.profile)}`,
      `Ranking (0–100, confidence 0–1):\n${input.ranked
        .map((r) => `${r.rank}. ${nameOf.get(r.optionId)} — score ${r.total}, confidence ${r.confidence} (${r.confidenceLabel}), evidence coverage ${r.coverage}`)
        .join("\n")}`,
      `Criteria: ${input.criteria.map((c) => `${c.name} (weight ${c.weight})`).join(", ")}`,
      `Verified claims:\n${usable.map(claimLine).join("\n")}`,
      `Contradictions:\n${input.contradictions.map((c) => `- ${c.option ?? "general"}: ${c.topic} — ${c.assessment}`).join("\n") || "none"}`,
    ].join("\n\n"),
  });
  const validClaims = new Set(usable.map((c) => c.id));
  const keep = (ids: string[]) => ids.filter((id) => validClaims.has(id));
  const optionByName = byName(input.options);
  return {
    recommendation: {
      optionId: leader.optionId,
      headline: out.headline,
      summary: out.summary,
      reasons: out.reasons.map((r) => ({ text: r.text, claimIds: keep(r.claimIds) })),
      tradeoffs: out.tradeoffs.map((r) => ({ text: r.text, claimIds: keep(r.claimIds) })),
      alternatives: out.alternatives.flatMap((a) => {
        const o = optionByName(a.option);
        return o && o.id !== leader.optionId ? [{ optionId: o.id, when: a.when }] : [];
      }),
      caveats: out.caveats,
      nextSteps: out.nextSteps,
    },
    uncertainties: out.uncertainties.map((u) => ({
      kind: u.kind,
      text: u.text,
      optionId: u.option ? optionByName(u.option)?.id ?? null : null,
      impact: u.impact,
      howToResolve: u.howToResolve,
    })),
  };
}

/** Case- and punctuation-insensitive name lookup, tolerant of models abbreviating names. */
export function byName<T extends { name: string; id: string }>(items: T[]) {
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const map = new Map(items.map((i) => [key(i.name), i]));
  return (name: string | null | undefined): T | undefined => {
    if (!name) return undefined;
    const k = key(name);
    if (map.has(k)) return map.get(k);
    for (const [ik, item] of map) if (ik.includes(k) || k.includes(ik)) return item;
    return undefined;
  };
}
