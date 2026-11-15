import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI, { APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { env, requireOpenAIKey } from "../config/env";

/**
 * The only module that talks to OpenAI. Agents call `structured()` for typed,
 * schema-constrained output, `text()` for prose, `embed()` for vectors and
 * `webSearch()` for the hosted search tool. Usage is accumulated per pipeline run
 * through AsyncLocalStorage so the dossier can report model calls and tokens.
 */

export type ModelTier = "main" | "fast";

export class AIError extends Error {
  constructor(
    message: string,
    readonly code: "auth" | "quota" | "model" | "refusal" | "incomplete" | "invalid_output" | "upstream",
    readonly status = 502,
  ) {
    super(message);
  }
}

type Usage = { calls: number; inputTokens: number; outputTokens: number };
const usageStore = new AsyncLocalStorage<Usage>();

export function newUsage(): Usage {
  return { calls: 0, inputTokens: 0, outputTokens: 0 };
}

/** Runs `fn` while attributing every model call inside it to `usage`. */
export function withUsage<T>(usage: Usage, fn: () => Promise<T>): Promise<T> {
  return usageStore.run(usage, fn);
}

function record(input = 0, output = 0) {
  const u = usageStore.getStore();
  if (!u) return;
  u.calls += 1;
  u.inputTokens += input;
  u.outputTokens += output;
}

const g = globalThis as unknown as { __openai?: { key: string; client: OpenAI } };

export function client(): OpenAI {
  const key = requireOpenAIKey();
  if (g.__openai && g.__openai.key === key) return g.__openai.client;
  const c = new OpenAI({
    apiKey: key,
    baseURL: env().OPENAI_BASE_URL,
    maxRetries: 3,
    timeout: 180_000,
  });
  g.__openai = { key, client: c };
  return c;
}

export function modelFor(tier: ModelTier): string {
  return tier === "main" ? env().OPENAI_MODEL : env().OPENAI_FAST_MODEL;
}

/** Models that rejected the `reasoning` parameter; learned at runtime, not hard-coded. */
const noReasoning = new Set<string>();

function reasoningParam(model: string) {
  if (noReasoning.has(model)) return {};
  return { reasoning: { effort: env().OPENAI_REASONING_EFFORT } };
}

function isReasoningUnsupported(err: unknown): boolean {
  return (
    err instanceof APIError &&
    err.status === 400 &&
    /reasoning|effort/i.test(err.message) &&
    /unsupported|not supported|does not support|invalid/i.test(err.message)
  );
}

function translate(err: unknown, model: string): never {
  if (err instanceof AIError) throw err;
  if (err instanceof APIError) {
    if (err.status === 401) throw new AIError("OpenAI rejected the API key. Check OPENAI_API_KEY.", "auth", 401);
    if (err.status === 429) {
      throw new AIError(
        /quota|billing/i.test(err.message)
          ? "OpenAI quota exhausted for this key. Check billing on the OpenAI dashboard."
          : "OpenAI rate limit reached. Wait a moment and try again.",
        "quota",
        429,
      );
    }
    if (err.status === 404 || /model/i.test(err.message) && err.status === 400) {
      throw new AIError(
        `Model "${model}" is not available for this key: ${err.message}. Change OPENAI_MODEL / OPENAI_FAST_MODEL.`,
        "model",
        400,
      );
    }
    throw new AIError(`OpenAI error (${err.status ?? "network"}): ${err.message}`, "upstream", 502);
  }
  if (err instanceof Error && err.name === "AbortError") throw err;
  throw new AIError(err instanceof Error ? err.message : String(err), "upstream", 502);
}

export type StructuredOptions<S extends z.ZodType> = {
  tier: ModelTier;
  name: string;
  schema: S;
  system: string;
  input: string;
  signal?: AbortSignal;
};

/**
 * Calls the model with a strict JSON schema derived from `schema` and returns the
 * validated object. Retries once on malformed or incomplete output.
 */
export async function structured<S extends z.ZodType>(opts: StructuredOptions<S>): Promise<z.infer<S>> {
  const model = modelFor(opts.tier);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client().responses.parse(
        {
          model,
          instructions: opts.system,
          input: opts.input,
          text: { format: zodTextFormat(opts.schema, opts.name) },
          ...reasoningParam(model),
        },
        { signal: opts.signal },
      );
      record(response.usage?.input_tokens, response.usage?.output_tokens);

      if (response.status === "incomplete") {
        throw new AIError(
          `The model stopped early (${response.incomplete_details?.reason ?? "unknown reason"}).`,
          "incomplete",
        );
      }
      const refusal = findRefusal(response.output);
      if (refusal) throw new AIError(`The model declined this step: ${refusal}`, "refusal", 422);
      if (response.output_parsed == null) throw new AIError("The model returned no structured output.", "invalid_output");
      const result = opts.schema.safeParse(response.output_parsed);
      if (!result.success) throw new AIError(`Model output failed validation: ${result.error.message}`, "invalid_output");
      return result.data;
    } catch (err) {
      if (isReasoningUnsupported(err)) {
        noReasoning.add(model);
        attempt--; // does not count as a retry
        continue;
      }
      lastError = err;
      const retriable = err instanceof AIError && (err.code === "invalid_output" || err.code === "incomplete");
      if (!retriable) break;
    }
  }
  translate(lastError, model);
}

