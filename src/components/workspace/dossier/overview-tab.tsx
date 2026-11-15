"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ExternalLink, Info } from "lucide-react";
import type { DecisionOption, VerificationStatus } from "@/lib/domain";
import type { RankedOption } from "@/lib/scoring";
import { cn, percent } from "@/lib/utils";
import { OptionThumb } from "@/components/ui/media";
import { Badge, VERDICT_DOT, VERDICT_LABEL } from "@/components/ui/stamp";
import { Notice } from "@/components/ui/notice";
import { ClaimChips } from "../chips";
import { useDossier } from "../dossier-context";

const DECISIVENESS_LABEL = {
  clear: "Clear lead",
  narrow: "Narrow lead",
  tied: "Effectively tied",
  single: "Only option",
} as const;

const CONFIDENCE_LABEL = { high: "High confidence", moderate: "Moderate confidence", low: "Low confidence" } as const;

export function ConfidenceBadge({ ranked }: { ranked: RankedOption | undefined }) {
  if (!ranked) return null;
  const tone = ranked.confidenceLabel === "high" ? "supported" : ranked.confidenceLabel === "moderate" ? "sky" : "partial";
  return (
    <Badge tone={tone}>
      {CONFIDENCE_LABEL[ranked.confidenceLabel]} · {percent(ranked.confidence)}
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function ClaimCounts({ counts, className }: { counts: Record<VerificationStatus, number>; className?: string }) {
  const order: VerificationStatus[] = ["supported", "partial", "unsupported", "contradicted"];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate", className)}>
      {order.map((s) => (
        <span key={s} className="inline-flex items-center gap-1" title={`${counts[s]} ${VERDICT_LABEL[s].toLowerCase()}`}>
          <span aria-hidden className={cn("size-1.5 rounded-full", VERDICT_DOT[s])} />
          <span className="tabular-nums text-ink">{counts[s]}</span>
          <span>{VERDICT_LABEL[s].toLowerCase()}</span>
        </span>
      ))}
    </span>
  );
}

function RecommendationCard() {
  const { dossier, optionById, ranked, baselineRanked, decisiveness } = useDossier();
  const rec = dossier?.recommendation;
  if (!dossier) return null;
  if (!rec) {
    return (
      <Notice tone="warning" title="No recommendation was written">
        The run finished without enough verified evidence to recommend an option. See Conflicts and gaps for what is missing.
      </Notice>
    );
  }
  const option = optionById.get(rec.optionId);
  const recRank = ranked.find((r) => r.optionId === rec.optionId);
  const leader = ranked[0];
  const leaderChanged = leader && leader.optionId !== rec.optionId;
  const baselineLeader = baselineRanked[0];

  return (
    <article className="overflow-hidden rounded-panel border border-rule bg-paper">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        {option && (
          <OptionThumb
            name={option.name}
            image={option.image}
            className="size-24 text-2xl sm:size-40 sm:text-3xl"
            rounded="rounded-panel"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] text-slate">Recommendation{option ? ` · ${option.name}` : ""}</p>
          <h2 className="mt-1 font-serif text-[1.75rem] leading-[2.25rem] font-semibold tracking-tight text-ink">{rec.headline}</h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <ConfidenceBadge ranked={recRank} />
            <Badge tone="neutral">{DECISIVENESS_LABEL[decisiveness]}</Badge>
            {recRank && (
              <Badge tone="neutral">
                Score <span className="tabular-nums text-ink">{recRank.total.toFixed(1)}</span>/100
              </Badge>
            )}
            {option?.priceText && <Badge tone="neutral">{option.priceText}</Badge>}
          </div>
          <p className="mt-3 font-serif text-[1.0625rem] leading-relaxed text-ink">{rec.summary}</p>
          {option?.officialUrl && (
            <a
              href={option.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] text-cobalt hover:underline"
            >
              Official page <ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      {leaderChanged && (
        <div className="flex items-start gap-2 border-t border-sky/50 bg-sky-soft/60 px-5 py-3 text-[0.8125rem] text-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-cobalt" />
          <p>
            With your adjusted priorities, <strong className="font-semibold">{optionById.get(leader.optionId)?.name}</strong> now
            ranks first ({leader.total.toFixed(1)} vs {recRank?.total.toFixed(1)}). This recommendation was written for your stated
            priorities{baselineLeader ? `, where ${optionById.get(baselineLeader.optionId)?.name} led` : ""}.
          </p>
        </div>
      )}

      <div className="space-y-4 px-5 pb-5">
        {rec.reasons.length > 0 && (
          <Section title="Why">
            <ol className="space-y-2.5">
              {rec.reasons.map((r, i) => (
                <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-2 text-sm leading-relaxed text-ink">
                  <span className="font-semibold tabular-nums text-cobalt">{i + 1}</span>
                  <span>
                    {r.text} <ClaimChips ids={r.claimIds} className="ml-0.5" />
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}
        {rec.tradeoffs.length > 0 && (
          <Section title="Trade-offs">
            <ul className="space-y-2">
              {rec.tradeoffs.map((t, i) => (
                <li key={i} className="text-sm leading-relaxed text-ink">
                  {t.text} <ClaimChips ids={t.claimIds} className="ml-0.5" />
                </li>
              ))}
            </ul>
          </Section>
        )}
        {rec.alternatives.length > 0 && (
          <Section title="When to choose something else">
            <ul className="divide-y divide-rule border-y border-rule">
              {rec.alternatives.map((a, i) => {
                const alt = optionById.get(a.optionId);
                return (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    {alt && <OptionThumb name={alt.name} image={alt.image} className="size-9 text-xs" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{alt?.name ?? "Another option"}</p>
                      <p className="text-sm text-slate">{a.when}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        {(rec.caveats.length > 0 || rec.nextSteps.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {rec.caveats.length > 0 && (
              <Section title="Caveats">
                <ul className="list-disc space-y-1 pl-4 text-sm text-ink">
                  {rec.caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Section>
            )}
            {rec.nextSteps.length > 0 && (
              <Section title="Next steps">
                <ul className="list-disc space-y-1 pl-4 text-sm text-ink">
                  {rec.nextSteps.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function OptionRow({ option, ranked, recommended }: { option: DecisionOption; ranked: RankedOption; recommended: boolean }) {
  return (
    <div className="grid grid-cols-[2rem_3.5rem_1fr] items-center gap-3 py-3 sm:grid-cols-[2rem_3.5rem_1fr_11rem]">
      <span className={cn("text-lg font-semibold tabular-nums", ranked.rank === 1 ? "text-cobalt" : "text-slate")}>
        {ranked.rank}
      </span>
      <OptionThumb name={option.name} image={option.image} className="size-14 text-sm" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-ink">{option.name}</span>
          {recommended && <Badge tone="sky">Recommended</Badge>}
          {option.userNamed && <Badge tone="neutral">You named it</Badge>}
        </p>
        <p className="mt-0.5 truncate text-[0.8125rem] text-slate">
          {option.priceText ?? "Price not found"}
          {option.summary ? ` · ${option.summary}` : ""}
        </p>
        <ClaimCounts counts={ranked.claimCounts} className="mt-1" />
      </div>
      <div className="col-span-3 space-y-1 sm:col-span-1">
        <div className="flex items-baseline justify-between text-xs text-slate">
          <span>
            Score <span className="text-sm font-semibold tabular-nums text-ink">{ranked.total.toFixed(1)}</span>
          </span>
          <span title="Computed confidence">{percent(ranked.confidence)} conf.</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-rule/70">
          <motion.div
            className={cn("h-full rounded-full", ranked.rank === 1 ? "bg-cobalt" : "bg-sky")}
            initial={false}
            animate={{ width: `${ranked.total}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>
      </div>
    </div>
  );
}

export function RankedOptions({ compact = false }: { compact?: boolean }) {
  const { ranked, optionById, dossier } = useDossier();
  const recId = dossier?.recommendation?.optionId;
  if (ranked.length === 0) return <p className="text-sm text-slate">No options were identified in this run.</p>;
  return (
    <ul className={cn("divide-y divide-rule border-y border-rule", compact && "text-sm")}>
      {ranked.map((r) => {
        const option = optionById.get(r.optionId);
        if (!option) return null;
        return (
          <motion.li key={r.optionId} layout transition={{ type: "spring", stiffness: 380, damping: 34 }}>
            <OptionRow option={option} ranked={r} recommended={r.optionId === recId} />
          </motion.li>
        );
      })}
    </ul>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-[7rem] flex-1 px-4 py-3" title={hint}>
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function OverviewTab() {
  const { dossier } = useDossier();
  if (!dossier) return null;
  const m = dossier.metrics;
  const checked = m.supported + m.partial + m.unsupported + m.contradicted;
  return (
    <div className="space-y-6">
      <RecommendationCard />
      <dl className="flex flex-wrap divide-x divide-rule rounded-panel border border-rule bg-mist/50">
        <Metric label="Sources read" value={`${m.sourcesRead}/${m.sourcesConsulted}`} />
        <Metric label="Claims verified" value={checked} />
        <Metric
          label="Supported"
          value={checked ? percent((m.supported + 0.5 * m.partial) / checked) : "–"}
          hint="Supported plus half of partially supported claims"
        />
        <Metric label="Conflicts" value={m.contradictions} />
        <Metric label="Avg. reliability" value={Math.round(m.averageReliability)} />
      </dl>
      <section aria-labelledby="ranking-heading">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 id="ranking-heading" className="text-base font-semibold text-ink">
            Ranking
          </h3>
          <p className="text-xs text-slate">Weighted by your priorities. Change them in Compare.</p>
        </div>
        <RankedOptions />
      </section>
    </div>
  );
}
