import type { ReactNode } from "react";
import type { DecisionStatus, VerificationStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const VERDICT_LABEL: Record<VerificationStatus, string> = {
  supported: "Supported",
  partial: "Partial",
  unsupported: "Unsupported",
  contradicted: "Contradicted",
};

export const VERDICT_DESCRIPTION: Record<VerificationStatus, string> = {
  supported: "The cited passage states this claim.",
  partial: "The passage supports part of the claim, or the quote was not found verbatim.",
  unsupported: "The passage does not support this claim. It is not used as evidence.",
  contradicted: "A source of equal or higher reliability states the opposite.",
};

const VERDICT_CLASS: Record<VerificationStatus, string> = {
  supported: "text-supported border-supported/45 bg-supported-soft",
  partial: "text-partial border-partial/45 bg-partial-soft",
  unsupported: "text-unsupported border-unsupported/40 bg-unsupported-soft",
  contradicted: "text-contradicted border-contradicted/45 bg-contradicted-soft",
};

export const VERDICT_DOT: Record<VerificationStatus, string> = {
  supported: "bg-supported",
  partial: "bg-partial",
  unsupported: "bg-unsupported",
  contradicted: "bg-contradicted",
};

export const VERDICT_TEXT: Record<VerificationStatus, string> = {
  supported: "text-supported",
  partial: "text-partial",
  unsupported: "text-unsupported",
  contradicted: "text-contradicted",
};

/** A verdict stamp: the visual signature of the verification ledger. */
export function Stamp({
  status,
  size = "md",
  className,
}: {
  status: VerificationStatus | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!status) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-[4px] border border-dashed border-rule-strong px-1.5 font-medium text-slate",
          size === "sm" ? "h-5 text-[0.6875rem]" : "h-6 text-xs",
          className,
        )}
      >
        Unchecked
      </span>
    );
  }
  return (
    <span
      title={VERDICT_DESCRIPTION[status]}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[4px] border font-semibold tracking-[0.01em]",
        size === "sm" ? "h-5 px-1.5 text-[0.6875rem]" : "h-6 px-2 text-xs",
        VERDICT_CLASS[status],
        className,
      )}
    >
      {VERDICT_LABEL[status]}
    </span>
  );
}

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  intake: "Gathering details",
  researching: "Researching",
  ready: "Dossier ready",
  failed: "Research failed",
};

const DECISION_STATUS_DOT: Record<DecisionStatus, string> = {
  intake: "bg-sky",
  researching: "bg-cobalt animate-pulse-dot",
  ready: "bg-supported",
  failed: "bg-contradicted",
};

export function StatusDot({ status, className }: { status: DecisionStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", DECISION_STATUS_DOT[status], className)}
    />
  );
}

export function StatusPill({ status }: { status: DecisionStatus }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-rule bg-paper px-2.5 text-xs font-medium text-slate">
      <StatusDot status={status} />
      {DECISION_STATUS_LABEL[status]}
    </span>
  );
}

type Tone = "neutral" | "sky" | "ink" | VerificationStatus;

const TONE: Record<Tone, string> = {
  neutral: "bg-mist text-slate border-rule",
  sky: "bg-sky-soft text-cobalt border-sky/40",
  ink: "bg-ink text-paper border-ink",
  supported: VERDICT_CLASS.supported,
  partial: VERDICT_CLASS.partial,
  unsupported: VERDICT_CLASS.unsupported,
  contradicted: VERDICT_CLASS.contradicted,
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
