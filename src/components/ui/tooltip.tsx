import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * CSS-only tooltip shown on hover and keyboard focus of the wrapped trigger.
 * The tip text is also exposed via aria-describedby-equivalent visually hidden copy.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 w-max max-w-[280px] -translate-x-1/2 rounded-control bg-ink px-2.5 py-1.5 text-xs leading-snug font-normal text-paper opacity-0 shadow-float transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}
