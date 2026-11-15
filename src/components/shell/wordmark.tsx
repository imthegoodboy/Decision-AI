import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="64" height="64" rx="14" fill="var(--sky-soft)" />
      <rect x="12" y="11" width="40" height="42" rx="5" fill="var(--paper)" stroke="var(--sky)" strokeWidth="2.5" />
      <path d="M18 22h28M18 30h28M18 38h12" stroke="var(--rule)" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M33 40l5 5 10-12"
        fill="none"
        stroke="var(--cobalt)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold tracking-tight text-ink">Decision AI</span>
    </span>
  );
}
