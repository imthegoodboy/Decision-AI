import "server-only";
import { z } from "zod";
import { ClaimKind } from "@/lib/domain";
import type { Passage } from "@/lib/text";
import { structured } from "../ai/openai";
import { EVIDENCE_RULES, block } from "./prompts";

/**
 * Extracts atomic, checkable claims from one source. Each claim carries the
 * passage id and a verbatim quote, which the verifier later checks
 * deterministically against the stored page text.
 */

const ClaimsOutput = z.object({
  claims: z.array(
    z.object({
      option: z.string().describe("Exact option name from the list, or 'general' if not about a single option"),
      criterion: z.string().describe("Exact criterion name from the list, or 'other'"),
      claim: z.string().describe("Self-contained factual statement, naming the option explicitly"),
      kind: ClaimKind,
      passage: z.string().describe("Passage id the quote is copied from, e.g. P2"),
      quote: z.string().describe("Verbatim sentence(s) from that passage stating the claim"),
    }),
  ),
});

export type RawClaim = {
  option: string;
  criterion: string;
  claim: string;
  kind: z.infer<typeof ClaimKind>;
  passageId: string | null;
  quote: string;
};

export async function extractClaims(input: {
  sourceTitle: string;
  sourceUrl: string;
  passages: Passage[];
  options: string[];
  criteria: string[];
  maxClaims?: number;
  signal?: AbortSignal;
}): Promise<RawClaim[]> {
  if (input.passages.length === 0) return [];
  const local = new Map(input.passages.map((p, i) => [`P${i + 1}`, p]));
  const out = await structured({
    tier: "fast",
    name: "claims",
    schema: ClaimsOutput,
    signal: input.signal,
    system: [
      "You extract decision-relevant factual claims from one web source.",
      `Extract up to ${input.maxClaims ?? 12} claims that bear on the criteria for the listed options:`,
      "specifications, measured performance, prices, policies, warranty, rankings, fees, outcomes, documented problems.",
      "Each claim must be atomic (one fact), self-contained (names the option), and supported by a verbatim quote.",
      "Prefer concrete, checkable facts (numbers, dates, named features) over vague praise.",
      "Opinions or user experiences may be included only with kind 'opinion' or 'experience' and attributed ('Reviewer says…').",
      EVIDENCE_RULES,
    ].join("\n"),
    input: [
      `Options: ${input.options.join(" | ")}`,
      `Criteria: ${input.criteria.join(" | ")}`,
      `Source: ${input.sourceTitle} — ${input.sourceUrl}`,
      "",
      ...[...local.entries()].map(([id, p]) => block(id, "", p.text)),
    ].join("\n"),
  });
  return out.claims
    .filter((c) => c.claim.trim() && c.quote.trim())
    .map((c) => ({
      option: c.option,
      criterion: c.criterion,
      claim: c.claim.trim(),
      kind: c.kind,
      passageId: local.get(c.passage.trim().toUpperCase())?.id ?? null,
      quote: c.quote.trim(),
    }));
}
