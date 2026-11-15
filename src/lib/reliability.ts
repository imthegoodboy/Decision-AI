/**
 * Transparent source reliability.
 *
 * Reliability has two parts, kept separate on purpose:
 *  - a **prior** from metadata signals (HTTPS, publisher, author, date, source
 *    kind, depth). These are cheap for a bad actor to fake.
 *  - an **earned** component from how the source's claims fared in
 *    cross-source verification (corroborated vs contradicted). This is
 *    expensive to fake because it requires independent sources to agree.
 *
 * Every adjustment is emitted as a signal so the UI and audit log can show
 * exactly why a source scored as it did.
 */
import type { ReliabilitySignal, Source, SourceKind } from "./domain";
import { clamp } from "./scoring";

export const BASE_SCORE = 50;

export const KIND_EFFECT: Record<SourceKind, number> = {
  government: 14,
  academic: 12,
  official: 10,
  "independent-review": 8,
  reference: 6,
  news: 6,
  video: 0,
  other: 0,
  blog: -4,
  retailer: -4,
  forum: -8,
};

export type PriorInput = Pick<Source, "url" | "siteName" | "author" | "publishedAt" | "wordCount" | "kind" | "status">;

export function priorSignals(input: PriorInput, freshnessDays: number, now = new Date()): ReliabilitySignal[] {
  const s: ReliabilitySignal[] = [];
  const push = (key: string, label: string, effect: number, detail: string) => s.push({ key, label, effect, detail });

  if (input.url.startsWith("https://")) push("https", "Secure connection", 3, "Served over HTTPS.");
  else push("https", "Insecure connection", -6, "Served over plain HTTP.");

  if (input.siteName) push("publisher", "Identified publisher", 4, input.siteName);
  else push("publisher", "Publisher not stated", -2, "No publisher metadata on the page.");

  if (input.author) push("author", "Named author", 5, input.author);

  if (input.publishedAt) {
    const ageDays = (now.getTime() - Date.parse(input.publishedAt)) / 86_400_000;
    push("dated", "Publication date present", 4, input.publishedAt.slice(0, 10));
    if (ageDays > freshnessDays) {
      push("freshness", "Possibly outdated", -10, `About ${Math.round(ageDays)} days old; this decision expects information newer than ${freshnessDays} days.`);
    } else {
      push("freshness", "Recent", 5, `About ${Math.max(0, Math.round(ageDays))} days old.`);
    }
  } else {
    push("dated", "No publication date", -6, "Age of the information cannot be checked.");
  }

  push("kind", `Source type: ${input.kind.replace("-", " ")}`, KIND_EFFECT[input.kind], kindDetail(input.kind));

  if (input.status === "snippet") push("access", "Page could not be read", -18, "Only a search snippet was available.");
  else if (input.wordCount < 250) push("depth", "Thin content", -8, `${input.wordCount} words of readable text.`);
  else if (input.wordCount > 900) push("depth", "In-depth content", 3, `${input.wordCount} words of readable text.`);

  return s;
}

export type TrackRecord = { supported: number; partial: number; unsupported: number; contradicted: number; corroborated: number };

/** Signals earned through verification. */
export function earnedSignals(record: TrackRecord): ReliabilitySignal[] {
  const s: ReliabilitySignal[] = [];
  const checked = record.supported + record.partial + record.unsupported + record.contradicted;
  if (checked === 0) return s;
  if (record.corroborated > 0) {
    s.push({
      key: "corroboration",
      label: "Corroborated by other sources",
      effect: Math.min(12, record.corroborated * 3),
      detail: `${record.corroborated} of ${checked} claims were confirmed by an independent source.`,
    });
  }
  if (record.contradicted > 0) {
    s.push({
      key: "contradicted",
      label: "Contradicted by other sources",
      effect: -Math.min(24, record.contradicted * 8),
      detail: `${record.contradicted} of ${checked} claims conflict with other sources.`,
    });
  }
  if (record.unsupported > 0) {
    s.push({
      key: "unsupported",
      label: "Claims not supported by its own text",
      effect: -Math.min(10, record.unsupported * 3),
      detail: `${record.unsupported} extracted claims were not supported by the passage they came from.`,
    });
  }
  return s;
}

export function scoreFromSignals(signals: ReliabilitySignal[]): number {
  return Math.round(clamp(BASE_SCORE + signals.reduce((sum, sig) => sum + sig.effect, 0), 0, 100));
}

function kindDetail(kind: SourceKind): string {
  switch (kind) {
    case "official":
      return "Primary source from the maker or institution; authoritative on its own facts, not on comparisons.";
    case "independent-review":
      return "Independent testing or review.";
    case "government":
      return "Government or regulator publication.";
    case "academic":
      return "Academic or peer-reviewed publication.";
    case "retailer":
      return "Retail listing; prices are useful, descriptions are promotional.";
    case "forum":
      return "User discussion; useful for experiences, weak for facts.";
    case "blog":
      return "Personal or marketing blog.";
    case "news":
      return "News reporting.";
    case "reference":
      return "Reference work such as an encyclopedia or database.";
    default:
      return "Unclassified source.";
  }
}
