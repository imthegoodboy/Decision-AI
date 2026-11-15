"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  disabled,
  sending,
  placeholder,
}: {
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  sending?: boolean;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    el.style.overflowY = el.scrollHeight > 180 ? "auto" : "hidden";
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || disabled || sending) return;
    setDraft("");
    requestAnimationFrame(resize);
    const ok = await onSend(text);
    if (!ok) {
      setDraft(text);
      requestAnimationFrame(resize);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 rounded-panel border border-rule-strong bg-paper p-1.5 transition-shadow focus-within:border-sky focus-within:shadow-[0_0_0_3px_var(--sky-soft)]"
    >
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          resize();
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="max-h-[180px] min-h-9 flex-1 resize-none overflow-hidden bg-transparent px-2.5 py-2 text-[0.9375rem] leading-6 text-ink placeholder:text-slate/70 focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        aria-label="Send message"
        disabled={!draft.trim() || disabled || sending}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-cobalt text-paper transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:bg-rule-strong",
        )}
      >
        {sending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ArrowUp aria-hidden className="size-4" />}
      </button>
    </form>
  );
}
