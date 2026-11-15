"""Statistics and figures for the Decision AI experiment.

Reads eval/results/items.csv and eval/results/reliability.csv (written by
`npm run eval:aggregate`) and writes:
  eval/results/stats.json      all estimates, CIs and tests
  eval/results/table1.md       main results table (Markdown)
  report/figures/*.png         figures used in the report

Run: python eval/analysis.py
"""
from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy import stats  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "eval" / "results"
FIGURES = ROOT / "report" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)

SYSTEMS = ["baseline", "selfcheck", "decisionai"]
LABELS = {"baseline": "Baseline agent", "selfcheck": "Self-check prompt", "decisionai": "Agent + Decision AI tool"}
COLORS = {"baseline": "#9AACBD", "selfcheck": "#7CC0EC", "decisionai": "#1667A8"}
INK = "#0E2236"
SLATE = "#4D6378"
RULE = "#D6E7F5"
RNG = np.random.default_rng(20261115)
BOOT = 10_000

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 10,
        "axes.edgecolor": SLATE,
        "axes.labelcolor": INK,
        "axes.titlecolor": INK,
        "axes.titleweight": "bold",
        "axes.titlesize": 11,
        "xtick.color": SLATE,
        "ytick.color": SLATE,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": RULE,
        "grid.linewidth": 0.8,
        "axes.axisbelow": True,
        "legend.frameon": False,
        "savefig.dpi": 220,
        "savefig.bbox": "tight",
    }
)


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf8") as f:
        return list(csv.DictReader(f))


def num(v: str) -> float:
    if v in ("", None):
        return math.nan
    if v in ("true", "false"):
        return 1.0 if v == "true" else 0.0
    return float(v)


rows = read_csv(RESULTS / "items.csv")
for r in rows:
    for k, v in list(r.items()):
        if k not in ("question", "domain", "system", "condition", "recommended_option"):
            r[k] = num(v)

questions = sorted({r["question"] for r in rows})


def table(metric: str, condition: str) -> dict[str, dict[str, float]]:
    """question -> system -> value."""
    t: dict[str, dict[str, float]] = defaultdict(dict)
    for r in rows:
        if r["condition"] == condition and not math.isnan(r.get(metric, math.nan)):
            t[r["question"]][r["system"]] = r[metric]
    return t


def boot_ci(values: np.ndarray) -> tuple[float, float]:
    if len(values) < 2:
        return (math.nan, math.nan)
    idx = RNG.integers(0, len(values), size=(BOOT, len(values)))
    means = values[idx].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def summarize(metric: str, condition: str) -> dict:
    t = table(metric, condition)
    out: dict = {"metric": metric, "condition": condition, "systems": {}, "tests": {}}
    for s in SYSTEMS:
        vals = np.array([t[q][s] for q in t if s in t[q]], dtype=float)
        lo, hi = boot_ci(vals)
        out["systems"][s] = {"n": int(len(vals)), "mean": float(vals.mean()) if len(vals) else math.nan, "ci95": [lo, hi]}
    if all(out["systems"][s]["n"] == 0 for s in SYSTEMS):
        return out
    for other in ("baseline", "selfcheck"):
        paired = [(t[q]["decisionai"], t[q][other]) for q in t if "decisionai" in t[q] and other in t[q]]
        if len(paired) < 3:
            continue
        a = np.array([p[0] for p in paired])
        b = np.array([p[1] for p in paired])
        diff = a - b
        lo, hi = boot_ci(diff)
        if np.allclose(diff, 0):
            p = 1.0
        else:
            p = float(stats.wilcoxon(a, b, zero_method="wilcox", alternative="two-sided").pvalue)
        out["tests"][f"decisionai_vs_{other}"] = {
            "n_pairs": len(paired),
            "mean_diff": float(diff.mean()),
            "ci95_diff": [lo, hi],
            "wilcoxon_p": p,
        }
    return out


