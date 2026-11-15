import "server-only";
import { chunk, settleLimit } from "@/lib/async";
import type {
  Claim,
  Contradiction,
  DecisionOption,
  DecisionProfile,
  Dossier,
  PipelineEvent,
  ResearchPlan,
  Source,
  Uncertainty,
} from "@/lib/domain";
import { earnedSignals, priorSignals, scoreFromSignals, type TrackRecord } from "@/lib/reliability";
import { isFresh, rankOptions } from "@/lib/scoring";
import { makeId } from "@/lib/utils";
import { embed } from "../ai/openai";
import { extractClaims } from "../agents/claims";
import { identifyOptions } from "../agents/options";
import { classifySources } from "../agents/sources";
import { byName, findContradictions, recommend, scoreOptions } from "../agents/synthesis";
import { verifyClaims } from "../agents/verifier";
import { PassageIndex } from "../research/retrieval";

/**
 * The verification core: given a pool of fetched sources, produce a fully
 * verified dossier. Pure with respect to storage — the web app wraps it with
 * search, persistence and audit; the evaluation harness calls it directly on a
 * fixed source pool so every system sees identical evidence.
 */

export type PoolSource = Omit<Source, "kind" | "perspective" | "reliability"> & { text: string };

export type CoreInput = {
  question: string;
  profile: DecisionProfile;
  plan: ResearchPlan;
  sources: PoolSource[];
  concurrency: number;
  maxOptions?: number;
  claimsPerSource?: number;
  emit?: (event: PipelineEvent) => void;
  signal?: AbortSignal;
};

export type CoreOutput = {
  sources: Source[];
  dossier: Omit<Dossier, "metrics">;
  excludedOptions: { name: string; reason: string }[];
  stats: { passages: number; dense: boolean };
};

