/**
 * Deterministic ranking and confidence.
 *
 * The model scores each option against each criterion (0–10) from verified
 * evidence; everything after that — weighting, evidence coverage, confidence —
 * happens here so it is reproducible, explainable and unit tested. This module is
 * shared with the browser so priority sliders re-rank instantly.
 */
import type {
  Claim,
  Contradiction,
  Criterion,
  CriterionScore,
  DecisionOption,
  Source,
  VerificationStatus,
} from "./domain";
import { round } from "./text";

/** Score assumed for a criterion with no usable evidence. Neutral, but flagged. */
export const NEUTRAL_SCORE = 5;

export const CONFIDENCE_WEIGHTS = {
  coverage: 0.35,
  support: 0.3,
  reliability: 0.2,
  freshness: 0.15,
} as const;

export const CONTRADICTION_PENALTY = { high: 0.08, medium: 0.04, low: 0.01 } as const;
export const MAX_CONTRADICTION_PENALTY = 0.2;

export type ConfidenceLabel = "high" | "moderate" | "low";

export type CriterionBreakdown = {
  criterionId: string;
  weight: number;
  normalizedWeight: number;
  score: number;
  imputed: boolean;
  contribution: number;
};

export type RankedOption = {
  optionId: string;
  rank: number;
  total: number; // 0–100
  breakdown: CriterionBreakdown[];
  coverage: number; // 0–1, share of weight backed by evidence
  supportRate: number; // 0–1
  averageReliability: number; // 0–100
  freshShare: number; // 0–1
  contradictionPenalty: number;
  confidence: number; // 0–1
  confidenceLabel: ConfidenceLabel;
  claimCounts: Record<VerificationStatus, number>;
};

export type RankingInput = {
  options: DecisionOption[];
  criteria: Criterion[];
  scores: CriterionScore[];
  claims: Claim[];
  sources: Source[];
  contradictions: Contradiction[];
  freshnessDays: number;
  /** User overrides keyed by criterion id. */
  weightOverrides?: Record<string, number>;
  now?: Date;
};

export function effectiveWeights(
  criteria: Criterion[],
  overrides: Record<string, number> = {},
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of criteria) {
    const w = overrides[c.id];
    m.set(c.id, clamp(typeof w === "number" && Number.isFinite(w) ? w : c.weight, 0, 100));
  }
  return m;
}

export function isUsableEvidence(claim: Claim): boolean {
  const s = claim.verification?.status;
  return s === "supported" || s === "partial";
}

export function isFresh(publishedAt: string | null, freshnessDays: number, now = new Date()): boolean | null {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000 <= freshnessDays;
}

export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.45) return "moderate";
  return "low";
}

export function rankOptions(input: RankingInput): RankedOption[] {
  const { options, criteria, scores, claims, sources, contradictions, freshnessDays } = input;
  const now = input.now ?? new Date();
  const weights = effectiveWeights(criteria, input.weightOverrides);
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const claimById = new Map(claims.map((c) => [c.id, c]));

  const ranked = options.map((option): Omit<RankedOption, "rank"> => {
    const optionClaims = claims.filter((c) => c.optionId === option.id && c.verification);
    const claimCounts: Record<VerificationStatus, number> = {
      supported: 0,
      partial: 0,
      unsupported: 0,
      contradicted: 0,
    };
    for (const c of optionClaims) claimCounts[c.verification!.status]++;

    let total = 0;
    let coveredWeight = 0;
    const breakdown: CriterionBreakdown[] = criteria.map((criterion) => {
      const weight = weights.get(criterion.id) ?? 0;
      const normalizedWeight = totalWeight > 0 ? weight / totalWeight : 1 / Math.max(1, criteria.length);
      const entry = scores.find((s) => s.optionId === option.id && s.criterionId === criterion.id);
      const backed =
        entry?.score != null &&
        entry.claimIds.some((id) => {
          const claim = claimById.get(id);
          return claim ? isUsableEvidence(claim) : false;
        });
      const imputed = !backed;
      const score = backed ? clamp(entry!.score!, 0, 10) : NEUTRAL_SCORE;
      if (backed) coveredWeight += normalizedWeight;
      const contribution = normalizedWeight * score * 10;
      total += contribution;
      return { criterionId: criterion.id, weight, normalizedWeight, score, imputed, contribution };
    });

    const verifiedTotal = optionClaims.length;
    const supportRate =
      verifiedTotal === 0 ? 0 : (claimCounts.supported + 0.5 * claimCounts.partial) / verifiedTotal;

    const usedSourceIds = new Set(optionClaims.filter(isUsableEvidence).map((c) => c.sourceId));
    const usedSources = [...usedSourceIds].map((id) => sourceById.get(id)).filter(Boolean) as Source[];
    const averageReliability =
      usedSources.length === 0
        ? 0
        : usedSources.reduce((s, src) => s + src.reliability.score, 0) / usedSources.length;
    const dated = usedSources
      .map((s) => isFresh(s.publishedAt, freshnessDays, now))
      .filter((v): v is boolean => v !== null);
    // Undated sources count as half-fresh: unknown age is itself an uncertainty.
    const undated = usedSources.length - dated.length;
    const freshShare =
      usedSources.length === 0 ? 0 : (dated.filter(Boolean).length + 0.5 * undated) / usedSources.length;

    const contradictionPenalty = Math.min(
      MAX_CONTRADICTION_PENALTY,
      contradictions
        .filter((c) => c.optionId === option.id)
        .reduce((p, c) => p + CONTRADICTION_PENALTY[c.severity], 0),
    );

    const confidence = clamp(
      CONFIDENCE_WEIGHTS.coverage * coveredWeight +
        CONFIDENCE_WEIGHTS.support * supportRate +
        CONFIDENCE_WEIGHTS.reliability * (averageReliability / 100) +
        CONFIDENCE_WEIGHTS.freshness * freshShare -
        contradictionPenalty,
      0,
      1,
    );

    return {
      optionId: option.id,
      total: round(total, 1),
      breakdown,
      coverage: round(coveredWeight, 3),
      supportRate: round(supportRate, 3),
      averageReliability: round(averageReliability, 1),
      freshShare: round(freshShare, 3),
      contradictionPenalty: round(contradictionPenalty, 3),
      confidence: round(confidence, 3),
      confidenceLabel: confidenceLabel(confidence),
      claimCounts,
    };
  });

  return ranked
    .sort((a, b) => b.total - a.total || b.confidence - a.confidence)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** How decisively the leader beats the runner-up, used to phrase recommendations. */
export function decisiveness(ranked: RankedOption[]): "clear" | "narrow" | "tied" | "single" {
  if (ranked.length < 2) return "single";
  const gap = ranked[0].total - ranked[1].total;
  if (gap < 1.5) return "tied";
  if (gap < 6) return "narrow";
  return "clear";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
