import { cn } from "@/lib/utils";

/** Horizontal bar for 0–1 values (progress, scores, readiness). */
export function Meter({
  value,
  label,
  className,
  barClassName,
  height = "h-1.5",
}: {
  value: number;
  label: string;
  className?: string;
  barClassName?: string;
  height?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("w-full overflow-hidden rounded-full bg-rule/70", height, className)}
    >
      <div
        className={cn("h-full rounded-full bg-sky transition-[width] duration-500 ease-out", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Small semicircular gauge for 0–100 reliability scores. */
export function Gauge({ score, size = 44, label }: { score: number; size?: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, score));
  const r = 16;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const tone = clamped >= 70 ? "var(--supported)" : clamped >= 45 ? "var(--cobalt)" : "var(--partial)";
  return (
    <div
      className="relative inline-flex shrink-0 flex-col items-center"
      style={{ width: size }}
      role="img"
      aria-label={label ?? `Reliability ${Math.round(clamped)} out of 100`}
    >
      <svg viewBox="0 0 40 24" width={size} height={(size * 24) / 40} aria-hidden>
        <path d="M4 21a16 16 0 0 1 32 0" fill="none" stroke="var(--rule)" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M4 21a16 16 0 0 1 32 0"
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="-mt-2 text-xs font-semibold tabular-nums text-ink">{Math.round(clamped)}</span>
    </div>
  );
}

/** Inline reliability number with a tiny bar, for dense rows. */
export function ReliabilityInline({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-supported" : score >= 45 ? "bg-cobalt" : "bg-partial";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate" title={`Reliability ${Math.round(score)} of 100`}>
      <span className="relative h-1 w-8 overflow-hidden rounded-full bg-rule">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
      <span className="tabular-nums">{Math.round(score)}</span>
    </span>
  );
}
