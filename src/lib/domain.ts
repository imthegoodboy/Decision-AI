/**
 * Domain model for Decision AI.
 *
 * Every type is inferred from a zod schema so that data read from the database,
 * returned by the model, or received over the wire is validated by the same
 * definition the compiler checks against. This file is isomorphic: it is used by
 * route handlers, the research pipeline and client components alike.
 */
import { z } from "zod";

/* ───────────────────────────── Decision profile ───────────────────────────── */

export const Importance = z.enum(["must", "high", "medium", "low"]);
export type Importance = z.infer<typeof Importance>;

export const DecisionProfile = z.object({
  goal: z.string().describe("One-sentence restatement of what the user is deciding"),
  category: z.string().describe("Short free-form category, e.g. 'smartphone purchase'"),
  locale: z.object({
    country: z.string().nullable(),
    currency: z.string().nullable(),
  }),
  budget: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable(),
      note: z.string().nullable(),
    })
    .nullable(),
  requirements: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      importance: Importance,
    }),
  ),
  priorities: z.array(
    z.object({
      name: z.string(),
      weight: z.number().min(0).max(100),
      reason: z.string().nullable(),
    }),
  ),
  constraints: z.array(z.string()),
  candidates: z.array(z.string()).describe("Options the user explicitly named"),
  context: z.array(z.string()).describe("Facts about the user's situation"),
  exclusions: z.array(z.string()),
});
export type DecisionProfile = z.infer<typeof DecisionProfile>;

export function emptyProfile(): DecisionProfile {
  return {
    goal: "",
    category: "",
    locale: { country: null, currency: null },
    budget: null,
    requirements: [],
    priorities: [],
    constraints: [],
    candidates: [],
    context: [],
    exclusions: [],
  };
}

/* ───────────────────────────── Conversation ───────────────────────────── */

export const QuestionKind = z.enum(["single", "multi", "text", "number"]);

export const FollowUpQuestion = z.object({
  id: z.string(),
  prompt: z.string(),
  why: z.string().describe("Why the answer changes the recommendation"),
  kind: QuestionKind,
  options: z.array(z.string()),
  placeholder: z.string().nullable(),
});
export type FollowUpQuestion = z.infer<typeof FollowUpQuestion>;

export const AnalystAction = z.enum(["answer", "reweight", "update_profile", "deepen", "rerun"]);
export type AnalystAction = z.infer<typeof AnalystAction>;

export const MessageMeta = z
  .object({
    questions: z.array(FollowUpQuestion).optional(),
    readiness: z.number().min(0).max(1).optional(),
    readyToResearch: z.boolean().optional(),
    missing: z.array(z.string()).optional(),
    action: AnalystAction.optional(),
    runId: z.string().optional(),
    citations: z.array(z.string()).optional(),
    kind: z.enum(["intake", "analyst", "research-event", "error"]).optional(),
  })
  .catchall(z.unknown());
export type MessageMeta = z.infer<typeof MessageMeta>;

export const MessageRole = z.enum(["user", "assistant", "system"]);

export const Message = z.object({
  id: z.string(),
  decisionId: z.string(),
  role: MessageRole,
  content: z.string(),
  meta: MessageMeta,
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;

/* ───────────────────────────── Research plan ───────────────────────────── */

export const Criterion = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  weight: z.number().min(0).max(100),
  origin: z.enum(["user", "inferred"]),
});
export type Criterion = z.infer<typeof Criterion>;

export const QueryIntent = z.enum([
  "discover",
  "specifications",
  "reviews",
  "pricing",
  "reliability",
  "official",
  "comparison",
  "news",
]);

