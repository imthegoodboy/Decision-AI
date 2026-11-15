"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { cn, formatRelative } from "@/lib/utils";
import { StatusDot, DECISION_STATUS_LABEL } from "@/components/ui/stamp";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/client/api";
import { useAppData } from "./app-data";
import { Wordmark } from "./wordmark";

/** Re-render relative times once a minute without touching the data. */
function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

function DecisionList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { decisions, decisionsError } = useAppData();
  const now = useNow();

  if (decisions === null) {
    return (
      <div className="space-y-3 px-3 py-2" aria-label="Loading decisions">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <p className="px-3 py-2 text-[0.8125rem] text-slate">
        {decisionsError ? errorMessage(decisionsError) : "Your decisions will appear here."}
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {decisions.map((d) => {
        const href = `/d/${d.id}`;
        const active = pathname === href;
        return (
          <li key={d.id}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-start gap-2.5 rounded-control px-3 py-2 transition-colors",
                active ? "bg-sky-soft" : "hover:bg-paper",
              )}
            >
              <StatusDot status={d.status} className="mt-[0.45rem]" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", active ? "font-medium text-ink" : "text-ink/90")}>
                  {d.title || "Untitled decision"}
                </span>
                <span className="block truncate text-xs text-slate">
                  <span className="sr-only">{DECISION_STATUS_LABEL[d.status]}, </span>
                  {now ? formatRelative(d.updatedAt, now) : " "}
                  {d.category ? ` · ${d.category}` : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SystemFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { system, systemError } = useAppData();
  let line = "Checking configuration…";
  let dot = "bg-rule-strong";
  if (systemError) {
    line = "Server unreachable";
    dot = "bg-contradicted";
  } else if (system) {
    if (!system.configured) {
      line = "API key missing";
      dot = "bg-partial";
    } else {
      const search = system.search[0] ?? "no search";
      line = `${system.models.main} · ${search}`;
      dot = "bg-supported";
    }
  }
  return (
    <Link
      href="/settings"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-control px-3 py-2 text-[0.8125rem] text-slate transition-colors hover:bg-paper hover:text-ink"
    >
      <Settings aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{line}</span>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
    </Link>
  );
}

export function Rail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Decisions" className="flex h-full flex-col bg-mist">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/" onClick={onNavigate} className="rounded-control">
          <Wordmark />
        </Link>
      </div>
      <div className="px-3 pb-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex h-10 items-center gap-2 rounded-control border border-rule-strong bg-paper px-3 text-sm font-medium text-ink transition-colors hover:border-sky hover:bg-sky-soft"
        >
          <Plus aria-hidden className="size-4 text-cobalt" />
          New decision
        </Link>
      </div>
      <p className="px-6 pb-1 pt-2 text-xs font-medium text-slate">Recent decisions</p>
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <Suspense
          fallback={
            <div className="space-y-3 px-3 py-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          }
        >
          <DecisionList onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="border-t border-rule p-3">
        <SystemFooter onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
