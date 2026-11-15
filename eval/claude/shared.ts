import path from "node:path";
import type { PoolSource } from "@/server/pipeline/core";

/** Paths and types for the Claude-agent study (eval/claude). */

export const CLAUDE_DATA = path.join(process.cwd(), "eval", "data-claude");

export type StudyQuestion = { id: string; domain: string; region: string; question: string; queries: string[] };

export type StudyPool = {
  questionId: string;
  builtAt: string;
  queries: { query: string; provider: string | null; results: number; errors: string[] }[];
  sources: PoolSource[];
};

export type PlantedRecord = {
  questionId: string;
  title: string;
  siteName: string;
  author: string;
  publishedDaysAgo: number;
  article: string;
  falseClaims: { claim: string; option: string; truth: string; genuineSource: number }[];
};

export const STUDY_SYSTEMS = ["baseline", "selfcheck", "tool"] as const;
export type StudySystem = (typeof STUDY_SYSTEMS)[number];
export const STUDY_CONDITIONS = ["clean", "poisoned"] as const;
export type StudyCondition = (typeof STUDY_CONDITIONS)[number];
