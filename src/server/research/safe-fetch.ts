import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Fetches public web pages for research. Blocks private, loopback and
 * link-local targets (SSRF), enforces a timeout and a byte cap, and only
 * accepts HTML or plain text.
 */

export class FetchBlockedError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 DecisionAI-Research/1.0";

const MAX_BYTES = 2_500_000;

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:127.");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError(`Unsupported protocol: ${url.protocol}`);
  if (url.username || url.password) throw new FetchBlockedError("Credentials in URL are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new FetchBlockedError(`Blocked host: ${host}`);
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new FetchBlockedError(`Blocked private address for ${host}`);
  return url;
}

export type FetchedPage = { url: string; finalUrl: string; contentType: string; body: string; status: number };

export async function fetchPage(raw: string, timeoutMs: number, signal?: AbortSignal): Promise<FetchedPage> {
  let current = await assertPublicUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    // Follow redirects manually so every hop is checked against the SSRF guard.
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "accept-language": "en;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = await assertPublicUrl(new URL(res.headers.get("location")!, current).toString());
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
      }
      const body = await readCapped(res, MAX_BYTES);
      return { url: raw, finalUrl: current.toString(), contentType, body, status: res.status };
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c.subarray(0, Math.min(c.byteLength, total - offset)), offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}
