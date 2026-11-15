/** Offline smoke test of the fetch → extract → chunk path (no API key needed). */
import { extractPage } from "@/server/research/extract";
import { fetchPage } from "@/server/research/safe-fetch";
import { chunkText, locateQuote } from "@/lib/text";

async function main() {
const urls = process.argv.slice(2).length ? process.argv.slice(2) : ["https://en.wikipedia.org/wiki/NIFTY_50", "https://www.rtings.com/headphones/reviews/best/noise-cancelling"];
for (const url of urls) {
  try {
    const page = await fetchPage(url, 15000);
    const ex = extractPage(page.body, page.finalUrl);
    const passages = chunkText("s", ex.text);
    const probe = ex.text.split("\n").find((l) => l.split(" ").length > 12) ?? "";
    console.log({ url, title: ex.title, site: ex.siteName, author: ex.author, published: ex.publishedAt, words: ex.wordCount, passages: passages.length, image: !!ex.image, quoteSelfCheck: locateQuote(ex.text, probe).similarity });
  } catch (e) { console.log(url, "ERROR", (e as Error).message); }
}
try { await fetchPage("http://127.0.0.1:3000", 2000); console.log("SSRF guard FAILED"); } catch (e) { console.log("SSRF guard ok:", (e as Error).message); }
}
main();
