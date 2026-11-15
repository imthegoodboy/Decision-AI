import { STAGES, type PipelineEvent, type Stage, type VerificationStatus } from "@/lib/domain";

export type StageState = {
  status: "pending" | "active" | "done" | "skip";
  detail?: string;
  progress?: { done: number; total: number; detail?: string };
};

export type LiveSource = Extract<PipelineEvent, { type: "source" }>["source"];
export type LiveOption = Extract<PipelineEvent, { type: "option" }>["option"];
export type LiveClaim = Extract<PipelineEvent, { type: "claim" }>["claim"] & { at: number };
export type LiveQuery = { query: string; provider: string; results: number };

export type LiveState = {
  phase: "idle" | "starting" | "streaming" | "finished" | "failed";
  focus: string | null;
  runId: string | null;
  version: number | null;
  startedAt: number | null;
  stages: Record<Stage, StageState>;
  queries: LiveQuery[];
  sources: LiveSource[];
  options: LiveOption[];
  claims: LiveClaim[];
  logs: string[];
  error: string | null;
};

export const STAGE_INFO: Record<Stage, { label: string; description: string }> = {
  plan: { label: "Plan the research", description: "Turns your priorities into criteria and search queries." },
  search: { label: "Search the web", description: "Runs the planned searches and picks diverse pages." },
  read: { label: "Read pages", description: "Fetches each page, extracts readable text and fingerprints it." },
  assess: { label: "Assess sources", description: "Rates every source with transparent reliability signals." },
  options: { label: "Identify options", description: "Finds candidates that satisfy your constraints." },
  deepen: { label: "Deepen thin evidence", description: "Targeted searches for options with little evidence." },
  extract: { label: "Extract claims", description: "Pulls atomic claims, each tied to a verbatim quote." },
  verify: { label: "Verify each claim", description: "Locates the quote in the page and judges the passage." },
  contradictions: { label: "Find contradictions", description: "Looks for sources that disagree." },
  score: { label: "Score options", description: "Scores options on your criteria from verified claims only." },
  recommend: { label: "Write recommendation", description: "Explains the pick with cited reasons and trade-offs." },
  seal: { label: "Seal the dossier", description: "Hashes the dossier into the tamper-evident audit log." },
};

function initialStages(): Record<Stage, StageState> {
  return Object.fromEntries(STAGES.map((s) => [s, { status: "pending" }])) as Record<Stage, StageState>;
}

export function initialLive(): LiveState {
  return {
    phase: "idle",
    focus: null,
    runId: null,
    version: null,
    startedAt: null,
    stages: initialStages(),
    queries: [],
    sources: [],
    options: [],
    claims: [],
    logs: [],
    error: null,
  };
}

export type LiveAction =
  | { type: "start"; focus: string | null }
  | { type: "event"; event: PipelineEvent }
  | { type: "fail"; message: string }
  | { type: "reset" };

/** Marks every stage before `stage` that is still pending/active as done. */
function closeEarlier(stages: Record<Stage, StageState>, stage: Stage): Record<Stage, StageState> {
  const idx = STAGES.indexOf(stage);
  const next = { ...stages };
  for (let i = 0; i < idx; i++) {
    const s = STAGES[i];
    if (next[s].status === "active") next[s] = { ...next[s], status: "done" };
  }
  return next;
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case "reset":
      return initialLive();
    case "start":
      return { ...initialLive(), phase: "starting", focus: action.focus, startedAt: Date.now() };
    case "fail":
      return { ...state, phase: "failed", error: action.message };
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: LiveState, event: PipelineEvent): LiveState {
  const base: LiveState = state.phase === "starting" ? { ...state, phase: "streaming" } : state;
  switch (event.type) {
    case "run":
      return { ...base, runId: event.runId, version: event.version };
    case "stage": {
      const stages = event.status === "start" ? closeEarlier(base.stages, event.stage) : { ...base.stages };
      const prev = stages[event.stage];
      stages[event.stage] = {
        ...prev,
        status: event.status === "start" ? "active" : event.status === "done" ? "done" : "skip",
        detail: event.detail ?? prev.detail,
      };
      return { ...base, stages };
    }
    case "progress": {
      const stages = { ...base.stages };
      const prev = stages[event.stage];
      stages[event.stage] = {
        ...prev,
        status: prev.status === "pending" ? "active" : prev.status,
        progress: { done: event.done, total: event.total, detail: event.detail },
      };
      return { ...base, stages };
    }
    case "query":
      return { ...base, queries: [...base.queries, { query: event.query, provider: event.provider, results: event.results }] };
    case "source": {
      const exists = base.sources.findIndex((s) => s.id === event.source.id);
      const sources = [...base.sources];
      if (exists >= 0) sources[exists] = { ...sources[exists], ...event.source };
      else sources.push(event.source);
      return { ...base, sources };
    }
    case "option": {
      const exists = base.options.findIndex((o) => o.id === event.option.id);
      const options = [...base.options];
      if (exists >= 0) options[exists] = { ...options[exists], ...event.option, image: event.option.image ?? options[exists].image };
      else options.push(event.option);
      return { ...base, options };
    }
    case "claim": {
      const exists = base.claims.findIndex((c) => c.id === event.claim.id);
      const claims = [...base.claims];
      const claim: LiveClaim = { ...event.claim, at: Date.now() };
      if (exists >= 0) claims[exists] = { ...claims[exists], ...claim };
      else claims.push(claim);
      return { ...base, claims };
    }
    case "log":
      return { ...base, logs: [...base.logs.slice(-49), event.message] };
    case "done": {
      const stages = { ...base.stages };
      for (const s of STAGES) if (stages[s].status === "active") stages[s] = { ...stages[s], status: "done" };
      return { ...base, phase: "finished", stages, runId: event.runId };
    }
    case "error":
      return { ...base, phase: "failed", error: event.message };
  }
}

export function claimTally(claims: Array<{ status?: VerificationStatus }>): Record<VerificationStatus, number> {
  const t: Record<VerificationStatus, number> = { supported: 0, partial: 0, unsupported: 0, contradicted: 0 };
  for (const c of claims) if (c.status) t[c.status]++;
  return t;
}
