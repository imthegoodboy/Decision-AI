import { describe, expect, it } from "vitest";
import type { Claim, Criterion, CriterionScore, DecisionOption, Source, VerificationStatus } from "@/lib/domain";
import { NEUTRAL_SCORE, confidenceLabel, decisiveness, effectiveWeights, isFresh, rankOptions } from "@/lib/scoring";

const now = new Date("2026-06-01T00:00:00Z");

const criteria: Criterion[] = [
  { id: "c_battery", name: "Battery", description: "", weight: 60, origin: "user" },
  { id: "c_camera", name: "Camera", description: "", weight: 40, origin: "inferred" },
];

const option = (id: string): DecisionOption => ({
  id,
  name: id,
  summary: "",
  image: null,
  officialUrl: null,
  priceText: null,
  userNamed: false,
  sourceIds: [],
});

const source = (id: string, score: number, publishedAt: string | null): Source => ({
  id,
  runId: "run",
  decisionId: "dec",
  url: `https://${id}.example`,
  domain: `${id}.example`,
  title: id,
  siteName: null,
  author: null,
  publishedAt,
  retrievedAt: now.toISOString(),
  contentHash: "x",
  wordCount: 1000,
  excerpt: "",
  image: null,
  favicon: null,
  kind: "independent-review",
  perspective: null,
  status: "read",
  query: null,
  provider: "test",
  reliability: { score, signals: [] },
});

const claim = (id: string, optionId: string, sourceId: string, status: VerificationStatus): Claim => ({
  id,
  optionId,
  criterionId: null,
  text: id,
  kind: "specification",
  sourceId,
  quote: "q",
  verification: {
    status,
    confidence: 0.9,
    quoteFound: true,
    quoteSimilarity: 1,
    passage: null,
    rationale: "",
    corroboratingSourceIds: [],
    conflictingSourceIds: [],
    conflictNote: null,
    verifiedAt: now.toISOString(),
  },
});

const sources = [source("s1", 80, "2026-04-01T00:00:00Z"), source("s2", 60, null)];
const claims = [
  claim("k1", "A", "s1", "supported"),
  claim("k2", "A", "s1", "supported"),
  claim("k3", "B", "s2", "partial"),
  claim("k4", "B", "s2", "unsupported"),
];
const scores: CriterionScore[] = [
  { optionId: "A", criterionId: "c_battery", score: 9, rationale: "", claimIds: ["k1"] },
  { optionId: "A", criterionId: "c_camera", score: 6, rationale: "", claimIds: ["k2"] },
  { optionId: "B", criterionId: "c_battery", score: 7, rationale: "", claimIds: ["k3"] },
  // Score backed only by an unsupported claim must be ignored (imputed neutral).
  { optionId: "B", criterionId: "c_camera", score: 10, rationale: "", claimIds: ["k4"] },
];

const base = {
  options: [option("A"), option("B")],
  criteria,
  scores,
  claims,
  sources,
  contradictions: [],
  freshnessDays: 365,
  now,
};

describe("rankOptions", () => {
  it("computes weighted totals from evidence-backed scores", () => {
    const [first, second] = rankOptions(base);
    expect(first.optionId).toBe("A");
    expect(first.total).toBeCloseTo(0.6 * 90 + 0.4 * 60, 5);
    expect(second.optionId).toBe("B");
    // Camera for B is imputed at the neutral score because its only claim is unsupported.
    const camera = second.breakdown.find((b) => b.criterionId === "c_camera")!;
    expect(camera.imputed).toBe(true);
    expect(camera.score).toBe(NEUTRAL_SCORE);
    expect(second.coverage).toBeCloseTo(0.6, 5);
  });

  it("re-ranks when the user changes weights", () => {
    const ranked = rankOptions({ ...base, weightOverrides: { c_battery: 0, c_camera: 100 } });
    expect(ranked[0].optionId).toBe("A");
    expect(ranked[0].total).toBeCloseTo(60, 5);
    expect(ranked[1].total).toBeCloseTo(50, 5);
  });

  it("lowers confidence for contradictions", () => {
    const calm = rankOptions(base).find((r) => r.optionId === "A")!;
    const contested = rankOptions({
      ...base,
      contradictions: [
        { id: "x", optionId: "A", criterionId: null, topic: "t", statements: [], assessment: "", favoredSourceId: null, severity: "high" },
      ],
    }).find((r) => r.optionId === "A")!;
    expect(contested.confidence).toBeLessThan(calm.confidence);
  });

  it("reports claim counts per status", () => {
    const b = rankOptions(base).find((r) => r.optionId === "B")!;
    expect(b.claimCounts).toEqual({ supported: 0, partial: 1, unsupported: 1, contradicted: 0 });
    expect(b.supportRate).toBeCloseTo(0.25, 5);
  });
});

describe("helpers", () => {
  it("clamps weight overrides", () => {
    const w = effectiveWeights(criteria, { c_battery: 250, c_camera: -5 });
    expect(w.get("c_battery")).toBe(100);
    expect(w.get("c_camera")).toBe(0);
  });
  it("labels confidence", () => {
    expect(confidenceLabel(0.8)).toBe("high");
    expect(confidenceLabel(0.5)).toBe("moderate");
    expect(confidenceLabel(0.2)).toBe("low");
  });
  it("classifies freshness", () => {
    expect(isFresh("2026-05-01T00:00:00Z", 60, now)).toBe(true);
    expect(isFresh("2024-05-01T00:00:00Z", 60, now)).toBe(false);
    expect(isFresh(null, 60, now)).toBeNull();
  });
  it("measures decisiveness", () => {
    const ranked = rankOptions(base);
    expect(["clear", "narrow", "tied"]).toContain(decisiveness(ranked));
    expect(decisiveness(ranked.slice(0, 1))).toBe("single");
  });
});
