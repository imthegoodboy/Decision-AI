"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { AppDataProvider } from "./app-data";
import { Rail } from "./rail";
import { Wordmark } from "./wordmark";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <MotionConfig reducedMotion="user">
      <AppDataProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-paper focus:px-3 focus:py-2 focus:text-sm focus:text-cobalt focus:shadow-float"
        >
          Skip to content
        </a>
        <div className="flex h-dvh overflow-hidden bg-paper">
          {/* Desktop rail */}
          <aside className="hidden w-64 shrink-0 border-r border-rule lg:block">
            <Rail />
          </aside>

          {/* Mobile rail */}
          <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}>
            <div
              aria-hidden
              onClick={() => setOpen(false)}
              className={cn("absolute inset-0 bg-ink/20 transition-opacity", open ? "opacity-100" : "opacity-0")}
            />
            <aside
              id="mobile-rail"
              aria-hidden={!open}
              inert={!open}
              className={cn(
                "absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-rule shadow-float transition-transform duration-200",
                open ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <div className="absolute right-2 top-2.5 z-10">
                <IconButton label="Close menu" onClick={() => setOpen(false)}>
                  <X aria-hidden className="size-4" />
                </IconButton>
              </div>
              <Rail onNavigate={() => setOpen(false)} />
            </aside>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-rule px-2 lg:hidden">
              <IconButton
                label="Open menu"
                aria-expanded={open}
                aria-controls="mobile-rail"
                onClick={() => setOpen(true)}
              >
                <Menu aria-hidden className="size-5" />
              </IconButton>
              <Link href="/" className="rounded-control">
                <Wordmark />
              </Link>
            </header>
            <main id="main" className="pane-scroll relative min-h-0 flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </AppDataProvider>
    </MotionConfig>
  );
}
