"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { WorkspaceModel } from "../use-workspace";
import { BriefCard } from "./brief-card";
import { DossierTabs } from "./dossier-tabs";
import { LiveResearch } from "./live-research";

export function DossierPane({ model }: { model: WorkspaceModel }) {
  const { bundle, live, streaming, researchError, startResearch, dismissLive, setWeight, resetWeights, weightSave } = model;
  if (!bundle) return null;

  const run = bundle.run;
  const showLive = streaming || live.phase === "failed";

  return (
    <section aria-label="Dossier" className="px-4 py-5 sm:px-6">
      {showLive ? (
        <LiveResearch
          live={live}
          error={researchError}
          onRetry={() => void startResearch(live.focus)}
          onDismiss={dismissLive}
        />
      ) : bundle.decision.status === "researching" ? (
        <div className="space-y-5">
          <Notice
            title="Research is running on the server"
            action={<LoaderCircle aria-hidden className="size-5 animate-spin text-cobalt" />}
          >
            This view refreshes automatically when the dossier is sealed.
          </Notice>
          <BriefCard decision={bundle.decision} />
        </div>
      ) : run?.dossier ? (
        <DossierTabs setWeight={setWeight} resetWeights={resetWeights} weightSave={weightSave} />
      ) : (
        <div className="space-y-5">
          {run?.status === "failed" && (
            <Notice
              tone="error"
              title="The last research run failed"
              action={
                <Button size="sm" variant="secondary" onClick={() => void startResearch(run.focus)} icon={<RotateCcw aria-hidden className="size-3.5" />}>
                  Try again
                </Button>
              }
            >
              {run.error ?? "No error message was recorded."}
            </Notice>
          )}
          <BriefCard decision={bundle.decision} />
          <p className="px-1 text-[0.8125rem] leading-relaxed text-slate">
            When research starts, this side shows each step live: sources being read and rated, options found, and every claim
            stamped as it is checked against its source.
          </p>
        </div>
      )}
    </section>
  );
}
