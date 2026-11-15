import "server-only";
import { z } from "zod";
import { SourceKind } from "@/lib/domain";
import { truncate } from "@/lib/text";
import { structured } from "../ai/openai";
import { block } from "./prompts";

/** Classifies each source's type and perspective. Reliability itself is computed in code. */

const Classification = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      kind: SourceKind,
      publisher: z.string().nullable().describe("Publisher or site name if evident"),
      perspective: z
        .string()
        .describe("One short sentence on the source's standpoint or incentives, e.g. 'Manufacturer's own product page'"),
    }),
  ),
});

export type SourceForClassification = { id: string; url: string; title: string; excerpt: string };

export async function classifySources(sources: SourceForClassification[], signal?: AbortSignal) {
  if (sources.length === 0) return new Map<string, z.infer<typeof Classification>["sources"][number]>();
  const out = await structured({
    tier: "fast",
    name: "source_classification",
    schema: Classification,
    signal,
    system: [
      "Classify web sources used as evidence. For each id return its kind:",
      "official (maker, institution or company describing itself), independent-review (testing or review outlet),",
      "news, retailer (store or marketplace listing), forum (user discussion, Q&A, Reddit), reference (encyclopedia, database),",
      "academic, government, blog (personal or marketing blog, affiliate listicle), video, other.",
      "Judge from URL, title and excerpt only. Return every id exactly once.",
    ].join("\n"),
    input: sources
      .map((s) => block(s.id, `${s.title} — ${s.url}`, truncate(s.excerpt, 600)))
      .join("\n\n"),
  });
  return new Map(out.sources.map((s) => [s.id, s]));
}
