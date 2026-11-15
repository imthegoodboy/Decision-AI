"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "./button";

/**
 * Right-hand side drawer for claim and source detail. Escape closes, focus moves
 * into the drawer on open and returns to the trigger on close, Tab is trapped.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const raf = requestAnimationFrame(() => panel?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            className="absolute inset-0 bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative flex h-full w-full max-w-[560px] flex-col border-l border-rule bg-paper shadow-float focus-visible:outline-none"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "tween", duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-base font-semibold text-ink">
                  {title}
                </h2>
                {subtitle && <div className="mt-0.5 text-[0.8125rem] text-slate">{subtitle}</div>}
              </div>
              {actions}
              <IconButton label="Close" onClick={onClose}>
                <X className="size-4" aria-hidden />
              </IconButton>
            </header>
            <div className="pane-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