export async function runVerificationCore(input: CoreInput): Promise<CoreOutput> {
  const emit = input.emit ?? (() => undefined);
  const { plan, signal } = input;
  const readable = input.sources.filter((s) => s.status === "read" && s.text.trim().length > 0);

  /* 1 — classify sources and compute metadata-based reliability */
  emit({ type: "stage", stage: "assess", status: "start" });
  const classes = await classifySources(
    input.sources.map((s) => ({ id: s.id, url: s.url, title: s.title, excerpt: s.excerpt || s.text.slice(0, 600) })),
    signal,
  );
  const sources: Source[] = input.sources.map((s) => {
    const c = classes.get(s.id);
    const kind = c?.kind ?? "other";
    const base = { ...s, siteName: s.siteName ?? c?.publisher ?? null, kind };
    const signals = priorSignals(base, plan.freshnessDays);
    const { text: _text, ...rest } = base;
    void _text;
    return { ...rest, perspective: c?.perspective ?? null, reliability: { score: scoreFromSignals(signals), signals } };
  });
  for (const s of sources) {
    emit({ type: "source", source: { id: s.id, url: s.url, domain: s.domain, title: s.title, favicon: s.favicon, status: s.status, kind: s.kind, reliability: s.reliability.score } });
  }
  emit({ type: "stage", stage: "assess", status: "done", detail: `${sources.length} sources assessed` });

  /* 2 — candidate options */
  emit({ type: "stage", stage: "options", status: "start" });
  const identified = await identifyOptions({
    question: input.question,
    profile: input.profile,
    plan,
    sources: readable.map((s) => ({ id: s.id, title: s.title, url: s.url, text: s.text })),
    maxOptions: input.maxOptions,
    signal,
  });
  const options: DecisionOption[] = identified.options.map((o) => ({
    id: makeId("opt"),
    name: o.name,
    summary: o.summary,
    image: null,
    officialUrl: o.officialUrl,
    priceText: o.priceText,
    userNamed: o.userNamed,
    sourceIds: o.sourceIds,
  }));
  for (const o of options) emit({ type: "option", option: { id: o.id, name: o.name, image: null } });
  emit({ type: "stage", stage: "options", status: "done", detail: `${options.length} candidates` });
  if (options.length === 0) throw new Error("The sources did not mention any options that fit this decision. Try rephrasing or widening the constraints.");

  /* 3 — passage index (lexical + dense) */
  const index = new PassageIndex(readable.map((s) => ({ sourceId: s.id, text: s.text })));
  const dense = await index.enableDense((texts) => embed(texts, signal));

  /* 4 — claim extraction per source */
  emit({ type: "stage", stage: "extract", status: "start" });
  const optionByName = byName(options);
  const criterionByName = byName(plan.criteria);
  const focusQuery = [...options.map((o) => o.name), ...plan.criteria.map((c) => c.name)].join(" ");
  let extractedDone = 0;
  const extracted = await settleLimit(readable, input.concurrency, async (source) => {
    const relevant = index.search(focusQuery, { k: 8, sourceId: source.id });
    const passages = (relevant.length ? relevant : index.forSource(source.id).slice(0, 6)).sort((a, b) => a.index - b.index);
    const raw = await extractClaims({
      sourceTitle: source.title,
      sourceUrl: source.url,
      passages,
      options: options.map((o) => o.name),
      criteria: plan.criteria.map((c) => c.name),
      maxClaims: input.claimsPerSource ?? 10,
      signal,
    });
    emit({ type: "progress", stage: "extract", done: ++extractedDone, total: readable.length, detail: source.domain });
    return raw.map(
      (r): Claim => ({
        id: makeId("clm"),
        optionId: r.option.toLowerCase() === "general" ? null : optionByName(r.option)?.id ?? null,
        criterionId: r.criterion.toLowerCase() === "other" ? null : criterionByName(r.criterion)?.id ?? null,
        text: r.claim,
        kind: r.kind,
        sourceId: source.id,
        quote: r.quote,
        verification: null,
      }),
    );
  });
  const claims = extracted.flatMap((r) => (r.ok ? r.value : []));
  emit({ type: "stage", stage: "extract", status: "done", detail: `${claims.length} claims from ${readable.length} sources` });

  /* 5 — verification */
  emit({ type: "stage", stage: "verify", status: "start" });
  const textById = new Map(readable.map((s) => [s.id, s.text]));
  const claimVectors = dense ? await embed(claims.map((c) => c.text), signal) : null;
  const vectorByText = new Map(claimVectors ? claims.map((c, i) => [c.text, claimVectors[i]]) : []);
  let verifiedDone = 0;
  const batches = chunk(claims, 6);
  const verdictBatches = await settleLimit(batches, input.concurrency, async (batch) => {
    const res = await verifyClaims(batch, {
      index,
      sourceText: (id) => textById.get(id) ?? "",
      queryVector: (t) => vectorByText.get(t) ?? null,
    }, { batchSize: batch.length, signal });
    verifiedDone += batch.length;
    emit({ type: "progress", stage: "verify", done: verifiedDone, total: claims.length });
    for (const c of batch) {
      const v = res.get(c.id);
      if (v) emit({ type: "claim", claim: { id: c.id, text: c.text, optionId: c.optionId, sourceId: c.sourceId, status: v.status } });
    }
    return res;
  });
  for (const r of verdictBatches) {
    if (!r.ok) continue;
    for (const c of claims) {
      const v = r.value.get(c.id);
      if (v) c.verification = v;
    }
  }
  const verified = claims.filter((c) => c.verification);
  emit({ type: "stage", stage: "verify", status: "done", detail: `${verified.length} claims checked` });

  /* 6 — earned reliability from the verification track record */
  const records = new Map<string, TrackRecord>();
  for (const c of verified) {
    const r = records.get(c.sourceId) ?? { supported: 0, partial: 0, unsupported: 0, contradicted: 0, corroborated: 0 };
    r[c.verification!.status]++;
    if (c.verification!.corroboratingSourceIds.length > 0) r.corroborated++;
    records.set(c.sourceId, r);
  }
  for (const s of sources) {
    const record = records.get(s.id);
    if (!record) continue;
    const signals = [...s.reliability.signals, ...earnedSignals(record)];
    s.reliability = { score: scoreFromSignals(signals), signals };
  }
  const reliabilityOf = new Map(sources.map((s) => [s.id, s.reliability.score]));

  const claimViews = verified.map((c) => ({
    id: c.id,
    text: c.text,
    sourceId: c.sourceId,
    optionId: c.optionId,
    criterionId: c.criterionId,
    status: c.verification!.status,
    reliability: reliabilityOf.get(c.sourceId) ?? 50,
  }));

  /* 7 — contradictions (model-found + verifier-found) */
  emit({ type: "stage", stage: "contradictions", status: "start" });
  const found = await findContradictions({ options, claims: claimViews, signal }).catch(() => []);
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const contradictions: Contradiction[] = found.map((f) => ({
    id: makeId("con"),
    optionId: optionByName(f.option)?.id ?? claimById.get(f.claimIds[0])?.optionId ?? null,
    criterionId: claimById.get(f.claimIds[0])?.criterionId ?? null,
    topic: f.topic,
    statements: f.claimIds.map((id) => ({ claimId: id, sourceId: claimById.get(id)!.sourceId, text: claimById.get(id)!.text })),
    assessment: f.assessment,
    favoredSourceId: f.favoredClaimId ? claimById.get(f.favoredClaimId)?.sourceId ?? null : null,
    severity: f.severity,
  }));
  const covered = new Set(contradictions.flatMap((c) => c.statements.map((s) => s.claimId)));
  for (const c of verified) {
    if (c.verification!.status !== "contradicted" || covered.has(c.id)) continue;
    contradictions.push({
      id: makeId("con"),
      optionId: c.optionId,
      criterionId: c.criterionId,
      topic: c.text.slice(0, 80),
      statements: [
        { claimId: c.id, sourceId: c.sourceId, text: c.text },
        ...c.verification!.conflictingSourceIds.map((sid) => ({ claimId: null, sourceId: sid, text: c.verification!.conflictNote ?? "States a different value." })),
      ],
      assessment: c.verification!.conflictNote ?? "Another source states something incompatible.",
      favoredSourceId: null,
      severity: "medium",
    });
  }
  emit({ type: "stage", stage: "contradictions", status: "done", detail: `${contradictions.length} conflicts` });

  /* 8 — scoring and deterministic ranking */
  emit({ type: "stage", stage: "score", status: "start" });
  const scores = await scoreOptions({ profile: input.profile, criteria: plan.criteria, options, claims: claimViews, signal });
  const ranked = rankOptions({
    options,
    criteria: plan.criteria,
    scores,
    claims,
    sources,
    contradictions,
    freshnessDays: plan.freshnessDays,
  });
  emit({ type: "stage", stage: "score", status: "done" });

  /* 9 — recommendation and uncertainty */
  emit({ type: "stage", stage: "recommend", status: "start" });
  const rec = await recommend({
    question: input.question,
    profile: input.profile,
    criteria: plan.criteria,
    options,
    ranked,
    claims: claimViews,
    contradictions: contradictions.map((c) => ({
      topic: c.topic,
      assessment: c.assessment,
      option: options.find((o) => o.id === c.optionId)?.name ?? null,
    })),
    signal,
  });
  const uncertainties: Uncertainty[] = rec.uncertainties.map((u) => ({ id: makeId("unc"), ...u }));
  // Deterministic uncertainty: options that rest on a single source.
  for (const o of options) {
    const backing = new Set(verified.filter((c) => c.optionId === o.id && c.verification!.status !== "unsupported").map((c) => c.sourceId));
    if (backing.size === 1) {
      uncertainties.push({
        id: makeId("unc"),
        kind: "single-source",
        text: `Everything verified about ${o.name} comes from a single source.`,
        optionId: o.id,
        impact: "medium",
        howToResolve: "Look for an independent review or the official specification page.",
      });
    }
  }
  emit({ type: "stage", stage: "recommend", status: "done" });

  return {
    sources,
    dossier: {
      plan,
      options,
      claims,
      contradictions,
      uncertainties,
      scores,
      recommendation: rec.recommendation,
    },
    excludedOptions: identified.excluded,
    stats: { passages: index.size, dense },
  };
}

export function computeMetrics(
  dossier: Omit<Dossier, "metrics">,
  sources: Source[],
  extra: { durationMs: number; modelCalls: number; tokens: number },
): Dossier["metrics"] {
  const verified = dossier.claims.filter((c) => c.verification);
  const count = (s: string) => verified.filter((c) => c.verification!.status === s).length;
  const read = sources.filter((s) => s.status === "read");
  const dated = read.map((s) => isFresh(s.publishedAt, dossier.plan.freshnessDays)).filter((v): v is boolean => v !== null);
  return {
    sourcesConsulted: sources.length,
    sourcesRead: read.length,
    claimsTotal: dossier.claims.length,
    supported: count("supported"),
    partial: count("partial"),
    unsupported: count("unsupported"),
    contradicted: count("contradicted"),
    contradictions: dossier.contradictions.length,
    averageReliability: read.length ? Math.round(read.reduce((s, x) => s + x.reliability.score, 0) / read.length) : 0,
    freshShare: dated.length ? dated.filter(Boolean).length / dated.length : 0,
    durationMs: extra.durationMs,
    modelCalls: extra.modelCalls,
    tokens: extra.tokens,
  };
}