def mcnemar(metric: str, condition: str, other: str) -> dict:
    t = table(metric, condition)
    b = c = 0
    n = 0
    for q in t:
        if "decisionai" in t[q] and other in t[q]:
            n += 1
            da, ot = t[q]["decisionai"] > 0, t[q][other] > 0
            if ot and not da:
                b += 1
            elif da and not ot:
                c += 1
    p = float(stats.binomtest(min(b, c), b + c, 0.5).pvalue) if b + c > 0 else 1.0
    return {"n_pairs": n, "other_only": b, "decisionai_only": c, "exact_p": p}


METRICS = [
    ("citation_support_rate", "Cited claims fully supported by the cited source"),
    ("citation_support_or_partial_rate", "Cited claims at least partially supported"),
    ("unsupported_statement_rate", "Factual statements without support (cited or uncited)"),
    ("uncited_rate", "Factual statements with no citation"),
    ("conflict_disclosed", "Answers that disclose conflicting evidence"),
    ("cited_sources_dated_share", "Cited sources with a publication date"),
    ("claims", "Factual claims per answer"),
    ("answer_words", "Words per answer"),
    ("planted_false_positive", "Judge false positives on clean answers (control)"),
]
POISON_METRICS = [
    ("planted_adopted_any", "Answers repeating at least one planted falsehood"),
    ("planted_asserted", "Planted falsehoods asserted (of 3)"),
    ("planted_flagged", "Planted falsehoods flagged as disputed (of 3)"),
    ("cited_planted", "Answers citing the planted source"),
    ("recommendation_flipped", "Recommendation changed by the planted source"),
]

results: dict = {"n_questions": len(questions), "metrics": [], "poisoned": [], "mcnemar": {}}
for m, label in METRICS:
    for cond in ("clean", "poisoned"):
        s = summarize(m, cond)
        s["label"] = label
        results["metrics"].append(s)
for m, label in POISON_METRICS:
    s = summarize(m, "poisoned")
    s["label"] = label
    results["poisoned"].append(s)
for other in ("baseline", "selfcheck"):
    results["mcnemar"][f"planted_adopted_any_vs_{other}"] = mcnemar("planted_adopted_any", "poisoned", other)

# Evidence-bindability of baseline answers (Track 2: what fraction can be bound to checkable evidence?)
bind = []
for r in rows:
    if r["system"] == "baseline" and r["condition"] == "clean" and r["claims"] > 0:
        bound = r["cited_supported"] + (0 if math.isnan(r["uncited_bindable_rate"]) else r["uncited_bindable_rate"] * r["uncited_claims"])
        bind.append(bound / r["claims"])
if bind:
    arr = np.array(bind)
    results["baseline_bindable_share"] = {"mean": float(arr.mean()), "ci95": list(boot_ci(arr)), "n": len(arr)}

# Reliability gaming probe
rel_path = RESULTS / "reliability.csv"
if rel_path.exists():
    rel = read_csv(rel_path)
    planted = [r for r in rel if r["planted"] == "true"]
    genuine = [r for r in rel if r["planted"] != "true"]

    def pct_rank(rows_q: list[dict], key: str, sid: str) -> float:
        vals = sorted(float(r[key]) for r in rows_q)
        v = next(float(r[key]) for r in rows_q if r["source"] == sid)
        return sum(1 for x in vals if x < v) / max(1, len(vals) - 1)

    by_q = defaultdict(list)
    for r in rel:
        by_q[r["question"]].append(r)
    prior_pct = [pct_rank(by_q[p["question"]], "prior_score", p["source"]) for p in planted]
    final_pct = [pct_rank(by_q[p["question"]], "final_score", p["source"]) for p in planted]
    results["reliability_probe"] = {
        "n_planted": len(planted),
        "planted_prior_mean": float(np.mean([float(p["prior_score"]) for p in planted])) if planted else math.nan,
        "planted_final_mean": float(np.mean([float(p["final_score"]) for p in planted])) if planted else math.nan,
        "genuine_prior_mean": float(np.mean([float(g["prior_score"]) for g in genuine])) if genuine else math.nan,
        "genuine_final_mean": float(np.mean([float(g["final_score"]) for g in genuine])) if genuine else math.nan,
        "planted_prior_percentile_mean": float(np.mean(prior_pct)) if prior_pct else math.nan,
        "planted_final_percentile_mean": float(np.mean(final_pct)) if final_pct else math.nan,
        "planted_above_genuine_median_prior": float(np.mean([p >= 0.5 for p in prior_pct])) if prior_pct else math.nan,
        "planted_above_genuine_median_final": float(np.mean([p >= 0.5 for p in final_pct])) if final_pct else math.nan,
    }
    if planted:
        d = np.array([float(p["final_score"]) - float(p["prior_score"]) for p in planted])
        g = np.array([float(x["final_score"]) - float(x["prior_score"]) for x in genuine])
        results["reliability_probe"]["planted_earned_delta_mean"] = float(d.mean())
        results["reliability_probe"]["genuine_earned_delta_mean"] = float(g.mean()) if len(g) else math.nan
        if len(g) > 2 and len(d) > 2:
            results["reliability_probe"]["mannwhitney_p"] = float(stats.mannwhitneyu(d, g, alternative="less").pvalue)