export const SearchQuery = z.object({
  query: z.string(),
  intent: QueryIntent,
  optionHint: z.string().nullable(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const ResearchPlan = z.object({
  decisionType: z.string(),
  criteria: z.array(Criterion),
  queries: z.array(SearchQuery),
  freshnessDays: z.number().int().min(7).max(3650),
  region: z.string().nullable(),
  rationale: z.string(),
});
export type ResearchPlan = z.infer<typeof ResearchPlan>;

/* ───────────────────────────── Sources ───────────────────────────── */

export const SourceKind = z.enum([
  "official",
  "independent-review",
  "news",
  "retailer",
  "forum",
  "reference",
  "academic",
  "government",
  "blog",
  "video",
  "other",
]);
export type SourceKind = z.infer<typeof SourceKind>;

export const ReliabilitySignal = z.object({
  key: z.string(),
  label: z.string(),
  effect: z.number(),
  detail: z.string(),
});
export type ReliabilitySignal = z.infer<typeof ReliabilitySignal>;

export const Source = z.object({
  id: z.string(),
  runId: z.string(),
  decisionId: z.string(),
  url: z.string(),
  domain: z.string(),
  title: z.string(),
  siteName: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  retrievedAt: z.string(),
  contentHash: z.string(),
  wordCount: z.number(),
  excerpt: z.string(),
  image: z.string().nullable(),
  favicon: z.string().nullable(),
  kind: SourceKind,
  perspective: z.string().nullable(),
  status: z.enum(["read", "snippet", "failed"]),
  query: z.string().nullable(),
  provider: z.string(),
  reliability: z.object({
    score: z.number().min(0).max(100),
    signals: z.array(ReliabilitySignal),
  }),
});
export type Source = z.infer<typeof Source>;

/* ───────────────────────────── Options, claims, verification ───────────────────────────── */

export const OptionImage = z.object({
  url: z.string(),
  alt: z.string(),
  sourceUrl: z.string().nullable(),
  origin: z.enum(["search", "page", "wikipedia"]),
});
export type OptionImage = z.infer<typeof OptionImage>;

export const DecisionOption = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  image: OptionImage.nullable(),
  officialUrl: z.string().nullable(),
  priceText: z.string().nullable(),
  userNamed: z.boolean(),
  sourceIds: z.array(z.string()),
});
export type DecisionOption = z.infer<typeof DecisionOption>;

export const VerificationStatus = z.enum(["supported", "partial", "unsupported", "contradicted"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const Verification = z.object({
  status: VerificationStatus,
  confidence: z.number().min(0).max(1),
  quoteFound: z.boolean(),
  quoteSimilarity: z.number().min(0).max(1),
  passage: z.object({ id: z.string(), text: z.string() }).nullable(),
  rationale: z.string(),
  corroboratingSourceIds: z.array(z.string()),
  conflictingSourceIds: z.array(z.string()),
  conflictNote: z.string().nullable(),
  verifiedAt: z.string(),
});
export type Verification = z.infer<typeof Verification>;

export const ClaimKind = z.enum([
  "specification",
  "price",
  "performance",
  "policy",
  "fact",
  "opinion",
  "experience",
]);
export type ClaimKind = z.infer<typeof ClaimKind>;

export const Claim = z.object({
  id: z.string(),
  optionId: z.string().nullable(),
  criterionId: z.string().nullable(),
  text: z.string(),
  kind: ClaimKind,
  sourceId: z.string(),
  quote: z.string(),
  verification: Verification.nullable(),
});
export type Claim = z.infer<typeof Claim>;

export const Contradiction = z.object({
  id: z.string(),
  optionId: z.string().nullable(),
  criterionId: z.string().nullable(),
  topic: z.string(),
  statements: z.array(
    z.object({ claimId: z.string().nullable(), sourceId: z.string(), text: z.string() }),
  ),
  assessment: z.string(),
  favoredSourceId: z.string().nullable(),
  severity: z.enum(["high", "medium", "low"]),
});
export type Contradiction = z.infer<typeof Contradiction>;

export const UncertaintyKind = z.enum([
  "assumption",
  "incomplete",
  "unknown",
  "outdated",
  "single-source",
]);
export type UncertaintyKind = z.infer<typeof UncertaintyKind>;

export const Uncertainty = z.object({
  id: z.string(),
  kind: UncertaintyKind,
  text: z.string(),
  optionId: z.string().nullable(),
  impact: z.enum(["high", "medium", "low"]),
  howToResolve: z.string().nullable(),
});
export type Uncertainty = z.infer<typeof Uncertainty>;

export const CriterionScore = z.object({
  optionId: z.string(),
  criterionId: z.string(),
  score: z.number().min(0).max(10).nullable(),
  rationale: z.string(),
  claimIds: z.array(z.string()),
});
export type CriterionScore = z.infer<typeof CriterionScore>;

export const Recommendation = z.object({
  optionId: z.string(),
  headline: z.string(),
  summary: z.string(),
  reasons: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })),
  tradeoffs: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })),
  alternatives: z.array(z.object({ optionId: z.string(), when: z.string() })),
  caveats: z.array(z.string()),
  nextSteps: z.array(z.string()),
});
export type Recommendation = z.infer<typeof Recommendation>;

