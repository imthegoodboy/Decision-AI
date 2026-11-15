import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA } from "./config";

/** Tiny JSON cache so every experiment step is resumable and auditable on disk. */

export function dataPath(...parts: string[]): string {
  return path.join(DATA, ...parts);
}

export function readCache<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeCache(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function cached<T>(file: string, compute: () => Promise<T>): Promise<T> {
  const hit = readCache<T>(file);
  if (hit !== null) return hit;
  const value = await compute();
  writeCache(file, value);
  return value;
}

/** Deterministic 32-bit hash for seeding per-question choices. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
