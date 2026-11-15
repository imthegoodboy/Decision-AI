import { connection } from "next/server";
import { handle } from "@/server/http";
import { loadBundle } from "@/server/services/decisions";
import { renderReport } from "@/server/services/report";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await connection();
  const { id } = await ctx.params;
  const bundle = await loadBundle(id);
  const markdown = await renderReport(bundle);
  const slug = bundle.decision.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "decision";
  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.md"`,
    },
  });
});
