// Prints compact Workflow args for the replicate runs.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync("eval/data-claude/study.json", "utf8"));
const questions = s.questions.map((q) => ({ id: q.questionId, question: q.question, runs: q.replicates.map((r) => ({ id: r.runId, system: r.system })) }));
console.log(JSON.stringify({ root: s.root.split("\\").join("/"), questions }));