export const RunMetrics = z.object({
  sourcesConsulted: z.number(),
  sourcesRead: z.number(),
  claimsTotal: z.number(),
  supported: z.number(),
  partial: z.number(),
  unsupported: z.number(),
  contradicted: z.number(),
  contradictions: z.number(),
  averageReliability: z.number(),
  freshShare: z.number(),
  durationMs: z.number(),
  modelCalls: z.number(),
  tokens: z.number(),
});
export type RunMetrics = z.infer<typeof RunMetrics>;

export const Dossier = z.object({
  plan: ResearchPlan,
  options: z.array(DecisionOption),
  claims: z.array(Claim),
  contradictions: z.array(Contradiction),
  uncertainties: z.array(Uncertainty),
  scores: z.array(CriterionScore),
  recommendation: Recommendation.nullable(),
  metrics: RunMetrics,
});
export type Dossier = z.infer<typeof Dossier>;

/* ───────────────────────────── Runs, decisions, audit ───────────────────────────── */

export const RunStatus = z.enum(["running", "completed", "failed"]);

export const ResearchRun = z.object({
  id: z.string(),
  decisionId: z.string(),
  version: z.number(),
  status: RunStatus,
  trigger: z.string(),
  focus: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  plan: ResearchPlan.nullable(),
  dossier: Dossier.nullable(),
  dossierHash: z.string().nullable(),
});
export type ResearchRun = z.infer<typeof ResearchRun>;

export const DecisionStatus = z.enum(["intake", "researching", "ready", "failed"]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const Decision = z.object({
  id: z.string(),
  title: z.string(),
  status: DecisionStatus,
  profile: DecisionProfile,
  weights: z.record(z.string(), z.number()).describe("User overrides keyed by criterion id"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Decision = z.infer<typeof Decision>;

export const DecisionSummary = Decision.pick({
  id: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({ category: z.string() });
export type DecisionSummary = z.infer<typeof DecisionSummary>;

export const AuditEvent = z.object({
  id: z.string(),
  decisionId: z.string(),
  seq: z.number(),
  type: z.string(),
  payload: z.unknown(),
  prevHash: z.string(),
  hash: z.string(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const ChainVerification = z.object({
  valid: z.boolean(),
  checked: z.number(),
  brokenAt: z.number().nullable(),
  reason: z.string().nullable(),
  headHash: z.string().nullable(),
  dossierChecks: z.array(
    z.object({ runId: z.string(), valid: z.boolean(), expected: z.string(), actual: z.string() }),
  ),
});
export type ChainVerification = z.infer<typeof ChainVerification>;

/** Everything the workspace needs to render one decision. */
export type DecisionBundle = {
  decision: Decision;
  messages: Message[];
  run: ResearchRun | null;
  sources: Source[];
  runs: Array<Pick<ResearchRun, "id" | "version" | "status" | "trigger" | "startedAt" | "completedAt">>;
};

/* ───────────────────────────── Streaming events ───────────────────────────── */

export const STAGES = [
  "plan",
  "search",
  "read",
  "assess",
  "options",
  "deepen",
  "extract",
  "verify",
  "contradictions",
  "score",
  "recommend",
  "seal",
] as const;
export type Stage = (typeof STAGES)[number];

export type PipelineEvent =
  | { type: "run"; runId: string; version: number }
  | { type: "stage"; stage: Stage; status: "start" | "done" | "skip"; detail?: string }
  | { type: "progress"; stage: Stage; done: number; total: number; detail?: string }
  | { type: "query"; query: string; provider: string; results: number }
  | { type: "source"; source: Pick<Source, "id" | "url" | "domain" | "title" | "favicon" | "status" | "kind"> & { reliability?: number } }
  | { type: "option"; option: Pick<DecisionOption, "id" | "name" | "image"> }
  | { type: "claim"; claim: Pick<Claim, "id" | "text" | "optionId" | "sourceId"> & { status?: VerificationStatus } }
  | { type: "log"; message: string }
  | { type: "done"; runId: string }
  | { type: "error"; message: string };
