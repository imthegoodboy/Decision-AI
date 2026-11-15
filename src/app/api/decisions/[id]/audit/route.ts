import { connection } from "next/server";
import { listAudit, verifyAudit } from "@/server/audit/log";
import { handle, notFound } from "@/server/http";
import { getDecision } from "@/server/repositories/decisions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await connection();
  const { id } = await ctx.params;
  if (!(await getDecision(id))) throw notFound("Decision");
  const [events, verification] = await Promise.all([listAudit(id), verifyAudit(id)]);
  return Response.json({ events, verification });
});
