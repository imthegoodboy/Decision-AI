import "server-only";
import type { DecisionOption, OptionImage, Source } from "@/lib/domain";
import { searchImages } from "./search";

/**
 * Finds a representative image for each option, in order of preference:
 *  1. an image search result (when a search provider with image search is configured);
 *  2. the og:image of the option's official page, or of a source that discusses it;
 *  3. the Wikipedia page image for the option name (no key required).
 */
export async function resolveOptionImage(option: DecisionOption, sources: Source[], signal?: AbortSignal): Promise<OptionImage | null> {
  const hits = await searchImages(option.name, { limit: 3, signal }).catch(() => []);
  const first = hits.find((h) => /^https:\/\//.test(h.url));
  if (first) return { url: first.url, alt: option.name, sourceUrl: first.sourceUrl, origin: "search" };

  const related = sources.filter((s) => option.sourceIds.includes(s.id) && s.image);
  const official = related.find((s) => s.kind === "official" || (option.officialUrl && s.url.startsWith(option.officialUrl)));
  const page = official ?? related.find((s) => s.title.toLowerCase().includes(option.name.toLowerCase().split(" ")[0]));
  if (page?.image) return { url: page.image, alt: option.name, sourceUrl: page.url, origin: "page" };

  return wikipediaImage(option.name, signal);
}

async function wikipediaImage(name: string, signal?: AbortSignal): Promise<OptionImage | null> {
  try {
    const search = new URL("https://en.wikipedia.org/w/api.php");
    search.searchParams.set("action", "query");
    search.searchParams.set("list", "search");
    search.searchParams.set("srsearch", name);
    search.searchParams.set("srlimit", "1");
    search.searchParams.set("format", "json");
    const res = await fetch(search, { signal, headers: { "user-agent": "DecisionAI/1.0 (research prototype)" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { query?: { search?: { title: string }[] } };
    const title = data.query?.search?.[0]?.title;
    if (!title) return null;
    // Guard against unrelated pages: the article must name the same brand AND every model
    // number in the option (e.g. "K13", "A07", "450X"), otherwise we would show a different product.
    const lowerTitle = title.toLowerCase();
    const tokens = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const modelTokens = tokens.filter((t) => /\d/.test(t) && !/^\d+g$/.test(t));
    const wordTokens = tokens.filter((t) => !/\d/.test(t) && t.length > 2);
    if (!wordTokens.some((t) => lowerTitle.includes(t))) return null;
    if (!modelTokens.every((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(lowerTitle))) return null;
    const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      signal,
      headers: { "user-agent": "DecisionAI/1.0 (research prototype)" },
    });
    if (!summary.ok) return null;
    const s = (await summary.json()) as { thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } };
    if (!s.thumbnail?.source) return null;
    return { url: s.thumbnail.source, alt: title, sourceUrl: s.content_urls?.desktop?.page ?? null, origin: "wikipedia" };
  } catch {
    return null;
  }
}
