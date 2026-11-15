import type { ReactNode } from "react";
import { CircleExclamationPoint, Info, KeyRound } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "error" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? Info : CircleExclamationPoint;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-panel border px-4 py-3 text-sm",
        tone === "error" && "border-contradicted/35 bg-contradicted-soft text-ink",
        tone === "warning" && "border-partial/35 bg-partial-soft text-ink",
        tone === "info" && "border-rule bg-mist text-ink",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "error" ? "text-contradicted" : tone === "warning" ? "text-partial" : "text-cobalt",
        )}
      />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-slate", title ? "mt-0.5" : "")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SetupNotice({ className, detail }: { className?: string; detail?: string }) {
  return (
    <div
      role="alert"
      className={cn("rounded-panel border border-sky/60 bg-sky-soft/60 px-5 py-4 text-sm text-ink", className)}
    >
      <div className="flex items-start gap-3">
        <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-cobalt" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold">Decision AI needs an OpenAI API key</p>
          <p className="text-slate">
            Add <code className="rounded bg-paper px-1 font-mono text-[0.8125rem] text-ink">OPENAI_API_KEY</code> to{" "}
            <code className="rounded bg-paper px-1 font-mono text-[0.8125rem] text-ink">.env.local</code> in the project
            root, then restart the dev server.
          </p>
          <pre className="overflow-x-auto rounded-control border border-rule bg-paper px-3 py-2 font-mono text-[0.8125rem] text-ink">
            OPENAI_API_KEY=sk-...
          </pre>
          {detail && <p className="text-xs text-slate">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

/** Shows the setup notice for `not_configured`, otherwise the server's error message. */
export function ApiErrorNotice({
  error,
  title = "Something went wrong",
  action,
  className,
}: {
  error: unknown;
  title?: string;
  action?: ReactNode;
  className?: string;
}) {
  if (error instanceof ApiError && error.notConfigured) {
    return <SetupNotice className={className} detail={error.message} />;
  }
  return (
    <Notice tone="error" title={title} action={action} className={className}>
      {errorMessage(error)}
    </Notice>
  );
}
