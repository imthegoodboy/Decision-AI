import { describe, expect, it } from "vitest";
import { Bm25Index, chunkText, cosine, locateQuote, normalize, tokenize, truncate } from "@/lib/text";

describe("normalize", () => {
  it("folds typography and case", () => {
    expect(normalize("The “Pixel 9a” — has a 5,100 mAh battery!")).toBe("the pixel 9a - has a 5 100 mah battery");
  });
});

describe("tokenize", () => {
  it("drops stopwords by default", () => {
    expect(tokenize("The battery of the phone is large")).toEqual(["battery", "phone", "large"]);
  });
});

describe("locateQuote", () => {
  const page =
    "In our testing the phone lasted 14 hours in the video loop. The 6.1-inch OLED display reaches 1,800 nits " +
    "outdoors. Charging is limited to 25W, which is slower than rivals.";

  it("finds an exact quote", () => {
    const m = locateQuote(page, "The 6.1-inch OLED display reaches 1,800 nits outdoors.");
    expect(m.found).toBe(true);
    expect(m.similarity).toBe(1);
  });

  it("tolerates curly quotes and small punctuation changes", () => {
    const m = locateQuote(page, "Charging is limited to 25W which is slower than rivals");
    expect(m.found).toBe(true);
  });

  it("rejects a fabricated quote", () => {
    const m = locateQuote(page, "The battery comfortably lasts two full days of heavy gaming.");
    expect(m.found).toBe(false);
    expect(m.similarity).toBeLessThan(0.5);
  });

  it("rejects a quote with a changed number only when overlap is low", () => {
    const m = locateQuote(page, "the phone lasted 9 hours in the video loop");
    expect(m.similarity).toBeLessThan(1);
  });
});

describe("chunkText", () => {
  it("produces stable, overlapping passages", () => {
    const text = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const a = chunkText("src_1", text, { targetWords: 100, overlapWords: 20 });
    const b = chunkText("src_1", text, { targetWords: 100, overlapWords: 20 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(3);
    expect(a[0].id).toBe("src_1#0");
    expect(a[1].text.startsWith("word80")).toBe(true);
  });

  it("returns a single passage for short text", () => {
    expect(chunkText("s", "Short text.")).toHaveLength(1);
  });
});

describe("Bm25Index", () => {
  it("ranks the most relevant passage first", () => {
    const idx = new Bm25Index([
      { id: 1, text: "Battery life is excellent, lasting two days." },
      { id: 2, text: "The camera produces sharp photos in daylight." },
      { id: 3, text: "Price starts at 19,999 rupees in India." },
    ]);
    expect(idx.search("how long does the battery last", 1)[0].item.id).toBe(1);
    expect(idx.search("price in india", 1)[0].item.id).toBe(3);
  });
});

describe("misc", () => {
  it("cosine of identical vectors is 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it("truncates at a word boundary", () => {
    expect(truncate("one two three four five", 12)).toBe("one two…");
  });
});
