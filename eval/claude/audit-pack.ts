/**
 * Builds a self-contained, blind human-audit page (submission/human-audit.html):
 * 60 judge decisions sampled at random (20 per condition), each shown with the
 * claim and the best-matching passages from its cited sources. The judge's verdict
 * is hidden. Labels are exported as CSV for eval/results/human-audit-labels.csv.
 *
 *   node --import tsx eval/claude/audit-pack.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Bm25Index, chunkText, type Passage } from "@/lib/text";
import { readCache, seedOf } from "../lib/store";
import { CLAUDE_DATA, type StudyPool } from "./shared";

type Run = { runId: string; questionId: string; system: string; condition: string; numbering: Record<string, string> };
type Study = { runs: Run[]; questions: { questionId: string; question: string; judges: { judgeId: string; file: string; answers: { label: string; runId: string }[] }[] }[] };
type JudgeFile = { answers: { label: string; claims: { claim: string; citations: number[]; verdict: string }[] }[] };

const study = readCache<Study>(path.join(CLAUDE_DATA, "study.json"))!;
type Item = { key: string; question: string; claim: string; evidence: { source: string; url: string; text: string }[]; judge: string; system: string };
const pool: Item[] = [];

for (const q of study.questions) {
  const genuine = readCache<StudyPool>(path.join(CLAUDE_DATA, "pools", `${q.questionId}.json`))!;
  const planted = readCache<{ source: { id: string; url: string; title: string; text: string } }>(path.join(CLAUDE_DATA, "planted-sources", `${q.questionId}.json`))!;
  const all = [...genuine.sources, planted.source];
  const numbering = study.runs.find((r) => r.questionId === q.questionId && r.condition === "poisoned")!.numbering;
  const passages: Passage[] = all.flatMap((s) => chunkText(s.id, s.text, { targetWords: 90, overlapWords: 20 }));
  const index = new Bm25Index(passages);
  for (const j of q.judges) {
    const jf = readCache<JudgeFile>(j.file);
    if (!jf) continue;
    for (const a of j.answers) {
      const verdicts = jf.answers.find((x) => x.label.toUpperCase() === a.label);
      const run = study.runs.find((r) => r.runId === a.runId)!;
      verdicts?.claims.forEach((c, i) => {
        if (!c.citations.length) return;
        const evidence = c.citations.slice(0, 2).flatMap((n) => {
          const id = numbering[String(n)];
          const src = all.find((s) => s.id === id);
          if (!src) return [];
          return index.search(c.claim, 2, (p) => p.sourceId === id).map((r) => ({ source: `[${n}] ${src.title}`, url: src.url, text: r.item.text }));
        });
        pool.push({ key: `${a.runId}|${i}`, question: q.question, claim: c.claim, evidence, judge: c.verdict, system: run.system });
      });
    }
  }
}

const sample = ["baseline", "selfcheck", "tool"].flatMap((system) =>
  pool.filter((p) => p.system === system).sort((a, b) => seedOf(a.key) - seedOf(b.key)).slice(0, 20),
).sort((a, b) => seedOf(`order:${a.key}`) - seedOf(`order:${b.key}`));

// The page never shows the judge verdict or the system; both stay in the answer key file.
writeFileSync(path.join(CLAUDE_DATA, "human-audit-key.json"), JSON.stringify(sample.map((s) => ({ key: s.key, judge: s.judge, system: s.system })), null, 2));
const items = sample.map((s) => ({ key: s.key, question: s.question, claim: s.claim, evidence: s.evidence }));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Decision AI — human audit</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;background:#F3F8FC;color:#0E2236;margin:0}
main{max-width:860px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:1.4rem;margin:0 0 4px} .muted{color:#4D6378;font-size:.9rem}
.card{background:#fff;border:1px solid #D6E7F5;border-radius:14px;padding:18px 20px;margin:16px 0}
.claim{font-size:1.05rem;font-weight:600;margin:6px 0 12px}
.ev{border-left:3px solid #7CC0EC;padding:6px 12px;margin:8px 0;font-family:Georgia,serif;font-size:.95rem;line-height:1.5;background:#fbfdff}
.ev .src{font-family:system-ui;font-size:.8rem;color:#1667A8;margin-bottom:4px}
.btns{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap} button{border:1px solid #D6E7F5;background:#fff;border-radius:999px;padding:8px 14px;font-size:.9rem;cursor:pointer}
button.on{background:#1667A8;color:#fff;border-color:#1667A8} .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #D6E7F5;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;z-index:2}
</style></head><body>
<div class="bar"><strong>Human audit</strong><span><span id="count">0</span> / ${items.length} labelled &nbsp; <button id="dl">Download labels (CSV)</button></span></div>
<main>
<h1>Does the cited evidence support the claim?</h1>
<p class="muted">For each claim, read the passages from the source(s) the AI cited. Choose <b>supported</b> if they state the claim (numbers, names and conditions match), <b>partial</b> if they support only part of it, <b>unsupported</b> if they do not state it. Judge only from the passages (open the link if you need more context). You do not see which system wrote the claim or what the automatic judge decided. Labels are saved in this browser as you go.</p>
<div id="list"></div></main>
<script>
const ITEMS=${JSON.stringify(items)};
const KEY='decision-ai-audit';
let labels={}; try{labels=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(){document.getElementById('list').innerHTML=ITEMS.map((it,i)=>'<div class="card"><div class="muted">'+(i+1)+'. '+esc(it.question)+'</div><div class="claim">'+esc(it.claim)+'</div>'+it.evidence.map(e=>'<div class="ev"><div class="src"><a href="'+esc(e.url)+'" target="_blank" rel="noreferrer">'+esc(e.source)+'</a></div>'+esc(e.text)+'</div>').join('')+'<div class="btns">'+['supported','partial','unsupported'].map(v=>'<button data-k="'+esc(it.key)+'" data-v="'+v+'" class="'+(labels[it.key]===v?'on':'')+'">'+v+'</button>').join('')+'</div></div>').join('');document.getElementById('count').textContent=Object.keys(labels).length;}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(b){labels[b.dataset.k]=b.dataset.v;try{localStorage.setItem(KEY,JSON.stringify(labels))}catch(err){}render();}});
document.getElementById('dl').onclick=()=>{const rows=['key,human_verdict',...ITEMS.filter(it=>labels[it.key]).map(it=>it.key+','+labels[it.key])];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\\n')],{type:'text/csv'}));a.download='human-audit-labels.csv';a.click();};
render();
</script></body></html>`;
mkdirSync(path.join(process.cwd(), "submission"), { recursive: true });
writeFileSync(path.join(process.cwd(), "submission", "human-audit.html"), html);
console.log(`Audit pack: ${items.length} items from ${pool.length} judged cited claims → submission/human-audit.html`);
void readFileSync;
