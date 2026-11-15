"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { FileQuestionMark, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Button, buttonClass } from "@/components/ui/button";
import { ApiErrorNotice } from "@/components/ui/notice";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { ConversationPane } from "./conversation/conversation-pane";
import { DossierPane } from "./dossier/dossier-pane";
import { DetailDrawer } from "./dossier/detail-drawer";
import { DossierProvider } from "./dossier-context";
import { useWorkspace } from "./use-workspace";
import { WorkspaceHeader } from "./workspace-header";

export function WorkspaceSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading decision">
      <div className="border-b border-rule px-6 py-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6 border-r border-rule p-6">
          <SkeletonLines lines={3} />
          <Skeleton className="ml-auto h-10 w-2/3" />
          <SkeletonLines lines={4} />
        </div>
        <div className="hidden space-y-4 p-6 lg:block">
          <Skeleton className="h-40 w-full" />
          <SkeletonLines lines={5} />
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <FileQuestionMark aria-hidden className="size-10 text-sky" />
      <h1 className="mt-4 text-[1.375rem] leading-[1.85rem] font-semibold text-ink">This decision does not exist</h1>
      <p className="mt-2 text-sm text-slate">It may have been deleted, or the link is incomplete.</p>
      <Link href="/" className={cn(buttonClass("primary", "md"), "mt-6")}>
        Start a new decision
      </Link>
    </div>
  );
}

function WorkspaceBody({ id }: { id: string }) {
  const model = useWorkspace(id);
  const [mobilePane, setMobilePane] = useState<"chat" | "dossier">("chat");
  const { bundle, loadError } = model;

  if (!bundle) {
    if (loadError) {
      if (loadError instanceof ApiError && loadError.notFound) return <NotFound />;
      return (
        <div className="mx-auto max-w-xl px-6 py-16">
          <ApiErrorNotice
            error={loadError}
            title="Could not load this decision"
            action={
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()} icon={<RotateCcw aria-hidden className="size-3.5" />}>
                Retry
              </Button>
            }
          />
        </div>
      );
    }
    return <WorkspaceSkeleton />;
  }

  return (
    <DossierProvider bundle={bundle} weights={model.weights}>
      <div className="flex h-full min-h-0 flex-col">
        <WorkspaceHeader model={model} />
        <div className="flex border-b border-rule lg:hidden" role="group" aria-label="Choose pane">
          {(["chat", "dossier"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={mobilePane === p}
              onClick={() => setMobilePane(p)}
              className={cn(
                "h-10 flex-1 border-b-2 text-sm font-medium",
                mobilePane === p ? "border-cobalt text-ink" : "border-transparent text-slate",
              )}
            >
              {p === "chat" ? "Conversation" : model.streaming ? "Research (live)" : "Dossier"}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className={cn("min-h-0 border-rule lg:block lg:border-r", mobilePane === "chat" ? "block" : "hidden")}>
            <ConversationPane model={model} />
          </div>
          <div
            className={cn(
              "pane-scroll min-h-0 overflow-y-auto bg-paper lg:block",
              mobilePane === "dossier" ? "block" : "hidden",
            )}
          >
            <DossierPane model={model} />
          </div>
        </div>
      </div>
      <DetailDrawer />
    </DossierProvider>
  );
}

export function Workspace() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <NotFound />;
  return <WorkspaceBody key={id} id={id} />;
}
