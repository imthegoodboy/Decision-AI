import { connection } from "next/server";
import { handle, notFound } from "@/server/http";
import { deleteDecision } from "@/server/repositories/decisions";
import { loadBundle } from "@/server/services/decisions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await connection();
  const { id } = await ctx.params;
  return Response.json({ bundle: await loadBundle(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await deleteDecision(id))) throw notFound("Decision");
  return Response.json({ ok: true });
});
