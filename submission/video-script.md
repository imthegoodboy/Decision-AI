# Demo video script (target 4:00, limit 3–5 min)

Record at 1920×1080 with the browser at 110% zoom. Use a decision that has already finished researching (open it from the left rail), so nothing waits on the network. Start one fresh research run in step 3 to show the live ledger.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:20 | Title slide (`submission/slides.pdf`, slide 1) | "AI assistants are becoming how people make decisions: what to buy, where to study, which insurer to trust. They cite sources, which makes answers look checkable. But studies find only about half of AI-generated sentences are actually supported by their citations, and a single planted web page can steer them. We built Decision AI to make AI-assisted decisions verifiable." |
| 0:20–0:45 | Home page, type "Which smartphone should I buy under ₹20,000 in India? Battery and updates matter most." | "You describe your decision in plain language. Decision AI doesn't answer straight away. It works out what would change the answer." |
| 0:45–1:10 | Question cards appear; click answers; brief panel fills in on the right | "It asks a few targeted questions: budget, must-haves, priorities. Each answer updates a structured decision brief you can see on the right." |
| 1:10–1:50 | Click **Start research**; live pipeline: searches, sources with reliability, options, then claims stamped supported / partial / contradicted | "Now it researches the live web. Every page is fetched, hashed and scored for reliability. Then the key step: it breaks the evidence into individual claims, and checks each one. Is the quoted sentence really on the page? Does the passage actually say it? Do other sources agree, or contradict it? Each claim gets a verdict." |
| 1:50–2:25 | Overview tab of a finished decision: recommendation, confidence, reasons with claim chips; click a chip → evidence drawer with highlighted quote and provenance | "The recommendation is built only from verified claims. Click any reason and you see the exact passage, highlighted, with where and when it was retrieved and its content hash. Confidence is computed from evidence coverage, support, source reliability and freshness, not from the model's tone." |
| 2:25–2:50 | Compare tab: drag a priority slider; ranking reorders | "Your priorities are yours. Move a slider and the ranking recomputes instantly from the same evidence. You can see when a different phone would be the better choice." |
| 2:50–3:10 | Conflicts & gaps tab; then Sources tab reliability signals | "Where sources disagree, Decision AI shows both sides and which is more credible. Reliability is transparent: a metadata prior that's easy to fake, plus a track record a source earns when other sources corroborate it." |
| 3:10–3:25 | Audit tab → **Verify integrity** → "Chain intact" | "Every step is written to a hash-chained audit log, and each research dossier is sealed into it. Anyone can verify nothing was altered afterwards." |
| 3:25–3:55 | Slides: Figure 2 and Figure 3 from the report | "Does this infrastructure change what the AI says? We ran a controlled experiment on 30 real decisions. All systems saw identical sources, with and without a planted false article. [Read the two headline numbers from report Section 4: citation support and planted-falsehood adoption, Decision AI vs baseline, and the self-check prompt result.] Asking the model to be careful isn't the same as giving it verification infrastructure." |
| 3:55–4:10 | Closing slide with repo link | "Decision AI: decisions you can check. Code, data and the full report are open." |

## Recording tips
- OBS Studio, or Windows Game Bar (Win+Alt+R), records the screen. Record the narration in one take over the screen recording, or record the voice separately and align it.
- Keep the mouse movements slow; pause for one second on each verdict stamp and drawer.
- Export as MP4 (H.264). Upload as an unlisted YouTube video, or attach it in the form's "Presentation recording" field.
