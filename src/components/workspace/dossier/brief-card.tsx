"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Decision, Importance } from "@/lib/domain";
import { cn } from "@/lib/utils";

const IMPORTANCE_LABEL: Record<Importance, string> = {
  must: "Must have",
  high: "High",
  medium: "Medium",
  low: "Nice to have",
};

const IMPORTANCE_CLASS: Record<Importance, string> = {
  must: "bg-cobalt text-paper border-cobalt",
  high: "bg-sky-soft text-cobalt border-sky/50",
  medium: "bg-mist text-slate border-rule",
  low: "bg-paper text-slate border-rule",
};

function formatMoney(n: number, currency: string | null): string {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
    } catch {
      /* fall through */
    }
  }
  return `${currency ? `${currency} ` : ""}${n.toLocaleString()}`;
}

function Row({ label, children, empty }: { label: string; children?: ReactNode; empty?: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-rule py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-[0.8125rem] font-medium text-slate">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children ?? <span className="text-slate/80">{empty ?? "Not yet known"}</span>}</dd>
    </div>
  );
}

export function BriefCard({ decision }: { decision: Decision }) {
  const p = decision.profile;
  const budget = p.budget;
  const budgetText = budget
    ? budget.min != null && budget.max != null
      ? `${formatMoney(budget.min, budget.currency)} – ${formatMoney(budget.max, budget.currency)}`
      : budget.max != null
        ? `Up to ${formatMoney(budget.max, budget.currency)}`
        : budget.min != null
          ? `From ${formatMoney(budget.min, budget.currency)}`
          : null
    : null;
  const totalWeight = p.priorities.reduce((s, x) => s + x.weight, 0) || 1;
  const region = [p.locale.country, p.locale.currency].filter(Boolean).join(" · ");

  return (
    <section aria-labelledby="brief-heading" className="rounded-panel border border-rule bg-paper">
      <header className="border-b border-rule px-5 py-4">
        <p className="text-[0.8125rem] text-slate">Decision brief</p>
        <h2 id="brief-heading" className="mt-0.5 font-serif text-[1.375rem] leading-[1.85rem] text-ink">
          {p.goal || decision.title || "Tell me what you are deciding"}
        </h2>
        <p className="mt-1 text-xs text-slate">Updates as you answer. Research uses exactly what is written here.</p>
      </header>
      <dl className="px-5">
        <Row label="Category">{p.category || null}</Row>
        <Row label="Budget">
          {budgetText || budget?.note ? (
            <span>
              {budgetText}
              {budget?.note && <span className="text-slate">{budgetText ? ` · ${budget.note}` : budget.note}</span>}
            </span>
          ) : null}
        </Row>
        {region && <Row label="Region">{region}</Row>}
        <Row label="Requirements">
          {p.requirements.length > 0 ? (
            <ul className="space-y-1.5">
              {p.requirements.map((r, i) => (
                <li key={`${r.label}-${i}`} className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full border px-2 text-[0.6875rem] font-medium",
                      IMPORTANCE_CLASS[r.importance],
                    )}
                  >
                    {IMPORTANCE_LABEL[r.importance]}
                  </span>
                  <span>
                    <span className="font-medium">{r.label}</span>
                    {r.value && <span className="text-slate">: {r.value}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Row>
        <Row label="Priorities">
          {p.priorities.length > 0 ? (
            <ul className="space-y-2">
              {[...p.priorities]
                .sort((a, b) => b.weight - a.weight)
                .map((pr) => (
                  <li key={pr.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{pr.name}</span>
                      <span className="text-xs tabular-nums text-slate">{Math.round((pr.weight / totalWeight) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rule/70">
                      <motion.div
                        className="h-full rounded-full bg-sky"
                        initial={false}
                        animate={{ width: `${(pr.weight / totalWeight) * 100}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                    {pr.reason && <p className="mt-0.5 text-xs text-slate">{pr.reason}</p>}
                  </li>
                ))}
            </ul>
          ) : null}
        </Row>
        <Row label="Constraints">
          {p.constraints.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {p.constraints.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
        </Row>
        <Row label="Named options" empty="None yet: research will find candidates">
          {p.candidates.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {p.candidates.map((c) => (
                <li key={c} className="rounded-full border border-rule bg-mist px-2.5 py-0.5 text-[0.8125rem]">
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
        </Row>
        {p.exclusions.length > 0 && (
          <Row label="Ruled out">
            <span className="text-slate">{p.exclusions.join(", ")}</span>
          </Row>
        )}
        {p.context.length > 0 && (
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="text-[0.8125rem] font-medium text-slate">Your situation</dt>
            <dd className="text-sm text-ink">
              <ul className="list-disc space-y-0.5 pl-4">
                {p.context.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
