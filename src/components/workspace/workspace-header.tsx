"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, RefreshCw, Trash } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatRelative } from "@/lib/utils";
import { Button, IconButton, buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/stamp";
import type { WorkspaceModel } from "./use-workspace";

function ResearchAgain({ onStart, disabled }: { onStart: (focus: string | null) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    onStart(focus.trim() || null);
    setFocus("");
  };

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        icon={<RefreshCw aria-hidden className="size-3.5" />}
      >
        Research again
      </Button>
      {open && (
        <form
          onSubmit={submit}
          role="dialog"
          aria-label="Research again"
          className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-panel border border-rule bg-paper p-4 shadow-float"
        >
          <div>
            <label htmlFor="focus" className="text-sm font-medium text-ink">
              Anything to focus on?
            </label>
            <p className="text-xs text-slate">Optional. For example: battery life tests, or warranty in India.</p>
          </div>
          <input
            id="focus"
            ref={inputRef}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Leave empty for a fresh full run"
            className="h-9 w-full rounded-control border border-rule-strong px-3 text-sm text-ink placeholder:text-slate/70 focus:border-sky focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit">
              Start research
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function WorkspaceHeader({ model }: { model: WorkspaceModel }) {
  const router = useRouter();
  const { bundle, streaming, startResearch, remove } = model;
  const [deleting, setDeleting] = useState(false);
  if (!bundle) return null;
  const { decision, run } = bundle;
  const hasDossier = Boolean(run?.dossier);
  const researching = streaming || decision.status === "researching";

  const onDelete = async () => {
    if (!window.confirm("Delete this decision and its audit log? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await remove();
      router.push("/");
    } catch (err) {
      window.alert(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3 sm:px-6">
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        <h1 className="truncate text-lg font-semibold text-ink" title={decision.title}>
          {decision.title || "Untitled decision"}
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate">
          <StatusPill status={streaming ? "researching" : decision.status} />
          {run && hasDossier && (
            <span>
              Run {run.version}
              {run.completedAt ? ` · sealed ${formatRelative(run.completedAt)}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {(hasDossier || run?.status === "failed") && (
          <ResearchAgain disabled={researching} onStart={(focus) => void startResearch(focus)} />
        )}
        {hasDossier && (
          <a href={api.reportUrl(decision.id)} download className={buttonClass("secondary", "sm")}>
            <Download aria-hidden className="size-3.5" />
            Download report
          </a>
        )}
        <IconButton label="Delete decision" onClick={onDelete} disabled={deleting || researching} className="hover:bg-contradicted-soft hover:text-contradicted">
          <Trash aria-hidden className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}
