import "server-only";

/**
 * Append-only list of schema migrations. Never edit a shipped migration; add a
 * new version instead. Applied automatically on first connection.
 */
export const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE decisions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        profile TEXT NOT NULL,
        weights TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        meta TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX messages_decision ON messages(decision_id, created_at)`,
      `CREATE TABLE research_runs (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        focus TEXT,
        plan TEXT,
        dossier TEXT,
        dossier_hash TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(decision_id, version)
      )`,
      `CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
        decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        data TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        content_hash TEXT NOT NULL,
        retrieved_at TEXT NOT NULL
      )`,
      `CREATE INDEX sources_run ON sources(run_id)`,
      `CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(decision_id, seq)
      )`,
      `CREATE TABLE evaluations (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )`,
    ],
  },
];
