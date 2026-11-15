import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client, type InValue } from "@libsql/client";
import { env } from "../config/env";
import { MIGRATIONS } from "./migrations";

/**
 * libSQL connection shared across hot reloads. Local `file:` URLs get their
 * directory created automatically; remote `libsql://` URLs use the auth token.
 * Migrations are idempotent and run once per process on first use.
 */

const g = globalThis as unknown as { __db?: Promise<Client> };

export function db(): Promise<Client> {
  if (!g.__db) {
    g.__db = connect().catch((err) => {
      g.__db = undefined;
      throw err;
    });
  }
  return g.__db;
}

async function connect(): Promise<Client> {
  const { DATABASE_URL, DATABASE_AUTH_TOKEN } = env();
  if (DATABASE_URL.startsWith("file:")) {
    const filePath = DATABASE_URL.slice("file:".length);
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });
  if (DATABASE_URL.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(client);
  return client;
}

async function migrate(client: Client) {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = await client.execute("SELECT version FROM schema_migrations");
  const done = new Set(applied.rows.map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await client.batch(
      [
        ...m.statements,
        {
          sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
          args: [m.version, new Date().toISOString()],
        },
      ],
      "write",
    );
  }
}

export type Row = Record<string, unknown>;

export async function query<T extends Row = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await (await db()).execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function queryOne<T extends Row = Row>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] ?? null;
}

export async function execute(sql: string, args: InValue[] = []): Promise<number> {
  const res = await (await db()).execute({ sql, args });
  return res.rowsAffected;
}

export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
