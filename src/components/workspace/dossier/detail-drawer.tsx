"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { Claim, Source } from "@/lib/domain";
import { api } from "@/lib/client/api";
import { formatDate, percent } from "@/lib/utils";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Favicon } from "@/components/ui/media";
import { Gauge } from "@/components/ui/meter";
import { ApiErrorNotice } from "@/components/ui/notice";
import { Badge, Stamp, VERDICT_DESCRIPTION } from "@/components/ui/stamp";
import { SourceChip } from "../chips";
import { useDossier } from "../dossier-context";
import { QuoteFound } from "./evidence-tab";
import { ReliabilityBreakdown, kindLabel } from "./sources-tab";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds the quote inside `text`, tolerating case, whitespace and punctuation differences. */
function findQuote(text: string, quote: string): [number, number] | null {
  const q = quote.trim().replace(/^[“"']+|[”"'.…]+$/g, "");
  if (!q) return null;
  const exact = text.toLowerCase().indexOf(q.toLowerCase());
  if (exact >= 0) return [exact, exact + q.length];
  const words = q.split(/\W+/).filter(Boolean);
  for (const len of [words.length, 12, 8, 5]) {
    if (len > words.length || len < 3) continue;
    const pattern = new RegExp(words.slice(0, len).map(escapeRegExp).join("\\W+"), "i");
    const m = pattern.exec(text);
    if (m) return [m.index, m.index + m[0].length];
  }
  return null;
}

export function Highlighted({ text, quote }: { text: string; quote: string }) {
  const range = findQuote(text, quote);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="quote-mark">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-rule py-2 text-sm last:border-b-0">
      <dt className="text-slate">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-ink">{children}</h3>;
}

function Provenance({ source }: { source: Source }) {
  return (
    <dl className="rounded-panel border border-rule px-3">
      <Field label="Page">
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 text-cobalt hover:underline">
          <span className="break-all">{source.url}</span>
          <ExternalLink aria-hidden className="size-3 shrink-0" />
        </a>
      </Field>
      <Field label="Publisher">{[source.siteName, source.author].filter(Boolean).join(" · ") || "Not stated"}</Field>
      <Field label="Published">{source.publishedAt ? formatDate(source.publishedAt) : "Undated"}</Field>
      <Field label="Retrieved">
        {formatDate(source.retrievedAt, { hour: "numeric", minute: "2-digit" })}
      </Field>
      <Field label="Content hash">
        <span className="break-all font-mono text-xs" title="SHA-256 of the extracted page text at retrieval time">
          sha256:{source.contentHash}
        </span>
      </Field>
      <Field label="Found by">
        {source.query ? <span>“{source.query}”</span> : "Direct link"}
        <span className="text-slate"> via {source.provider}</span>
      </Field>
      <Field label="Readable text">{source.wordCount.toLocaleString()} words</Field>
    </dl>
  );
}

function PageText({ decisionId, source, quote }: { decisionId: string; source: Source; quote?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.sourceText(decisionId, source.id);
      setText(res.text);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  if (text !== null) {
    return (
      <div>
        <Heading>Extracted page text</Heading>
        <div className="pane-scroll max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-panel border border-rule bg-mist/50 px-4 py-3 font-serif text-[0.9375rem] leading-relaxed text-ink">
          {quote ? <Highlighted text={text} quote={quote} /> : text}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={load} loading={loading} icon={<FileText aria-hidden className="size-4" />}>
        View extracted page text
      </Button>
      {error != null && <ApiErrorNotice error={error} title="Could not load the page text" />}
    </div>
  );
}

function ClaimDetail({ claim }: { claim: Claim }) {
  const { sourceById, optionById, criterionById, decisionId } = useDossier();
  const source = sourceById.get(claim.sourceId);
  const v = claim.verification;
  const option = claim.optionId ? optionById.get(claim.optionId) : null;
  const criterion = claim.criterionId ? criterionById.get(claim.criterionId) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Stamp status={v?.status} />
          {v && <span className="text-xs tabular-nums text-slate">{percent(v.confidence)} verifier confidence</span>}
        </div>
        <p className="text-base font-medium leading-snug text-ink">{claim.text}</p>
        <div className="flex flex-wrap gap-1.5">
          {option && <Badge tone="neutral">{option.name}</Badge>}
          {criterion && <Badge tone="neutral">{criterion.name}</Badge>}
          <Badge tone="neutral" className="capitalize">
            {claim.kind}
          </Badge>
        </div>
        {v && <p className="text-xs text-slate">{VERDICT_DESCRIPTION[v.status]}</p>}
      </div>

      <div>
        <Heading>Quote the claim was extracted from</Heading>
        <blockquote className="border-l-2 border-sky pl-3 font-serif text-[1rem] italic leading-relaxed text-ink">“{claim.quote}”</blockquote>
        <div className="mt-1.5">
          <QuoteFound claim={claim} />
        </div>
      </div>

      <div>
        <Heading>Verification passage</Heading>
        {v?.passage ? (
          <div className="rounded-panel border border-rule bg-mist/50 px-4 py-3 font-serif text-[0.9375rem] leading-relaxed text-ink">
            <Highlighted text={v.passage.text} quote={claim.quote} />
          </div>
        ) : (
          <p className="text-sm text-slate">No passage was retrieved for this claim.</p>
        )}
      </div>

      {v && (
        <div>
          <Heading>Verifier rationale</Heading>
          <p className="text-sm leading-relaxed text-ink">{v.rationale}</p>
          {v.conflictNote && <p className="mt-2 text-sm text-contradicted">{v.conflictNote}</p>}
          {(v.corroboratingSourceIds.length > 0 || v.conflictingSourceIds.length > 0) && (
            <div className="mt-3 space-y-1.5 text-xs text-slate">
              {v.corroboratingSourceIds.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5">
                  Corroborated by {v.corroboratingSourceIds.map((id) => <SourceChip key={id} id={id} />)}
                </p>
              )}
              {v.conflictingSourceIds.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="text-contradicted">Conflicts with</span>{" "}
                  {v.conflictingSourceIds.map((id) => (
                    <SourceChip key={id} id={id} />
                  ))}
                </p>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-slate">Verified {formatDate(v.verifiedAt, { hour: "numeric", minute: "2-digit" })}</p>
        </div>
      )}

      {source && (
        <div>
          <Heading>Provenance</Heading>
          <div className="mb-2 flex items-center gap-2">
            <Favicon src={source.favicon} domain={source.domain} />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{source.title}</p>
            <Gauge score={source.reliability.score} size={40} />
          </div>
          <Provenance source={source} />
          <div className="mt-3">
            <PageText decisionId={decisionId} source={source} quote={claim.quote} />
          </div>
        </div>
      )}
    </div>
  );
}

function SourceDetail({ source }: { source: Source }) {
  const { dossier, decisionId, openClaim } = useDossier();
  const claims = (dossier?.claims ?? []).filter((c) => c.sourceId === source.id);
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{kindLabel(source.kind)}</Badge>
            {source.status !== "read" && <Badge tone="partial">{source.status === "snippet" ? "Snippet only" : "Could not read"}</Badge>}
          </div>
          {source.excerpt && <p className="font-serif text-[0.9375rem] italic leading-relaxed text-ink/90">{source.excerpt}</p>}
        </div>
        <Gauge score={source.reliability.score} size={52} />
      </div>
      <div>
        <Heading>Reliability signals</Heading>
        <ReliabilityBreakdown source={source} explain />
      </div>
      <div>
        <Heading>Provenance</Heading>
        <Provenance source={source} />
      </div>
      <div>
        <Heading>Claims from this source ({claims.length})</Heading>
        {claims.length === 0 ? (
          <p className="text-sm text-slate">No claims were extracted from this page.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {claims.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openClaim(c.id)}
                  className="flex w-full items-start gap-3 py-2 text-left hover:bg-sky-soft/40"
                >
                  <Stamp status={c.verification?.status} size="sm" className="mt-0.5" />
                  <span className="text-sm text-ink">{c.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PageText decisionId={decisionId} source={source} />
    </div>
  );
}

export function DetailDrawer() {
  const { drawer, closeDrawer, claimById, sourceById } = useDossier();
  const claim = drawer?.kind === "claim" ? claimById.get(drawer.id) : undefined;
  const source = drawer?.kind === "source" ? sourceById.get(drawer.id) : undefined;
  const claimSource = claim ? sourceById.get(claim.sourceId) : undefined;

  const title = claim ? "Claim verification" : source ? source.title || source.domain : "Not found";
  const subtitle = claim ? (claimSource ? `From ${claimSource.domain}` : undefined) : source?.domain;

  return (
    <Drawer open={drawer !== null} onClose={closeDrawer} title={title} subtitle={subtitle}>
      {claim ? (
        <ClaimDetail key={claim.id} claim={claim} />
      ) : source ? (
        <SourceDetail key={source.id} source={source} />
      ) : (
        <p className="text-sm text-slate">This item is not part of the current dossier.</p>
      )}
    </Drawer>
  );
}
