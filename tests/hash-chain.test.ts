import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  canonicalJson,
  computeEventHash,
  verifyChain,
  type ChainLink,
} from "@/server/audit/hash-chain";

function buildChain(payloads: unknown[]): ChainLink[] {
  const links: ChainLink[] = [];
  let prev = GENESIS_HASH;
  payloads.forEach((payload, i) => {
    const base = { seq: i + 1, type: "test.event", payload, prevHash: prev, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` };
    const hash = computeEventHash(base);
    links.push({ ...base, hash });
    prev = hash;
  });
  return links;
}

describe("canonicalJson", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }),
    );
  });
  it("drops undefined values", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("verifyChain", () => {
  it("accepts an untouched chain", () => {
    const chain = buildChain([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const res = verifyChain(chain);
    expect(res.valid).toBe(true);
    expect(res.checked).toBe(3);
    expect(res.headHash).toBe(chain[2].hash);
  });

  it("detects an edited payload", () => {
    const chain = buildChain([{ a: 1 }, { b: 2 }, { c: 3 }]);
    chain[1] = { ...chain[1], payload: { b: 999 } };
    const res = verifyChain(chain);
    expect(res.valid).toBe(false);
    expect(res.brokenAt).toBe(2);
  });

  it("detects a deleted event", () => {
    const chain = buildChain([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const res = verifyChain([chain[0], chain[2]]);
    expect(res.valid).toBe(false);
    expect(res.brokenAt).toBe(3);
  });

  it("detects a rewritten hash", () => {
    const chain = buildChain([{ a: 1 }, { b: 2 }]);
    chain[0] = { ...chain[0], payload: { a: 2 } };
    chain[0] = { ...chain[0], hash: computeEventHash(chain[0]) };
    const res = verifyChain(chain);
    expect(res.valid).toBe(false);
    expect(res.brokenAt).toBe(2);
  });

  it("treats an empty log as valid", () => {
    expect(verifyChain([]).valid).toBe(true);
  });
});
