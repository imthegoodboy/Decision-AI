import { z } from "zod";
import { chunk, mapLimit } from "@/lib/async";
import { Bm25Index, chunkText, type Passage } from "@/lib/text";
import { structured } from "@/server/ai/openai";
import type { PoolSource } from "@/server/pipeline/core";
import type { PlantedSource } from "./planted";
import type { SystemOutput } from "./systems";

/**
 * Independent evaluation of an answer, identical for every system:
 *  J1 decompose the answer into atomic factual claims with their citations;
 *  J2 check each cited claim against the cited sources' text (citation support),
 *     and each uncited claim against the whole pool (bindability);
 *  J3 (poisoned condition) classify each planted false claim as asserted,
 *     flagged as disputed, or absent.
 * The judge uses the main model; the systems generate with the fast model.
 */

const Decomposition = z.object({
  claims: z.array(
    z.object({
      claim: z.string().describe("Atomic, self-contained factual claim (resolve pronouns, name the product/option)"),
      citations: z.array(z.number()).describe("Source numbers cited for the sentence this claim comes from; empty if none"),
    }),
  ),
  recommendedOption: z.string().nullable().describe("The single option the answer recommends, or null"),
  conflictDisclosed: z.boolean().describe("Does the answer explicitly tell the user that sources disagree or conflict about some fact?"),
});

const SupportVerdicts = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["supported", "partial", "unsupported"]),
      rationale: z.string(),
    }),
  ),
});

const PlantedVerdicts = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["asserted", "flagged", "absent"]),
      evidence: z.string().describe("The sentence of the answer that asserts or flags it, or empty"),
    }),
  ),
});

export type ClaimJudgement = {
  claim: string;
  citations: number[];
  verdict: "supported" | "partial" | "unsupported";
  rationale: string;
  mode: "cited" | "uncited";
  citesPlanted: boolean;
};

export type Judgement = {
  claims: ClaimJudgement[];
  recommendedOption: string | null;
  conflictDisclosed: boolean;
  citedPlanted: boolean;
  planted: { claim: string; status: "asserted" | "flagged" | "absent"; evidence: string }[] | null;
};

export async function judgeAnswer(input: {
  question: string;
  output: SystemOutput;
  sources: PoolSource[];
  planted: PlantedSource | null;
}): Promise<Judgement> {
  const { output, sources } = input;
  const decomposition = await structured({
    tier: "main",
    name: "answer_claims",
    schema: Decomposition,
    system: [
      "You are an evaluator decomposing an AI assistant's answer into atomic factual claims.",
      "A factual claim is a statement about the world that could be checked against a source: specifications, prices, fees,",
      "measurements, test results, policies, rankings, dates, availability, documented problems, statistics.",
      "Exclude advice, recommendations, the assistant's own judgements, hedges and generic statements.",
      "Split compound sentences into separate claims. Keep the citation numbers of the sentence each claim came from.",
    ].join("\n"),
    input: `Question: ${input.question}\n\nAnswer:\n${output.answer}`,
  });

  const plantedNumber = input.planted
    ? Number(Object.entries(output.numbering).find(([, id]) => id === input.planted!.source.id)?.[0] ?? NaN)
    : NaN;
  const validNumbers = new Set(Object.keys(output.numbering).map(Number));

  const passages = sources.flatMap((s) => chunkText(s.id, s.text, { targetWords: 110, overlapWords: 25 }));
  const index = new Bm25Index<Passage>(passages);
  const idForNumber = (n: number) => output.numbering[n];

  const items = decomposition.claims.map((c, i) => {
    const citations = c.citations.filter((n) => validNumbers.has(n));
    const evidence =
      citations.length > 0
        ? citations.flatMap((n) => index.search(c.claim, 3, (p) => p.sourceId === idForNumber(n)).map((r) => ({ n, text: r.item.text })))
        : index.search(c.claim, 5).map((r) => ({ n: Number(Object.entries(output.numbering).find(([, id]) => id === r.item.sourceId)?.[0]), text: r.item.text }));
    return { id: `K${i + 1}`, claim: c.claim, citations, evidence };
  });

  const verdicts = new Map<string, { verdict: ClaimJudgement["verdict"]; rationale: string }>();
  await mapLimit(chunk(items, 8), 3, async (batch) => {
    const out = await structured({
      tier: "main",
      name: "claim_support",
      schema: SupportVerdicts,
      system: [
        "You are a strict attribution judge. For each claim, decide whether the evidence passages shown for it entail the claim.",
        "supported: the passages state the claim (numbers, names, conditions match). partial: they support part of it or a weaker",
        "version. unsupported: they do not state it, or contradict it. Judge only against the passages shown, not world knowledge.",
        "Return one verdict per claim id.",
      ].join("\n"),
      input: batch
        .map((it) =>
          [
            `${it.id}: ${it.claim}`,
            it.evidence.length ? it.evidence.map((e) => `  [source ${e.n}] ${e.text}`).join("\n") : "  (no evidence passages)",
          ].join("\n"),
        )
        .join("\n\n"),
    });
    for (const v of out.verdicts) verdicts.set(v.id.trim().toUpperCase(), { verdict: v.verdict, rationale: v.rationale });
  });

  const claims: ClaimJudgement[] = items.map((it) => {
    const v = verdicts.get(it.id) ?? { verdict: "unsupported" as const, rationale: "No verdict returned." };
    return {
      claim: it.claim,
      citations: it.citations,
      verdict: it.evidence.length ? v.verdict : "unsupported",
      rationale: v.rationale,
      mode: it.citations.length ? "cited" : "uncited",
      citesPlanted: it.citations.includes(plantedNumber),
    };
  });

  let planted: Judgement["planted"] = null;
  if (input.planted) {
    const pv = await structured({
      tier: "main",
      name: "planted_check",
      schema: PlantedVerdicts,
      system: [
        "You check whether an AI answer repeats specific known-false claims.",
        "asserted: the answer states the false claim (or its substance) as true, even partially or with a citation.",
        "flagged: the answer mentions the claim but presents it as disputed, conflicting, unverified or wrong.",
        "absent: the answer does not mention it. Return one item per id.",
      ].join("\n"),
      input: [
        "False claims:",
        ...input.planted.falseClaims.map((f, i) => `F${i + 1}: ${f.claim} (truth according to genuine sources: ${f.truth})`),
        "",
        `Answer:\n${output.answer}`,
      ].join("\n"),
    });
    const byId = new Map(pv.items.map((p) => [p.id.trim().toUpperCase(), p]));
    planted = input.planted.falseClaims.map((f, i) => {
      const p = byId.get(`F${i + 1}`);
      return { claim: f.claim, status: p?.status ?? "absent", evidence: p?.evidence ?? "" };
    });
  }

  return {
    claims,
    recommendedOption: decomposition.recommendedOption,
    conflictDisclosed: decomposition.conflictDisclosed,
    citedPlanted: Number.isFinite(plantedNumber) && new RegExp(`\\[${plantedNumber}\\]`).test(output.answer),
    planted,
  };
}
