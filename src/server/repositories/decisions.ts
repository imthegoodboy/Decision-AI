import "server-only";
import {
  Decision,
  DecisionProfile,
  DecisionSummary,
  Message,
  MessageMeta,
  type DecisionStatus,
} from "@/lib/domain";
import { makeId } from "@/lib/utils";
import { execute, json, parseJson, query, queryOne, type Row } from "../db/client";

/* ───────────────────────────── Decisions ───────────────────────────── */

function toDecision(r: Row): Decision {
  return Decision.parse({
    id: r.id,
    title: r.title,
    status: r.status,
    profile: DecisionProfile.parse(parseJson(r.profile)),
    weights: (parseJson(r.weights) as Record<string, number>) ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

export async function createDecision(input: { title: string; profile: DecisionProfile }): Promise<Decision> {
  const now = new Date().toISOString();
  const decision: Decision = {
    id: makeId("dec"),
    title: input.title,
    status: "intake",
    profile: input.profile,
    weights: {},
    createdAt: now,
    updatedAt: now,
  };
  await execute(
    `INSERT INTO decisions (id, title, status, profile, weights, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [decision.id, decision.title, decision.status, json(decision.profile), json(decision.weights), now, now],
  );
  return decision;
}

export async function getDecision(id: string): Promise<Decision | null> {
  const row = await queryOne("SELECT * FROM decisions WHERE id = ?", [id]);
  return row ? toDecision(row) : null;
}

export async function listDecisions(limit = 50): Promise<DecisionSummary[]> {
  const rows = await query(
    "SELECT id, title, status, profile, created_at, updated_at FROM decisions ORDER BY updated_at DESC LIMIT ?",
    [limit],
  );
  return rows.map((r) => {
    const profile = DecisionProfile.safeParse(parseJson(r.profile));
    return DecisionSummary.parse({
      id: r.id,
      title: r.title,
      status: r.status,
      category: profile.success ? profile.data.category : "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  });
}

export async function updateDecision(
  id: string,
  patch: Partial<{ title: string; status: DecisionStatus; profile: DecisionProfile; weights: Record<string, number> }>,
): Promise<Decision | null> {
  const current = await getDecision(id);
  if (!current) return null;
  const next: Decision = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await execute(
    "UPDATE decisions SET title = ?, status = ?, profile = ?, weights = ?, updated_at = ? WHERE id = ?",
    [next.title, next.status, json(next.profile), json(next.weights), next.updatedAt, id],
  );
  return next;
}

export async function touchDecision(id: string): Promise<void> {
  await execute("UPDATE decisions SET updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
}

export async function deleteDecision(id: string): Promise<boolean> {
  return (await execute("DELETE FROM decisions WHERE id = ?", [id])) > 0;
}

/* ───────────────────────────── Messages ───────────────────────────── */

function toMessage(r: Row): Message {
  return Message.parse({
    id: r.id,
    decisionId: r.decision_id,
    role: r.role,
    content: r.content,
    meta: MessageMeta.parse(parseJson(r.meta) ?? {}),
    createdAt: r.created_at,
  });
}

export async function addMessage(input: {
  decisionId: string;
  role: Message["role"];
  content: string;
  meta?: MessageMeta;
}): Promise<Message> {
  const message: Message = {
    id: makeId("msg"),
    decisionId: input.decisionId,
    role: input.role,
    content: input.content,
    meta: input.meta ?? {},
    createdAt: new Date().toISOString(),
  };
  await execute(
    "INSERT INTO messages (id, decision_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [message.id, message.decisionId, message.role, message.content, json(message.meta), message.createdAt],
  );
  return message;
}

export async function listMessages(decisionId: string): Promise<Message[]> {
  const rows = await query("SELECT * FROM messages WHERE decision_id = ? ORDER BY created_at ASC, rowid ASC", [
    decisionId,
  ]);
  return rows.map(toMessage);
}
