/**
 * decision-tool — Decision AI's provenance and verification layer as a CLI that an
 * AI agent can call. Everything here is deterministic code: quote location,
 * passage retrieval, transparent reliability signals, fixed verification rules,
 * weighted ranking and a SHA-256 hash-chained record. The agent supplies the
 * language judgements (does this passage state the claim?); the tool enforces the
 * rules and keeps the provenance.
 *
 *   node decision-tool.cjs --dir <run dir> <command> [options]
 *
 * Commands: sources | verify | search | record | ledger | finalize | seal | help
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Claim, Contradiction, CriterionScore, DecisionOption, Dossier, Source, Uncertainty, VerificationStatus } from "@/lib/domain";
import { UncertaintyKind } from "@/lib/domain";
import { earnedSignals, priorSignals, scoreFromSignals, type TrackRecord } from "@/lib/reliability";
import { rankOptions } from "@/lib/scoring";
import { Bm25Index, chunkText, locateQuote, truncate, type Passage } from "@/lib/text";
import { decideStatus } from "@/lib/verification";
import { kindOf } from "./kind";
import { GENESIS_HASH, canonicalJson, computeEventHash, sha256, verifyChain, type ChainLink } from "@/server/audit/hash-chain";

/* ───────────────────────────── I/O ───────────────────────────── */

type PoolFile = {
  question: string;
  freshnessDays: number;
  sources: {
    n: number;
    id: string;
    url: string;
    domain: string;
    title: string;
    siteName: string | null;
    author: string | null;
    publishedAt: string | null;
    retrievedAt: string;
    contentHash: string;
    wordCount: number;
    text: string;
  }[];
};

type LedgerClaim = {
  id: string;
  source: number;
  option: string;
  criterion: string;
  claim: string;
  quote: string;
  support: "supported" | "partial" | "unsupported";
  corroborating: number[];
  conflicting: number[];
  note: string | null;
  quoteFound: boolean;
  quoteSimilarity: number;
  status: VerificationStatus;
  passage: { id: string; text: string } | null;
  recordedAt: string;
};

const args = process.argv.slice(2);
const dirIndex = args.indexOf("--dir");
if (dirIndex < 0 || !args[dirIndex + 1]) fail("Missing --dir <run directory>.");
const DIR = path.resolve(args[dirIndex + 1]);
const rest = args.filter((_, i) => i !== dirIndex && i !== dirIndex + 1);
const command = rest[0] ?? "help";

