import * as cheerio from "cheerio";

/**
 * Turns raw HTML into readable text plus provenance metadata. Deterministic and
 * dependency-light so it runs in route handlers and in the evaluation harness.
 */

export type ExtractedPage = {
  title: string;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  canonicalUrl: string | null;
  text: string;
  wordCount: number;
};

const NOISE = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "form",
  "nav",
  "footer",
  "header",
  "aside",
  "button",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  "[aria-hidden=true]",
  ".cookie",
  ".cookies",
  ".newsletter",
  ".advert",
  ".ads",
  ".share",
  ".social",
  ".related",
  ".comments",
  "#comments",
];

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const meta = (selector: string) => $(selector).attr("content")?.trim() || null;
  const abs = (href: string | null | undefined) => {
    if (!href) return null;
    try {
      const u = new URL(href, pageUrl);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  };

  const jsonLd = readJsonLd($);
  const title =
    meta('meta[property="og:title"]') ??
    $("title").first().text().trim() ??
    $("h1").first().text().trim() ??
    pageUrl;
  const publishedAt = normalizeDate(
    meta('meta[property="article:published_time"]') ??
      meta('meta[name="date"]') ??
      meta('meta[name="publish-date"]') ??
      meta('meta[itemprop="datePublished"]') ??
      jsonLd.datePublished ??
      $("time[datetime]").first().attr("datetime") ??
      meta('meta[property="article:modified_time"]') ??
      jsonLd.dateModified ??
      null,
  );
  const author =
    meta('meta[name="author"]') ?? meta('meta[property="article:author"]') ?? jsonLd.author ?? null;

  const image = abs(meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]') ?? jsonLd.image);
  const favicon =
    abs($('link[rel="icon"]').attr("href") ?? $('link[rel="shortcut icon"]').attr("href") ?? $('link[rel="apple-touch-icon"]').attr("href")) ??
    abs("/favicon.ico");

  $(NOISE.join(",")).remove();
  const root = pickMainRoot($);
  const blocks: string[] = [];
  root.find("h1,h2,h3,h4,p,li,td,th,blockquote,pre,dd,dt,figcaption").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    // Avoid duplicating text of list items that contain paragraphs.
    if (tag === "li" && $(el).find("p").length > 0) return;
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length < 2) return;
    if (tag && /^h[1-4]$/.test(tag)) blocks.push(`\n${t}`);
    else if (tag === "li") blocks.push(`• ${t}`);
    else blocks.push(t);
  });

  let text = dedupeLines(blocks).join("\n").trim();
  if (text.split(/\s+/).length < 60) {
    // Fallback for pages without semantic markup.
    text = root.text().replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  }

  return {
    title: cleanTitle(title || pageUrl),
    siteName: meta('meta[property="og:site_name"]') ?? jsonLd.publisher ?? null,
    author: author && author.length < 120 && !/^https?:/.test(author) ? author : null,
    publishedAt,
    description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
    image,
    favicon,
    canonicalUrl: abs($('link[rel="canonical"]').attr("href")),
    text,
    wordCount: text ? text.split(/\s+/).length : 0,
  };
}

function pickMainRoot($: cheerio.CheerioAPI) {
  for (const sel of ["article", "main", "[role=main]", "#content", ".content", ".post", ".entry-content"]) {
    const el = $(sel).first();
    if (el.length && el.text().trim().split(/\s+/).length > 150) return el;
  }
  return $("body").length ? $("body") : $.root();
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 300);
}

type JsonLdInfo = {
  datePublished: string | null;
  dateModified: string | null;
  author: string | null;
  publisher: string | null;
  image: string | null;
};

function readJsonLd($: cheerio.CheerioAPI): JsonLdInfo {
  const info: JsonLdInfo = { datePublished: null, dateModified: null, author: null, publisher: null, image: null };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const nodes: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as Record<string, unknown>;
        info.datePublished ??= typeof n.datePublished === "string" ? n.datePublished : null;
        info.dateModified ??= typeof n.dateModified === "string" ? n.dateModified : null;
        info.author ??= nameOf(n.author);
        info.publisher ??= nameOf(n.publisher);
        info.image ??= typeof n.image === "string" ? n.image : nameOf(n.image, "url");
      }
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });
  return info;
}

function nameOf(value: unknown, key = "name"): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return nameOf(value[0], key);
  if (typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string") {
    return (value as Record<string, string>)[key];
  }
  return null;
}

export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // Reject obviously wrong dates (future or before the web existed).
  if (d.getTime() > Date.now() + 86_400_000 * 2 || d.getUTCFullYear() < 1995) return null;
  return d.toISOString();
}
