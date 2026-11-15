"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { LoaderCircle, Telescope } from "lucide-react";
import type { Message } from "@/lib/domain";
import { cn, percent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import { ApiErrorNotice } from "@/components/ui/notice";
import type { WorkspaceModel } from "../use-workspace";
import { Markdown } from "./markdown";
import { AnsweredQuestions, QuestionCards } from "./question-cards";
import { Composer } from "./composer";

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function UserBubble({ text, pending }: { text: string; pending?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-panel rounded-br-[4px] bg-sky-soft px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-ink",
          pending && "opacity-70",
        )}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  interactive,
  disabled,
  onAnswer,
}: {
  message: Message;
  interactive: boolean;
  disabled: boolean;
  onAnswer: (text: string) => Promise<boolean>;
}) {
  const questions = message.meta.questions ?? [];
  const isAnalyst = message.meta.kind === "analyst";
  if (message.meta.kind === "research-event") {
    return (
      <div className="flex items-center gap-3 py-1 text-xs text-slate">
        <span className="h-px flex-1 bg-rule" />
        <span className="max-w-[80%] text-center">{message.content}</span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    );
  }
  return (
    <div className="max-w-full">
      <div className="mb-1 flex items-center gap-2 text-xs text-slate">
        <span className="font-medium text-ink">{isAnalyst ? "Analyst" : "Decision AI"}</span>
        <span aria-hidden>·</span>
        <time dateTime={message.createdAt}>{timeOf(message.createdAt)}</time>
      </div>
      {message.meta.kind === "error" ? (
        <p className="text-sm text-contradicted">{message.content}</p>
      ) : (
        <Markdown text={message.content} />
      )}
      {questions.length > 0 &&
        (interactive ? (
          <QuestionCards questions={questions} disabled={disabled} onSubmit={onAnswer} />
        ) : (
          <AnsweredQuestions questions={questions} />
        ))}
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.8125rem] text-slate" role="status">
      <span className="flex gap-1" aria-hidden>
        <span className="size-1.5 animate-pulse-dot rounded-full bg-cobalt" />
        <span className="size-1.5 animate-pulse-dot rounded-full bg-cobalt [animation-delay:200ms]" />
        <span className="size-1.5 animate-pulse-dot rounded-full bg-cobalt [animation-delay:400ms]" />
      </span>
      {label}
    </div>
  );
}

export function ConversationPane({ model }: { model: WorkspaceModel }) {
  const { bundle, sending, pendingUser, sendError, send, startResearch, streaming, live } = model;
  const endRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => (bundle?.messages ?? []).filter((m) => m.role !== "system"), [bundle?.messages]);

  const hasDossier = Boolean(bundle?.run?.dossier);
  const researching = streaming || bundle?.decision.status === "researching";

  const { interactiveId, readiness, ready } = useMemo(() => {
    let lastUser = -1;
    messages.forEach((m, i) => {
      if (m.role === "user") lastUser = i;
    });
    let interactive: string | null = null;
    let r: number | null = null;
    let ok = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      if (r === null && typeof m.meta.readiness === "number") {
        r = m.meta.readiness;
        ok = Boolean(m.meta.readyToResearch);
      }
      if (interactive === null && i > lastUser && (m.meta.questions?.length ?? 0) > 0) interactive = m.id;
      if (r !== null) break;
    }
    return { interactiveId: interactive, readiness: r, ready: ok };
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingUser, sending]);

  const showIntakeBar = !hasDossier && !researching;

  return (
    <section aria-label="Conversation" className="flex h-full min-h-0 flex-col">
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <ol className="space-y-5" aria-live="polite" aria-relevant="additions">
          {messages.map((m) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {m.role === "user" ? (
                <UserBubble text={m.content} />
              ) : (
                <AssistantMessage
                  message={m}
                  interactive={m.id === interactiveId && !researching}
                  disabled={sending}
                  onAnswer={send}
                />
              )}
            </motion.li>
          ))}
          {pendingUser && (
            <li>
              <UserBubble text={pendingUser} pending />
            </li>
          )}
          {sending && (
            <li>
              <Thinking label={hasDossier ? "Checking the evidence…" : "Thinking about what matters…"} />
            </li>
          )}
        </ol>
        {sendError != null && (
          <ApiErrorNotice error={sendError} title="Message not sent" className="mt-4" />
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-3 border-t border-rule bg-paper px-4 py-3 sm:px-6">
        {showIntakeBar && (
          <div className={cn("rounded-panel border px-3.5 py-3", ready ? "border-sky bg-sky-soft/60" : "border-rule bg-mist/60")}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[0.8125rem] font-medium text-ink">
                    {ready ? "Ready to research" : "Getting to know your decision"}
                  </p>
                  {readiness !== null && <span className="text-xs tabular-nums text-slate">{percent(readiness)}</span>}
                </div>
                <Meter
                  value={readiness ?? 0}
                  label="Readiness to research"
                  className="mt-1.5"
                  barClassName={ready ? "bg-cobalt" : "bg-sky"}
                />
              </div>
              {ready ? (
                <Button
                  onClick={() => void startResearch(null)}
                  disabled={sending}
                  icon={<Telescope aria-hidden className="size-4" />}
                >
                  Start research
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startResearch(null)}
                  disabled={sending}
                  className="shrink-0 rounded-control px-2 py-1 text-[0.8125rem] font-medium text-cobalt underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Research now
                </button>
              )}
            </div>
          </div>
        )}
        {researching && (
          <p className="flex items-center gap-2 text-[0.8125rem] text-cobalt" role="status">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {live.focus ? `Researching: ${live.focus}` : "Research in progress. You can keep reading while it runs."}
          </p>
        )}
        <Composer
          onSend={send}
          sending={sending}
          disabled={researching}
          placeholder={
            hasDossier
              ? "Ask about the evidence…"
              : "Answer in your own words…"
          }
        />
      </div>
    </section>
  );
}
