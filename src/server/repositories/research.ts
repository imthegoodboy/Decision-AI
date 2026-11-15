import "server-only";
import { Dossier, ResearchPlan, ResearchRun, Source } from "@/lib/domain";
import { makeId } from "@/lib/utils";
import { execute, json, parseJson, query, queryOne, type Row } from "../db/client";

/* ───────────────────────────── Research runs ───────────────────────────── */

function toRun(r: Row): ResearchRun {
  const plan = r.plan ? ResearchPlan.safeParse(parseJson(r.plan)) : null;
  const dossier = r.dossier ? Dossier.safeParse(parseJson(r.dossier)) : null;
  return ResearchRun.parse({
    id: r.id,
    decisionId: r.decision_id,
    version: Number(r.version),
    status: r.status,
    trigger: r.trigger,
    focus: r.focus ?? null,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? null,
    error: r.error ?? null,
    plan: plan?.success ? plan.data : null,
    dossier: dossier?.success ? dossier.data : null,
    dossierHash: r.dossier_hash ?? null,
  });
}

export async function createRun(input: { decisionId: string; trigger: string; focus: string | null }): Promise<ResearchRun> {
  const last = await queryOne<{ v: number | null }>(
    "SELECT MAX(version) AS v FROM research_runs WHERE decision_id = ?",
    [input.decisionId],
  );
  const run: ResearchRun = {
    id: makeId("run"),
    decisionId: input.decisionId,
    version: Number(last?.v ?? 0) + 1,
    status: "running",
    trigger: input.trigger,
    focus: input.focus,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    plan: null,
    dossier: null,
    dossierHash: null,
  };
  await execute(
    `INSERT INTO research_runs (id, decision_id, version, status, trigger, focus, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [run.id, run.decisionId, run.version, run.status, run.trigger, run.focus, run.startedAt],
  );
  return run;
}

export async function saveRunPlan(runId: string, plan: ResearchPlan): Promise<void> {
  await execute("UPDATE research_runs SET plan = ? WHERE id = ?", [json(plan), runId]);
}

export async function completeRun(runId: string, dossier: Dossier, dossierHash: string): Promise<void> {
  await execute(
    "UPDATE research_runs SET status = 'completed', dossier = ?, dossier_hash = ?, completed_at = ? WHERE id = ?",
    [json(dossier), dossierHash, new Date().toISOString(), runId],
  );
}

export async function failRun(runId: string, error: string): Promise<void> {
  await execute(
    "UPDATE research_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
    [error, new Date().toISOString(), runId],
  );
}

export async function getRun(runId: string): Promise<ResearchRun | null> {
  const row = await queryOne("SELECT * FROM research_runs WHERE id = ?", [runId]);
  return row ? toRun(row) : null;
}

/** The newest completed run, or the newest run of any status if none completed. */
export async function latestRun(decisionId: string): Promise<ResearchRun | null> {
  const completed = await queryOne(
    "SELECT * FROM research_runs WHERE decision_id = ? AND status = 'completed' ORDER BY version DESC LIMIT 1",
    [decisionId],
  );
  if (completed) return toRun(completed);
  const any = await queryOne("SELECT * FROM research_runs WHERE decision_id = ? ORDER BY version DESC LIMIT 1", [
    decisionId,
  ]);
  return any ? toRun(any) : null;
}

export async function activeRun(decisionId: string): Promise<ResearchRun | null> {
  const row = await queryOne(
    "SELECT * FROM research_runs WHERE decision_id = ? AND status = 'running' ORDER BY version DESC LIMIT 1",
    [decisionId],
  );
  return row ? toRun(row) : null;
}

export async function listRuns(decisionId: string) {
  const rows = await query(
    "SELECT id, version, status, trigger, started_at, completed_at FROM research_runs WHERE decision_id = ? ORDER BY version DESC",
    [decisionId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    version: Number(r.version),
    status: ResearchRun.shape.status.parse(r.status),
    trigger: String(r.trigger),
    startedAt: String(r.started_at),
    completedAt: (r.completed_at as string | null) ?? null,
  }));
}

/** Marks runs left in `running` by a crashed or restarted server as failed. */
export async function failStaleRuns(decisionId: string, olderThanMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  await execute(
    "UPDATE research_runs SET status = 'failed', error = 'Research was interrupted before it finished.', completed_at = ? WHERE decision_id = ? AND status = 'running' AND started_at < ?",
    [new Date().toISOString(), decisionId, cutoff],
  );
}

/* ───────────────────────────── Sources ───────────────────────────── */

export async function insertSource(source: Source, text: string): Promise<void> {
  await execute(
    `INSERT INTO sources (id, run_id, decision_id, url, data, text, content_hash, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [source.id, source.runId, source.decisionId, source.url, json(source), text, source.contentHash, source.retrievedAt],
  );
}

export async function updateSource(source: Source): Promise<void> {
  await execute("UPDATE sources SET data = ? WHERE id = ?", [json(source), source.id]);
}

export async function listSources(runId: string): Promise<Source[]> {
  const rows = await query("SELECT data FROM sources WHERE run_id = ? ORDER BY rowid ASC", [runId]);
  return rows.map((r) => Source.parse(parseJson(r.data)));
}

export async function getSourceText(sourceId: string): Promise<{ source: Source; text: string } | null> {
  const row = await queryOne("SELECT data, text FROM sources WHERE id = ?", [sourceId]);
  if (!row) return null;
  return { source: Source.parse(parseJson(row.data)), text: String(row.text ?? "") };
}

export function newSourceId(): string {
  return makeId("src");
}
