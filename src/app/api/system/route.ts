import { connection } from "next/server";
import { listModels } from "@/server/ai/openai";
import { env, searchProviderOrder } from "@/server/config/env";
import { handle } from "@/server/http";

export const GET = handle(async (request: Request) => {
  await connection();
  const e = env();
  const configured = Boolean(e.OPENAI_API_KEY);
  const includeModels = new URL(request.url).searchParams.get("models") === "1";
  let availableModels: string[] | null = null;
  let keyValid: boolean | null = null;
  if (configured && includeModels) {
    try {
      availableModels = await listModels();
      keyValid = true;
    } catch {
      keyValid = false;
    }
  }
  return Response.json({
    configured,
    keyValid,
    models: { main: e.OPENAI_MODEL, fast: e.OPENAI_FAST_MODEL, embedding: e.OPENAI_EMBEDDING_MODEL },
    search: searchProviderOrder(),
    database: e.DATABASE_URL.startsWith("file:") ? "Local file (libSQL)" : "Remote libSQL",
    limits: { maxSources: e.RESEARCH_MAX_SOURCES, maxQueries: e.RESEARCH_MAX_QUERIES },
    availableModels,
  });
});
