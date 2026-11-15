import { z } from "zod";
import type { PipelineEvent } from "@/lib/domain";
import { requireOpenAIKey } from "@/server/config/env";
import { HttpError, errorResponse, notFound } from "@/server/http";
import { startResearch } from "@/server/pipeline/research-pipeline";
import { getDecision } from "@/server/repositories/decisions";
import { activeRun } from "@/server/repositories/research";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ focus: z.string().trim().max(500).nullish() });

/**
 * Streams research progress as NDJSON. The pipeline runs independently of the
 * stream: if the client disconnects, research still completes and is saved.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const raw = await request.text();
    const body = raw.trim() ? Body.parse(JSON.parse(raw)) : {};
    requireOpenAIKey();
    if (!(await getDecision(id))) throw notFound("Decision");
    if (await activeRun(id)) throw new HttpError(409, "research_running", "Research is already running for this decision.");

    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const emit = (event: PipelineEvent) => {
      if (!controller) return;
      try {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch {
        controller = null; // client went away; research continues
      }
    };
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        startResearch({ decisionId: id, focus: body.focus ?? null, trigger: body.focus ? "user-focus" : "user", emit })
          .catch((err) => emit({ type: "error", message: err instanceof Error ? err.message : String(err) }))
          .finally(() => {
            try {
              controller?.close();
            } catch {
              /* already closed */
            }
            controller = null;
          });
      },
      cancel() {
        controller = null;
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
