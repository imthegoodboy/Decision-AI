import "server-only";
import { z } from "zod";
import {
  DecisionProfile,
  Importance,
  QuestionKind,
  type Decision,
  type Dossier,
  type FollowUpQuestion,
  type Message,
  type Source,
} from "@/lib/domain";
import { rankOptions } from "@/lib/scoring";
import { makeId } from "@/lib/utils";
import { structured } from "../ai/openai";
import { EVIDENCE_RULES, today } from "./prompts";
import { byName } from "./synthesis";

/* ───────────────────────────── Intake ───────────────────────────── */

const ProfileForModel = z.object({
  goal: z.string(),
  category: z.string(),
  locale: z.object({ country: z.string().nullable(), currency: z.string().nullable() }),
  budget: z
    .object({ min: z.number().nullable(), max: z.number().nullable(), currency: z.string().nullable(), note: z.string().nullable() })
    .nullable(),
  requirements: z.array(z.object({ label: z.string(), value: z.string(), importance: Importance })),
  priorities: z.array(z.object({ name: z.string(), weight: z.number(), reason: z.string().nullable() })),
  constraints: z.array(z.string()),
  candidates: z.array(z.string()),
  context: z.array(z.string()),
  exclusions: z.array(z.string()),
});

const IntakeOutput = z.object({
  title: z.string().describe("Short title for this decision, max 8 words"),
  reply: z.string().describe("Your message to the user: brief, warm, plain language, 1–3 sentences. No lists of questions here."),
  profile: ProfileForModel.describe("The COMPLETE updated decision profile, merging everything known so far"),
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        why: z.string().describe("One short clause on how the answer changes the recommendation"),
        kind: QuestionKind,
        options: z.array(z.string()).describe("Answer choices for single/multi questions; empty for text/number"),
        placeholder: z.string().nullable(),
      }),
    )
    .describe("0–4 follow-up questions, most decision-relevant first. Empty when ready."),
  readiness: z.number().describe("0–1: how well the profile supports useful research"),
  readyToResearch: z.boolean().describe("True when the key constraints (budget/region/priorities as relevant) are known"),
  startResearch: z.boolean().describe("True only if the user explicitly asked to start or proceed with research now"),
  missing: z.array(z.string()).describe("Important unknowns that remain"),
});

export type IntakeResult = {
  title: string;
  reply: string;
  profile: DecisionProfile;
  questions: FollowUpQuestion[];
  readiness: number;
  readyToResearch: boolean;
  startResearch: boolean;
  missing: string[];
};

export async function runIntake(input: { decision: Decision; messages: Message[] }): Promise<IntakeResult> {
  const transcript = input.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  const out = await structured({
    tier: "main",
    name: "intake",
    schema: IntakeOutput,
    system: [
      "You are the intake step of Decision AI, an evidence-based decision assistant.",
      `Today is ${today()}. Understand the user's decision before any research happens.`,
      "Build a structured profile: goal, category, country/currency, budget, requirements (with importance), priorities",
      "(weights 0–100 reflecting how much THIS user cares), constraints, options the user named, context and exclusions.",
      "Ask only questions whose answers would change which option is best (budget, region, must-haves, priorities, usage).",
      "Prefer single/multi choice questions with 3–6 concrete options; never re-ask what is already known.",
      "Infer sensible defaults (e.g. currency from ₹ means India) and state them rather than asking.",
      "Mark readyToResearch true once research would be useful even if minor details remain. Never invent facts about products.",
    ].join("\n"),
    input: `Current profile: ${JSON.stringify(input.decision.profile)}\n\nConversation so far:\n${transcript}`,
  });
  const profile = DecisionProfile.parse({
    ...out.profile,
    priorities: out.profile.priorities.map((p) => ({ ...p, weight: Math.max(0, Math.min(100, p.weight)) })),
  });
  return {
    title: out.title.trim().slice(0, 90) || input.decision.title,
    reply: out.reply,
    profile,
    questions: out.questions.slice(0, 4).map((q) => ({ ...q, id: makeId("q") })),
    readiness: Math.max(0, Math.min(1, out.readiness)),
    readyToResearch: out.readyToResearch,
    startResearch: out.startResearch,
    missing: out.missing,
  };
}

/* ───────────────────────────── Analyst (after research) ───────────────────────────── */

