"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Info, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/stamp";
import { OptionThumb } from "@/components/ui/media";
import { ClaimChips } from "../chips";
import { useDossier } from "../dossier-context";
import type { SaveState } from "../use-workspace";

/** Sky tint proportional to score; imputed cells are hatched. */
function cellStyle(score: number): { backgroundColor: string } {
  const alpha = 0.08 + (score / 10) * 0.5;
  return { backgroundColor: `color-mix(in srgb, var(--sky) ${Math.round(alpha * 100)}%, var(--paper))` };
}

const SAVE_TEXT: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved to the audit log",
  error: "Could not save; your changes apply in this view only",
};

export function CompareTab({
  setWeight,
  resetWeights,
  saveState,
}: {
  setWeight: (criterionId: string, value: number) => void;
  resetWeights: (defaults: Record<string, number>) => void;
  saveState: SaveState;
}) {
  const { dossier, ranked, baselineRanked, effective, optionById, criterionById } = useDossier();
  const [selected, setSelected] = useState<{ optionId: string; criterionId: string } | null>(null);

  const criteria = useMemo(() => dossier?.plan.criteria ?? [], [dossier]);
  const defaults = useMemo(() => Object.fromEntries(criteria.map((c) => [c.id, c.weight])), [criteria]);
  const totalWeight = [...effective.values()].reduce((a, b) => a + b, 0) || 1;
  const changed = criteria.some((c) => (effective.get(c.id) ?? c.weight) !== c.weight);

  if (!dossier) return null;
  const leader = ranked[0];
  const baselineLeader = baselineRanked[0];
  const leaderChanged = leader && baselineLeader && leader.optionId !== baselineLeader.optionId;
  const maxTotal = Math.max(1, ...ranked.map((r) => r.total));

  const selectedScore = selected
    ? dossier.scores.find((s) => s.optionId === selected.optionId && s.criterionId === selected.criterionId)
    : null;
  const selectedBreakdown = selected
    ? ranked.find((r) => r.optionId === selected.optionId)?.breakdown.find((b) => b.criterionId === selected.criterionId)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Priorities */}
        <section aria-labelledby="priorities-heading" className="rounded-panel border border-rule bg-paper p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-[10rem] flex-1">
              <h3 id="priorities-heading" className="text-sm font-semibold text-ink">
                Your priorities
              </h3>
              <p className="text-xs text-slate">Drag to see how the ranking responds.</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!changed}
              onClick={() => resetWeights(defaults)}
              icon={<RotateCcw aria-hidden className="size-3.5" />}
              className="-ml-3 sm:ml-0"
            >
              Reset to my stated priorities
            </Button>
          </div>
          <div className="space-y-4">
            {criteria.map((c) => {
              const w = effective.get(c.id) ?? c.weight;
              return (
                <Slider
                  key={c.id}
                  id={`w-${c.id}`}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      {c.name}
                      {c.origin === "inferred" && (
                        <span className="text-xs font-normal text-slate" title="Added by the planner, not stated by you">
                          (inferred)
                        </span>
                      )}
                    </span>
                  }
                  value={w}
                  onChange={(v) => setWeight(c.id, v)}
                  valueLabel={`${Math.round((w / totalWeight) * 100)}% of total`}
                  hint={c.description}
                />
              );
            })}
          </div>
          <p className="mt-3 h-4 text-xs text-slate" aria-live="polite">
            {SAVE_TEXT[saveState]}
          </p>
        </section>

        {/* Live ranking */}
        <section aria-labelledby="live-ranking-heading" className="rounded-panel border border-rule bg-paper p-4">
          <h3 id="live-ranking-heading" className="text-sm font-semibold text-ink">
            Ranking with these priorities
          </h3>
          <div aria-live="polite" className="mt-1 min-h-5 text-xs">
            {leaderChanged ? (
              <span className="inline-flex items-center gap-1 text-cobalt">
                <Info aria-hidden className="size-3.5" />
                The leader changed: {optionById.get(leader.optionId)?.name} now ranks first.
              </span>
            ) : (
              <span className="text-slate">Scores come from verified claims; only the weights change here.</span>
            )}
          </div>
          <ol className="mt-3 space-y-2">
            {ranked.map((r) => {
              const o = optionById.get(r.optionId);
              if (!o) return null;
              return (
                <motion.li
                  key={r.optionId}
                  layout
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  className={cn(
                    "flex items-center gap-3 rounded-control border px-2.5 py-2",
                    r.rank === 1 ? "border-sky bg-sky-soft/60" : "border-rule bg-paper",
                  )}
                >
                  <span className={cn("w-4 text-sm font-semibold tabular-nums", r.rank === 1 ? "text-cobalt" : "text-slate")}>
                    {r.rank}
                  </span>
                  <OptionThumb name={o.name} image={o.image} className="size-8 text-[0.6875rem]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{o.name}</span>
                      <span className="text-sm font-semibold tabular-nums text-ink">{r.total.toFixed(1)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rule/70">
                      <motion.div
                        className={cn("h-full rounded-full", r.rank === 1 ? "bg-cobalt" : "bg-sky")}
                        initial={false}
                        animate={{ width: `${(r.total / maxTotal) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </section>
      </div>

      {/* Matrix */}
      <section aria-labelledby="matrix-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="matrix-heading" className="text-base font-semibold text-ink">
            Evidence matrix
          </h3>
          <p className="flex items-center gap-3 text-xs text-slate">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-3 rounded-[3px]" style={cellStyle(9)} /> strong
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-3 rounded-[3px]" style={cellStyle(3)} /> weak
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="hatch size-3 rounded-[3px] border border-rule" /> no evidence
            </span>
          </p>
        </div>
        <div className="pane-scroll overflow-x-auto rounded-panel border border-rule">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">Scores from 0 to 10 for each option on each criterion. Select a cell for the rationale.</caption>
            <thead>
              <tr className="bg-mist/60">
                <th scope="col" className="sticky left-0 z-10 bg-mist px-3 py-2 text-left text-xs font-medium text-slate">
                  Option
                </th>
                {criteria.map((c) => (
                  <th key={c.id} scope="col" className="px-2 py-2 text-left align-bottom text-xs font-medium text-slate">
                    <span className="block text-ink">{c.name}</span>
                    <span className="tabular-nums">{Math.round(((effective.get(c.id) ?? 0) / totalWeight) * 100)}%</span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-slate">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const o = optionById.get(r.optionId);
                if (!o) return null;
                return (
                  <tr key={r.optionId} className="border-t border-rule">
                    <th scope="row" className="sticky left-0 z-10 max-w-[12rem] bg-paper px-3 py-2 text-left font-medium text-ink">
                      <span className="line-clamp-2">{o.name}</span>
                    </th>
                    {r.breakdown.map((b) => {
                      const isSel = selected?.optionId === r.optionId && selected?.criterionId === b.criterionId;
                      const entry = dossier.scores.find((s) => s.optionId === r.optionId && s.criterionId === b.criterionId);
                      return (
                        <td key={b.criterionId} className="p-1">
                          <button
                            type="button"
                            onClick={() => setSelected(isSel ? null : { optionId: r.optionId, criterionId: b.criterionId })}
                            aria-pressed={isSel}
                            title={entry?.rationale || (b.imputed ? "No verified evidence; neutral score assumed" : undefined)}
                            className={cn(
                              "flex h-10 w-full min-w-[4.5rem] items-center justify-center rounded-[6px] border text-sm tabular-nums transition-colors",
                              isSel ? "border-cobalt ring-2 ring-sky" : "border-transparent hover:border-sky",
                              b.imputed ? "hatch bg-paper text-xs text-slate" : "font-semibold text-ink",
                            )}
                            style={b.imputed ? undefined : cellStyle(b.score)}
                          >
                            {b.imputed ? "no evidence" : b.score.toFixed(b.score % 1 === 0 ? 0 : 1)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{r.total.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-panel border border-sky/60 bg-sky-soft/40 p-4"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {optionById.get(selected.optionId)?.name} · {criterionById.get(selected.criterionId)?.name}
              </p>
              {selectedBreakdown &&
                (selectedBreakdown.imputed ? (
                  <Badge tone="partial">No verified evidence · neutral 5 assumed</Badge>
                ) : (
                  <Badge tone="sky">
                    {selectedBreakdown.score}/10 · contributes {selectedBreakdown.contribution.toFixed(1)} points
                  </Badge>
                ))}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {selectedScore?.rationale || "The scorer found no claim about this criterion for this option."}
            </p>
            {selectedScore && selectedScore.claimIds.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate">
                Evidence: <ClaimChips ids={selectedScore.claimIds} />
              </div>
            )}
          </motion.div>
        )}
      </section>
    </div>
  );
}
