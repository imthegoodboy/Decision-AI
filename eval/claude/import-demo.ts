/**
 * Imports the tool-augmented agent's sealed dossiers from the study into the web
 * app's database, so the app can display real research (sources, verified claims,
 * contradictions, ranking, audit chain) without an OpenAI key.
 *
 *   node --conditions=react-server --import tsx eval/claude/import-demo.ts [--only id,id] [--condition clean|poisoned]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { emptyProfile, type Dossier, type Source } from "@/lib/domain";
import { appendAudit, hashDossier } from "@/server/audit/log";
import { addMessage, createDecision, updateDecision } from "@/server/repositories/decisions";
import { completeRun, createRun, insertSource } from "@/server/repositories/research";
import { resolveOptionImage } from "@/server/research/images";
import { readCache } from "../lib/store";
import { CLAUDE_DATA, type StudyPool, type StudyQuestion } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string; dir: string };
const study = readCache<{ runs: Run[] }>(path.join(CLAUDE_DATA, "study.json"))!;
const questions: StudyQuestion[] = JSON.parse(readFileSync(path.join(process.cwd(), "eval", "claude", "questions.json"), "utf8"));
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg("only")?.split(",");
const condition = arg("condition") ?? "clean";

function title(q: string): string {
  const first = q.split("?")[0].replace(/^(Which|What|Should)\s+/i, (m) => m);
  return first.length > 80 ? `${first.slice(0, 77)}…` : `${first}?`;
}

async function importRun(run: Run) {
  const q = questions.find((x) => x.id === run.questionId)!;
  const file = path.join(run.dir, "dossier.json");
  if (!existsSync(file)) return `${run.questionId}: no dossier`;
  const { dossier: raw, sources: toolSources } = JSON.parse(readFileSync(file, "utf8")) as { dossier: Dossier; sources: Source[] };
  const pool = readCache<StudyPool>(path.join(CLAUDE_DATA, "pools", `${run.questionId}.json`))!;
  const poolJson = JSON.parse(readFileSync(path.join(run.dir, "pool.json"), "utf8")) as { sources: { n: number; id: string; text: string }[] };
  const answer = readFileSync(path.join(run.dir, "answer.md"), "utf8");

  const decision = await createDecision({ title: title(q.question), profile: { ...emptyProfile(), goal: q.question, category: q.domain } });
  await appendAudit(decision.id, "decision.created", { title: decision.title, origin: "study-import", studyRun: run.runId });
  await addMessage({ decisionId: decision.id, role: "user", content: q.question });
  const dbRun = await createRun({ decisionId: decision.id, trigger: "study-import", focus: null });
  await appendAudit(decision.id, "research.started", { runId: dbRun.id, version: dbRun.version, trigger: "study-import" });

  // Re-key sources ("1".."N" in the tool) to globally unique ids.
  const idFor = (n: string) => `src_${run.runId}_${n}`;
  const sources: Source[] = toolSources.map((s) => {
    const poolSrc = pool.sources.find((p) => p.url === s.url);
    return {
      ...s,
      id: idFor(s.id),
      runId: dbRun.id,
      decisionId: decision.id,
      favicon: poolSrc?.favicon ?? null,
      image: poolSrc?.image ?? null,
      query: poolSrc?.query ?? null,
      provider: poolSrc?.provider ?? s.provider,
    };
  });
  const dossier: Dossier = {
    ...raw,
    options: raw.options.map((o) => ({ ...o, sourceIds: o.sourceIds.map(idFor) })),
    claims: raw.claims.map((c) => ({
      ...c,
      sourceId: idFor(c.sourceId),
      verification: c.verification && {
        ...c.verification,
        corroboratingSourceIds: c.verification.corroboratingSourceIds.map(idFor),
        conflictingSourceIds: c.verification.conflictingSourceIds.map(idFor),
      },
    })),
    contradictions: raw.contradictions.map((c) => ({ ...c, statements: c.statements.map((s) => ({ ...s, sourceId: idFor(s.sourceId) })), favoredSourceId: c.favoredSourceId ? idFor(c.favoredSourceId) : null })),
  };
  for (const o of dossier.options) o.image = await resolveOptionImage(o, sources).catch(() => null);

  for (const s of sources) {
    const text = poolJson.sources.find((p) => idFor(String(p.n)) === s.id)?.text ?? "";
    await insertSource(s, text);
    await appendAudit(decision.id, "source.retrieved", { runId: dbRun.id, sourceId: s.id, url: s.url, retrievedAt: s.retrievedAt, contentHash: s.contentHash, reliability: s.reliability.score });
  }
  for (const c of dossier.claims) {
    await appendAudit(decision.id, "claim.verified", { runId: dbRun.id, claimId: c.id, sourceId: c.sourceId, status: c.verification?.status, quoteFound: c.verification?.quoteFound });
  }
  const dossierHash = hashDossier(dossier);
  await completeRun(dbRun.id, dossier, dossierHash);
  await appendAudit(decision.id, "research.sealed", { runId: dbRun.id, dossierHash, recommendation: dossier.recommendation?.optionId ?? null, metrics: dossier.metrics });
  await addMessage({ decisionId: decision.id, role: "assistant", content: answer, meta: { kind: "analyst", runId: dbRun.id } });
  await updateDecision(decision.id, { status: "ready" });
  return `${run.questionId} (${run.condition}) → /d/${decision.id}: ${dossier.claims.length} claims, ${dossier.options.length} options`;
}

async function main() {
  const runs = study.runs.filter((r) => r.system === "tool" && r.condition === condition && (!only || only.includes(r.questionId)));
  for (const r of runs) {
    try {
      console.log(await importRun(r));
    } catch (err) {
      console.log(`${r.questionId}: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
