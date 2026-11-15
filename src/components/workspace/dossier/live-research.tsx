"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, LoaderCircle, Minus, RotateCcw } from "lucide-react";
import { STAGES, type Stage } from "@/lib/domain";
import { cn, pluralize } from "@/lib/utils";
import { Stamp, VERDICT_TEXT } from "@/components/ui/stamp";
import { Favicon, OptionThumb } from "@/components/ui/media";
import { Meter, ReliabilityInline } from "@/components/ui/meter";
import { ApiErrorNotice, Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { STAGE_INFO, claimTally, type LiveState, type StageState } from "../live-state";

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function useElapsed(startedAt: number | null, running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    const first = setTimeout(tick, 0);
    if (!running) return () => clearTimeout(first);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [startedAt, running]);
  return elapsed;
}

function StageIcon({ state, index }: { state: StageState; index: number }) {
  if (state.status === "done")
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-cobalt text-paper">
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      </span>
    );
  if (state.status === "active")
    return (
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-sky bg-sky-soft text-cobalt">
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      </span>
    );
  if (state.status === "skip")
    return (
      <span className="flex size-6 items-center justify-center rounded-full border border-rule bg-mist text-slate">
        <Minus aria-hidden className="size-3.5" />
      </span>
    );
  return (
    <span className="flex size-6 items-center justify-center rounded-full border border-rule-strong bg-paper text-[0.6875rem] font-semibold tabular-nums text-slate">
      {index + 1}
    </span>
  );
}

const STATUS_WORD: Record<StageState["status"], string> = {
  pending: "waiting",
  active: "in progress",
  done: "done",
  skip: "skipped",
};

