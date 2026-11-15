/**
 * Text utilities used by verification: normalisation, tokenisation, verbatim
 * quote location, passage chunking and BM25 ranking. Pure and deterministic.
 */

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have he her his i in into is it its of on or our " +
    "she so that the their them then there these they this to was we were what when which who " +
    "will with you your than can could would should may might do does did not no yes also just very"
  ).split(" "),
);

/** Lower-cases and folds typography so that quotes copied by a model still match the page. */
export function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/[^\p{L}\p{N}.%₹$€£¥'\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string, { keepStopwords = false } = {}): string[] {
  const tokens = normalize(input)
    .split(" ")
    .map((t) => t.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean);
  return keepStopwords ? tokens : tokens.filter((t) => !STOPWORDS.has(t));
}

export type QuoteMatch = {
  found: boolean;
  similarity: number;
  /** Approximate character offset of the best window in the normalised haystack. */
  offset: number;
};

/**
 * Locates `quote` inside `haystack`. An exact normalised substring scores 1.
 * Otherwise a sliding window the size of the quote is compared token by token
 * (order-insensitive F1 over the window), which tolerates small edits such as
 * dropped punctuation, ellipses or a changed word.
 */
export function locateQuote(haystack: string, quote: string, threshold = 0.82): QuoteMatch {
  const h = normalize(haystack);
  const q = normalize(quote);
  if (!q) return { found: false, similarity: 0, offset: -1 };
  const exact = h.indexOf(q);
  if (exact >= 0) return { found: true, similarity: 1, offset: exact };

  const hTokens = h.split(" ");
  const qTokens = q.split(" ");
  const n = qTokens.length;
  if (n === 0 || hTokens.length === 0) return { found: false, similarity: 0, offset: -1 };

  const qCounts = countTokens(qTokens);
  const window = Math.min(n, hTokens.length);
  const wCounts = countTokens(hTokens.slice(0, window));
  let best = 0;
  let bestStart = 0;

  const score = () => {
    let overlap = 0;
    for (const [tok, c] of qCounts) overlap += Math.min(c, wCounts.get(tok) ?? 0);
    const precision = overlap / window;
    const recall = overlap / n;
    return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  };

  best = score();
  for (let start = 1; start + window <= hTokens.length; start++) {
    const out = hTokens[start - 1];
    const inn = hTokens[start + window - 1];
    wCounts.set(out, (wCounts.get(out) ?? 1) - 1);
    wCounts.set(inn, (wCounts.get(inn) ?? 0) + 1);
    // Cheap pre-check: only score windows that end on a quote token.
    if (!qCounts.has(inn) && !qCounts.has(hTokens[start])) continue;
    const s = score();
    if (s > best) {
      best = s;
      bestStart = start;
      if (best === 1) break;
    }
  }

  const offset = hTokens.slice(0, bestStart).join(" ").length;
  return { found: best >= threshold, similarity: round(best, 3), offset };
}

function countTokens(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/* ───────────────────────────── Chunking ───────────────────────────── */

export type Passage = { id: string; sourceId: string; index: number; text: string };

/**
 * Splits extracted page text into overlapping passages of roughly `targetWords`.
 * Paragraph boundaries are respected where possible so that a passage reads as a
 * coherent excerpt when shown to the user. Deterministic, so passage ids are stable.
 */
export function chunkText(
  sourceId: string,
  text: string,
  { targetWords = 140, overlapWords = 30 }: { targetWords?: number; overlapWords?: number } = {},
): Passage[] {
  const paragraphs = text
    .split(/\n{1,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  const passages: Passage[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    passages.push({
      id: `${sourceId}#${passages.length}`,
      sourceId,
      index: passages.length,
      text: buffer.join(" "),
    });
    buffer = overlapWords > 0 ? buffer.slice(-overlapWords) : [];
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    for (const word of words) {
      buffer.push(word);
      if (buffer.length >= targetWords) flush();
    }
    // Close a passage at a paragraph boundary once it is reasonably full.
    if (buffer.length >= targetWords * 0.6) flush();
  }
  if (buffer.length > overlapWords || passages.length === 0) {
    passages.push({
      id: `${sourceId}#${passages.length}`,
      sourceId,
      index: passages.length,
      text: buffer.join(" "),
    });
  }
  return passages.filter((p) => p.text.trim().length > 0);
}

/* ───────────────────────────── BM25 ───────────────────────────── */

export class Bm25Index<T extends { text: string }> {
  private readonly docs: { item: T; tf: Map<string, number>; length: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(
    items: T[],
    private readonly k1 = 1.4,
    private readonly b = 0.75,
  ) {
    this.docs = items.map((item) => {
      const tokens = tokenize(item.text);
      const tf = countTokens(tokens);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { item, tf, length: tokens.length };
    });
    this.avgLength = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, limit = 5, filter?: (item: T) => boolean): { item: T; score: number }[] {
    const qTokens = [...new Set(tokenize(query))];
    const N = this.docs.length;
    const results: { item: T; score: number }[] = [];
    for (const doc of this.docs) {
      if (filter && !filter(doc.item)) continue;
      let score = 0;
      for (const t of qTokens) {
        const f = doc.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLength)));
      }
      if (score > 0) results.push({ item: doc.item, score });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.5 ? lastSpace : max).trimEnd()}…`;
}
