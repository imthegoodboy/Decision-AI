"use client";

import { Scale } from "lucide-react";
import type { Uncertainty, UncertaintyKind } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/stamp";
import { ReliabilityInline } from "@/components/ui/meter";
import { ClaimChip, SourceChip } from "../chips";
import { useDossier } from "../dossier-context";

const KIND_LABEL: Record<UncertaintyKind, { title: string; blurb: string }> = {
  assumption: { title: "Assumptions", blurb: "Things the analysis had to assume." },
  incomplete: { title: "Incomplete evidence", blurb: "Criteria or options with thin coverage." },
  unknown: { title: "Unknowns", blurb: "Questions no source answered." },
  outdated: { title: "Possibly outdated", blurb: "Information that may have changed." },
  "single-source": { title: "Single-source claims", blurb: "Facts only one source states." },
};

const ORDER: UncertaintyKind[] = ["unknown", "incomplete", "single-source", "outdated", "assumption"];

const IMPACT_TONE = { high: "contradicted", medium: "partial", low: "neutral" } as const;

function Contradictions() {
  const { dossier, sourceById, optionById } = useDossier();
  const list = dossier?.contradictions ?? [];
  if (list.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-slate">
        No contradictions between sources were found.
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {list.map((c) => {
        const option = c.optionId ? optionById.get(c.optionId) : null;
        return (
          <li key={c.id} className="overflow-hidden rounded-panel border border-rule bg-paper">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-mist/50 px-4 py-2.5">
              <p className="text-sm font-semibold text-ink">
                {c.topic}
                {option && <span className="font-normal text-slate"> · {option.name}</span>}
              </p>
              <Badge tone={IMPACT_TONE[c.severity]}>
                {c.severity === "high" ? "High" : c.severity === "medium" ? "Medium" : "Low"} severity
              </Badge>
            </div>
            <div className="grid divide-y divide-rule sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {c.statements.map((s, i) => {
                const src = sourceById.get(s.sourceId);
                const favored = c.favoredSourceId === s.sourceId;
                return (
                  <div key={i} className={cn("space-y-2 px-4 py-3", favored && "bg-supported-soft/40")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate">Statement {String.fromCharCode(65 + i)}</span>
                      {favored && <Badge tone="supported">More credible</Badge>}
                    </div>
                    <p className="font-serif text-[0.9375rem] italic leading-relaxed text-ink">“{s.text}”</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SourceChip id={s.sourceId} />
                      {src && <ReliabilityInline score={src.reliability.score} />}
                      {s.claimId && <ClaimChip id={s.claimId} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 border-t border-rule px-4 py-3 text-sm text-ink">
              <Scale aria-hidden className="mt-0.5 size-4 shrink-0 text-cobalt" />
              <p>{c.assessment}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UncertaintyGroup({ kind, items }: { kind: UncertaintyKind; items: Uncertainty[] }) {
  const { optionById } = useDossier();
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-ink">{KIND_LABEL[kind].title}</h4>
        <span className="text-xs text-slate">{KIND_LABEL[kind].blurb}</span>
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {items.map((u) => {
          const option = u.optionId ? optionById.get(u.optionId) : null;
          return (
            <li key={u.id} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_auto] sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm text-ink">{u.text}</p>
                {u.howToResolve && (
                  <p className="mt-0.5 text-xs text-slate">
                    <span className="font-medium text-ink">How to resolve:</span> {u.howToResolve}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-start gap-1.5 sm:justify-end">
                {option && <Badge tone="neutral">{option.name}</Badge>}
                <Badge tone={IMPACT_TONE[u.impact]}>{u.impact === "high" ? "High" : u.impact === "medium" ? "Medium" : "Low"} impact</Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ConflictsTab() {
  const { dossier } = useDossier();
  if (!dossier) return null;
  const groups = ORDER.map((k) => ({ kind: k, items: dossier.uncertainties.filter((u) => u.kind === k) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <div className="space-y-8">
      <section aria-labelledby="contradictions-heading" className="space-y-3">
        <div>
          <h3 id="contradictions-heading" className="text-base font-semibold text-ink">
            Where sources disagree
          </h3>
          <p className="text-xs text-slate">Each conflict shows both statements, their sources, and which side is better supported.</p>
        </div>
        <Contradictions />
      </section>
      <section aria-labelledby="gaps-heading" className="space-y-4">
        <div>
          <h3 id="gaps-heading" className="text-base font-semibold text-ink">
            What we do not know
          </h3>
          <p className="text-xs text-slate">Uncertainty is reported, not hidden. High-impact items could change the recommendation.</p>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-slate">No open uncertainties were recorded.</p>
        ) : (
          groups.map((g) => <UncertaintyGroup key={g.kind} kind={g.kind} items={g.items} />)
        )}
      </section>
    </div>
  );
}
