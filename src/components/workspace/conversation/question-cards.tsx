"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { FollowUpQuestion } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Answer = string | string[];

function hasValue(a: Answer | undefined): boolean {
  if (a == null) return false;
  return Array.isArray(a) ? a.length > 0 : a.trim().length > 0;
}

function labelOf(prompt: string): string {
  return prompt.trim().replace(/[?:.]+$/, "");
}

export function composeAnswers(questions: FollowUpQuestion[], answers: Record<string, Answer>): string {
  return questions
    .filter((q) => hasValue(answers[q.id]))
    .map((q) => {
      const a = answers[q.id];
      return `${labelOf(q.prompt)}: ${Array.isArray(a) ? a.join(", ") : a.trim()}`;
    })
    .join("\n");
}

function Pill({ selected, onClick, children, multi }: { selected: boolean; onClick: () => void; children: string; multi?: boolean }) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[0.8125rem] transition-colors",
        selected
          ? "border-cobalt bg-cobalt text-paper"
          : "border-rule-strong bg-paper text-ink hover:border-sky hover:bg-sky-soft",
      )}
    >
      {selected && <Check aria-hidden className="size-3.5" />}
      {children}
    </button>
  );
}

function QuestionCard({
  question,
  value,
  onChange,
  index,
}: {
  question: FollowUpQuestion;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
  index: number;
}) {
  const promptId = `q-${question.id}-prompt`;
  const kind = question.options.length === 0 && (question.kind === "single" || question.kind === "multi") ? "text" : question.kind;

  return (
    <fieldset className="border-b border-rule py-3.5 last:border-b-0" aria-labelledby={promptId}>
      <div className="flex gap-2.5">
        <span className="pt-px text-[0.8125rem] font-semibold tabular-nums text-cobalt">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p id={promptId} className="text-sm font-medium text-ink">
              {question.prompt}
            </p>
            {question.why && <p className="mt-0.5 text-xs leading-relaxed text-slate">{question.why}</p>}
          </div>
          {kind === "single" && (
            <div role="radiogroup" aria-labelledby={promptId} className="flex flex-wrap gap-1.5">
              {question.options.map((opt) => (
                <Pill key={opt} selected={value === opt} onClick={() => onChange(value === opt ? "" : opt)}>
                  {opt}
                </Pill>
              ))}
            </div>
          )}
          {kind === "multi" && (
            <div role="group" aria-labelledby={promptId} className="flex flex-wrap gap-1.5">
              {question.options.map((opt) => {
                const list = Array.isArray(value) ? value : [];
                const selected = list.includes(opt);
                return (
                  <Pill
                    key={opt}
                    multi
                    selected={selected}
                    onClick={() => onChange(selected ? list.filter((v) => v !== opt) : [...list, opt])}
                  >
                    {opt}
                  </Pill>
                );
              })}
            </div>
          )}
          {(kind === "text" || kind === "number") && (
            <input
              type="text"
              inputMode={kind === "number" ? "decimal" : undefined}
              aria-labelledby={promptId}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder ?? (kind === "number" ? "Enter a number" : "Type your answer")}
              className="h-9 w-full rounded-control border border-rule-strong bg-paper px-3 text-sm text-ink placeholder:text-slate/70 focus:border-sky focus:outline-none"
            />
          )}
        </div>
      </div>
    </fieldset>
  );
}

export function QuestionCards({
  questions,
  disabled,
  onSubmit,
}: {
  questions: FollowUpQuestion[];
  disabled?: boolean;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answeredCount = questions.filter((q) => hasValue(answers[q.id])).length;

  const submit = async () => {
    const text = composeAnswers(questions, answers);
    if (!text) return;
    const ok = await onSubmit(text);
    if (ok) setAnswers({});
  };

  return (
    <div className="mt-3 rounded-panel border border-rule bg-paper">
      <div className="px-4">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            value={answers[q.id]}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule bg-mist/60 px-4 py-2.5">
        <p className="text-xs text-slate">
          {answeredCount === 0
            ? "Answer what you can; skip the rest."
            : `${answeredCount} of ${questions.length} answered`}
        </p>
        <Button size="sm" onClick={submit} disabled={disabled || answeredCount === 0}>
          Send answers
        </Button>
      </div>
    </div>
  );
}

/** Read-only rendering of questions that were already answered. */
export function AnsweredQuestions({ questions }: { questions: FollowUpQuestion[] }) {
  return (
    <ul className="mt-2 space-y-1 border-l-2 border-rule pl-3">
      {questions.map((q) => (
        <li key={q.id} className="text-[0.8125rem] text-slate">
          {q.prompt}
        </li>
      ))}
    </ul>
  );
}
