import "server-only";
import type { DecisionBundle } from "@/lib/domain";
import { rankOptions } from "@/lib/scoring";
import { percent } from "@/lib/utils";
import { verifyAudit } from "../audit/log";

/** Markdown export of a decision: recommendation, ranking, evidence, conflicts, provenance. */
export async function renderReport(bundle: DecisionBundle): Promise<string> {
  const { decision, run, sources } = bundle;
  const lines: string[] = [`# ${decision.title}`, "", `Exported ${new Date().toISOString()} from Decision AI.`, ""];
  if (!run?.dossier) {
    lines.push("Research has not been completed for this decision yet.");
    return lines.join("\n");
  }
  const d = run.dossier;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const sourceNo = new Map(sources.map((s, i) => [s.id, i + 1]));
  const optionName = new Map(d.options.map((o) => [o.id, o.name]));
  const claimById = new Map(d.claims.map((c) => [c.id, c]));
  const cite = (ids: string[]) =>
    [...new Set(ids.map((id) => sourceNo.get(claimById.get(id)?.sourceId ?? "")).filter(Boolean))].map((n) => `[${n}]`).join("");
  const ranked = rankOptions({
    options: d.options,
    criteria: d.plan.criteria,
    scores: d.scores,
    claims: d.claims,
    sources,
    contradictions: d.contradictions,
    freshnessDays: d.plan.freshnessDays,
    weightOverrides: decision.weights,
  });

  if (d.recommendation) {
    lines.push("## Recommendation", "", `**${d.recommendation.headline}**`, "", d.recommendation.summary, "", "### Why");
    for (const r of d.recommendation.reasons) lines.push(`- ${r.text} ${cite(r.claimIds)}`);
    if (d.recommendation.tradeoffs.length) {
      lines.push("", "### Trade-offs");
      for (const t of d.recommendation.tradeoffs) lines.push(`- ${t.text} ${cite(t.claimIds)}`);
    }
    if (d.recommendation.alternatives.length) {
      lines.push("", "### When to choose something else");
      for (const a of d.recommendation.alternatives) lines.push(`- **${optionName.get(a.optionId)}** — ${a.when}`);
    }
  }

  lines.push("", "## Ranking", "", "| # | Option | Score | Confidence | Evidence coverage | Supported / partial / unsupported / contradicted |", "|---|---|---|---|---|---|");
  for (const r of ranked) {
    const c = r.claimCounts;
    lines.push(`| ${r.rank} | ${optionName.get(r.optionId)} | ${r.total} | ${r.confidenceLabel} (${percent(r.confidence)}) | ${percent(r.coverage)} | ${c.supported} / ${c.partial} / ${c.unsupported} / ${c.contradicted} |`);
  }
  lines.push("", `Criteria and weights: ${d.plan.criteria.map((c) => `${c.name} ${decision.weights[c.id] ?? c.weight}`).join(", ")}.`);

  if (d.contradictions.length) {
    lines.push("", "## Conflicting evidence");
    for (const c of d.contradictions) {
      lines.push(`- **${c.topic}** (${c.severity}): ${c.assessment} ${[...new Set(c.statements.map((s) => sourceNo.get(s.sourceId)))].map((n) => `[${n}]`).join("")}`);
    }
  }
  if (d.uncertainties.length) {
    lines.push("", "## Uncertainty");
    for (const u of d.uncertainties) lines.push(`- *${u.kind}* (${u.impact}): ${u.text}${u.howToResolve ? ` — ${u.howToResolve}` : ""}`);
  }

  lines.push("", "## Verified claims", "", "| Status | Claim | Source | Quote found |", "|---|---|---|---|");
  for (const c of d.claims.filter((c) => c.verification)) {
    lines.push(`| ${c.verification!.status} | ${c.text.replace(/\|/g, "/")} | [${sourceNo.get(c.sourceId)}] | ${c.verification!.quoteFound ? "yes" : "no"} |`);
  }

  lines.push("", "## Sources", "");
  for (const s of sources) {
    lines.push(`${sourceNo.get(s.id)}. ${s.title} — ${s.url} (retrieved ${s.retrievedAt.slice(0, 10)}; published ${s.publishedAt?.slice(0, 10) ?? "undated"}; reliability ${s.reliability.score}/100; SHA-256 ${s.contentHash.slice(0, 16)}…)`);
  }
  void sourceById;

  const audit = await verifyAudit(decision.id);
  lines.push(
    "",
    "## Provenance",
    "",
    `Research run v${run.version} sealed with dossier hash \`${run.dossierHash}\`.`,
    `Audit chain: ${audit.valid ? `intact — ${audit.checked} events verified, head \`${audit.headHash}\`` : `BROKEN at event #${audit.brokenAt}: ${audit.reason}`}.`,
    "",
    "Decision AI is a decision-support tool. It can be wrong; check the sources before acting.",
  );
  return lines.join("\n");
}
