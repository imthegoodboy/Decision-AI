"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { Claim, VerificationStatus } from "@/lib/domain";
import { cn, percent } from "@/lib/utils";
import { Stamp, VERDICT_LABEL } from "@/components/ui/stamp";
import { Favicon } from "@/components/ui/media";
import { ReliabilityInline } from "@/components/ui/meter";
import { SourceChip } from "../chips";
import { useDossier } from "../dossier-context";

const STATUSES: VerificationStatus[] = ["supported", "partial", "unsupported", "contradicted"];

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-0 flex-1 sm:flex-none">
      <label htmlFor={id} className="mb-1 block text-xs text-slate">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-control border border-rule-strong bg-paper px-2.5 text-sm text-ink focus:border-sky focus:outline-none sm:w-48"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function QuoteFound({ claim }: { claim: Claim }) {
  const v = claim.verification;
  if (!v) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", v.quoteFound ? "text-supported" : "text-partial")}
      title={`Similarity between the quoted text and the best-matching window of the page: ${percent(v.quoteSimilarity)}`}
    >
      {v.quoteFound ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <X aria-hidden className="size-3.5" strokeWidth={3} />}
      {v.quoteFound ? "Quote found in page" : "Quote not found verbatim"}
      <span className="tabular-nums text-slate">({percent(v.quoteSimilarity)})</span>
    </span>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const { sourceById, optionById, criterionById, openClaim } = useDossier();
  const source = sourceById.get(claim.sourceId);
  const option = claim.optionId ? optionById.get(claim.optionId) : null;
  const criterion = claim.criterionId ? criterionById.get(claim.criterionId) : null;
  const v = claim.verification;

  return (
    <li className="border-b border-rule last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => openClaim(claim.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openClaim(claim.id);
          }
        }}
        aria-label={`${v ? VERDICT_LABEL[v.status] : "Unchecked"}: ${claim.text}. Open verification detail.`}
        className="grid cursor-pointer grid-cols-1 gap-2 px-4 py-3.5 transition-colors hover:bg-sky-soft/40 focus-visible:bg-sky-soft/40 sm:grid-cols-[7rem_1fr]"
      >
        <div className="flex items-center gap-2 sm:block sm:space-y-1">
          <Stamp status={v?.status} />
          {v && <p className="text-xs tabular-nums text-slate">{percent(v.confidence)} conf.</p>}
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium leading-snug text-ink">{claim.text}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate">
            {option && <span className="rounded-full bg-mist px-2 py-0.5 text-ink">{option.name}</span>}
            {criterion && <span className="rounded-full border border-rule px-2 py-0.5">{criterion.name}</span>}
            <span className="capitalize">{claim.kind}</span>
          </div>
          {claim.quote && (
            <blockquote className="border-l-2 border-sky/70 pl-3 font-serif text-[0.9375rem] italic leading-relaxed text-ink/90">
              “{claim.quote}”
            </blockquote>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {source && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-slate">
                <Favicon src={source.favicon} domain={source.domain} className="size-3.5" />
                <span className="truncate text-ink">{source.domain}</span>
                <ReliabilityInline score={source.reliability.score} />
              </span>
            )}
            <QuoteFound claim={claim} />
          </div>
          {v && (v.corroboratingSourceIds.length > 0 || v.conflictingSourceIds.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate">
              {v.corroboratingSourceIds.length > 0 && (
                <>
                  <span>Corroborated by</span>
                  {v.corroboratingSourceIds.map((id) => (
                    <SourceChip key={id} id={id} />
                  ))}
                </>
              )}
              {v.conflictingSourceIds.length > 0 && (
                <>
                  <span className="text-contradicted">Conflicts with</span>
                  {v.conflictingSourceIds.map((id) => (
                    <SourceChip key={id} id={id} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function EvidenceTab() {
  const { dossier } = useDossier();
  const [optionId, setOptionId] = useState("all");
  const [status, setStatus] = useState("all");
  const [criterionId, setCriterionId] = useState("all");

  const claims = useMemo(() => dossier?.claims ?? [], [dossier]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: claims.length };
    for (const s of STATUSES) c[s] = claims.filter((x) => x.verification?.status === s).length;
    return c;
  }, [claims]);

  const filtered = useMemo(
    () =>
      claims.filter(
        (c) =>
          (optionId === "all" || (optionId === "general" ? c.optionId === null : c.optionId === optionId)) &&
          (status === "all" || c.verification?.status === status) &&
          (criterionId === "all" || c.criterionId === criterionId),
      ),
    [claims, optionId, status, criterionId],
  );

  if (!dossier) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          id="ev-option"
          label="Option"
          value={optionId}
          onChange={setOptionId}
          options={[
            { value: "all", label: "All options" },
            ...dossier.options.map((o) => ({ value: o.id, label: o.name })),
            { value: "general", label: "General claims" },
          ]}
        />
        <Select
          id="ev-status"
          label="Verdict"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: `All verdicts (${counts.all})` },
            ...STATUSES.map((s) => ({ value: s, label: `${VERDICT_LABEL[s]} (${counts[s]})` })),
          ]}
        />
        <Select
          id="ev-criterion"
          label="Criterion"
          value={criterionId}
          onChange={setCriterionId}
          options={[{ value: "all", label: "All criteria" }, ...dossier.plan.criteria.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <p className="pb-2 text-xs text-slate sm:ml-auto" aria-live="polite">
          Showing {filtered.length} of {claims.length} claims
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-panel border border-dashed border-rule-strong px-4 py-8 text-center text-sm text-slate">
          No claims match these filters.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-panel border border-rule bg-paper">
          {filtered.map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
