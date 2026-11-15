import { connection } from "next/server";
import { z } from "zod";
import { requireOpenAIKey } from "@/server/config/env";
import { handle, readJson } from "@/server/http";
import { listDecisions } from "@/server/repositories/decisions";
import { createDecisionFromQuestion } from "@/server/services/decisions";

export const maxDuration = 120;

export const GET = handle(async () => {
  await connection();
  return Response.json({ decisions: await listDecisions() });
});

const CreateBody = z.object({ question: z.string().trim().min(3, "Describe the decision in a few words.").max(2000) });

export const POST = handle(async (request: Request) => {
  const { question } = await readJson(request, CreateBody);
  requireOpenAIKey();
  const bundle = await createDecisionFromQuestion(question);
  return Response.json({ bundle }, { status: 201 });
});
