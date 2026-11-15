import "server-only";
import { mapLimit } from "@/lib/async";
import type { Dossier, PipelineEvent } from "@/lib/domain";
import { rankOptions } from "@/lib/scoring";
import { pluralize } from "@/lib/utils";
import { newUsage, withUsage } from "../ai/openai";
import { planResearch } from "../agents/planner";
import { appendAudit, hashDossier } from "../audit/log";
import { env } from "../config/env";
import { HttpError, notFound } from "../http";
import { addMessage, getDecision, listMessages, updateDecision } from "../repositories/decisions";
import {
  activeRun,
  completeRun,
  createRun,
  failRun,
  failStaleRuns,
  insertSource,
  latestRun,
  newSourceId,
  saveRunPlan,
} from "../repositories/research";
import { resolveOptionImage } from "../research/images";
import { computeMetrics, runVerificationCore } from "./core";
import { gatherSources } from "./gather";

/**
 * Full research run for a decision in the web app: plan → search → read →
 * verification core → images → seal. Emits progress events for the UI stream
 * and appends every trust-relevant step to the hash-chained audit log.
 */

const STALE_RUN_MS = 15 * 60_000;

export async function startResearch(input: {
  decisionId: string;
  focus: string | null;
  trigger: string;
  emit: (event: PipelineEvent) => void;
}): Promise<void> {
  const { decisionId, emit } = input;
  const decision = await getDecision(decisionId);
  if (!decision) throw notFound("Decision");
  await failStaleRuns(decisionId, STALE_RUN_MS);
  if (await activeRun(decisionId)) throw new HttpError(409, "research_running", "Research is already running for this decision.");

  const run = await createRun({ decisionId, trigger: input.trigger, focus: input.focus });
  emit({ type: "run", runId: run.id, version: run.version });
  await updateDecision(decisionId, { status: "researching" });
  await appendAudit(decisionId, "research.started", { runId: run.id, version: run.version, trigger: input.trigger, focus: input.focus });

  const usage = newUsage();
  const started = Date.now();
  const messages = await listMessages(decisionId);
  const question = messages.find((m) => m.role === "user")?.content ?? decision.title;

  try {
    await withUsage(usage, async () => {
      /* Plan */
      emit({ type: "stage", stage: "plan", status: "start" });
      const plan = await planResearch({ profile: decision.profile, question, focus: input.focus });
      await saveRunPlan(run.id, plan);
      await appendAudit(decisionId, "research.planned", {
        runId: run.id,
        criteria: plan.criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight, origin: c.origin })),
        queries: plan.queries.map((q) => q.query),
        freshnessDays: plan.freshnessDays,
      });
      emit({ type: "stage", stage: "plan", status: "done", detail: `${plan.criteria.length} criteria, ${plan.queries.length} searches` });

      /* Search + read */
      const gathered = await gatherSources({
        queries: plan.queries,
        region: plan.region,
        runId: run.id,
        decisionId,
        newId: newSourceId,
        emit,
      });
      for (const q of gathered.queries) {
        await appendAudit(decisionId, "search.query", { runId: run.id, query: q.query, provider: q.provider, results: q.results });
      }

      /* Verification core */
      const core = await runVerificationCore({
        question,
        profile: decision.profile,
        plan,
        sources: gathered.sources,
        concurrency: env().RESEARCH_CONCURRENCY,
        emit,
      });

      /* Persist sources with provenance */
      const textById = new Map(gathered.sources.map((s) => [s.id, s.text]));
      for (const s of core.sources) {
        await insertSource(s, textById.get(s.id) ?? "");
        await appendAudit(decisionId, "source.retrieved", {
          runId: run.id,
          sourceId: s.id,
          url: s.url,
          status: s.status,
          retrievedAt: s.retrievedAt,
          contentHash: s.contentHash,
          reliability: s.reliability.score,
        });
      }

      /* Option images */
      emit({ type: "stage", stage: "deepen", status: "start", detail: "Finding images for each option" });
      await mapLimit(core.dossier.options, 3, async (option) => {
        option.image = await resolveOptionImage(option, core.sources).catch(() => null);
        emit({ type: "option", option: { id: option.id, name: option.name, image: option.image } });
      });
      emit({ type: "stage", stage: "deepen", status: "done" });

      for (const c of core.dossier.claims) {
        if (!c.verification) continue;
        await appendAudit(decisionId, "claim.verified", {
          runId: run.id,
          claimId: c.id,
          sourceId: c.sourceId,
          status: c.verification.status,
          quoteFound: c.verification.quoteFound,
          passageId: c.verification.passage?.id ?? null,
        });
      }
      for (const c of core.dossier.contradictions) {
        await appendAudit(decisionId, "contradiction.detected", { runId: run.id, id: c.id, topic: c.topic, severity: c.severity });
      }

      /* Seal */
      emit({ type: "stage", stage: "seal", status: "start" });
      const dossier: Dossier = {
        ...core.dossier,
        metrics: computeMetrics(core.dossier, core.sources, {
          durationMs: Date.now() - started,
          modelCalls: usage.calls,
          tokens: usage.inputTokens + usage.outputTokens,
        }),
      };
      const dossierHash = hashDossier(dossier);
      await completeRun(run.id, dossier, dossierHash);
      await appendAudit(decisionId, "research.sealed", {
        runId: run.id,
        dossierHash,
        recommendation: dossier.recommendation?.optionId ?? null,
        metrics: dossier.metrics,
      });
      emit({ type: "stage", stage: "seal", status: "done", detail: `Dossier sealed (${dossierHash.slice(0, 12)}…)` });

      const ranked = rankOptions({
        options: dossier.options,
        criteria: plan.criteria,
        scores: dossier.scores,
        claims: dossier.claims,
        sources: core.sources,
        contradictions: dossier.contradictions,
        freshnessDays: plan.freshnessDays,
        weightOverrides: decision.weights,
      });
      const leader = dossier.options.find((o) => o.id === ranked[0]?.optionId);
      const m = dossier.metrics;
      const summary = [
        `I read ${pluralize(m.sourcesRead, "source")} and checked ${pluralize(m.claimsTotal, "claim")} against the exact passages they came from:`,
        `${m.supported} supported, ${m.partial} partially supported, ${m.unsupported} unsupported, ${m.contradicted} contradicted by another source.`,
        leader ? `\n\n**${dossier.recommendation?.headline ?? `Leading option: ${leader.name}`}** Confidence is ${ranked[0].confidenceLabel}.` : "",
        dossier.contradictions.length ? ` I found ${pluralize(dossier.contradictions.length, "conflict")} between sources; see Conflicts & gaps.` : "",
        "\n\nAsk me anything about the evidence, challenge the recommendation, or change your priorities.",
      ].join(" ");
      await addMessage({ decisionId, role: "assistant", content: summary, meta: { kind: "analyst", runId: run.id } });
      await updateDecision(decisionId, { status: "ready" });
    });
    emit({ type: "done", runId: run.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(run.id, message);
    await appendAudit(decisionId, "research.failed", { runId: run.id, error: message });
    const previous = await latestRun(decisionId);
    await updateDecision(decisionId, { status: previous?.status === "completed" ? "ready" : "failed" });
    emit({ type: "error", message });
  }
}
