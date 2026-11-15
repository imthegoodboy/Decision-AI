import "server-only";
import { z } from "zod";
import type { DecisionProfile, ResearchPlan } from "@/lib/domain";
import { truncate } from "@/lib/text";
import { structured } from "../ai/openai";
import { EVIDENCE_RULES, block } from "./prompts";

const OptionsOutput = z.object({
  options: z.array(
    z.object({
      name: z.string().describe("Canonical option name, e.g. 'Samsung Galaxy A35 5G' or 'University of Edinburgh'"),
      summary: z.string().describe("One sentence on what it is and why it is a candidate, from the sources"),
      officialUrl: z.string().nullable().describe("Official page URL if one of the sources is official for it"),
      priceText: z.string().nullable().describe("Price or cost as stated in a source, with currency, else null"),
      sourceIds: z.array(z.string()).describe("Ids of sources that discuss this option"),
      userNamed: z.boolean(),
      fitsConstraints: z.boolean().describe("False if sources show it violates a hard constraint such as budget"),
    }),
  ),
  excluded: z.array(z.object({ name: z.string(), reason: z.string() })),
});

export type IdentifiedOption = z.infer<typeof OptionsOutput>["options"][number];

export async function identifyOptions(input: {
  question: string;
  profile: DecisionProfile;
  plan: ResearchPlan;
  sources: { id: string; title: string; url: string; text: string }[];
  maxOptions?: number;
  signal?: AbortSignal;
}): Promise<{ options: IdentifiedOption[]; excluded: { name: string; reason: string }[] }> {
  const max = input.maxOptions ?? 5;
  const out = await structured({
    tier: "main",
    name: "candidate_options",
    schema: OptionsOutput,
    signal: input.signal,
    system: [
      "You identify the candidate options for a decision from research sources.",
      `Return the ${max} strongest candidates that the sources actually discuss (fewer if the sources support fewer).`,
      "Always include options the user explicitly named (userNamed true), even if they fit poorly; mark fitsConstraints honestly.",
      "Use one canonical name per option and merge variants of the same product or institution.",
      "Put candidates you rejected (e.g. over budget, discontinued) in excluded with the reason.",
      EVIDENCE_RULES,
    ].join("\n"),
    input: [
      `Decision: ${input.question}`,
      `User profile: ${JSON.stringify(input.profile)}`,
      `Criteria: ${input.plan.criteria.map((c) => c.name).join(", ")}`,
      "",
      ...input.sources.map((s) => block(s.id, `${s.title} — ${s.url}`, truncate(s.text, 2200))),
    ].join("\n"),
  });
  const validIds = new Set(input.sources.map((s) => s.id));
  const options = out.options
    .map((o) => ({ ...o, sourceIds: o.sourceIds.filter((id) => validIds.has(id)) }))
    .sort((a, b) => Number(b.userNamed) - Number(a.userNamed) || Number(b.fitsConstraints) - Number(a.fitsConstraints))
    .slice(0, Math.max(max, out.options.filter((o) => o.userNamed).length));
  return { options, excluded: out.excluded };
}
