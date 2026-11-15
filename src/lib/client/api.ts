/**
 * Typed browser helpers for the Decision AI HTTP API.
 *
 * Every non-2xx response carries `{ error: { code, message } }`; it is turned into
 * an `ApiError` so components can show the server's own message and detect the
 * `not_configured` case (missing OPENAI_API_KEY).
 */
import type {
  AuditEvent,
  ChainVerification,
  Decision,
  DecisionBundle,
  DecisionSummary,
  Message,
  PipelineEvent,
  Source,
} from "@/lib/domain";

export type SystemInfo = {
  configured: boolean;
  keyValid?: boolean | null;
  models: { main: string; fast: string; embedding: string | null };
  search: string[];
  database: string;
  limits?: { maxSources: number; maxQueries: number };
  availableModels?: string[] | null;
};

export type MessageAction = "none" | "research" | "rerun" | "reweight";

export type MessageResponse = {
  messages: Message[];
  decision: Decision;
  action: MessageAction;
  focus?: string | null;
};

export type AuditResponse = { events: AuditEvent[]; verification: ChainVerification };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get notConfigured(): boolean {
    return this.code === "not_configured";
  }

  get notFound(): boolean {
    return this.status === 404 || this.code === "not_found";
  }
}

export function isNotConfigured(err: unknown): boolean {
  return err instanceof ApiError && err.notConfigured;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) {
    if (err.name === "AbortError") return "The request was cancelled.";
    if (err.message === "Failed to fetch") return "Could not reach the server. Is the dev server running?";
    return err.message;
  }
  return "Something went wrong.";
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`;
  let message = res.statusText || `Request failed with status ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    if (res.status === 404) message = "This endpoint is not available yet.";
  }
  return new ApiError(res.status, code, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit["body"] => JSON.stringify(body);

export const api = {
  system: (withModels = false) => request<SystemInfo>(withModels ? "/api/system?models=1" : "/api/system"),

  listDecisions: () => request<{ decisions: DecisionSummary[] }>("/api/decisions"),

  createDecision: (question: string) =>
    request<{ bundle: DecisionBundle }>("/api/decisions", { method: "POST", body: json({ question }) }),

  getDecision: (id: string, signal?: AbortSignal) =>
    request<{ bundle: DecisionBundle }>(`/api/decisions/${encodeURIComponent(id)}`, { signal }),

  deleteDecision: (id: string) =>
    request<{ ok: true }>(`/api/decisions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  sendMessage: (id: string, content: string) =>
    request<MessageResponse>(`/api/decisions/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: json({ content }),
    }),

  putWeights: (id: string, weights: Record<string, number>) =>
    request<{ decision: Decision }>(`/api/decisions/${encodeURIComponent(id)}/weights`, {
      method: "PUT",
      body: json({ weights }),
    }),

  audit: (id: string) => request<AuditResponse>(`/api/decisions/${encodeURIComponent(id)}/audit`),

  sourceText: (id: string, sourceId: string) =>
    request<{ source: Source; text: string }>(
      `/api/decisions/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`,
    ),

  reportUrl: (id: string) => `/api/decisions/${encodeURIComponent(id)}/report`,
};

/**
 * Starts a research run and calls `onEvent` for every NDJSON line the server
 * streams. Resolves when the stream ends; rejects with an ApiError if the run
 * could not be started.
 */
export async function streamResearch(
  id: string,
  focus: string | null | undefined,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/decisions/${encodeURIComponent(id)}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(focus ? { focus } : {}),
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(500, "no_stream", "The server did not return a progress stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed) as PipelineEvent);
    } catch {
      // Ignore malformed lines rather than abort the whole run view.
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      flush(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  flush(buffer);
}
