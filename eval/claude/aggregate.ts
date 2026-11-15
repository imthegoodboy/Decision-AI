/**
 * Aggregates the Claude-agent study into the same files the analysis script reads:
 *   eval/results/items.csv, reliability.csv, human-audit-sample.csv, coverage.json
 *
 *   node --import tsx eval/claude/aggregate.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { earnedSignals, priorSignals, scoreFromSignals, type TrackRecord } from "@/lib/reliability";
import { RESULTS } from "../lib/config";
import { readCache, seedOf } from "../lib/store";
import { kindOf } from "./kind";
import { CLAUDE_DATA, type PlantedRecord, type StudyPool, type StudyQuestion } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string; dir: string; numbering: Record<string, string> };
type StudyQ = {
  questionId: string;
  cleanToPoisoned: Record<string, number>;
  judges: { judgeId: string; file: string; answers: { label: string; runId: string }[] }[];
};
type Study = { root: string; runs: Run[]; questions: StudyQ[] };
type JudgeFile = {
  answers: {
    label: string;
    claims: { claim: string; citations: number[]; verdict: "supported" | "partial" | "unsupported"; rationale: string }[];
    recommendedOption: string | null;
    conflictDisclosed: boolean;
    planted: { id: string; status: "asserted" | "flagged" | "absent"; evidence: string }[];
  }[];
};
type LedgerClaim = { id: string; source: number; status: "supported" | "partial" | "unsupported" | "contradicted"; corroborating: number[] };

const study = readCache<Study>(path.join(CLAUDE_DATA, "study.json"));
if (!study) throw new Error("Run prepare.ts first.");
const questions: StudyQuestion[] = JSON.parse(readFileSync(path.join(process.cwd(), "eval", "claude", "questions.json"), "utf8"));
const domainOf = new Map(questions.map((q) => [q.id, q.domain]));
const SYSTEM_NAME: Record<string, string> = { baseline: "baseline", selfcheck: "selfcheck", tool: "decisionai" };
const FRESHNESS = 365;

type Row = Record<string, string | number | boolean | null>;
const rows: Row[] = [];
const audit: Row[] = [];
const missing: string[] = [];

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sameOption = (a: string | null, b: string | null) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const tx = new Set(x.split(" ").filter((t) => t.length > 1));
  const shared = y.split(" ").filter((t) => t.length > 1 && tx.has(t));
  return shared.length >= 2;
};

for (const q of study.questions) {
  const pool = readCache<StudyPool>(path.join(CLAUDE_DATA, "pools", `${q.questionId}.json`))!;
  const plantedSrc = readCache<{ source: { id: string; publishedAt: string | null; url: string } }>(path.join(CLAUDE_DATA, "planted-sources", `${q.questionId}.json`))!;
  const allSources = [...pool.sources, plantedSrc.source];
  const verdicts = new Map<string, JudgeFile["answers"][number]>();
  for (const j of q.judges) {
    const jf = readCache<JudgeFile>(j.file);
    if (!jf) {
      missing.push(j.judgeId);
      continue;
    }
    for (const a of j.answers) {
      const v = jf.answers.find((x) => x.label.trim().toUpperCase() === a.label);
      if (v) verdicts.set(a.runId, v);
      else missing.push(`${j.judgeId}:${a.label}`);
    }
  }

  const recommended: Record<string, Record<string, string | null>> = {};
  for (const run of study.runs.filter((r) => r.questionId === q.questionId)) {
    const v = verdicts.get(run.runId);
    const answerPath = path.join(run.dir, "answer.md");
    if (!v || !existsSync(answerPath)) {
      missing.push(run.runId);
      continue;
    }
    const answer = readFileSync(answerPath, "utf8");
    const system = SYSTEM_NAME[run.system];
    (recommended[system] ??= {})[run.condition] = v.recommendedOption;

    // Judge citations use the poisoned (superset) numbering; map back to source ids.
    const poisonedNumbering = study.runs.find((r) => r.questionId === q.questionId && r.condition === "poisoned")!.numbering;
    const claims = v.claims;
    const cited = claims.filter((c) => c.citations.length > 0);
    const uncited = claims.filter((c) => c.citations.length === 0);
    const count = (cs: typeof claims, verdict: string) => cs.filter((c) => c.verdict === verdict).length;
    const citedIds = [...new Set(cited.flatMap((c) => c.citations).map((n) => poisonedNumbering[String(n)]).filter(Boolean))];
    const citedSources = citedIds.map((id) => allSources.find((s) => s.id === id)).filter(Boolean) as { publishedAt: string | null }[];
    const dated = citedSources.filter((s) => s.publishedAt);
    const fresh = dated.filter((s) => (Date.now() - Date.parse(s.publishedAt!)) / 86_400_000 <= FRESHNESS);
    const plantedAsserted = run.condition === "poisoned" ? v.planted.filter((p) => p.status === "asserted").length : null;
    const plantedFlagged = run.condition === "poisoned" ? v.planted.filter((p) => p.status === "flagged").length : null;
    const plantedNumber = Number(Object.entries(poisonedNumbering).find(([, id]) => id === plantedSrc.source.id)?.[0]);
    const ledger = run.system === "tool" ? (readCache<LedgerClaim[]>(path.join(run.dir, "ledger.json")) ?? []) : null;

    rows.push({
      question: q.questionId,
      domain: domainOf.get(q.questionId) ?? "",
      system,
      condition: run.condition,
      claims: claims.length,
      cited_claims: cited.length,
      uncited_claims: uncited.length,
      cited_supported: count(cited, "supported"),
      cited_partial: count(cited, "partial"),
      citation_support_rate: cited.length ? count(cited, "supported") / cited.length : null,
      citation_support_or_partial_rate: cited.length ? (count(cited, "supported") + count(cited, "partial")) / cited.length : null,
      uncited_rate: claims.length ? uncited.length / claims.length : null,
      uncited_bindable_rate: uncited.length ? count(uncited, "supported") / uncited.length : null,
      unsupported_statement_rate: claims.length ? (count(cited, "unsupported") + count(uncited, "unsupported")) / claims.length : null,
      cited_sources: citedSources.length,
      cited_sources_dated_share: citedSources.length ? dated.length / citedSources.length : null,
      cited_sources_fresh_share: dated.length ? fresh.length / dated.length : null,
      conflict_disclosed: v.conflictDisclosed,
      cited_planted: run.condition === "poisoned" ? cited.some((c) => c.citations.includes(plantedNumber)) : null,
      planted_asserted: plantedAsserted,
      planted_flagged: plantedFlagged,
      planted_adopted_any: plantedAsserted === null ? null : plantedAsserted > 0,
      // Control: does the judge "find" planted claims in answers that never saw the planted source?
      planted_false_positive: run.condition === "clean" ? v.planted.filter((p) => p.status === "asserted").length : null,
      recommended_option: v.recommendedOption,
      answer_words: answer.split(/\s+/).filter(Boolean).length,
      verified_claims: ledger ? ledger.length : null,
    });

    claims.forEach((c, i) => {
      if (c.citations.length === 0) return;
      audit.push({
        key: `${q.questionId}|${system}|${run.condition}|${i}`,
        system,
        claim: c.claim,
        cited_sources: c.citations.map((n) => `[${n}]`).join(" "),
        cited_urls: c.citations.map((n) => allSources.find((s) => s.id === poisonedNumbering[String(n)])?.url ?? "").join(" "),
        judge_verdict: c.verdict,
        judge_rationale: c.rationale,
      });
    });
  }
  for (const system of Object.keys(recommended)) {
    const r = recommended[system];
    const row = rows.find((x) => x.question === q.questionId && x.system === system && x.condition === "poisoned");
    if (row) row.recommendation_flipped = r.clean && r.poisoned ? !sameOption(r.clean, r.poisoned) : null;
  }
}

// Reliability probe: metadata prior vs reliability earned through the tool agent's own verification.
const reliability: Row[] = [];
for (const run of study.runs.filter((r) => r.system === "tool" && r.condition === "poisoned")) {
  const pool = JSON.parse(readFileSync(path.join(run.dir, "pool.json"), "utf8")) as {
    sources: { n: number; id: string; url: string; title: string; siteName: string | null; author: string | null; publishedAt: string | null; wordCount: number }[];
  };
  const ledger = readCache<LedgerClaim[]>(path.join(run.dir, "ledger.json"));
  if (!ledger) continue;
  const planted = readCache<{ source: { id: string } }>(path.join(CLAUDE_DATA, "planted-sources", `${run.questionId}.json`))!;
  for (const s of pool.sources) {
    const prior = priorSignals({ url: s.url, siteName: s.siteName, author: s.author, publishedAt: s.publishedAt, wordCount: s.wordCount, kind: kindOf(s.url, s.title), status: "read" }, FRESHNESS);
    const record: TrackRecord = { supported: 0, partial: 0, unsupported: 0, contradicted: 0, corroborated: 0 };
    const own = ledger.filter((c) => c.source === s.n);
    for (const c of own) {
      record[c.status]++;
      if (c.corroborating.length > 0 && c.status !== "unsupported") record.corroborated++;
    }
    const priorScore = scoreFromSignals(prior);
    const finalScore = scoreFromSignals([...prior, ...earnedSignals(record)]);
    reliability.push({
      question: run.questionId,
      source: s.id,
      planted: s.id === planted.source.id,
      kind: kindOf(s.url, s.title),
      prior_score: priorScore,
      final_score: finalScore,
      earned_delta: finalScore - priorScore,
      claims_checked: own.length,
    });
  }
}

const csv = (data: Row[]) => {
  const cols = [...new Set(data.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...data.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
};

mkdirSync(RESULTS, { recursive: true });
writeFileSync(path.join(RESULTS, "items.csv"), csv(rows));
writeFileSync(path.join(RESULTS, "reliability.csv"), csv(reliability));
const sample = ["baseline", "selfcheck", "decisionai"].flatMap((system) =>
  audit
    .filter((a) => a.system === system)
    .sort((a, b) => seedOf(String(a.key)) - seedOf(String(b.key)))
    .slice(0, 20),
);
if (!existsSync(path.join(RESULTS, "human-audit-sample.csv"))) {
  writeFileSync(path.join(RESULTS, "human-audit-sample.csv"), csv(sample.map((s) => ({ ...s, human_verdict: "" }))));
}
const planted = study.questions.map((q) => readCache<PlantedRecord>(path.join(CLAUDE_DATA, "planted", `${q.questionId}.json`)));
const summary = {
  generatedAt: new Date().toISOString(),
  questions: new Set(rows.map((r) => r.question)).size,
  rows: rows.length,
  missing,
  plantedClaims: planted.reduce((a, p) => a + (p?.falseClaims.length ?? 0), 0),
  auditSample: sample.length,
};
writeFileSync(path.join(RESULTS, "coverage.json"), JSON.stringify(summary, null, 2));
console.log(summary);
