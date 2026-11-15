import type { VerificationStatus } from "./domain";

/**
 * Fixed verification rules, shared by the app's verifier and the agent-facing
 * provenance tool (documented in .agent/pipeline.md):
 *  - Evidence that conflicts with another source and is not corroborated → contradicted.
 *  - "Supported" whose quote cannot be found in the page text is downgraded to partial.
 *  - Otherwise the judge's support verdict stands.
 */
export function decideStatus(input: {
  support: "supported" | "partial" | "unsupported";
  quoteFound: boolean;
  conflicting: number;
  corroborating: number;
}): VerificationStatus {
  if (input.support !== "unsupported" && input.conflicting > 0 && input.corroborating === 0) return "contradicted";
  if (input.support === "supported" && !input.quoteFound) return "partial";
  return input.support;
}
