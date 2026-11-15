import "server-only";
import { emptyProfile, type DecisionBundle, type Message } from "@/lib/domain";
import { truncate } from "@/lib/text";
import { runAnalyst, runIntake } from "../agents/conversation";
import { appendAudit } from "../audit/log";
import { notFound } from "../http";
import { addMessage, createDecision, getDecision, listMessages, updateDecision } from "../repositories/decisions";
import { latestRun, listRuns, listSources } from "../repositories/research";

/** Application services used by route handlers. */

export async function loadBundle(decisionId: string): Promise<DecisionBundle> {
  const decision = await getDecision(decisionId);
  if (!decision) throw notFound("Decision");
  const [messages, run, runs] = await Promise.all([listMessages(decisionId), latestRun(decisionId), listRuns(decisionId)]);
  const sources = run && run.status === "completed" ? await listSources(run.id) : [];
  return { decision, messages, run, sources, runs };
}

export async function createDecisionFromQuestion(question: string): Promise<DecisionBundle> {
  const decision = await createDecision({ title: truncate(question, 80), profile: { ...emptyProfile(), goal: question } });
  await appendAudit(decision.id, "decision.created", { title: decision.title });
  const userMessage = await addMessage({ decisionId: decision.id, role: "user", content: question });
  await appendAudit(decision.id, "message.user", { messageId: userMessage.id, content: question });
  await respondWithIntake(decision.id);
  return loadBundle(decision.id);
}

async function respondWithIntake(decisionId: string): Promise<{ message: Message; startResearch: boolean }> {
  const decision = (await getDecision(decisionId))!;
  const messages = await listMessages(decisionId);
  const intake = await runIntake({ decision, messages });
  await updateDecision(decisionId, { title: intake.title, profile: intake.profile });
  await appendAudit(decisionId, "profile.updated", { profile: intake.profile, readiness: intake.readiness });
  const message = await addMessage({
    decisionId,
    role: "assistant",
    content: intake.reply,
    meta: {
      kind: "intake",
      questions: intake.questions,
      readiness: intake.readiness,
      readyToResearch: intake.readyToResearch,
      missing: intake.missing,
    },
  });
  await appendAudit(decisionId, "message.assistant", { messageId: message.id, kind: "intake", questions: intake.questions.length });
  return { message, startResearch: intake.startResearch && intake.readyToResearch };
}

export async function handleUserMessage(decisionId: string, content: string) {
  const decision = await getDecision(decisionId);
  if (!decision) throw notFound("Decision");
  const userMessage = await addMessage({ decisionId, role: "user", content });
  await appendAudit(decisionId, "message.user", { messageId: userMessage.id, content });

  const run = await latestRun(decisionId);
  if (!run || run.status !== "completed" || !run.dossier) {
    const { message, startResearch } = await respondWithIntake(decisionId);
    return {
      messages: [userMessage, message],
      decision: (await getDecision(decisionId))!,
      action: startResearch ? ("research" as const) : ("none" as const),
      focus: null,
    };
  }

  const sources = await listSources(run.id);
  const messages = await listMessages(decisionId);
  const analyst = await runAnalyst({ decision, messages, dossier: run.dossier, sources });
  let updated = decision;
  if (analyst.action === "reweight" && Object.keys(analyst.weights).length) {
    updated = (await updateDecision(decisionId, { weights: { ...decision.weights, ...analyst.weights } }))!;
    await appendAudit(decisionId, "weights.changed", { by: "analyst", weights: updated.weights });
  }
  const message = await addMessage({
    decisionId,
    role: "assistant",
    content: analyst.reply,
    meta: { kind: "analyst", action: analyst.action === "none" ? "answer" : analyst.action === "reweight" ? "reweight" : "rerun", citations: analyst.citations, runId: run.id },
  });
  await appendAudit(decisionId, "message.assistant", { messageId: message.id, kind: "analyst", action: analyst.action, citations: analyst.citations });
  return {
    messages: [userMessage, message],
    decision: updated,
    action: analyst.action === "rerun" ? ("rerun" as const) : analyst.action === "reweight" ? ("reweight" as const) : ("none" as const),
    focus: analyst.focus,
  };
}

export async function setWeights(decisionId: string, weights: Record<string, number>) {
  const decision = await getDecision(decisionId);
  if (!decision) throw notFound("Decision");
  const clean = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Math.max(0, Math.min(100, Number(v) || 0))]));
  const updated = await updateDecision(decisionId, { weights: clean });
  await appendAudit(decisionId, "weights.changed", { by: "user", weights: clean });
  return updated!;
}