function Stepper({ stages, failed }: { stages: Record<Stage, StageState>; failed: boolean }) {
  return (
    <ol className="relative">
      {STAGES.map((stage, i) => {
        const s = stages[stage];
        const info = STAGE_INFO[stage];
        const last = i === STAGES.length - 1;
        const progress = s.progress && s.progress.total > 0 ? s.progress : null;
        return (
          <li key={stage} className="relative flex gap-3 pb-4" aria-current={s.status === "active" ? "step" : undefined}>
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-3 top-7 bottom-1 w-px -translate-x-1/2",
                  s.status === "done" ? "bg-cobalt/50" : "bg-rule",
                )}
              />
            )}
            <StageIcon state={s} index={i} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-sm leading-5",
                  s.status === "active" ? "font-semibold text-ink" : s.status === "done" ? "font-medium text-ink" : "text-slate",
                  failed && s.status === "active" && "text-contradicted",
                )}
              >
                {info.label}
                <span className="sr-only">, {STATUS_WORD[s.status]}</span>
              </p>
              {s.status === "active" && !s.detail && !progress && (
                <p className="mt-0.5 text-xs leading-snug text-slate">{info.description}</p>
              )}
              {s.detail && <p className="mt-0.5 text-xs leading-snug text-slate">{s.detail}</p>}
              {progress && s.status === "active" && (
                <div className="mt-1.5 space-y-1">
                  <Meter value={progress.done / progress.total} label={`${info.label} progress`} />
                  <p className="truncate text-xs tabular-nums text-slate">
                    {progress.done} of {progress.total}
                    {progress.detail ? ` · ${progress.detail}` : ""}
                  </p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SectionTitle({ children, aside }: { children: string; aside?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">{children}</h3>
      {aside && <span className="text-xs tabular-nums text-slate">{aside}</span>}
    </div>
  );
}

const MAX_LEDGER = 80;

export function LiveResearch({
  live,
  error,
  onRetry,
  onDismiss,
}: {
  live: LiveState;
  error: unknown;
  onRetry: () => void;
  onDismiss?: () => void;
}) {
  const running = live.phase === "starting" || live.phase === "streaming";
  const failed = live.phase === "failed";
  const elapsed = useElapsed(live.startedAt, running);
  const tally = claimTally(live.claims);
  const verified = tally.supported + tally.partial + tally.unsupported + tally.contradicted;

  const sourceById = useMemo(() => new Map(live.sources.map((s) => [s.id, s])), [live.sources]);
  const optionById = useMemo(() => new Map(live.options.map((o) => [o.id, o])), [live.options]);
  const ledger = useMemo(() => [...live.claims].reverse().slice(0, MAX_LEDGER), [live.claims]);

  const activeStage = STAGES.find((s) => live.stages[s].status === "active");
  const announcement = activeStage
    ? `${STAGE_INFO[activeStage].label}${live.stages[activeStage].progress ? `: ${live.stages[activeStage].progress!.done} of ${live.stages[activeStage].progress!.total}` : ""}`
    : failed
      ? "Research failed"
      : live.phase === "finished"
        ? "Research complete"
        : "Starting research";

  return (
    <section aria-labelledby="live-heading" className="space-y-5">
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] text-slate">
            {live.version ? `Research run ${live.version}` : "Research run"}
            {live.focus ? ` · focus: ${live.focus}` : ""}
          </p>
          <h2 id="live-heading" className="text-[1.375rem] leading-[1.85rem] font-semibold text-ink">
            {failed ? "Research stopped" : live.phase === "finished" ? "Dossier sealed" : "Researching your decision"}
          </h2>
        </div>
        <dl className="flex gap-5 text-right">
          <div>
            <dt className="text-xs text-slate">Elapsed</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">{formatElapsed(elapsed)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">Sources</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">{live.sources.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate">Claims checked</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">{verified}</dd>
          </div>
        </dl>
      </header>

      {failed &&
        (error ? (
          <ApiErrorNotice
            error={error}
            title="Research could not run"
            action={
              <Button size="sm" variant="secondary" onClick={onRetry} icon={<RotateCcw aria-hidden className="size-3.5" />}>
                Try again
              </Button>
            }
          />
        ) : (
          <Notice
            tone="error"
            title="Research stopped"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={onRetry} icon={<RotateCcw aria-hidden className="size-3.5" />}>
                  Try again
                </Button>
                {onDismiss && (
                  <Button size="sm" variant="quiet" onClick={onDismiss}>
                    Dismiss
                  </Button>
                )}
              </div>
            }
          >
            {live.error}
          </Notice>
        ))}

      <div className="grid gap-6 xl:grid-cols-[minmax(15rem,17rem)_1fr]">
        <div className="rounded-panel border border-rule bg-mist/50 px-4 pt-4">
          <Stepper stages={live.stages} failed={failed} />
        </div>

        <div className="min-w-0 space-y-6">
          {/* Verification ledger */}
          <div>
            <SectionTitle aside={verified > 0 ? `${tally.supported} supported · ${tally.partial} partial · ${tally.unsupported + tally.contradicted} rejected` : undefined}>
              Verification ledger
            </SectionTitle>
            <div className="overflow-hidden rounded-panel border border-rule bg-paper">
              <div className="grid grid-cols-[6.5rem_1fr] border-b border-rule bg-mist/60 px-3 py-1.5 text-xs font-medium text-slate">
                <span>Verdict</span>
                <span>Claim and source</span>
              </div>
              {ledger.length === 0 ? (
                <p className="ledger-paper px-3 py-6 text-center text-[0.8125rem] text-slate" style={{ ["--ledger-line" as string]: "2.25rem" }}>
                  Claims appear here as each one is checked against its source passage.
                </p>
              ) : (
                <ul className="pane-scroll max-h-[26rem] overflow-y-auto">
                  <AnimatePresence initial={false}>
                    {ledger.map((c) => {
                      const src = sourceById.get(c.sourceId);
                      const opt = c.optionId ? optionById.get(c.optionId) : null;
                      return (
                        <motion.li
                          key={c.id}
                          layout="position"
                          initial={{ opacity: 0, backgroundColor: "rgba(228, 242, 252, 1)" }}
                          animate={{ opacity: 1, backgroundColor: "rgba(255, 255, 255, 0)" }}
                          transition={{ duration: 0.9, ease: "easeOut" }}
                          className="grid grid-cols-[6.5rem_1fr] items-start gap-0 border-b border-rule px-3 py-2 last:border-b-0"
                        >
                          <motion.span
                            initial={{ scale: 1.25, opacity: 0, rotate: -4 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.08 }}
                            className="pt-0.5"
                          >
                            {c.status ? <Stamp status={c.status} size="sm" /> : <Stamp status={null} size="sm" />}
                          </motion.span>
                          <div className="min-w-0">
                            <p className="text-[0.8125rem] leading-snug text-ink">{c.text}</p>
                            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate">
                              {src && <Favicon src={src.favicon} domain={src.domain} className="size-3" />}
                              <span className="shrink-0">{src?.domain ?? "source"}</span>
                              {opt && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="min-w-0 truncate">{opt.name}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>
            {live.claims.length > MAX_LEDGER && (
              <p className="mt-1.5 text-xs text-slate">Showing the latest {MAX_LEDGER} of {live.claims.length} claims.</p>
            )}
          </div>

          {/* Options */}
          <div>
            <SectionTitle aside={live.options.length ? pluralize(live.options.length, "candidate") : undefined}>Options found</SectionTitle>
            {live.options.length === 0 ? (
              <p className="text-[0.8125rem] text-slate">Candidates appear once enough sources have been read.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                <AnimatePresence initial={false}>
                  {live.options.map((o) => (
                    <motion.li
                      key={o.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2 rounded-full border border-rule bg-paper py-1 pl-1 pr-3"
                    >
                      <OptionThumb name={o.name} image={o.image} className="size-7 text-[0.6875rem]" rounded="rounded-full" />
                      <span className="text-[0.8125rem] font-medium text-ink">{o.name}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {/* Sources */}
          <div>
            <SectionTitle aside={live.queries.length ? `${pluralize(live.queries.length, "search", "searches")}` : undefined}>
              Sources
            </SectionTitle>
            {live.sources.length === 0 ? (
              <p className="text-[0.8125rem] text-slate">
                {live.queries.length > 0
                  ? `Searching: ${live.queries[live.queries.length - 1].query}`
                  : "Sources appear here as pages are read and assessed."}
              </p>
            ) : (
              <ul className="pane-scroll max-h-72 overflow-y-auto border-t border-rule">
                <AnimatePresence initial={false}>
                  {live.sources.map((s) => (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2.5 border-b border-rule py-1.5"
                    >
                      <Favicon src={s.favicon} domain={s.domain} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] text-ink">{s.title || s.domain}</p>
                        <p className="truncate text-xs text-slate">
                          {s.domain} · {s.kind.replace(/-/g, " ")}
                          {s.status !== "read" && <span className={VERDICT_TEXT.partial}> · {s.status === "snippet" ? "snippet only" : "could not read"}</span>}
                        </p>
                      </div>
                      {typeof s.reliability === "number" && <ReliabilityInline score={s.reliability} />}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {live.logs.length > 0 && (
            <details className="text-xs text-slate">
              <summary className="cursor-pointer select-none">Run log ({live.logs.length})</summary>
              <ul className="mt-1.5 space-y-0.5 font-mono">
                {live.logs.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