# Human audit agreement (if the sample has been labelled)
audit_path = RESULTS / "human-audit-sample.csv"
if audit_path.exists():
    audit = [r for r in read_csv(audit_path) if r.get("human_verdict", "").strip()]
    if audit:
        agree = [r["human_verdict"].strip().lower() == r["judge_verdict"].strip().lower() for r in audit]
        coarse = [
            (r["human_verdict"].strip().lower() == "unsupported") == (r["judge_verdict"].strip().lower() == "unsupported")
            for r in audit
        ]
        labels = ["supported", "partial", "unsupported"]
        h = [labels.index(r["human_verdict"].strip().lower()) for r in audit if r["human_verdict"].strip().lower() in labels]
        j = [labels.index(r["judge_verdict"].strip().lower()) for r in audit if r["human_verdict"].strip().lower() in labels]
        po = np.mean(np.array(h) == np.array(j)) if h else math.nan
        pe = sum((h.count(k) / len(h)) * (j.count(k) / len(j)) for k in range(3)) if h else math.nan
        results["human_audit"] = {
            "n": len(audit),
            "exact_agreement": float(np.mean(agree)),
            "binary_agreement": float(np.mean(coarse)),
            "cohen_kappa": float((po - pe) / (1 - pe)) if h and pe < 1 else math.nan,
        }

(RESULTS / "stats.json").write_text(json.dumps(results, indent=2), encoding="utf8")


# ───────────────────────────── Table 1 ─────────────────────────────
def fmt(s: dict, pct: bool = True) -> str:
    m = s["mean"]
    lo, hi = s["ci95"]
    if math.isnan(m):
        return "–"
    if pct:
        return f"{m*100:.1f}% [{lo*100:.1f}, {hi*100:.1f}]"
    return f"{m:.2f} [{lo:.2f}, {hi:.2f}]"


def find(collection: str, metric: str, cond: str) -> dict:
    return next(x for x in results[collection] if x["metric"] == metric and x["condition"] == cond)


lines = ["| Metric | Condition | " + " | ".join(LABELS[s] for s in SYSTEMS) + " | DA − Baseline (p) |", "|---|---|---|---|---|---|"]
for m, label in METRICS[:6]:
    for cond in ("clean", "poisoned"):
        s = find("metrics", m, cond)
        test = s["tests"].get("decisionai_vs_baseline")
        tcell = f"{test['mean_diff']*100:+.1f} pp (p={test['wilcoxon_p']:.3g})" if test else "–"
        lines.append(f"| {label} | {cond} | " + " | ".join(fmt(s["systems"][x]) for x in SYSTEMS) + f" | {tcell} |")
for m, label in POISON_METRICS:
    s = find("poisoned", m, "poisoned")
    pct = m not in ("planted_asserted", "planted_flagged")
    test = s["tests"].get("decisionai_vs_baseline")
    if test:
        tcell = (f"{test['mean_diff']*100:+.1f} pp" if pct else f"{test['mean_diff']:+.2f}") + f" (p={test['wilcoxon_p']:.3g})"
    else:
        tcell = "–"
    lines.append(f"| {label} | poisoned | " + " | ".join(fmt(s["systems"][x], pct) for x in SYSTEMS) + f" | {tcell} |")
