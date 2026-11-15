import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Short, URL-safe, prefixed id, e.g. `src_k3j9x2ab`. */
export function makeId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return `${prefix}_${id}`;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Undated";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", ...opts });
}

export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "unknown date";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown date";
  const diff = (now.getTime() - t) / 1000;
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [86400 * 30, "day"],
    [86400 * 365, "month"],
    [Infinity, "year"],
  ];
  const divisors: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    month: 86400 * 30,
    year: 86400 * 365,
  };
  const unit = units.find(([limit]) => abs < limit)![1];
  const value = Math.round(diff / divisors[unit]);
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-value, unit);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
