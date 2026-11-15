import "server-only";
import { AuditEvent, type ChainVerification } from "@/lib/domain";
import { makeId } from "@/lib/utils";
import { db, json, parseJson, query } from "../db/client";
import { GENESIS_HASH, canonicalJson, computeEventHash, sha256, verifyChain } from "./hash-chain";

/**
 * Append-only audit log. Appends for one decision are serialised in-process and
 * written inside a write transaction so sequence numbers and hashes stay linear
 * even when pipeline stages log concurrently.
 */

const queues = new Map<string, Promise<unknown>>();

export function appendAudit(decisionId: string, type: string, payload: unknown): Promise<AuditEvent> {
  const previous = queues.get(decisionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => write(decisionId, type, payload));
  queues.set(decisionId, next);
  next.finally(() => {
    if (queues.get(decisionId) === next) queues.delete(decisionId);
  });
  return next;
}

async function write(decisionId: string, type: string, payload: unknown): Promise<AuditEvent> {
  const client = await db();
  const tx = await client.transaction("write");
  try {
    const head = await tx.execute({
      sql: "SELECT seq, hash FROM audit_events WHERE decision_id = ? ORDER BY seq DESC LIMIT 1",
      args: [decisionId],
    });
    const seq = head.rows.length ? Number(head.rows[0].seq) + 1 : 1;
    const prevHash = head.rows.length ? String(head.rows[0].hash) : GENESIS_HASH;
    const createdAt = new Date().toISOString();
    // Round-trip through canonical JSON so the stored payload hashes identically on verify.
    const normalized = JSON.parse(canonicalJson(payload ?? null));
    const hash = computeEventHash({ seq, type, payload: normalized, prevHash, createdAt });
    const event: AuditEvent = { id: makeId("evt"), decisionId, seq, type, payload: normalized, prevHash, hash, createdAt };
    await tx.execute({
      sql: `INSERT INTO audit_events (id, decision_id, seq, type, payload, prev_hash, hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [event.id, decisionId, seq, type, json(normalized), prevHash, hash, createdAt],
    });
    await tx.commit();
    return event;
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  } finally {
    tx.close();
  }
}

export async function listAudit(decisionId: string): Promise<AuditEvent[]> {
  const rows = await query(
    "SELECT * FROM audit_events WHERE decision_id = ? ORDER BY seq ASC",
    [decisionId],
  );
  return rows.map((r) =>
    AuditEvent.parse({
      id: r.id,
      decisionId: r.decision_id,
      seq: Number(r.seq),
      type: r.type,
      payload: parseJson(r.payload),
      prevHash: r.prev_hash,
      hash: r.hash,
      createdAt: r.created_at,
    }),
  );
}

/**
 * Recomputes the chain and checks every sealed research dossier against the hash
 * that was committed to the chain when the run finished.
 */
export async function verifyAudit(decisionId: string): Promise<ChainVerification> {
  const events = await listAudit(decisionId);
  const chain = verifyChain(events);

  const sealed = events.filter((e) => e.type === "research.sealed");
  const runs = await query<{ id: string; dossier: string | null }>(
    "SELECT id, dossier FROM research_runs WHERE decision_id = ?",
    [decisionId],
  );
  const dossierById = new Map(runs.map((r) => [String(r.id), r.dossier]));
  const dossierChecks = sealed.map((e) => {
    const p = e.payload as { runId: string; dossierHash: string };
    const stored = dossierById.get(p.runId);
    const actual = stored ? sha256(canonicalJson(parseJson(stored))) : "missing";
    return { runId: p.runId, valid: actual === p.dossierHash, expected: p.dossierHash, actual };
  });

  const dossiersValid = dossierChecks.every((c) => c.valid);
  return {
    ...chain,
    valid: chain.valid && dossiersValid,
    reason:
      chain.reason ??
      (dossiersValid ? null : "A sealed research dossier was modified after it was recorded in the audit chain."),
    dossierChecks,
  };
}

export function hashDossier(dossier: unknown): string {
  return sha256(canonicalJson(dossier));
}
