import { z } from "zod";
import { requireOpenAIKey } from "@/server/config/env";
import { handle, readJson } from "@/server/http";
import { handleUserMessage } from "@/server/services/decisions";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ content: z.string().trim().min(1).max(4000) });

export const POST = handle(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { content } = await readJson(request, Body);
  requireOpenAIKey();
  return Response.json(await handleUserMessage(id, content));
});
