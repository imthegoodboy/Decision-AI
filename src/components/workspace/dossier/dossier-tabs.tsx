"use client";

import { useState } from "react";
import { TabList, TabPanel, type TabItem } from "@/components/ui/tabs";
import { useDossier } from "../dossier-context";
import type { SaveState } from "../use-workspace";
import { OverviewTab } from "./overview-tab";
import { CompareTab } from "./compare-tab";
import { EvidenceTab } from "./evidence-tab";
import { SourcesTab } from "./sources-tab";
import { ConflictsTab } from "./conflicts-tab";
import { AuditTab } from "./audit-tab";

type TabId = "overview" | "compare" | "evidence" | "sources" | "conflicts" | "audit";

export function DossierTabs({
  setWeight,
  resetWeights,
  weightSave,
}: {
  setWeight: (criterionId: string, value: number) => void;
  resetWeights: (defaults: Record<string, number>) => void;
  weightSave: SaveState;
}) {
  const { dossier, sources } = useDossier();
  const [tab, setTab] = useState<TabId>("overview");
  if (!dossier) return null;

  const highConflicts =
    dossier.contradictions.some((c) => c.severity === "high") || dossier.uncertainties.some((u) => u.impact === "high");

  const tabs: TabItem<TabId>[] = [
    { id: "overview", label: "Overview" },
    { id: "compare", label: "Compare" },
    { id: "evidence", label: "Evidence", count: dossier.claims.length },
    { id: "sources", label: "Sources", count: sources.length },
    {
      id: "conflicts",
      label: "Conflicts & gaps",
      count: dossier.contradictions.length + dossier.uncertainties.length,
      attention: highConflicts,
    },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 bg-paper/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <TabList tabs={tabs} value={tab} onChange={setTab} idPrefix="dossier" label="Dossier sections" />
      </div>
      <TabPanel idPrefix="dossier" id={tab} className="pt-5">
        {tab === "overview" && <OverviewTab />}
        {tab === "compare" && <CompareTab setWeight={setWeight} resetWeights={resetWeights} saveState={weightSave} />}
        {tab === "evidence" && <EvidenceTab />}
        {tab === "sources" && <SourcesTab />}
        {tab === "conflicts" && <ConflictsTab />}
        {tab === "audit" && <AuditTab />}
      </TabPanel>
    </div>
  );
}
