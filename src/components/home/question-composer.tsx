"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { ApiErrorNotice, SetupNotice } from "@/components/ui/notice";
import { useAppData } from "@/components/shell/app-data";

const EXAMPLES = [
  "Which phone should I buy under ₹20,000?",
  "Which university should I choose for a master's in data science?",
  "Should I accept this job offer?",
  "Which laptop is best for a CS student under $900?",
];

export function QuestionComposer() {
  const router = useRouter();
  const { system, refreshDecisions } = useAppData();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The page is preserved (hidden) across navigations; reset transient state when it hides.
  useLayoutEffect(() => {
    return () => {
      setPending(false);
      setQuestion("");
    };
  }, []);

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setPending(true);
    setError(null);
    try {
      const { bundle } = await api.createDecision(q);
      void refreshDecisions();
      router.push(`/d/${bundle.decision.id}`);
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(question);
    }
  };

  return (
    <div className="space-y-5">
      {system && !system.configured && <SetupNotice />}

      <form
        onSubmit={onSubmit}
        aria-busy={pending}
        className={cn(
          "relative overflow-hidden rounded-panel border border-rule bg-paper transition-shadow focus-within:border-sky focus-within:shadow-[0_0_0_4px_var(--sky-soft)]",
        )}
      >
        {/* Ledger margin line */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-12 w-px bg-sky/35 sm:left-14" />
        <label htmlFor="question" className="sr-only">
          What are you deciding?
        </label>
        <textarea
          id="question"
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending}
          rows={4}
          placeholder="What are you deciding?"
          className="ledger-paper block min-h-[10rem] w-full resize-none bg-transparent py-[0.6rem] pl-16 pr-5 text-[1.375rem] leading-[2.5rem] text-ink placeholder:text-slate/70 focus:outline-none disabled:opacity-60 sm:pl-20 sm:text-[1.5rem]"
          style={{ ["--ledger-line" as string]: "2.5rem" }}
          autoFocus
        />
        <div className="flex items-center justify-between gap-3 border-t border-rule bg-paper px-4 py-3 sm:pl-20">
          <p className="text-[0.8125rem] text-slate" aria-live="polite">
            {pending ? (
              <span className="inline-flex items-center gap-2 text-cobalt">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                Reading your question…
              </span>
            ) : (
              <span className="hidden sm:inline">Describe it in your own words. Enter to start, Shift+Enter for a new line.</span>
            )}
          </p>
          <button
            type="submit"
            disabled={!question.trim() || pending}
            className="inline-flex h-10 items-center gap-2 rounded-control bg-cobalt px-4 text-sm font-medium text-paper transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ArrowUp aria-hidden className="size-4" />}
            Start
          </button>
        </div>
      </form>

      {error != null && <ApiErrorNotice error={error} title="Could not start this decision" />}

      <div>
        <p className="mb-2 text-[0.8125rem] text-slate">Or try one of these</p>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setQuestion(ex);
                  void submit(ex);
                }}
                className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-left text-[0.8125rem] text-ink transition-colors hover:border-sky hover:bg-sky-soft disabled:opacity-50"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
