"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { DecisionBundle } from "@/lib/domain";
import { api, errorMessage, streamResearch } from "@/lib/client/api";
import { useAppData } from "@/components/shell/app-data";
import { initialLive, liveReducer } from "./live-state";

const WEIGHT_SAVE_DELAY = 600;

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useWorkspace(id: string) {
  const { patchDecision, refreshDecisions, removeDecision } = useAppData();
  const [bundle, setBundle] = useState<DecisionBundle | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [live, dispatch] = useReducer(liveReducer, undefined, initialLive);
  const [researchError, setResearchError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [weightSave, setWeightSave] = useState<SaveState>("idle");

  const runningRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBundle = useCallback((b: DecisionBundle) => {
    setBundle(b);
    setWeights(b.decision.weights ?? {});
    setLoadError(null);
  }, []);

  const reload = useCallback(async () => {
    try {
      const { bundle: b } = await api.getDecision(id);
      applyBundle(b);
      patchDecision(id, { status: b.decision.status, title: b.decision.title, updatedAt: b.decision.updatedAt });
      return b;
    } catch (err) {
      setLoadError((prev: unknown) => prev ?? err);
      return null;
    }
  }, [id, applyBundle, patchDecision]);

  // Initial load.
  useEffect(() => {
    const controller = new AbortController();
    api
      .getDecision(id, controller.signal)
      .then(({ bundle: b }) => applyBundle(b))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err);
      });
    return () => controller.abort();
  }, [id, applyBundle]);

  const startResearch = useCallback(
    async (focus?: string | null) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setResearchError(null);
      dispatch({ type: "start", focus: focus?.trim() || null });
      setBundle((b) => (b ? { ...b, decision: { ...b.decision, status: "researching" } } : b));
      patchDecision(id, { status: "researching" });

      let terminal = false;
      try {
        await streamResearch(id, focus?.trim() || null, (event) => {
          if (event.type === "done" || event.type === "error") terminal = true;
          dispatch({ type: "event", event });
        });
        if (!terminal) {
          dispatch({
            type: "fail",
            message: "The progress stream ended before the run finished. It may still be completing on the server.",
          });
        }
      } catch (err) {
        setResearchError(err);
        dispatch({ type: "fail", message: errorMessage(err) });
      } finally {
        runningRef.current = false;
        await reload();
        void refreshDecisions();
      }
    },
    [id, patchDecision, reload, refreshDecisions],
  );

  const send = useCallback(
    async (content: string): Promise<boolean> => {
      const text = content.trim();
      if (!text) return false;
      setSending(true);
      setSendError(null);
      setPendingUser(text);
      try {
        const res = await api.sendMessage(id, text);
        setBundle((b) => {
          if (!b) return b;
          const known = new Set(b.messages.map((m) => m.id));
          return { ...b, decision: res.decision, messages: [...b.messages, ...res.messages.filter((m) => !known.has(m.id))] };
        });
        patchDecision(id, { title: res.decision.title, status: res.decision.status, updatedAt: res.decision.updatedAt });
        setPendingUser(null);
        if (res.action === "research" || res.action === "rerun") {
          void startResearch(res.focus ?? null);
        } else if (res.action === "reweight") {
          await reload();
        }
        return true;
      } catch (err) {
        setSendError(err);
        setPendingUser(null);
        return false;
      } finally {
        setSending(false);
      }
    },
    [id, patchDecision, reload, startResearch],
  );

  const persistWeights = useCallback(
    (next: Record<string, number>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setWeightSave("saving");
      saveTimer.current = setTimeout(() => {
        api
          .putWeights(id, next)
          .then(() => setWeightSave("saved"))
          .catch(() => setWeightSave("error"));
      }, WEIGHT_SAVE_DELAY);
    },
    [id],
  );

  const setWeight = useCallback(
    (criterionId: string, value: number) => {
      setWeights((prev) => {
        const next = { ...prev, [criterionId]: value };
        persistWeights(next);
        return next;
      });
    },
    [persistWeights],
  );

  const resetWeights = useCallback(
    (defaults: Record<string, number>) => {
      setWeights(defaults);
      persistWeights(defaults);
    },
    [persistWeights],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const remove = useCallback(async () => {
    await api.deleteDecision(id);
    removeDecision(id);
  }, [id, removeDecision]);

  // A run started elsewhere (or before a reload) is still going: poll until it settles.
  const serverResearching = bundle?.decision.status === "researching";
  const streaming = live.phase === "starting" || live.phase === "streaming";
  useEffect(() => {
    if (!serverResearching || streaming) return;
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [serverResearching, streaming, reload]);

  return {
    bundle,
    loadError,
    live,
    researchError,
    streaming,
    sending,
    sendError,
    pendingUser,
    weights,
    weightSave,
    reload,
    startResearch,
    send,
    setWeight,
    resetWeights,
    remove,
    dismissLive: () => dispatch({ type: "reset" }),
  };
}

export type WorkspaceModel = ReturnType<typeof useWorkspace>;