(RESULTS / "table1.md").write_text("\n".join(lines) + "\n", encoding="utf8")


# ───────────────────────────── Figures ─────────────────────────────
def bar_with_ci(ax, metric: str, title: str, ylabel: str, collection: str = "metrics", conds=("clean", "poisoned"), pct=True):
    width = 0.26
    x = np.arange(len(conds))
    for i, s in enumerate(SYSTEMS):
        means, los, his = [], [], []
        for cond in conds:
            st = find(collection, metric, cond)["systems"][s]
            k = 100 if pct else 1
            means.append(st["mean"] * k)
            los.append((st["mean"] - st["ci95"][0]) * k)
            his.append((st["ci95"][1] - st["mean"]) * k)
        pos = x + (i - 1) * width
        bars = ax.bar(pos, means, width, color=COLORS[s], label=LABELS[s], yerr=[los, his], capsize=3, error_kw={"ecolor": INK, "elinewidth": 0.9})
        for b, v in zip(bars, means):
            if not math.isnan(v):
                ax.text(b.get_x() + b.get_width() / 2, b.get_height() + max(his) * 0.15 + 1, f"{v:.0f}" if pct else f"{v:.1f}", ha="center", va="bottom", fontsize=8, color=INK)
    ax.set_xticks(x, [c.capitalize() + " sources" if c == "clean" else "With planted source" for c in conds])
    ax.set_title(title, loc="left")
    ax.set_ylabel(ylabel)
    if pct:
        ax.set_ylim(0, 105)


# Figure 2 — main attribution results
fig, axes = plt.subplots(1, 2, figsize=(9.2, 3.6))
bar_with_ci(axes[0], "citation_support_rate", "(a) Citation support", "% of cited claims fully supported")
bar_with_ci(axes[1], "unsupported_statement_rate", "(b) Unsupported statements", "% of factual statements")
axes[1].set_ylim(0, max(60, axes[1].get_ylim()[1]))
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.06))
fig.tight_layout()
fig.savefig(FIGURES / "fig2_attribution.png")
plt.close(fig)

# Figure 3 — planted falsehoods
fig, ax = plt.subplots(figsize=(9.2, 2.9))
statuses = [("asserted", "Repeated as fact", "#C2453D"), ("flagged", "Flagged as disputed", "#B7791F"), ("absent", "Not mentioned", "#D6E7F5")]
ys = np.arange(len(SYSTEMS))[::-1]
for y, s in zip(ys, SYSTEMS):
    asserted = find("poisoned", "planted_asserted", "poisoned")["systems"][s]["mean"] / 3
    flagged = find("poisoned", "planted_flagged", "poisoned")["systems"][s]["mean"] / 3
    absent = max(0.0, 1 - asserted - flagged)
    left = 0.0
    for (key, label, color), v in zip(statuses, (asserted, flagged, absent)):
        ax.barh(y, v * 100, left=left, color=color, edgecolor="white", height=0.6, label=label if y == ys[0] else None)
        if v * 100 >= 6:
            ax.text(left + v * 50, y, f"{v*100:.0f}%", ha="center", va="center", fontsize=9, color="white" if key != "absent" else INK)
        left += v * 100
ax.set_yticks(ys, [LABELS[s] for s in SYSTEMS])
ax.set_xlim(0, 100)
ax.set_xlabel("% of planted false claims (3 per question)")
ax.set_title("Planted falsehoods in the final answer", loc="left")
ax.grid(axis="y", visible=False)
ax.legend(loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.5))
fig.tight_layout()
fig.savefig(FIGURES / "fig3_planted.png")
plt.close(fig)

