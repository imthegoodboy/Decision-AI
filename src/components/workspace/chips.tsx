"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERDICT_DOT, VERDICT_LABEL } from "@/components/ui/stamp";
import { Favicon } from "@/components/ui/media";
import { useDossier } from "./dossier-context";

const chipBase =
  "inline-flex h-[1.375rem] max-w-[12rem] items-center gap-1 rounded-full border px-2 align-middle text-[0.71875rem] font-medium leading-none transition-colors";

/** Interactive citation for a verified claim; opens the claim drawer. */
export function ClaimChip({ id, className }: { id: string; className?: string }) {
  const { claimById, sourceById, openClaim } = useDossier();
  const claim = claimById.get(id);
  if (!claim) {
    return (
      <span className={cn(chipBase, "border-dashed border-rule-strong text-slate", className)} title="Claim not found in this dossier">
        claim
      </span>
    );
  }
  const source = sourceById.get(claim.sourceId);
  const status = claim.verification?.status;
  const label = source?.domain ?? "source";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openClaim(id);
      }}
      title={`${status ? VERDICT_LABEL[status] : "Unchecked"} claim: ${claim.text}`}
      aria-label={`Open ${status ? VERDICT_LABEL[status].toLowerCase() : "unchecked"} claim from ${label}: ${claim.text}`}
      className={cn(chipBase, "border-rule bg-sky-soft/70 text-cobalt hover:border-sky hover:bg-sky-soft", className)}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", status ? VERDICT_DOT[status] : "bg-rule-strong")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Interactive citation for a source; opens the source drawer. */
export function SourceChip({ id, className, showFavicon = true }: { id: string; className?: string; showFavicon?: boolean }) {
  const { sourceById, openSource } = useDossier();
  const source = sourceById.get(id);
  if (!source) {
    return (
      <span className={cn(chipBase, "border-dashed border-rule-strong text-slate", className)} title="Source not found">
        source
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openSource(id);
      }}
      title={source.title}
      aria-label={`Open source ${source.domain}: ${source.title}`}
      className={cn(chipBase, "border-rule bg-paper text-ink hover:border-sky hover:bg-sky-soft", className)}
    >
      {showFavicon ? <Favicon src={source.favicon} domain={source.domain} className="size-3" /> : <FileText aria-hidden className="size-3" />}
      <span className="truncate">{source.domain}</span>
    </button>
  );
}

export function ClaimChips({ ids, className }: { ids: string[]; className?: string }) {
  if (ids.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {ids.map((id) => (
        <ClaimChip key={id} id={id} />
      ))}
    </span>
  );
}
