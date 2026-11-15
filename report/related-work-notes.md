# Related Work: verification notes

Reference numbers below match `references.md`. Every entry there was checked against the arXiv, ACL Anthology, publisher, RFC or Forethought page named in its `<!-- verified: ... -->` comment. Checks were done on 2026-11-15.

## Could not verify / do not use

- **NewsGuard-style ratings as a citable paper.** I did not look for or verify a NewsGuard methodology document, so do not cite NewsGuard directly. Lin et al. [18] is the verified source on domain-quality ratings.
- **Exact pages for Greshake et al. [17] (AISec '23).** A secondary index (researchr) gives pp. 79–90, but the ACM page returned HTTP 403, so the page range was left out. The venue (CISPA publication page) and the DOI (resolves to dl.acm.org) are verified.
- **OpenReview forum IDs for Self-RAG [11] and Xie et al. [16].** These were seen only in secondary snippets and are not used. The ICLR 2024 venue for both is verified on proceedings.iclr.cc.
- **Schneier & Kelsey [22] DOI.** Not checked, so not given. The venue (ACM TISSEC 1(3):159–176) is verified on schneier.com. The PDF on schneier.com says "A version of this paper appeared in [SK98]", so it may differ slightly from the journal version.
- **C2PA version.** I cite v2.4 (April 2026), the current version on spec.c2pa.org. The "hard binding" glossary definition was read in the v2.4 text. v2.2 (May 2025) also exists and was checked, if you prefer to cite that.
- **OpenTelemetry GenAI conventions [23].** The old opentelemetry.io/docs/specs/semconv/gen-ai/ pages now say "Moved". The canonical home is the GitHub repo open-telemetry/semantic-conventions-genai. Its README shows no stability or version number, so the reference is dated by access date (Nov 2026).

## Verified but not used (optional extras)

- **arXiv 2510.09585** (the sprint-listed item): Mohammadi, S., et al., 2025. "From Birdwatch to Community Notes, from Twitter to X: four years of community-based content moderation." arXiv preprint. It is a descriptive study of the program's first four years, covering languages, sourcing, contributor activity, rating behaviour and interaction networks, and it releases a dataset. It was left out to stay within the reference budget, because Wojcik et al. [19] is the canonical Birdwatch paper. It can be added if you want to cite the sprint list explicitly. Verified at https://arxiv.org/abs/2510.09585.
- Narayanan Venkit, P., et al., 2024. "Search Engines in an AI Era: The False Promise of Factual and Verifiable Source-Cited Responses." arXiv:2410.22349. This is a 21-participant usability study of answer engines (You.com, Perplexity.ai, BingChat). It is relevant to the Introduction's motivation but was not used. The arXiv record was confirmed through search results only, not opened directly; open it before citing.
- RFC 9162 (Certificate Transparency Version 2.0) obsoletes RFC 6962, as stated on the RFC 6962 page. I did not open RFC 9162 itself.

## Facts for the Introduction (read in the source)

1. In a human audit of Bing Chat, NeevaAI, perplexity.ai and YouChat, only **51.5%** of generated sentences were fully supported by citations, and only **74.5%** of citations supported their associated sentence [1] (abstract). The same paper reports that citation precision is **inversely correlated with perceived utility (r = −0.96)** (Sec. 4.3), even though responses were rated fluent (4.48) and useful (4.50) on average (Sec. 4.1). This supports the point that fluent, cited answers look trustworthy without being verifiable.
2. On ELI5, "even the best models lack complete citation support **50%** of the time" [2] (abstract).
3. ChatGPT reaches only a **58%** FActScore on people biographies, and the automated estimator has an error rate under **2%** [5] (abstract). SAFE agrees with crowdsourced annotators on about **72%** of roughly 16k facts, wins **76%** of 100 sampled disagreements, and is more than **20x** cheaper than human annotators [6] (abstract).
4. LLM-generated misinformation causes "a significant degradation (**up to 87%**) in the performance of ODQA systems" [14] (abstract). PoisonedRAG achieves a **90%** attack success rate by injecting **five** malicious texts per target question into a knowledge database with **millions** of texts [15] (abstract).
5. GPT-4 as a judge reaches **over 80%** agreement with human preferences, "the same level of agreement between humans", and the paper also documents position and verbosity biases [13] (abstract). Even a fine-tuned GPT-3.5 reaches only about **80% macro-F1** at attribution evaluation [4] (abstract). Use these to justify the human audit sample.
6. (Optional) Six sets of expert news-domain ratings "generally correlated highly with one another" (pairwise Pearson r of **0.32–0.86** on raw ratings), and the aggregate covers **11,520** domains [18].