const AnalystOutput = z.object({
  reply: z
    .string()
    .describe("Markdown answer. Cite verified claims as [C:<claim id>] and sources as [S:<source id>] right after the statements they support."),
  action: z.enum(["none", "reweight", "rerun"]).describe("reweight: user changed priorities; rerun: user wants new or deeper research"),
  weights: z.array(z.object({ criterion: z.string(), weight: z.number() })).describe("New weights 0–100 for reweight, else empty"),
  focus: z.string().nullable().describe("For rerun: what the new research should focus on"),
});

export type AnalystResult = {
  reply: string;
  action: "none" | "reweight" | "rerun";
  weights: Record<string, number>;
  focus: string | null;
  citations: string[];
};

export async function runAnalyst(input: {
  decision: Decision;
  messages: Message[];
  dossier: Dossier;
  sources: Source[];
}): Promise<AnalystResult> {
  const { dossier, decision, sources } = input;
  const ranked = rankOptions({
    options: dossier.options,
    criteria: dossier.plan.criteria,
    scores: dossier.scores,
    claims: dossier.claims,
    sources,
    contradictions: dossier.contradictions,
    freshnessDays: dossier.plan.freshnessDays,
    weightOverrides: decision.weights,
  });
  const optionName = new Map(dossier.options.map((o) => [o.id, o.name]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const claims = dossier.claims
    .filter((c) => c.verification)
    .map((c) => {
      const s = sourceById.get(c.sourceId);
      return `[C:${c.id}] ${c.verification!.status} — ${optionName.get(c.optionId ?? "") ?? "general"}: ${c.text} (source S:${c.sourceId}, ${s?.domain}, reliability ${s?.reliability.score})`;
    });
  const recent = input.messages.slice(-10).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  const out = await structured({
    tier: "main",
    name: "analyst",
    schema: AnalystOutput,
    system: [
      "You are Decision AI's analyst. Research is complete; answer the user's follow-up using ONLY the verified evidence below.",
      "Cite claims as [C:id] and sources as [S:id]. Prefer supported claims; label partial ones as partially supported;",
      "never rely on unsupported or contradicted claims except to warn about them. If the evidence does not answer the",
      "question, say so and offer to research it (action 'rerun' with a focus) — do not guess.",
      "If the user challenges the recommendation, steelman the alternative honestly using the evidence.",
      "If the user changes priorities, set action 'reweight' with weights for the named criteria (others keep current weight).",
      EVIDENCE_RULES,
    ].join("\n"),
    input: [
      `Decision profile: ${JSON.stringify(decision.profile)}`,
      `Criteria and current weights: ${dossier.plan.criteria.map((c) => `${c.name}=${decision.weights[c.id] ?? c.weight}`).join(", ")}`,
      `Current ranking: ${ranked.map((r) => `${r.rank}. ${optionName.get(r.optionId)} (${r.total}/100, confidence ${r.confidenceLabel})`).join("; ")}`,
      `Recommendation: ${dossier.recommendation?.headline ?? "none"}`,
      `Contradictions: ${dossier.contradictions.map((c) => `${c.topic}: ${c.assessment}`).join(" | ") || "none"}`,
      `Uncertainties: ${dossier.uncertainties.map((u) => `${u.kind}: ${u.text}`).join(" | ") || "none"}`,
      `Verified claims:\n${claims.join("\n")}`,
      `Conversation:\n${recent}`,
    ].join("\n\n"),
  });
  const criterionByName = byName(dossier.plan.criteria);
  const weights: Record<string, number> = {};
  for (const w of out.weights) {
    const c = criterionByName(w.criterion);
    if (c) weights[c.id] = Math.max(0, Math.min(100, w.weight));
  }
  const validClaims = new Set(dossier.claims.map((c) => c.id));
  const validSources = new Set(sources.map((s) => s.id));
  // Strip citations to ids that do not exist, so the UI never links to nothing.
  const reply = out.reply.replace(/\[(C|S):([a-z0-9_]+)\]/gi, (m, kind: string, id: string) =>
    (kind.toUpperCase() === "C" ? validClaims.has(id) : validSources.has(id)) ? m : "",
  );
  const citations = [...reply.matchAll(/\[C:([a-z0-9_]+)\]/gi)].map((m) => m[1]);
  return { reply, action: out.action, weights, focus: out.focus, citations };
}
