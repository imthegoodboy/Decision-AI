"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Slider({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  hint,
  valueLabel,
  className,
}: {
  id: string;
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  valueLabel?: string;
  className?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="min-w-0 truncate text-sm font-medium text-ink">
          {label}
        </label>
        <span className="shrink-0 text-[0.8125rem] tabular-nums text-slate">{valueLabel ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="weight-slider w-full"
        style={{ ["--fill" as string]: `${fill}%` }}
        aria-valuetext={valueLabel ?? String(value)}
      />
      {hint && <div className="text-xs text-slate">{hint}</div>}
    </div>
  );
}
