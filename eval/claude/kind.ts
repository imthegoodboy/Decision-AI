import type { SourceKind } from "@/lib/domain";

/** Transparent, URL-based source type heuristic (no model involved). */
export function kindOf(url: string, title: string): SourceKind {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const t = title.toLowerCase();
  if (/\.gov(\.[a-z]{2})?$|\.gov\.|\.nic\.in$|gov\.uk$/.test(host)) return "government";
  if (/\.edu$|\.ac\.[a-z]{2}$|arxiv\.org|doi\.org|nature\.com|sciencedirect|springer|ncbi\.nlm/.test(host)) return "academic";
  if (/wikipedia\.org|britannica\.com|investopedia\.com/.test(host)) return "reference";
  if (/reddit\.com|quora\.com|stackexchange|forum|community\.|discuss/.test(host)) return "forum";
  if (/amazon\.|flipkart\.|bestbuy\.|walmart\.|ebay\.|croma\.|reliancedigital|currys\.co\.uk|argos\.co\.uk|smartprix|mysmartprice/.test(host)) return "retailer";
  if (/youtube\.com|vimeo\.com/.test(host)) return "video";
  if (/rtings|wirecutter|cnet|pcmag|techradar|tomsguide|theverge|engadget|zdnet|consumerreports|which\.co\.uk|gsmarena|gadgets360|91mobiles|digit\.in|nerdwallet|bankrate|forbes\.com|wired|androidauthority|dcrainmaker|electrek|bicycling|security\.org|cybernews|pcworld|whathifi|expertreviews|soundguys|trustedreviews|notebookcheck|autocarindia|rushlane|bikedekho|carwale|zigwheels|electricbikereport|comparitech|cyberinsider|mybanktracker|livescience|popsci|tomshardware|wareable|beebom|smartprix|91wheels/.test(host)) return "independent-review";
  if (/news|times|guardian|bbc|reuters|cnbc|bloomberg|hindustantimes|indianexpress|economictimes|livemint|ndtv/.test(host)) return "news";
  if (/blog|medium\.com|substack/.test(host) || /blog/.test(t)) return "blog";
  return "other";
}