export async function text(opts: {
  tier: ModelTier;
  system: string;
  input: string;
  signal?: AbortSignal;
}): Promise<string> {
  const model = modelFor(opts.tier);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client().responses.create(
        { model, instructions: opts.system, input: opts.input, ...reasoningParam(model) },
        { signal: opts.signal },
      );
      record(response.usage?.input_tokens, response.usage?.output_tokens);
      return response.output_text;
    } catch (err) {
      if (isReasoningUnsupported(err) && !noReasoning.has(model)) {
        noReasoning.add(model);
        continue;
      }
      translate(err, model);
    }
  }
  throw new AIError("Text generation failed.", "upstream");
}

function findRefusal(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (item && typeof item === "object" && "content" in item && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part && part.type === "refusal" && typeof part.refusal === "string") return part.refusal;
      }
    }
  }
  return null;
}

/* ───────────────────────────── Embeddings ───────────────────────────── */

export function embeddingsEnabled(): boolean {
  return Boolean(env().OPENAI_EMBEDDING_MODEL);
}

/** Returns one vector per input, or null when embeddings are disabled or unavailable. */
export async function embed(inputs: string[], signal?: AbortSignal): Promise<number[][] | null> {
  const model = env().OPENAI_EMBEDDING_MODEL;
  if (!model || inputs.length === 0) return null;
  const vectors: number[][] = [];
  const batchSize = 128;
  try {
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize).map((t) => t.slice(0, 6000) || " ");
      const res = await client().embeddings.create({ model, input: batch }, { signal });
      record(res.usage?.prompt_tokens, 0);
      for (const d of res.data.sort((a, b) => a.index - b.index)) vectors.push(d.embedding);
    }
    return vectors;
  } catch (err) {
    // Retrieval degrades gracefully to BM25; the caller logs the reason.
    if (err instanceof APIError) return null;
    throw err;
  }
}

/* ───────────────────────────── Hosted web search ───────────────────────────── */

export type WebSearchHit = { url: string; title: string; snippet: string };

/**
 * Uses the Responses API `web_search` tool to discover pages for a query. The
 * returned URLs are then fetched and verified by our own pipeline; the model's
 * summary is used only as a snippet, never as evidence.
 */
export async function webSearch(query: string, opts: { region?: string | null; signal?: AbortSignal } = {}): Promise<WebSearchHit[]> {
  const model = modelFor("fast");
  try {
    const response = await client().responses.create(
      {
        model,
        tools: [{ type: "web_search", search_context_size: "medium" }],
        include: ["web_search_call.action.sources"],
        instructions:
          "You are a research librarian. Always use web search. Find distinct, high-quality pages " +
          "(official pages, independent reviews, reputable news, documentation). For each page you " +
          "rely on, cite it. Reply with a short bullet list: one bullet per page, one line each.",
        input: opts.region ? `${query}\n(Region of interest: ${opts.region})` : query,
      },
      { signal: opts.signal },
    );
    record(response.usage?.input_tokens, response.usage?.output_tokens);

    const hits = new Map<string, WebSearchHit>();
    for (const item of response.output) {
      if (item.type === "message") {
        for (const part of item.content) {
          if (part.type !== "output_text") continue;
          for (const a of part.annotations) {
            if (a.type !== "url_citation") continue;
            const lineStart = part.text.lastIndexOf("\n", a.start_index) + 1;
            const lineEnd = part.text.indexOf("\n", a.end_index);
            const snippet = part.text
              .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
              .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "")
              .replace(/^[-*•\s]+/, "")
              .trim();
            if (!hits.has(a.url)) hits.set(a.url, { url: a.url, title: a.title, snippet });
          }
        }
      }
      if (item.type === "web_search_call" && item.action?.type === "search") {
        for (const s of item.action.sources ?? []) {
          if (!hits.has(s.url)) hits.set(s.url, { url: s.url, title: "", snippet: "" });
        }
      }
    }
    return [...hits.values()].map((h) => ({ ...h, url: stripTracking(h.url) }));
  } catch (err) {
    if (isReasoningUnsupported(err)) noReasoning.add(model);
    translate(err, model);
  }
}

function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^ref$|^ref_src$|^fbclid$|^gclid$/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/* ───────────────────────────── Introspection ───────────────────────────── */

export async function listModels(): Promise<string[]> {
  const ids: string[] = [];
  for await (const m of client().models.list()) ids.push(m.id);
  return ids.sort();
}
