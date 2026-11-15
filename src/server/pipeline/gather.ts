import "server-only";
import { createHash } from "node:crypto";
import { mapLimit } from "@/lib/async";
import type { PipelineEvent, SearchQuery } from "@/lib/domain";
import { truncate } from "@/lib/text";
import { domainOf } from "@/lib/utils";
import { env } from "../config/env";
import { extractPage, normalizeDate } from "../research/extract";
import { fetchPage } from "../research/safe-fetch";
import { search, type SearchHit } from "../research/search";
import type { PoolSource } from "./core";

/**
 * Search → select → fetch → extract. Produces the source pool for a run with
 * full provenance (final URL, retrieval time, SHA-256 of the extracted text).
 */

const SKIP_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|zip|mp4|mp3|jpg|jpeg|png|gif|webp)(\?|$)/i;
const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|pinterest\.com)$/i;

export type GatherResult = {
  sources: PoolSource[];
  queries: { query: string; provider: string | null; results: number; errors: string[] }[];
};

export async function gatherSources(input: {
  queries: SearchQuery[];
  region: string | null;
  runId: string;
  decisionId: string;
  newId: () => string;
  maxSources?: number;
  exclude?: Set<string>;
  emit?: (e: PipelineEvent) => void;
  signal?: AbortSignal;
}): Promise<GatherResult> {
  const cfg = env();
  const emit = input.emit ?? (() => undefined);
  const maxSources = input.maxSources ?? cfg.RESEARCH_MAX_SOURCES;

  emit({ type: "stage", stage: "search", status: "start" });
  const searched = await mapLimit(input.queries, Math.min(3, cfg.RESEARCH_CONCURRENCY), async (q) => {
    const res = await search(q.query, { region: input.region, limit: 8, signal: input.signal });
    emit({ type: "query", query: q.query, provider: res.provider ?? "none", results: res.hits.length });
    return { q, ...res };
  });
  const queryLog = searched.map((s) => ({ query: s.q.query, provider: s.provider, results: s.hits.length, errors: s.errors }));
  const selected = selectHits(
    searched.map((s) => s.hits.map((h) => ({ ...h, query: s.q.query }))),
    maxSources,
    input.exclude ?? new Set(),
  );
  emit({ type: "stage", stage: "search", status: "done", detail: `${selected.length} pages selected from ${input.queries.length} searches` });
  if (selected.length === 0) {
    const errors = queryLog.flatMap((q) => q.errors).slice(0, 3).join("; ");
    throw new Error(`Web search returned no usable pages.${errors ? ` (${errors})` : ""}`);
  }

  emit({ type: "stage", stage: "read", status: "start" });
  let done = 0;
  const sources = await mapLimit(selected, cfg.RESEARCH_CONCURRENCY, async (hit) => {
    const source = await readHit(hit, input, cfg.RESEARCH_FETCH_TIMEOUT_MS);
    emit({ type: "progress", stage: "read", done: ++done, total: selected.length, detail: source.domain });
    return source;
  });
  const read = sources.filter((s) => s.status === "read").length;
  emit({ type: "stage", stage: "read", status: "done", detail: `${read} of ${sources.length} pages read in full` });
  return { sources, queries: queryLog };
}

type HitWithQuery = SearchHit & { query: string };

/** Round-robin across queries for diversity; at most two pages per domain. */
export function selectHits(perQuery: HitWithQuery[][], max: number, exclude: Set<string>): HitWithQuery[] {
  const seenUrls = new Set<string>();
  const perDomain = new Map<string, number>();
  const out: HitWithQuery[] = [];
  const depth = Math.max(0, ...perQuery.map((h) => h.length));
  for (let i = 0; i < depth && out.length < max; i++) {
    for (const hits of perQuery) {
      const hit = hits[i];
      if (!hit || out.length >= max) continue;
      const key = canonicalUrl(hit.url);
      const domain = domainOf(hit.url);
      if (seenUrls.has(key) || exclude.has(key)) continue;
      if (SKIP_EXTENSIONS.test(hit.url) || SKIP_HOSTS.test(domain)) continue;
      if ((perDomain.get(domain) ?? 0) >= 2) continue;
      seenUrls.add(key);
      perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
      out.push(hit);
    }
  }
  return out;
}

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref|^fbclid|^gclid/i.test(k)) u.searchParams.delete(k);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

async function readHit(
  hit: HitWithQuery,
  ctx: { runId: string; decisionId: string; newId: () => string; signal?: AbortSignal },
  timeoutMs: number,
): Promise<PoolSource> {
  const retrievedAt = new Date().toISOString();
  const base = {
    id: ctx.newId(),
    runId: ctx.runId,
    decisionId: ctx.decisionId,
    query: hit.query,
    provider: hit.provider,
    retrievedAt,
  };
  try {
    const page = await fetchPage(hit.url, timeoutMs, ctx.signal);
    const ex = extractPage(page.body, page.finalUrl);
    if (ex.wordCount < 40) throw new Error("No readable text");
    const text = ex.text.slice(0, 120_000);
    return {
      ...base,
      url: page.finalUrl,
      domain: domainOf(page.finalUrl),
      title: ex.title || hit.title || page.finalUrl,
      siteName: ex.siteName,
      author: ex.author,
      publishedAt: ex.publishedAt ?? normalizeDate(hit.publishedAt),
      contentHash: sha256(text),
      wordCount: ex.wordCount,
      excerpt: truncate(ex.description || text, 320),
      image: ex.image,
      favicon: ex.favicon,
      status: "read",
      text,
    };
  } catch {
    const text = [hit.title, hit.snippet].filter(Boolean).join("\n");
    return {
      ...base,
      url: hit.url,
      domain: domainOf(hit.url),
      title: hit.title || domainOf(hit.url),
      siteName: null,
      author: null,
      publishedAt: normalizeDate(hit.publishedAt),
      contentHash: sha256(text),
      wordCount: text.split(/\s+/).filter(Boolean).length,
      excerpt: truncate(hit.snippet || hit.title, 320),
      image: null,
      favicon: null,
      status: "snippet",
      text,
    };
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
