"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DecisionSummary } from "@/lib/domain";
import { api, type SystemInfo } from "@/lib/client/api";

type AppData = {
  decisions: DecisionSummary[] | null;
  decisionsError: unknown;
  system: SystemInfo | null;
  systemError: unknown;
  refreshDecisions: () => Promise<void>;
  /** Optimistically patch a summary in the rail (e.g. status change). */
  patchDecision: (id: string, patch: Partial<DecisionSummary>) => void;
  removeDecision: (id: string) => void;
};

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<DecisionSummary[] | null>(null);
  const [decisionsError, setDecisionsError] = useState<unknown>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [systemError, setSystemError] = useState<unknown>(null);

  const refreshDecisions = useCallback(async () => {
    try {
      const res = await api.listDecisions();
      setDecisions(res.decisions);
      setDecisionsError(null);
    } catch (err) {
      setDecisionsError(err);
      setDecisions((d) => d ?? []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .system()
      .then((s) => !cancelled && setSystem(s))
      .catch((err) => !cancelled && setSystemError(err));
    api
      .listDecisions()
      .then((res) => {
        if (cancelled) return;
        setDecisions(res.decisions);
        setDecisionsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDecisionsError(err);
        setDecisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patchDecision = useCallback((id: string, patch: Partial<DecisionSummary>) => {
    setDecisions((list) => list?.map((d) => (d.id === id ? { ...d, ...patch } : d)) ?? list);
  }, []);

  const removeDecision = useCallback((id: string) => {
    setDecisions((list) => list?.filter((d) => d.id !== id) ?? list);
  }, []);

  const value = useMemo(
    () => ({ decisions, decisionsError, system, systemError, refreshDecisions, patchDecision, removeDecision }),
    [decisions, decisionsError, system, systemError, refreshDecisions, patchDecision, removeDecision],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}
