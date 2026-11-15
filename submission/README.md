# Submission pack: AI x Epistemics Research Sprint

**Deadline:** Sun 15 Nov 2026, 11:59 PM AoE (Mon 16 Nov, 11:59 UTC / 5:29 PM IST).

Submit through the official form on the sprint page. Resubmitting with the same title replaces an earlier submission. All form text is ready in [`form-answers.md`](form-answers.md).

| Form field | File / value |
| --- | --- |
| Project title* | In `form-answers.md` |
| Project summary* | In `form-answers.md` |
| PDF report* | `../report/Decision-AI-report.pdf`: official template structure, 8 pages of main text plus references and appendices, and the required Limitations and Dual-Use / Ethical Considerations appendix (Appendix A) |
| Publishing interest* | Yes |
| Tracks | Track 2: Trust Infrastructure (primary); Track 3 also fits |
| Presentation recording | `video/decision-ai-demo.mp4` (3 min 23 s, narrated). Upload it as an unlisted YouTube video, or attach it directly |
| Project code | https://github.com/imthegoodboy/Decision-AI |
| Slides | `slides.pdf` |
| Project image | `project-image.png` |
| Team name*, location*, member name* and email* | Decision AI · your city · Nikhil Sharma · your email |

## Before you submit
- [ ] Check `report/authors.json`: the affiliation is set to "Independent Researcher". If you change it, rebuild with `python report/build.py`.
- [ ] Open `report/Decision-AI-report.pdf` and read it end to end. The template asks that the final text be primarily the team's own, so edit anything you would phrase differently.
- [ ] Optional but valuable (about 20 minutes): open `human-audit.html` in a browser and label the 60 claims. Save the CSV it downloads as `eval/results/human-audit-labels.csv`, then run `python eval/analysis.py` and `python report/build.py`. The report will then include a judge–human agreement figure.
- [ ] Upload the video and paste the link into the form.
- [ ] Make sure the GitHub repository is public. It is now, and PRs #1 and #2 contain all the work.

## Regenerating everything
```bash
python eval/analysis.py                 # statistics + figures from eval/results
python report/build.py                  # report PDF
python report/build.py --slides         # slides PDF
python report/build.py --video          # narration text from the results
node submission/video/record.mjs        # narrated demo video (app on :3100, Chrome, edge-tts, ffmpeg)
```
