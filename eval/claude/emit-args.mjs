// Prints compact Workflow args for the given question ids (comma-separated) from study.json.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync("eval/data-claude/study.json", "utf8"));
const ids = (process.argv[2] ?? "").split(",").filter(Boolean);
const root = s.root.split("\\").join("/");
const out = {
  root,
  questions: s.questions
    .filter((q) => ids.length === 0 || ids.includes(q.questionId))
    .map((q) => ({
      id: q.questionId,
      question: q.question,
      map: q.cleanToPoisoned,
      runs: q.runs.map((r) => ({ id: r.runId, system: r.system, condition: r.condition })),
      planted: q.plantedClaims.map((p) => ({ id: p.id, claim: p.claim, truth: p.truth })),
      judges: q.judges.map((j) => ({ id: j.judgeId, answers: j.answers.map((a) => ({ label: a.label, run: a.runId })) })),
    })),
};
console.log(JSON.stringify(out));