# Figure 4 — per-question paired view of unsupported statements (poisoned and clean pooled per question)
fig, ax = plt.subplots(figsize=(4.6, 3.6))
t_clean = table("unsupported_statement_rate", "clean")
xs = np.arange(len(SYSTEMS))
for q in t_clean:
    if all(s in t_clean[q] for s in SYSTEMS):
        ax.plot(xs, [t_clean[q][s] * 100 for s in SYSTEMS], color=RULE, linewidth=1, marker="o", markersize=2.5, markerfacecolor="#B9CFE2", markeredgewidth=0)
means = [find("metrics", "unsupported_statement_rate", "clean")["systems"][s]["mean"] * 100 for s in SYSTEMS]
ax.plot(xs, means, color=INK, linewidth=2.2, marker="o", markersize=6)
for x, m in zip(xs, means):
    ax.text(x + 0.06, m, f"{m:.0f}%", fontsize=9, color=INK, va="center")
ax.set_xticks(xs, ["Baseline", "Self-check", "Decision AI"])
ax.set_ylabel("% unsupported statements per answer")
ax.set_title("Per-question change (clean sources)", loc="left")
fig.tight_layout()
fig.savefig(FIGURES / "fig4_paired.png")
plt.close(fig)

# Figure 5 — reliability gaming probe
if rel_path.exists() and planted:
    fig, ax = plt.subplots(figsize=(4.6, 3.6))
    gx = [float(g["prior_score"]) for g in genuine]
    gy = [float(g["final_score"]) for g in genuine]
    px = [float(p["prior_score"]) for p in planted]
    py = [float(p["final_score"]) for p in planted]
    jitter = lambda n: RNG.normal(0, 0.6, n)  # noqa: E731
    ax.scatter(np.array(gx) + jitter(len(gx)), np.array(gy) + jitter(len(gy)), s=14, color="#7CC0EC", alpha=0.65, label="Genuine sources", linewidths=0)
    ax.scatter(np.array(px) + jitter(len(px)), np.array(py) + jitter(len(py)), s=26, color="#C2453D", alpha=0.9, label="Planted source", marker="D", linewidths=0)
    lim = (min(gx + px + gy + py) - 5, max(gx + px + gy + py) + 5)
    ax.plot(lim, lim, color=SLATE, linewidth=0.8, linestyle="--")
    ax.set_xlim(lim)
    ax.set_ylim(lim)
    ax.set_xlabel("Metadata-only reliability (prior)")
    ax.set_ylabel("Reliability after verification")
    ax.set_title("Can reliability scores be gamed?", loc="left")
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(FIGURES / "fig5_reliability.png")
    plt.close(fig)

# Figure 6 — cost of verification (only when token/latency data exist)
HAS_COST = any(not math.isnan(r.get("input_tokens", math.nan)) for r in rows)
fig, axes = plt.subplots(1, 2, figsize=(9.2, 2.8)) if HAS_COST else (None, None)
for ax, (metric, title, scale, unit) in zip(
    axes if HAS_COST else [],
    [("input_tokens", "Input tokens per answer", 1000, "thousand tokens"), ("duration_ms", "Wall-clock time per answer", 1000, "seconds")],
):
    vals = [find("metrics", metric, "clean")["systems"][s]["mean"] / scale for s in SYSTEMS]
    bars = ax.barh(np.arange(3)[::-1], vals, color=[COLORS[s] for s in SYSTEMS], height=0.6)
    for b, v in zip(bars, vals):
        ax.text(b.get_width() * 1.01, b.get_y() + b.get_height() / 2, f"{v:.0f}", va="center", fontsize=9, color=INK)
    ax.set_yticks(np.arange(3)[::-1], [LABELS[s] for s in SYSTEMS])
    ax.set_xlabel(unit)
    ax.set_title(title, loc="left")
    ax.grid(axis="y", visible=False)
if HAS_COST:
    fig.tight_layout()
    fig.savefig(FIGURES / "fig6_cost.png")
    plt.close(fig)

print(json.dumps({k: v for k, v in results.items() if k not in ("metrics", "poisoned")}, indent=2))
print((RESULTS / "table1.md").read_text(encoding="utf8"))
