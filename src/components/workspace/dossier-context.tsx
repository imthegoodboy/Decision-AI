"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Claim, Criterion, DecisionBundle, DecisionOption, Dossier, Source } from "@/lib/domain";
import { decisiveness, effectiveWeights, rankOptions, type RankedOption } from "@/lib/scoring";

export type DrawerTarget = { kind: "claim"; id: string } | { kind: "source"; id: string } | null;

type DossierCtx = {
  decisionId: string;
  dossier: Dossier | null;
  sources: Source[];
  claimById: Map<string, Claim>;
  sourceById: Map<string, Source>;
  optionById: Map<string, DecisionOption>;
  criterionById: Map<string, Criterion>;
  /** Ranking with the user's current slider weights. */
  ranked: RankedOption[];
  /** Ranking with the weights the plan derived from the user's stated priorities. */
  baselineRanked: RankedOption[];
  weights: Record<string, number>;
  effective: Map<string, number>;
  decisiveness: ReturnType<typeof decisiveness>;
  drawer: DrawerTarget;
  openClaim: (id: string) => void;
  openSource: (id: string) => void;
  closeDrawer: () => void;
};

const Ctx = createContext<DossierCtx | null>(null);

export function DossierProvider({
  bundle,
  weights,
  children,
}: {
  bundle: DecisionBundle;
  weights: Record<string, number>;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const dossier = bundle.run?.dossier ?? null;
  const sources = bundle.sources;

  const maps = useMemo(() => {
    return {
      claimById: new Map((dossier?.claims ?? []).map((c) => [c.id, c])),
      sourceById: new Map(sources.map((s) => [s.id, s])),
      optionById: new Map((dossier?.options ?? []).map((o) => [o.id, o])),
      criterionById: new Map((dossier?.plan.criteria ?? []).map((c) => [c.id, c])),
    };
  }, [dossier, sources]);

  const rankingBase = useMemo(() => {
    if (!dossier) return null;
    return {
      options: dossier.options,
      criteria: dossier.plan.criteria,
      scores: dossier.scores,
      claims: dossier.claims,
      sources,
      contradictions: dossier.contradictions,
      freshnessDays: dossier.plan.freshnessDays,
    };
  }, [dossier, sources]);

  const ranked = useMemo(
    () => (rankingBase ? rankOptions({ ...rankingBase, weightOverrides: weights }) : []),
    [rankingBase, weights],
  );
  const baselineRanked = useMemo(() => (rankingBase ? rankOptions(rankingBase) : []), [rankingBase]);
  const effective = useMemo(() => effectiveWeights(dossier?.plan.criteria ?? [], weights), [dossier, weights]);

  const openClaim = useCallback((id: string) => setDrawer({ kind: "claim", id }), []);
  const openSource = useCallback((id: string) => setDrawer({ kind: "source", id }), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const value = useMemo<DossierCtx>(
    () => ({
      decisionId: bundle.decision.id,
      dossier,
      sources,
      ...maps,
      ranked,
      baselineRanked,
      weights,
      effective,
      decisiveness: decisiveness(ranked),
      drawer,
      openClaim,
      openSource,
      closeDrawer,
    }),
    [bundle.decision.id, dossier, sources, maps, ranked, baselineRanked, weights, effective, drawer, openClaim, openSource, closeDrawer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDossier(): DossierCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDossier must be used inside DossierProvider");
  return ctx;
}
