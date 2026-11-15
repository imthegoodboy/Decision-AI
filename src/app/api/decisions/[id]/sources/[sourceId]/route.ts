import { connection } from "next/server";
import { handle, notFound } from "@/server/http";
import { getSourceText } from "@/server/repositories/research";

type Ctx = { params: Promise<{ id: string; sourceId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await connection();
  const { id, sourceId } = await ctx.params;
  const found = await getSourceText(sourceId);
  if (!found || found.source.decisionId !== id) throw notFound("Source");
  return Response.json(found);
});
