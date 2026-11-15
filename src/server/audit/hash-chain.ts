import { createHash } from "node:crypto";

/**
 * Tamper-evident hash chain. Each event's hash commits to the previous hash,
 * its sequence number, type, canonical payload and timestamp, so editing,
 * deleting or reordering any stored event breaks every hash after it.
 */

export const GENESIS_HASH = "0".repeat(64);

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** JSON with recursively sorted keys and no undefined values — stable across runtimes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortDeep(v);
    }
    return out;
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export type ChainLink = {
  seq: number;
  type: string;
  payload: unknown;
  prevHash: string;
  hash: string;
  createdAt: string;
};

export function computeEventHash(link: Omit<ChainLink, "hash">): string {
  return sha256([link.prevHash, link.seq, link.type, canonicalJson(link.payload), link.createdAt].join("|"));
}

export type ChainCheck = {
  valid: boolean;
  checked: number;
  brokenAt: number | null;
  reason: string | null;
  headHash: string | null;
};

export function verifyChain(links: ChainLink[]): ChainCheck {
  const sorted = [...links].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  for (let i = 0; i < sorted.length; i++) {
    const link = sorted[i];
    if (link.seq !== i + 1) {
      return { valid: false, checked: i, brokenAt: link.seq, reason: `Expected event #${i + 1}, found #${link.seq} (missing or reordered event).`, headHash: null };
    }
    if (link.prevHash !== prev) {
      return { valid: false, checked: i, brokenAt: link.seq, reason: `Event #${link.seq} does not point to the previous event's hash.`, headHash: null };
    }
    const expected = computeEventHash(link);
    if (expected !== link.hash) {
      return { valid: false, checked: i, brokenAt: link.seq, reason: `Event #${link.seq} content does not match its recorded hash.`, headHash: null };
    }
    prev = link.hash;
  }
  return { valid: true, checked: sorted.length, brokenAt: null, reason: null, headHash: sorted.length ? prev : null };
}
