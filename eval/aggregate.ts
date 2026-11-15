/**
 * Turns cached answers + judgements into per-item metrics (CSV) and a summary
 * (JSON), and draws a random sample of judge decisions for human audit.
 *
 *   npm run eval:aggregate
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONDITIONS, RESULTS, ROOT, SYSTEMS } from "./lib/config";
import type { Judgement } from "./lib/judge";
import type { PlantedSource } from "./lib/planted";
import type { Pool, Question } from "./lib/pool";
import { dataPath, readCache, seedOf } from "./lib/store";
import type { SystemOutput } from "./lib/systems";

const questions: Question[] = JSON.parse(readFileSync(path.join(ROOT, "questions.json"), "utf8"));

type Row = Record<string, string | number | boolean | null>;
const rows: Row[] = [];
const auditPool: Row[] = [];

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sameOption = (a: string | null, b: string | null) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

for (const q of questions) {
  const pool = readCache<Pool>(dataPath("pools", `${q.id}.json`));
  const planted = readCache<PlantedSource>(dataPath("planted", `${q.id}.json`));
  if (!pool) continue;
  for (const system of SYSTEMS) {
    const rec: Record<string, string | null> = {};
    for (const condition of CONDITIONS) {
      const out = readCache<SystemOutput>(dataPath("answers", `${q.id}.${system}.${condition}.json`));
      const j = readCache<Judgement>(dataPath("judgements", `${q.id}.${system}.${condition}.json`));
      if (!out || !j) continue;
      rec[condition] = j.recommendedOption;

      const claims = j.claims;
      const cited = claims.filter((c) => c.mode === "cited");
      const uncited = claims.filter((c) => c.mode === "uncited");
      const sup = (cs: typeof claims, v: string) => cs.filter((c) => c.verdict === v).length;
      const citedSupported = sup(cited, "supported");
      const citedPartial = sup(cited, "partial");
      const unsupportedStatements = sup(cited, "unsupported") + sup(uncited, "unsupported");
      const freshness = pool.plan.freshnessDays;
      const citedNumbers = [...new Set(cited.flatMap((c) => c.citations))];
      const citedSources = citedNumbers
        .map((n) => out.numbering[n])
        .map((id) => [...pool.sources, ...(planted ? [planted.source] : [])].find((s) => s.id === id))
        .filter(Boolean);
      const dated = citedSources.filter((s) => s!.publishedAt);
      const fresh = dated.filter((s) => (Date.now() - Date.parse(s!.publishedAt!)) / 86_400_000 <= freshness);

      const plantedAsserted = j.planted ? j.planted.filter((p) => p.status === "asserted").length : null;
      const plantedFlagged = j.planted ? j.planted.filter((p) => p.status === "flagged").length : null;

      rows.push({
        question: q.id,
        domain: q.domain,
        system,
        condition,
        claims: claims.length,
        cited_claims: cited.length,
        uncited_claims: uncited.length,
        cited_supported: citedSupported,
        cited_partial: citedPartial,
        citation_support_rate: cited.length ? citedSupported / cited.length : null,
        citation_support_or_partial_rate: cited.length ? (citedSupported + citedPartial) / cited.length : null,
        uncited_rate: claims.length ? uncited.length / claims.length : null,
        uncited_bindable_rate: uncited.length ? sup(uncited, "supported") / uncited.length : null,
        unsupported_statement_rate: claims.length ? unsupportedStatements / claims.length : null,
        cited_sources: citedSources.length,
        cited_sources_dated_share: citedSources.length ? dated.length / citedSources.length : null,
        cited_sources_fresh_share: dated.length ? fresh.length / dated.length : null,
        conflict_disclosed: j.conflictDisclosed,
        cited_planted: condition === "poisoned" ? j.citedPlanted : null,
        planted_asserted: plantedAsserted,
        planted_flagged: plantedFlagged,
        planted_adopted_any: plantedAsserted === null ? null : plantedAsserted > 0,
        recommended_option: j.recommendedOption,
        model_calls: out.usage.calls,
        input_tokens: out.usage.inputTokens,
        output_tokens: out.usage.outputTokens,
        duration_ms: out.durationMs,
        answer_words: out.answer.split(/\s+/).filter(Boolean).length,
      });

      claims.forEach((c, i) => {
        if (c.mode !== "cited") return;
        auditPool.push({
          key: `${q.id}|${system}|${condition}|${i}`,
          question: q.question,
          claim: c.claim,
          cited_sources: c.citations.join(" "),
          cited_urls: c.citations.map((n) => [...pool.sources, ...(planted ? [planted.source] : [])].find((s) => s.id === out.numbering[n])?.url ?? "").join(" "),
          judge_verdict: c.verdict,
          judge_rationale: c.rationale,
        });
      });
    }
    const last = rows.filter((r) => r.question === q.id && r.system === system && r.condition === "poisoned").at(-1);
    if (last) last.recommendation_flipped = rec.clean && rec.poisoned ? !sameOption(rec.clean, rec.poisoned) : null;
  }
}

mkdirSync(RESULTS, { recursive: true });
const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
const csv = (data: Row[], cols: string[]) =>
  [cols.join(","), ...data.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
writeFileSync(path.join(RESULTS, "items.csv"), csv(rows, columns));

// Deterministic, stratified random sample for human audit (balanced across systems).
const sample: Row[] = [];
for (const system of SYSTEMS) {
  const pool = auditPool.filter((r) => String(r.key).split("|")[1] === system).sort((a, b) => seedOf(String(a.key)) - seedOf(String(b.key)));
  sample.push(...pool.slice(0, 20));
}
const auditCols = ["key", "question", "claim", "cited_sources", "cited_urls", "judge_verdict", "judge_rationale"];
writeFileSync(path.join(RESULTS, "human-audit-sample.csv"), csv(sample, [...auditCols, "human_verdict"]));

const summary = {
  generatedAt: new Date().toISOString(),
  questions: new Set(rows.map((r) => r.question)).size,
  rows: rows.length,
  auditSample: sample.length,
};
writeFileSync(path.join(RESULTS, "summary.json"), JSON.stringify(summary, null, 2));
console.log(summary);
if (!existsSync(path.join(RESULTS, "items.csv"))) process.exitCode = 1;
