import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { setWeights } from "@/server/services/decisions";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ weights: z.record(z.string(), z.number().min(0).max(100)) });

export const PUT = handle(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { weights } = await readJson(request, Body);
  return Response.json({ decision: await setWeights(id, weights) });
});
