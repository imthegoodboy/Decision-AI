import { newUsage, text, withUsage } from "@/server/ai/openai";
import { runVerificationCore, type PoolSource } from "@/server/pipeline/core";
import type { Dossier } from "@/lib/domain";
import type { SystemName } from "./config";
import type { Pool, Question } from "./pool";

/**
 * The three systems under comparison. All receive the same question and the
 * same numbered source texts, and all generate with the same (fast) model, so
 * differences are attributable to the verification + provenance layer.
 */

export type SystemOutput = {
  system: SystemName;
  answer: string;
  /** Source number → source id, as shown to the system. */
  numbering: Record<number, string>;
  usage: { calls: number; inputTokens: number; outputTokens: number };
  durationMs: number;
  dossier?: Omit<Dossier, "metrics"> | null;
  error?: string;
};

export function renderSources(sources: PoolSource[]): string {
  return sources
    .map((s, i) =>
      [
        `[${i + 1}] ${s.title} — ${s.url}`,
        `Publisher: ${s.siteName ?? "unknown"} | Author: ${s.author ?? "unknown"} | Published: ${s.publishedAt?.slice(0, 10) ?? "unknown"}`,
        s.text,
      ].join("\n"),
    )
    .join("\n\n=====\n\n");
}

const BASELINE_SYSTEM = [
  "You are a web-enabled AI assistant helping a user make a decision.",
  "You searched the web and retrieved the numbered sources below.",
  "Write a helpful recommendation of 250–450 words: name the option you recommend, explain why, and mention alternatives.",
  "Cite sources inline with bracketed numbers like [2] immediately after the statements they support. Use only the sources.",
].join("\n");

const SELFCHECK_ADDENDUM = [
  "",
  "Before writing, carefully verify every factual statement against the text of the source you cite;",
  "include a statement only if that source explicitly supports it. Check whether sources disagree with each other —",
  "if they do, say so explicitly and explain which source is more credible and why. Be skeptical of claims that",
  "appear in only one source or conflict with the others. State your uncertainty where evidence is thin.",
].join("\n");

export async function runSystem(system: SystemName, q: Question, pool: Pool, sources: PoolSource[]): Promise<SystemOutput> {
  const numbering = Object.fromEntries(sources.map((s, i) => [i + 1, s.id]));
  const usage = newUsage();
  const started = Date.now();
  try {
    if (system === "decisionai") {
      const out = await withUsage(usage, () =>
        runVerificationCore({
          question: q.question,
          profile: pool.profile,
          plan: pool.plan,
          sources,
          concurrency: 4,
          maxOptions: 4,
          claimsPerSource: 8,
        }),
      );
      return {
        system,
        answer: renderDecisionAnswer(out.dossier, sources),
        numbering,
        usage,
        durationMs: Date.now() - started,
        dossier: out.dossier,
      };
    }
    const instructions = system === "selfcheck" ? BASELINE_SYSTEM + SELFCHECK_ADDENDUM : BASELINE_SYSTEM;
    const answer = await withUsage(usage, () =>
      text({ tier: "fast", system: instructions, input: `User's question: ${q.question}\n\nSources:\n\n${renderSources(sources)}` }),
    );
    return { system, answer, numbering, usage, durationMs: Date.now() - started };
  } catch (err) {
    return { system, answer: "", numbering, usage, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Renders the verified dossier as an answer with the same [n] citation convention. */
export function renderDecisionAnswer(dossier: Omit<Dossier, "metrics">, sources: PoolSource[]): string {
  const num = new Map(sources.map((s, i) => [s.id, i + 1]));
  const claimById = new Map(dossier.claims.map((c) => [c.id, c]));
  const cite = (claimIds: string[]) => {
    const ns = [...new Set(claimIds.map((id) => num.get(claimById.get(id)?.sourceId ?? "")).filter((n): n is number => !!n))].sort((a, b) => a - b);
    return ns.length ? " " + ns.map((n) => `[${n}]`).join("") : "";
  };
  const optionName = new Map(dossier.options.map((o) => [o.id, o.name]));
  const rec = dossier.recommendation;
  if (!rec) return "No recommendation could be made from verified evidence.";
  const lines: string[] = [];
  lines.push(`Recommendation: ${rec.headline}`, "", rec.summary, "", "Why:");
  for (const r of rec.reasons) lines.push(`- ${r.text}${cite(r.claimIds)}`);
  if (rec.tradeoffs.length) {
    lines.push("", "Trade-offs:");
    for (const t of rec.tradeoffs) lines.push(`- ${t.text}${cite(t.claimIds)}`);
  }
  if (rec.alternatives.length) {
    lines.push("", "Alternatives:");
    for (const a of rec.alternatives) lines.push(`- ${optionName.get(a.optionId)}: ${a.when}`);
  }
  if (dossier.contradictions.length) {
    lines.push("", "Conflicting evidence:");
    for (const c of dossier.contradictions) {
      const refs = [...new Set(c.statements.map((s) => num.get(s.sourceId)).filter(Boolean))].map((n) => `[${n}]`).join("");
      lines.push(`- ${c.topic}: ${c.assessment} ${refs}`.trim());
    }
  }
  if (rec.caveats.length) {
    lines.push("", "Before you decide:");
    for (const c of rec.caveats) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}
