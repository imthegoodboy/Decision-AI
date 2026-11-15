import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type z } from "zod";
import { AIError } from "./ai/openai";
import { ConfigError } from "./config/env";

/** Consistent JSON error envelope for every route handler. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} was not found.`);

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return problem(err.status, err.code, err.message);
  if (err instanceof ZodError) {
    const detail = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return problem(400, "invalid_request", detail);
  }
  if (err instanceof ConfigError) return problem(503, "not_configured", err.message);
  if (err instanceof AIError) return problem(err.status, `ai_${err.code}`, err.message);
  console.error("[api] unexpected error", err);
  return problem(500, "internal_error", "Something went wrong on the server. Check the server logs for details.");
}

function problem(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return schema.parse(body);
}

/** Wraps a handler so thrown errors become JSON problems. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      // Let Next.js control-flow signals (e.g. prerender interruption from connection()) propagate.
      unstable_rethrow(err);
      return errorResponse(err);
    }
  };
}
