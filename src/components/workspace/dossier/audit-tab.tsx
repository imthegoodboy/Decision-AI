"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Download, LoaderCircle, Lock, ShieldCheck, ShieldX } from "lucide-react";
import type { AuditEvent, ChainVerification } from "@/lib/domain";
import { api } from "@/lib/client/api";
import { cn, formatDate } from "@/lib/utils";
import { Button, buttonClass } from "@/components/ui/button";
import { ApiErrorNotice } from "@/components/ui/notice";
import { SkeletonLines } from "@/components/ui/skeleton";
import { useDossier } from "../dossier-context";

const TYPE_LABEL: Record<string, string> = {
  "decision.created": "Decision created",
  "message.user": "User message",
  "message.assistant": "Assistant message",
  "profile.updated": "Decision brief updated",
  "research.started": "Research started",
  "research.planned": "Research planned",
  "search.query": "Search run",
  "source.retrieved": "Source retrieved",
  "claim.verified": "Claim verified",
  "contradiction.detected": "Contradiction detected",
  "weights.changed": "Priorities changed",
  "research.sealed": "Dossier sealed",
  "research.failed": "Research failed",
};

function short(hash: string): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : "–";
}

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(hash).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="inline-flex items-center gap-1 rounded-[6px] px-1 font-mono text-xs text-slate hover:bg-mist hover:text-ink"
      aria-label={copied ? "Hash copied" : `Copy hash ${hash}`}
      title={hash}
    >
      {short(hash)}
      {copied ? <Check aria-hidden className="size-3 text-supported" /> : <Copy aria-hidden className="size-3" />}
    </button>
  );
}

function payloadPreview(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload !== "object") return String(payload);
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([, v]) => v == null || typeof v !== "object")
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`);
  return entries.join(" · ");
}

function EventRow({ event, broken }: { event: AuditEvent; broken: boolean }) {
  const preview = payloadPreview(event.payload);
  return (
    <li className={cn("grid grid-cols-[3rem_1fr] gap-3 border-b border-rule px-4 py-2.5 last:border-b-0", broken && "bg-contradicted-soft")}>
      <span className="pt-0.5 font-mono text-xs tabular-nums text-slate">#{event.seq}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium text-ink">
            {TYPE_LABEL[event.type] ?? event.type}
            <span className="ml-2 font-mono text-xs font-normal text-slate">{event.type}</span>
          </p>
          <span className="text-xs tabular-nums text-slate">
            {formatDate(event.createdAt, { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate">
          <span>hash</span>
          <CopyHash hash={event.hash} />
          <span aria-hidden>←</span>
          <span>prev</span>
          <span className="font-mono" title={event.prevHash}>
            {short(event.prevHash)}
          </span>
        </div>
        {event.payload != null && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer select-none truncate text-slate hover:text-ink">{preview || "Payload"}</summary>
            <pre className="pane-scroll mt-1.5 max-h-64 overflow-auto rounded-control border border-rule bg-mist px-3 py-2 font-mono text-[0.75rem] leading-relaxed text-ink">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
}

function VerificationResult({ v }: { v: ChainVerification }) {
  const dossierOk = v.dossierChecks.every((d) => d.valid);
  const ok = v.valid && dossierOk;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className={cn(
        "rounded-panel border p-4",
        ok ? "border-supported/40 bg-supported-soft/60" : "border-contradicted/40 bg-contradicted-soft/70",
      )}
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-supported" />
        ) : (
          <ShieldX aria-hidden className="mt-0.5 size-6 shrink-0 text-contradicted" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-base font-semibold text-ink">
            {v.valid ? `Chain intact: ${v.checked} events verified` : `Chain broken at event #${v.brokenAt ?? "?"}`}
          </p>
          {!v.valid && v.reason && <p className="text-sm text-ink">{v.reason}</p>}
          {v.headHash && (
            <p className="text-xs text-slate">
              Head hash <span className="break-all font-mono text-ink">{v.headHash}</span>
            </p>
          )}
          {v.dossierChecks.length > 0 && (
            <ul className="space-y-1 pt-1">
              {v.dossierChecks.map((d) => (
                <li key={d.runId} className="flex flex-wrap items-center gap-2 text-xs">
                  {d.valid ? (
                    <Check aria-hidden className="size-3.5 text-supported" strokeWidth={3} />
                  ) : (
                    <ShieldX aria-hidden className="size-3.5 text-contradicted" />
                  )}
                  <span className="text-ink">
                    Sealed dossier {d.valid ? "matches its hash" : "does not match its sealed hash"}
                  </span>
                  <span className="font-mono text-slate" title={d.actual}>
                    {short(d.actual)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function AuditTab() {
  const { decisionId } = useDossier();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .audit(decisionId)
      .then((res) => !cancelled && setEvents(res.events))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [decisionId]);

  const verify = async () => {
    setVerifying(true);
    setVerification(null);
    setError(null);
    try {
      const [res] = await Promise.all([api.audit(decisionId), new Promise((r) => setTimeout(r, 450))]);
      setEvents(res.events);
      setVerification(res.verification);
    } catch (err) {
      setError(err);
    } finally {
      setVerifying(false);
    }
  };

  const brokenAt = verification && !verification.valid ? verification.brokenAt : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-panel border border-rule bg-mist/50 p-4 sm:flex-row sm:items-center">
        <Lock aria-hidden className="hidden size-5 shrink-0 text-cobalt sm:block" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Tamper-evident audit log</p>
          <p className="text-xs leading-relaxed text-slate">
            Every step is appended with a SHA-256 hash of its content and the previous hash. Editing any event, or the sealed
            dossier, breaks the chain from that point on.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={verify} loading={verifying} icon={<ShieldCheck aria-hidden className="size-4" />}>
            {verifying ? "Verifying" : "Verify integrity"}
          </Button>
          <a href={api.reportUrl(decisionId)} className={buttonClass("secondary", "md")} download>
            <Download aria-hidden className="size-4" />
            Download report
          </a>
        </div>
      </div>

      {verifying && (
        <p className="flex items-center gap-2 text-sm text-cobalt" role="status">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Recomputing {events?.length ?? ""} hashes…
        </p>
      )}
      {verification && <VerificationResult v={verification} />}
      {error != null && <ApiErrorNotice error={error} title="Could not load the audit log" />}

      {events === null && error == null ? (
        <SkeletonLines lines={6} />
      ) : events && events.length > 0 ? (
        <ol className="overflow-hidden rounded-panel border border-rule bg-paper" aria-label="Audit events">
          {events.map((e) => (
            <EventRow key={e.id} event={e} broken={brokenAt != null && e.seq >= brokenAt} />
          ))}
        </ol>
      ) : events ? (
        <p className="text-sm text-slate">No audit events yet.</p>
      ) : null}
    </div>
  );
}
