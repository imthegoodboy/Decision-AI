# Submission form answers (copy into the sprint form)

**Project title\***
Flagged but Still Followed: Planted Sources Steer AI Decision Support Even When Agents Dispute Them

**Project summary\*** (short abstract)
AI assistants increasingly help people choose phones, insurers and courses, and their citations make advice look checkable. We built Decision AI, a claim-level verification and provenance layer:

- each claim is bound to a verbatim quote and checked against every source under fixed rules;
- source reliability is scored from metadata and from verification;
- the evidence is sealed in a hash-chained audit log.

We exposed the layer as a tool that AI agents call and tested Track 2's question: does using it improve agent behaviour? In {{raw:n_agent_runs}} blinded agent runs on {{raw:n_questions}} real decisions from identical live-web sources, with and without a planted article containing three false claims:

- Citation faithfulness was already about 98% in every condition.
- No tool-using answer stated a planted falsehood as fact, against {{pct0:poisoned.planted_adopted_any.baseline}} of baseline answers.
- All conditions flagged the planted claims, yet recommendations still moved toward the attacker in {{rawpct:stability.pooled.attack_consistent_poisoned}} of cases, against {{rawpct:stability.pooled.attack_consistent_replicate}} between two clean runs ({{pv:stability.pooled.mcnemar_attack_p}}). The tool reduced this steering but did not remove it.
- Metadata-based reliability favoured the fake page; reliability earned through verification halved its advantage.

Detection is not defence: trust infrastructure must constrain decisions, not only claims.

**PDF report\*** → `report/Decision-AI-report.pdf`

**Are you interested in publishing this project?\*** → Yes

**Tracks** → Track 2: Trust Infrastructure (primary). Track 3: Epistemic Products also fits.

**Presentation recording** → `submission/video/decision-ai-demo.mp4` (3 min 23 s). Upload it as an unlisted YouTube video or attach it directly.

**Project code** → https://github.com/imthegoodboy/Decision-AI

**Slides** → `submission/slides.pdf`

**Project image** → `submission/project-image.png`

**Team name\*** → Decision AI

**Location\*** → your city, India (fill in)

**Team member 1** → Name: Nikhil Sharma · Email: (your email) · Discord: (optional) · Google Scholar: (optional)
