"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ReliabilitySignal, Source } from "@/lib/domain";
import { BASE_SCORE } from "@/lib/reliability";
import { cn, formatDate } from "@/lib/utils";
import { Favicon } from "@/components/ui/media";
import { Gauge } from "@/components/ui/meter";
import { Badge } from "@/components/ui/stamp";
import { useDossier } from "../dossier-context";

const EARNED_KEYS = new Set(["corroboration", "contradicted", "unsupported"]);

export function splitSignals(signals: ReliabilitySignal[]) {
  return {
    prior: signals.filter((s) => !EARNED_KEYS.has(s.key)),
    earned: signals.filter((s) => EARNED_KEYS.has(s.key)),
  };
}

function SignalList({ title, signals, empty }: { title: string; signals: ReliabilitySignal[]; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-slate">{title}</p>
      {signals.length === 0 ? (
        <p className="text-xs text-slate/80">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {signals.map((s, i) => (
            <li key={`${s.key}-${i}`} className="grid grid-cols-[2.5rem_1fr] gap-2 text-xs" title={s.detail}>
              <span
                className={cn(
                  "text-right font-semibold tabular-nums",
                  s.effect > 0 ? "text-supported" : s.effect < 0 ? "text-contradicted" : "text-slate",
                )}
              >
                {s.effect > 0 ? `+${s.effect}` : s.effect}
              </span>
              <span className="min-w-0">
                <span className="text-ink">{s.label}</span>
                {s.detail && <span className="block truncate text-slate">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function kindLabel(kind: string): string {
  const text = kind.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ReliabilityExplainer() {
  return (
    <p className="text-xs text-slate">
      Reliability starts at {BASE_SCORE}; each signal adds or subtracts. Metadata is cheap to fake, so agreement with independent
      sources is tracked separately as earned reliability.
    </p>
  );
}

export function ReliabilityBreakdown({ source, explain = false }: { source: Source; explain?: boolean }) {
  const { prior, earned } = splitSignals(source.reliability.signals);
  return (
    <div className="space-y-2">
      {explain && <ReliabilityExplainer />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SignalList title="Metadata prior" signals={prior} empty="No metadata signals." />
        <SignalList title="Earned through verification" signals={earned} empty="No verification track record yet." />
      </div>
    </div>
  );
}

function SourceRow({ source, claimCount }: { source: Source; claimCount: number }) {
  const { openSource } = useDossier();
  const byline = [source.siteName, source.author, source.publishedAt ? formatDate(source.publishedAt) : "Undated"]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 border-b border-rule px-4 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <Favicon src={source.favicon} domain={source.domain} className="mt-0.5" />
          <div className="min-w-0">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-baseline gap-1 text-sm font-semibold text-ink hover:text-cobalt hover:underline"
            >
              <span className="line-clamp-2">{source.title || source.domain}</span>
              <ExternalLink aria-hidden className="size-3 shrink-0" />
            </a>
            <p className="truncate text-xs text-slate">
              {source.domain}
              {byline ? ` · ${byline}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="neutral">{kindLabel(source.kind)}</Badge>
          {source.status !== "read" && <Badge tone="partial">{source.status === "snippet" ? "Snippet only" : "Could not read"}</Badge>}
          {source.perspective && <Badge tone="neutral">{source.perspective}</Badge>}
          <button
            type="button"
            onClick={() => openSource(source.id)}
            className="inline-flex h-6 items-center rounded-full px-2 text-xs font-medium text-cobalt hover:bg-sky-soft"
          >
            {claimCount} {claimCount === 1 ? "claim" : "claims"} · provenance
          </button>
        </div>
      </div>
      <Gauge score={source.reliability.score} />
      <div className="col-span-2">
        <ReliabilityBreakdown source={source} />
      </div>
    </li>
  );
}

export function SourcesTab() {
  const { sources, dossier } = useDossier();
  const [sort, setSort] = useState<"reliability" | "claims">("reliability");
  const claimCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of dossier?.claims ?? []) m.set(c.sourceId, (m.get(c.sourceId) ?? 0) + 1);
    return m;
  }, [dossier]);
  const sorted = useMemo(
    () =>
      [...sources].sort((a, b) =>
        sort === "reliability"
          ? b.reliability.score - a.reliability.score
          : (claimCounts.get(b.id) ?? 0) - (claimCounts.get(a.id) ?? 0),
      ),
    [sources, sort, claimCounts],
  );

  if (sources.length === 0) {
    return <p className="text-sm text-slate">No sources were stored for this run.</p>;
  }

  return (
    <div className="space-y-3">
      <ReliabilityExplainer />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate">
          {sources.length} sources · {sources.filter((s) => s.status === "read").length} read in full
        </p>
        <div className="flex items-center gap-1 text-xs" role="group" aria-label="Sort sources">
          <span className="text-slate">Sort by</span>
          {(["reliability", "claims"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={sort === k}
              onClick={() => setSort(k)}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium capitalize",
                sort === k ? "bg-sky-soft text-cobalt" : "text-slate hover:bg-mist",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <ul className="overflow-hidden rounded-panel border border-rule bg-paper">
        {sorted.map((s) => (
          <SourceRow key={s.id} source={s} claimCount={claimCounts.get(s.id) ?? 0} />
        ))}
      </ul>
    </div>
  );
}
