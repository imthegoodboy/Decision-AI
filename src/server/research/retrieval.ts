import { Bm25Index, chunkText, cosine, type Passage } from "@/lib/text";

/**
 * Hybrid passage retrieval over the research pool: BM25 for exact terms
 * (model numbers, prices, units) plus optional dense embeddings for paraphrase.
 * Used to find the passage a claim rests on and passages in *other* sources
 * that corroborate or contradict it.
 */

export type Embedder = (texts: string[]) => Promise<number[][] | null>;

export type ScoredPassage = Passage & { score: number };

const MAX_PASSAGES_PER_SOURCE = 60;

export class PassageIndex {
  private readonly passages: Passage[];
  private readonly bm25: Bm25Index<Passage>;
  private vectors: Map<string, number[]> | null = null;

  constructor(docs: { sourceId: string; text: string }[]) {
    this.passages = docs.flatMap((d) => chunkText(d.sourceId, d.text).slice(0, MAX_PASSAGES_PER_SOURCE));
    this.bm25 = new Bm25Index(this.passages);
  }

  get size(): number {
    return this.passages.length;
  }

  forSource(sourceId: string): Passage[] {
    return this.passages.filter((p) => p.sourceId === sourceId);
  }

  get(id: string): Passage | undefined {
    return this.passages.find((p) => p.id === id);
  }

  /** Embeds all passages once. Safe to call when embeddings are disabled. */
  async enableDense(embedder: Embedder): Promise<boolean> {
    if (this.passages.length === 0) return false;
    const vecs = await embedder(this.passages.map((p) => p.text));
    if (!vecs || vecs.length !== this.passages.length) return false;
    this.vectors = new Map(this.passages.map((p, i) => [p.id, vecs[i]]));
    return true;
  }

  get dense(): boolean {
    return this.vectors !== null;
  }

  /**
   * Returns the top-k passages for `query`. When a query vector is supplied and
   * dense vectors exist, scores are a 50/50 blend of max-normalised BM25 and cosine.
   */
  search(
    query: string,
    opts: { k?: number; sourceId?: string; excludeSourceId?: string; queryVector?: number[] | null } = {},
  ): ScoredPassage[] {
    const k = opts.k ?? 4;
    const filter = (p: Passage) =>
      (opts.sourceId ? p.sourceId === opts.sourceId : true) &&
      (opts.excludeSourceId ? p.sourceId !== opts.excludeSourceId : true);

    const lexical = this.bm25.search(query, Math.max(k * 4, 20), filter);
    const maxLex = lexical[0]?.score ?? 0;
    const scores = new Map<string, number>();
    for (const r of lexical) scores.set(r.item.id, maxLex > 0 ? r.score / maxLex : 0);

    if (this.vectors && opts.queryVector) {
      const blended = new Map<string, number>();
      for (const p of this.passages) {
        if (!filter(p)) continue;
        const v = this.vectors.get(p.id);
        if (!v) continue;
        const dense = Math.max(0, cosine(opts.queryVector, v));
        blended.set(p.id, 0.5 * (scores.get(p.id) ?? 0) + 0.5 * dense);
      }
      return rank(blended, this.passages, k);
    }
    return rank(scores, this.passages, k);
  }
}

function rank(scores: Map<string, number>, passages: Passage[], k: number): ScoredPassage[] {
  const byId = new Map(passages.map((p) => [p.id, p]));
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, score]) => ({ ...byId.get(id)!, score }));
}
