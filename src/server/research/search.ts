import "server-only";
import { webSearch } from "../ai/openai";
import { env, searchProviderOrder, type SearchProviderName } from "../config/env";

/**
 * Pluggable web search. `auto` mode tries dedicated search APIs first (when keys
 * are configured) and falls back to OpenAI's hosted web search, so the system
 * works with a single OpenAI key and improves with more providers.
 */

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
  provider: string;
};

export type ImageHit = { url: string; sourceUrl: string | null; title: string };

type Provider = {
  name: SearchProviderName;
  search(query: string, opts: { region: string | null; limit: number; signal?: AbortSignal }): Promise<SearchHit[]>;
  images?(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<ImageHit[]>;
};

const tavily: Provider = {
  name: "tavily",
  async search(query, { limit, signal }) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env().TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: limit, search_depth: "advanced", include_answer: false }),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const data = (await res.json()) as { results?: { url: string; title: string; content: string; published_date?: string }[] };
    return (data.results ?? []).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content,
      publishedAt: r.published_date ?? null,
      provider: "tavily" as const,
    }));
  },
  async images(query, { limit, signal }) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env().TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: 3, include_images: true }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { images?: (string | { url: string })[] };
    return (data.images ?? []).slice(0, limit).map((i) => ({ url: typeof i === "string" ? i : i.url, sourceUrl: null, title: query }));
  },
};

const brave: Provider = {
  name: "brave",
  async search(query, { limit, signal }) {
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.searchParams.set("q", query);
    u.searchParams.set("count", String(limit));
    const res = await fetch(u, { signal, headers: { accept: "application/json", "x-subscription-token": env().BRAVE_API_KEY! } });
    if (!res.ok) throw new Error(`Brave ${res.status}`);
    const data = (await res.json()) as { web?: { results?: { url: string; title: string; description: string; page_age?: string }[] } };
    return (data.web?.results ?? []).map((r) => ({
      url: r.url,
      title: stripTags(r.title),
      snippet: stripTags(r.description),
      publishedAt: r.page_age ?? null,
      provider: "brave" as const,
    }));
  },
  async images(query, { limit, signal }) {
    const u = new URL("https://api.search.brave.com/res/v1/images/search");
    u.searchParams.set("q", query);
    u.searchParams.set("count", String(limit));
    const res = await fetch(u, { signal, headers: { accept: "application/json", "x-subscription-token": env().BRAVE_API_KEY! } });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: { url: string; title: string; properties?: { url?: string } }[] };
    return (data.results ?? []).map((r) => ({ url: r.properties?.url ?? r.url, sourceUrl: r.url, title: r.title }));
  },
};

const serper: Provider = {
  name: "serper",
  async search(query, { limit, region, signal }) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": env().SERPER_API_KEY! },
      body: JSON.stringify({ q: query, num: limit, ...(region ? { gl: region.slice(0, 2).toLowerCase() } : {}) }),
    });
    if (!res.ok) throw new Error(`Serper ${res.status}`);
    const data = (await res.json()) as { organic?: { link: string; title: string; snippet: string; date?: string }[] };
    return (data.organic ?? []).map((r) => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet,
      publishedAt: r.date ?? null,
      provider: "serper" as const,
    }));
  },
  async images(query, { limit, signal }) {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": env().SERPER_API_KEY! },
      body: JSON.stringify({ q: query, num: limit }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { images?: { imageUrl: string; link: string; title: string }[] };
    return (data.images ?? []).map((r) => ({ url: r.imageUrl, sourceUrl: r.link, title: r.title }));
  },
};

const openai: Provider = {
  name: "openai",
  async search(query, { region, limit, signal }) {
    const hits = await webSearch(query, { region, signal });
    return hits.slice(0, limit).map((h) => ({ ...h, publishedAt: null, provider: "openai" as const }));
  },
};

const duckduckgo: Provider = {
  name: "duckduckgo",
  async search(query, { limit, signal }) {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      },
      body: new URLSearchParams({ q: query }).toString(),
    });
    if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
    const html = await res.text();
    const hits: SearchHit[] = [];
    const blocks = html.split(/class="[^"]*\bresult__body\b[^"]*"/).slice(1);
    for (const block of blocks) {
      const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) continue;
      let url = decodeEntities(link[1]);
      const redirect = url.match(/[?&]uddg=([^&]+)/);
      if (redirect) url = decodeURIComponent(redirect[1]);
      if (url.startsWith("//")) url = `https:${url}`;
      if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
      const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      hits.push({
        url,
        title: decodeEntities(stripTags(link[2])).trim(),
        snippet: snippet ? decodeEntities(stripTags(snippet[1])).trim() : "",
        publishedAt: null,
        provider: "duckduckgo",
      });
      if (hits.length >= limit) break;
    }
    return hits;
  },
};

const PROVIDERS: Record<SearchProviderName, Provider> = { tavily, brave, serper, openai, duckduckgo };

export function activeProviders(): SearchProviderName[] {
  return searchProviderOrder();
}

/** Searches with the first provider that succeeds, falling back down the configured order. */
export async function search(
  query: string,
  opts: { region?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<{ hits: SearchHit[]; provider: SearchProviderName | null; errors: string[] }> {
  const errors: string[] = [];
  for (const name of searchProviderOrder()) {
    try {
      const hits = await PROVIDERS[name].search(query, {
        region: opts.region ?? null,
        limit: opts.limit ?? 8,
        signal: opts.signal,
      });
      if (hits.length > 0) return { hits, provider: name, errors };
      errors.push(`${name}: no results`);
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { hits: [], provider: null, errors };
}

/** Image search through the first configured provider that supports it. */
export async function searchImages(query: string, opts: { limit?: number; signal?: AbortSignal } = {}): Promise<ImageHit[]> {
  for (const name of searchProviderOrder()) {
    const p = PROVIDERS[name];
    if (!p.images) continue;
    try {
      const hits = await p.images(query, { limit: opts.limit ?? 4, signal: opts.signal });
      if (hits.length) return hits;
    } catch {
      /* try next provider */
    }
  }
  return [];
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