function opt(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
function numList(v: string | undefined): number[] {
  if (!v) return [];
  return [...new Set(v.split(/[,\s]+/).map((x) => Number(x.replace(/[^\d]/g, ""))).filter((x) => Number.isInteger(x) && x > 0))];
}

const pool: PoolFile = JSON.parse(readFileSync(path.join(DIR, "pool.json"), "utf8"));
const ledgerPath = path.join(DIR, "ledger.json");
const auditPath = path.join(DIR, "audit.jsonl");
const ledger: LedgerClaim[] = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : [];

/* ───────────────────────────── Provenance log ───────────────────────────── */

function readChain(): ChainLink[] {
  if (!existsSync(auditPath)) return [];
  return readFileSync(auditPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChainLink);
}
function audit(type: string, payload: unknown): ChainLink {
  const chain = readChain();
  const prev = chain.at(-1);
  const base = {
    seq: (prev?.seq ?? 0) + 1,
    type,
    payload: JSON.parse(canonicalJson(payload ?? null)),
    prevHash: prev?.hash ?? GENESIS_HASH,
    createdAt: new Date().toISOString(),
  };
  const link = { ...base, hash: computeEventHash(base) };
  appendFileSync(auditPath, `${JSON.stringify(link)}\n`);
  return link;
}

/* ───────────────────────────── Sources & reliability ───────────────────────────── */

function sourceRecord(s: PoolFile["sources"][number]) {
  const kind = kindOf(s.url, s.title);
  const prior = priorSignals({ url: s.url, siteName: s.siteName, author: s.author, publishedAt: s.publishedAt, wordCount: s.wordCount, kind, status: "read" }, pool.freshnessDays);
  const record: TrackRecord = { supported: 0, partial: 0, unsupported: 0, contradicted: 0, corroborated: 0 };
  for (const c of ledger.filter((c) => c.source === s.n)) {
    record[c.status]++;
    if (c.corroborating.length > 0 && c.status !== "unsupported") record.corroborated++;
  }
  const earned = earnedSignals(record);
  return {
    kind,
    prior,
    earned,
    priorScore: scoreFromSignals(prior),
    score: scoreFromSignals([...prior, ...earned]),
  };
}

const passages: Passage[] = pool.sources.flatMap((s) => chunkText(String(s.n), s.text, { targetWords: 110, overlapWords: 25 }));
const index = new Bm25Index(passages);
const label = (p: Passage) => `[${p.sourceId}.p${p.index + 1}]`;
const bySource = new Map(pool.sources.map((s) => [s.n, s]));

function sourceOrFail(n: number) {
  const s = bySource.get(n);
  if (!s) fail(`No source [${n}]. Valid sources: ${pool.sources.map((x) => x.n).join(", ")}`);
  return s;
}

/* ───────────────────────────── Commands ───────────────────────────── */

switch (command) {
  case "sources": {
    console.log(`Question: ${pool.question}\nFreshness window: ${pool.freshnessDays} days\n`);
    for (const s of pool.sources) {
      const r = sourceRecord(s);
      console.log(`[${s.n}] ${s.title}`);
      console.log(`    ${s.domain} | type: ${r.kind} | published: ${s.publishedAt?.slice(0, 10) ?? "undated"} | author: ${s.author ?? "none"} | publisher: ${s.siteName ?? "unknown"} | ${s.wordCount} words`);
      console.log(`    reliability: ${r.score}/100 (metadata prior ${r.priorScore}${r.earned.length ? `, earned ${r.score - r.priorScore >= 0 ? "+" : ""}${r.score - r.priorScore}` : ""})`);
      console.log(`    signals: ${[...r.prior, ...r.earned].map((g) => `${g.label} ${g.effect >= 0 ? "+" : ""}${g.effect}`).join("; ")}`);
      console.log(`    sha256 ${s.contentHash.slice(0, 16)}… retrieved ${s.retrievedAt.slice(0, 10)}\n`);
    }
    break;
  }

  case "verify": {
    const n = Number(opt("source"));
    const claim = opt("claim") ?? fail("--claim is required");
    const quote = opt("quote") ?? "";
    const s = sourceOrFail(n);
    const q = quote ? locateQuote(s.text, quote) : null;
    console.log(q ? `Quote check in [${n}]: ${q.found ? "FOUND" : "NOT FOUND"} (similarity ${q.similarity.toFixed(2)})` : "Quote check: no quote given");
    console.log(`\nBest passages in the cited source [${n}] (reliability ${sourceRecord(s).score}):`);
    for (const r of index.search(`${claim} ${quote}`, 3, (p) => p.sourceId === String(n))) console.log(`  ${label(r.item)} ${truncate(r.item.text, 700)}`);
    console.log(`\nMost related passages in OTHER sources (check for corroboration or conflict):`);
    for (const r of index.search(claim, 4, (p) => p.sourceId !== String(n))) {
      console.log(`  ${label(r.item)} (source [${r.item.sourceId}], reliability ${sourceRecord(bySource.get(Number(r.item.sourceId))!).score}) ${truncate(r.item.text, 600)}`);
    }
    break;
  }

  case "search": {
    const query = opt("query") ?? fail("--query is required");
    for (const r of index.search(query, 6)) console.log(`${label(r.item)} (source [${r.item.sourceId}]) ${truncate(r.item.text, 600)}\n`);
    break;
  }

  case "record": {
    const n = Number(opt("source"));
    const s = sourceOrFail(n);
    const claim = opt("claim") ?? fail("--claim is required");
    const quote = opt("quote") ?? fail("--quote is required (verbatim sentence from the source)");
    const support = z.enum(["supported", "partial", "unsupported"]).parse(opt("support"));
    const corroborating = numList(opt("corroborating")).filter((x) => x !== n && bySource.has(x));
    const conflicting = numList(opt("conflicting")).filter((x) => x !== n && bySource.has(x));
    const q = locateQuote(s.text, quote);
    const status = decideStatus({ support, quoteFound: q.found, conflicting: conflicting.length, corroborating: corroborating.length });
    const best = index.search(`${claim} ${quote}`, 1, (p) => p.sourceId === String(n))[0]?.item ?? null;
    const entry: LedgerClaim = {
      id: `C${ledger.length + 1}`,
      source: n,
      option: opt("option") ?? "general",
      criterion: opt("criterion") ?? "other",
      claim,
      quote,
      support,
      corroborating,
      conflicting,
      note: opt("note") ?? null,
      quoteFound: q.found,
      quoteSimilarity: q.similarity,
      status,
      passage: best ? { id: label(best), text: best.text } : null,
      recordedAt: new Date().toISOString(),
    };
    ledger.push(entry);
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    audit("claim.recorded", { id: entry.id, source: n, contentHash: s.contentHash, claim, quote, support, quoteFound: q.found, corroborating, conflicting, status });
    const why =
      status === support
        ? ""
        : status === "partial"
          ? " (downgraded: the quote was not found verbatim in the source text)"
          : status === "contradicted"
            ? " (conflicts with another source and no source corroborates it)"
            : "";
    console.log(`Recorded ${entry.id}: final status = ${status.toUpperCase()}${why}; quote ${q.found ? "found" : "NOT found"} (similarity ${q.similarity.toFixed(2)}).`);
    break;
  }

  case "ledger": {
    if (!ledger.length) console.log("No claims recorded yet.");
    const options = [...new Set(ledger.map((c) => c.option))];
    for (const o of options) {
      console.log(`\n${o}`);
      for (const c of ledger.filter((x) => x.option === o)) {
        console.log(`  ${c.id} [${c.status}] ${c.claim} — source [${c.source}]${c.corroborating.length ? `, corroborated by ${c.corroborating.map((x) => `[${x}]`).join("")}` : ""}${c.conflicting.length ? `, conflicts with ${c.conflicting.map((x) => `[${x}]`).join("")}` : ""}`);
      }
    }
    console.log("\nSource reliability now (metadata prior → after verification):");
    for (const s of pool.sources) {
      const r = sourceRecord(s);
      console.log(`  [${s.n}] ${s.domain}: ${r.priorScore} → ${r.score}`);
    }
    break;
  }

  case "finalize": {
    const file = opt("file") ?? fail("--file <path to your dossier JSON> is required");
    const Input = z.object({
      criteria: z.array(z.object({ name: z.string(), weight: z.number(), description: z.string().default("") })).min(1),
      options: z.array(z.object({ name: z.string(), summary: z.string().default(""), price: z.string().nullable().default(null) })).min(1),
      scores: z.array(z.object({ option: z.string(), criterion: z.string(), score: z.number().min(0).max(10).nullable(), rationale: z.string().default(""), claims: z.array(z.string()).default([]) })),
      recommendation: z.object({
        option: z.string(),
        headline: z.string(),
        summary: z.string(),
        reasons: z.array(z.object({ text: z.string(), claims: z.array(z.string()).default([]) })),
        tradeoffs: z.array(z.object({ text: z.string(), claims: z.array(z.string()).default([]) })).default([]),
        alternatives: z.array(z.object({ option: z.string(), when: z.string() })).default([]),
        caveats: z.array(z.string()).default([]),
        nextSteps: z.array(z.string()).default([]),
      }),
      contradictions: z
        .array(z.object({ option: z.string().nullable().default(null), topic: z.string(), claims: z.array(z.string()), assessment: z.string(), severity: z.enum(["high", "medium", "low"]).default("medium") }))
        .default([]),
      uncertainties: z
        .array(z.object({ kind: UncertaintyKind, text: z.string(), option: z.string().nullable().default(null), impact: z.enum(["high", "medium", "low"]).default("medium"), howToResolve: z.string().nullable().default(null) }))
        .default([]),
    });
    const parsed = Input.safeParse(JSON.parse(readFileSync(path.resolve(DIR, file), "utf8")));
    if (!parsed.success) fail(`Invalid dossier JSON: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const input = parsed.data;
    const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const optionId = new Map(input.options.map((o, i) => [key(o.name), `opt_${i + 1}`]));
    const criterionId = new Map(input.criteria.map((c, i) => [key(c.name), `crit_${i + 1}`]));
    const findOpt = (name: string | null) => (name ? optionId.get(key(name)) ?? [...optionId.entries()].find(([k]) => k.includes(key(name)) || key(name).includes(k))?.[1] ?? null : null);
    const findCrit = (name: string) => criterionId.get(key(name)) ?? [...criterionId.entries()].find(([k]) => k.includes(key(name)) || key(name).includes(k))?.[1] ?? null;
    const valid = new Set(ledger.map((c) => c.id));
    const keep = (ids: string[]) => ids.filter((id) => valid.has(id));
    const unknown = [...input.scores.flatMap((s) => s.claims), ...input.recommendation.reasons.flatMap((r) => r.claims)].filter((id) => !valid.has(id));
    const totalWeight = input.criteria.reduce((a, c) => a + Math.max(0, c.weight), 0) || 1;

    const sources: Source[] = pool.sources.map((s) => {
      const r = sourceRecord(s);
      return {
        id: String(s.n), runId: "run", decisionId: "decision", url: s.url, domain: s.domain, title: s.title, siteName: s.siteName, author: s.author,
        publishedAt: s.publishedAt, retrievedAt: s.retrievedAt, contentHash: s.contentHash, wordCount: s.wordCount, excerpt: truncate(s.text, 300),
        image: null, favicon: null, kind: r.kind, perspective: null, status: "read", query: null, provider: "study",
        reliability: { score: r.score, signals: [...r.prior, ...r.earned] },
      };
    });
    const claims: Claim[] = ledger.map((c) => ({
      id: c.id,
      optionId: findOpt(c.option),
      criterionId: findCrit(c.criterion),
      text: c.claim,
      kind: "fact",
      sourceId: String(c.source),
      quote: c.quote,
      verification: {
        status: c.status, confidence: 1, quoteFound: c.quoteFound, quoteSimilarity: c.quoteSimilarity, passage: c.passage,
        rationale: c.note ?? `${c.support} by the cited passage`, corroboratingSourceIds: c.corroborating.map(String), conflictingSourceIds: c.conflicting.map(String),
        conflictNote: null, verifiedAt: c.recordedAt,
      },
    }));
    const options: DecisionOption[] = input.options.map((o, i) => ({
      id: `opt_${i + 1}`, name: o.name, summary: o.summary, image: null, officialUrl: null, priceText: o.price, userNamed: false,
      sourceIds: [...new Set(ledger.filter((c) => findOpt(c.option) === `opt_${i + 1}`).map((c) => String(c.source)))],
    }));
    const scores: CriterionScore[] = input.scores.flatMap((s) => {
      const o = findOpt(s.option);
      const c = findCrit(s.criterion);
      return o && c ? [{ optionId: o, criterionId: c, score: s.score, rationale: s.rationale, claimIds: keep(s.claims) }] : [];
    });
    const contradictions: Contradiction[] = input.contradictions.map((c, i) => ({
      id: `con_${i + 1}`, optionId: findOpt(c.option), criterionId: null, topic: c.topic,
      statements: keep(c.claims).map((id) => { const l = ledger.find((x) => x.id === id)!; return { claimId: id, sourceId: String(l.source), text: l.claim }; }),
      assessment: c.assessment, favoredSourceId: null, severity: c.severity,
    }));
    const criteria = input.criteria.map((c, i) => ({ id: `crit_${i + 1}`, name: c.name, description: c.description, weight: Math.round((Math.max(0, c.weight) / totalWeight) * 100), origin: "user" as const }));
    const ranked = rankOptions({ options, criteria, scores, claims, sources, contradictions, freshnessDays: pool.freshnessDays });
    const recId = findOpt(input.recommendation.option);
    const uncertainties: Uncertainty[] = input.uncertainties.map((u, i) => ({ id: `unc_${i + 1}`, kind: u.kind, text: u.text, optionId: findOpt(u.option), impact: u.impact, howToResolve: u.howToResolve }));
    const count = (st: string) => claims.filter((c) => c.verification?.status === st).length;
    const dossier: Dossier = {
      plan: { decisionType: "decision", criteria, queries: [], freshnessDays: pool.freshnessDays, region: null, rationale: "" },
      options, claims, contradictions, uncertainties, scores,
      recommendation: {
        optionId: recId ?? ranked[0].optionId,
        headline: input.recommendation.headline,
        summary: input.recommendation.summary,
        reasons: input.recommendation.reasons.map((r) => ({ text: r.text, claimIds: keep(r.claims) })),
        tradeoffs: input.recommendation.tradeoffs.map((r) => ({ text: r.text, claimIds: keep(r.claims) })),
        alternatives: input.recommendation.alternatives.flatMap((a) => { const o = findOpt(a.option); return o ? [{ optionId: o, when: a.when }] : []; }),
        caveats: input.recommendation.caveats,
        nextSteps: input.recommendation.nextSteps,
      },
      metrics: {
        sourcesConsulted: sources.length, sourcesRead: sources.length, claimsTotal: claims.length, supported: count("supported"), partial: count("partial"),
        unsupported: count("unsupported"), contradicted: count("contradicted"), contradictions: contradictions.length,
        averageReliability: Math.round(sources.reduce((a, s) => a + s.reliability.score, 0) / sources.length), freshShare: 0, durationMs: 0, modelCalls: 0, tokens: 0,
      },
    };
    writeFileSync(path.join(DIR, "dossier.json"), JSON.stringify({ dossier, sources }, null, 2));
    audit("dossier.finalized", { options: options.length, claims: claims.length, ranking: ranked.map((r) => ({ option: r.optionId, total: r.total, confidence: r.confidence })) });
    console.log("Deterministic ranking from your verified scores and the criteria weights:");
    for (const r of ranked) {
      const name = options.find((o) => o.id === r.optionId)!.name;
      console.log(`  ${r.rank}. ${name}: ${r.total}/100, confidence ${r.confidenceLabel} (${(r.confidence * 100).toFixed(0)}%), evidence coverage ${(r.coverage * 100).toFixed(0)}%`);
    }
    if (!recId) console.log(`warning: recommended option "${input.recommendation.option}" is not in options.`);
    else if (recId !== ranked[0].optionId) console.log(`note: you recommend ${input.recommendation.option}, but the evidence-weighted ranking puts ${options.find((o) => o.id === ranked[0].optionId)!.name} first. Justify this in your answer or revise.`);
    if (unknown.length) console.log(`warning: ignored unknown claim ids: ${[...new Set(unknown)].join(", ")}`);
    const unusable = scores.filter((s) => s.score != null && !s.claimIds.some((id) => ["supported", "partial"].includes(claims.find((c) => c.id === id)?.verification?.status ?? ""))).length;
    if (unusable) console.log(`note: ${unusable} scores cite no supported/partial claim; they were treated as missing evidence (neutral 5).`);
    console.log("Wrote dossier.json.");
    break;
  }

  case "seal": {
    const dossierFile = path.join(DIR, "dossier.json");
    if (!existsSync(dossierFile)) fail("Run finalize first.");
    const hash = sha256(canonicalJson(JSON.parse(readFileSync(dossierFile, "utf8"))));
    const link = audit("research.sealed", { dossierHash: hash, claims: ledger.length });
    const check = verifyChain(readChain());
    console.log(`Sealed. Dossier SHA-256 ${hash}\nAudit chain: ${check.valid ? `intact, ${check.checked} events, head ${link.hash}` : `BROKEN at #${check.brokenAt}: ${check.reason}`}`);
    break;
  }

  default:
    console.log(`decision-tool — provenance and verification for evidence-based answers

  --dir <run dir> sources
      List sources with type, date, author, publisher and transparent reliability signals.
  --dir <run dir> verify --source N --claim "<claim>" --quote "<verbatim sentence from source N>"
      Check the quote is really in source N; show the best passages in N and related passages in other sources.
  --dir <run dir> search --query "<words>"
      Find passages across all sources.
  --dir <run dir> record --source N --option "<option>" --criterion "<criterion>" --claim "<claim>" --quote "<verbatim>"
                         --support supported|partial|unsupported [--corroborating "2,5"] [--conflicting "3"] [--note "<why>"]
      Record your verdict. Fixed rules decide the final status (quote not found → at most partial;
      conflicting and not corroborated → contradicted). Every record is appended to a hash chain.
  --dir <run dir> ledger
      Show recorded claims with final statuses and each source's reliability after verification.
  --dir <run dir> finalize --file dossier-input.json
      Validate your options/criteria/scores/recommendation, compute the evidence-weighted ranking.
  --dir <run dir> seal
      Seal the dossier into the hash chain and verify the chain.`);
}
