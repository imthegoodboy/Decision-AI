"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { api, type SystemInfo } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { ApiErrorNotice, SetupNotice } from "@/components/ui/notice";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/stamp";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-rule py-3 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-slate">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

const ENV_EXAMPLE = `# .env.local (project root)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
OPENAI_FAST_MODEL=gpt-5.4-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional: faster, richer web search
SEARCH_PROVIDER=auto
TAVILY_API_KEY=
BRAVE_API_KEY=
SERPER_API_KEY=

DATABASE_URL=file:./data/decision-ai.db`;

function ModelName({ name, available }: { name: string | null; available: string[] | null }) {
  if (!name) return <span className="text-slate">Not set (lexical retrieval only)</span>;
  const ok = available ? available.includes(name) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono text-[0.8125rem]">{name}</span>
      {ok === true && (
        <span className="inline-flex items-center gap-0.5 text-xs text-supported">
          <Check aria-hidden className="size-3.5" /> available to this key
        </span>
      )}
      {ok === false && (
        <span className="inline-flex items-center gap-0.5 text-xs text-contradicted">
          <X aria-hidden className="size-3.5" /> not listed for this key
        </span>
      )}
    </span>
  );
}

export function SettingsView() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .system(true)
      .then((s) => !cancelled && setSystem(s))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, []);

  const available = system?.availableModels ?? null;

  return (
    <div className="space-y-8">
      {error != null && <ApiErrorNotice error={error} title="Could not read the server configuration" />}
      {system && !system.configured && <SetupNotice />}

      <section aria-labelledby="config-heading" className="rounded-panel border border-rule bg-paper">
        <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
          <h2 id="config-heading" className="text-base font-semibold text-ink">
            Current configuration
          </h2>
          {system &&
            (system.configured ? (
              system.keyValid === false ? (
                <Badge tone="contradicted">Key rejected</Badge>
              ) : (
                <Badge tone="supported">Configured</Badge>
              )
            ) : (
              <Badge tone="partial">API key missing</Badge>
            ))}
        </header>
        <div className="px-5">
          {!system && error == null ? (
            <div className="py-4">
              <SkeletonLines lines={5} />
            </div>
          ) : system ? (
            <dl>
              <Row label="OpenAI API key">
                {system.configured
                  ? system.keyValid === false
                    ? "Set, but OpenAI rejected it. Check the key and restart."
                    : system.keyValid
                      ? "Set and accepted by OpenAI"
                      : "Set"
                  : "Missing"}
              </Row>
              <Row label="Reasoning model">
                <ModelName name={system.models.main} available={available} />
              </Row>
              <Row label="Fast model">
                <ModelName name={system.models.fast} available={available} />
              </Row>
              <Row label="Embedding model">
                <ModelName name={system.models.embedding} available={available} />
              </Row>
              <Row label="Search providers">
                {system.search.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">
                    {system.search.map((s, i) => (
                      <Badge key={s} tone={i === 0 ? "sky" : "neutral"}>
                        {i === 0 ? `${s} (primary)` : s}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-slate">None configured</span>
                )}
              </Row>
              <Row label="Database">{system.database}</Row>
              {system.limits && (
                <Row label="Research limits">
                  Up to {system.limits.maxSources} sources and {system.limits.maxQueries} searches per run
                </Row>
              )}
            </dl>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="setup-heading" className="space-y-3">
        <h2 id="setup-heading" className="text-base font-semibold text-ink">
          Setup
        </h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
          <li>
            Copy <code className="rounded bg-mist px-1 font-mono text-[0.8125rem]">.env.example</code> to{" "}
            <code className="rounded bg-mist px-1 font-mono text-[0.8125rem]">.env.local</code> in the project root.
          </li>
          <li>
            Set <code className="rounded bg-mist px-1 font-mono text-[0.8125rem]">OPENAI_API_KEY</code>. Everything else has a
            sensible default.
          </li>
          <li>Optionally add a Tavily, Brave or Serper key for faster search with images; otherwise OpenAI web search is used.</li>
          <li>Restart the dev server so the new environment is read.</li>
        </ol>
        <pre
          className={cn(
            "pane-scroll overflow-x-auto rounded-panel border border-rule bg-mist/60 px-4 py-3 font-mono text-[0.8125rem] leading-relaxed text-ink",
          )}
        >
          {ENV_EXAMPLE}
        </pre>
      </section>
    </div>
  );
}
