import "server-only";
import { z } from "zod";

/**
 * Single source of truth for configuration. Values are parsed once, lazily, so
 * the app can boot and render a setup screen even when a key is missing; code
 * that needs a value calls `requireOpenAIKey()` and gets an actionable error.
 */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const intWithDefault = (def: number, min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).default(def));

const EnvSchema = z.object({
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-5.5")),
  OPENAI_FAST_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-5.4-mini")),
  // Empty string disables embeddings explicitly, so do not coerce it to the default.
  OPENAI_EMBEDDING_MODEL: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? "text-embedding-3-small" : v.trim() || null)),
  OPENAI_REASONING_EFFORT: z.preprocess(
    emptyToUndefined,
    z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).default("low"),
  ),

  SEARCH_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["auto", "tavily", "brave", "serper", "openai"]).default("auto"),
  ),
  TAVILY_API_KEY: optionalString,
  BRAVE_API_KEY: optionalString,
  SERPER_API_KEY: optionalString,

  RESEARCH_MAX_SOURCES: intWithDefault(16, 3, 60),
  RESEARCH_MAX_QUERIES: intWithDefault(8, 2, 24),
  RESEARCH_FETCH_TIMEOUT_MS: intWithDefault(12_000, 2_000, 60_000),
  RESEARCH_CONCURRENCY: intWithDefault(4, 1, 16),

  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().default("file:./data/decision-ai.db")),
  DATABASE_AUTH_TOKEN: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ConfigError(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export class ConfigError extends Error {
  readonly code = "config_error";
}

export function requireOpenAIKey(): string {
  const key = env().OPENAI_API_KEY;
  if (!key) {
    throw new ConfigError(
      "OPENAI_API_KEY is not set. Add it to .env.local (see .env.example) and restart the server.",
    );
  }
  return key;
}

export type SearchProviderName = "tavily" | "brave" | "serper" | "openai";

/** Providers in the order they will be tried for this configuration. */
export function searchProviderOrder(): SearchProviderName[] {
  const e = env();
  const configured: SearchProviderName[] = [];
  if (e.TAVILY_API_KEY) configured.push("tavily");
  if (e.BRAVE_API_KEY) configured.push("brave");
  if (e.SERPER_API_KEY) configured.push("serper");
  if (e.OPENAI_API_KEY) configured.push("openai");
  if (e.SEARCH_PROVIDER === "auto") return configured;
  const preferred = e.SEARCH_PROVIDER;
  return [preferred, ...configured.filter((p) => p !== preferred)].filter((p) => configured.includes(p));
}
