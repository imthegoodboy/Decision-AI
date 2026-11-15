"""Builds report/Decision-AI-report.pdf from template.html, section files and real results.

Every number in the report comes from eval/results/stats.json through placeholders
such as {{pct:metrics.citation_support_rate.clean.baseline}} — nothing is typed by hand.

Run: python report/build.py            (HTML + PDF)
     python report/build.py --html     (HTML only)
"""
from __future__ import annotations

import html
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "report"
SECTIONS = REPORT / "sections"
STATS = ROOT / "eval" / "results" / "stats.json"

stats = json.loads(STATS.read_text(encoding="utf8")) if STATS.exists() else {}
authors = json.loads((REPORT / "authors.json").read_text(encoding="utf8"))
config = json.loads((REPORT / "config.json").read_text(encoding="utf8")) if (REPORT / "config.json").exists() else {}


def lookup(path: str):
    parts = path.split(".")
    head = parts[0]
    if head in ("metrics", "poisoned"):
        metric = parts[1]
        if head == "metrics":
            cond = parts[2]
            rest = parts[3:]
        else:
            cond = "poisoned"
            rest = parts[2:]
        entry = next(x for x in stats[head] if x["metric"] == metric and x["condition"] == cond)
        if rest[0] == "test":
            return entry["tests"][rest[1]]
        return entry["systems"][rest[0]]
    node = stats
    for p in parts:
        node = node[int(p)] if isinstance(node, list) else node[p]
    return node


def p_fmt(p: float) -> str:
    if p is None or (isinstance(p, float) and math.isnan(p)):
        return "p = n/a"
    if p < 0.001:
        return "p &lt; 0.001"
    return f"p = {p:.3f}" if p < 0.01 else f"p = {p:.2f}"


def render_token(kind: str, path: str) -> str:
    v = lookup(path)
    if kind == "pct":
        return f"{v['mean'] * 100:.1f}%"
    if kind == "pct0":
        return f"{v['mean'] * 100:.0f}%"
    if kind == "ci":
        lo, hi = v["ci95"]
        return f"[{lo * 100:.1f}, {hi * 100:.1f}]"
    if kind == "num":
        return f"{v['mean']:.2f}"
    if kind == "num1":
        return f"{v['mean']:.1f}"
    if kind == "num0":
        return f"{v['mean']:,.0f}"
    if kind == "kilo":
        return f"{v['mean'] / 1000:,.1f}k"
    if kind == "sec":
        return f"{v['mean'] / 1000:,.0f} s"
    if kind == "cin":
        lo, hi = v["ci95"]
        return f"[{lo:.2f}, {hi:.2f}]"
    if kind == "pp":
        return f"{v['mean_diff'] * 100:+.1f} pp"
    if kind == "ppci":
        lo, hi = v["ci95_diff"]
        return f"[{lo * 100:+.1f}, {hi * 100:+.1f}]"
    if kind == "diff":
        return f"{v['mean_diff']:+.2f}"
    if kind == "p":
        return p_fmt(v["wilcoxon_p"] if isinstance(v, dict) and "wilcoxon_p" in v else v.get("exact_p"))
    if kind == "pv":
        return p_fmt(float(v))
    if kind == "int":
        return f"{int(round(float(v))):,}"
    if kind == "raw":
        return f"{v}"
    if kind == "rawpct":
        return f"{float(v) * 100:.0f}%"
    if kind == "raw1":
        return f"{float(v):.1f}"
    if kind == "n":
        return str(v["n"] if isinstance(v, dict) else v)
    raise KeyError(kind)


def fill_numbers(text: str) -> str:
    return re.sub(r"\{\{(\w+):([\w.]+)\}\}", lambda m: render_token(m.group(1), m.group(2)), text)


def md_inline(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<i>\1</i>", s)
    s = re.sub(r"`(.+?)`", r'<span class="mono">\1</span>', s)
    s = re.sub(r"(https?://[^\s<)]+)", r'<a href="\1">\1</a>', s)
    return s


def related_work() -> str:
    text = (REPORT / "related-work.md").read_text(encoding="utf8")
    paras = [p.strip() for p in text.split("\n\n") if p.strip() and not p.startswith("## ")]
    return "\n".join(f"<p>{md_inline(p)}</p>" for p in paras)


def references() -> str:
    text = (REPORT / "references.md").read_text(encoding="utf8")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    items = re.findall(r"^\s*\d+\.\s+(.+?)(?=^\s*\d+\.\s|\Z)", text, flags=re.S | re.M)
    return "\n".join(f"<li>{md_inline(' '.join(i.split()))}</li>" for i in items)


def section(name: str, default: str = "") -> str:
    path = SECTIONS / f"{name}.html"
    return path.read_text(encoding="utf8") if path.exists() else default


def build() -> Path:
    tpl = (REPORT / "template.html").read_text(encoding="utf8")
    author_html = "".join(
        f'<div><div>{html.escape(a["name"])}</div><div class="aff">{html.escape(a["affiliation"])}</div></div>' for a in authors["authors"]
    )
    values = {
        "TITLE": config.get("title", "Decision AI"),
        "AUTHORS": author_html,
        "ABSTRACT": section("abstract", "<i>Abstract pending results.</i>"),
        "RELATED_WORK": related_work(),
        "RESULTS": section("results", "<p><i>Results pending.</i></p>"),
        "DISCUSSION": section("discussion", "<p><i>Pending.</i></p>"),
        "CONCLUSION": section("conclusion", "<p><i>Pending.</i></p>"),
        "ETHICS": section("ethics", "<p><i>Pending.</i></p>"),
        "APPENDIX_B": section("appendix_b", ""),
        "REFERENCES": references(),
        "ARTIFACTS": config.get("artifacts", "Demo video and slides (links in the submission form)."),
        "HUMAN_AUDIT_METHOD": section("human_audit_method", ""),
        "N_QUESTIONS": str(stats.get("n_questions", config.get("n_questions", 30))),
        "QUERIES": str(config.get("queries", 5)),
        "POOL_SIZE": str(config.get("pool_size", 8)),
        "CHAR_BUDGET": f"{config.get('char_budget', 9000):,}",
        "FAST_MODEL": config.get("fast_model", "gpt-5.4-mini"),
        "JUDGE_MODEL": config.get("judge_model", "gpt-5.5"),
        "SYSTEM_MODEL": config.get("system_model", "Claude Sonnet 5.5"),
        "N_RUNS": str(int(stats.get("n_questions", config.get("n_questions", 12))) * 6),
    }
    out = tpl
    for key, val in values.items():
        out = out.replace("{{" + key + "}}", val)
    # generic section tokens: {{SOME_NAME}} -> sections/some_name.html (empty if missing)
    for _ in range(3):
        out = re.sub(r"\{\{([A-Z][A-Z0-9_]+)\}\}", lambda m: section(m.group(1).lower(), ""), out)
        for key, val in values.items():
            out = out.replace("{{" + key + "}}", val)
    out = fill_numbers(out)
    leftovers = re.findall(r"\{\{[^}]+\}\}", out)
    if leftovers:
        raise SystemExit(f"Unfilled placeholders: {sorted(set(leftovers))}")
    html_path = REPORT / "report.html"
    html_path.write_text(out, encoding="utf8")
    return html_path


def to_pdf(html_path: Path) -> Path:
    candidates = [
        shutil.which("chrome"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        shutil.which("google-chrome"),
        shutil.which("chromium"),
    ]
    browser = next((c for c in candidates if c and Path(c).exists()), None)
    if not browser:
        raise SystemExit("No Chrome/Edge found to print the PDF.")
    pdf = REPORT / "Decision-AI-report.pdf"
    subprocess.run(
        [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--virtual-time-budget=15000",
            f"--print-to-pdf={pdf}",
            html_path.resolve().as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    return pdf


def build_slides() -> Path:
    """submission/slides.html (+ slides.pdf) from slides.template.html and sections/slides.json."""
    tpl = (ROOT / "submission" / "slides.template.html").read_text(encoding="utf8")
    texts = json.loads((SECTIONS / "slides.json").read_text(encoding="utf8"))
    values = {
        "AUTHORS_TEXT": " · ".join(a["name"] for a in authors["authors"]) + (f" · {authors.get('team')}" if authors.get("team") else ""),
        "N_QUESTIONS": str(stats.get("n_questions", config.get("n_questions", 12))),
        "N_RUNS": str(int(stats.get("n_questions", config.get("n_questions", 12))) * 6),
        **texts,
    }
    out = tpl
    for key, val in values.items():
        out = out.replace("{{" + key + "}}", val)
    out = fill_numbers(out)
    left = re.findall(r"\{\{[^}]+\}\}", out)
    if left:
        raise SystemExit(f"Unfilled slide placeholders: {sorted(set(left))}")
    html_path = ROOT / "submission" / "slides.html"
    html_path.write_text(out, encoding="utf8")
    return html_path


def print_pdf(html_path: Path, pdf: Path) -> Path:
    candidates = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", shutil.which("chrome"), shutil.which("google-chrome")]
    browser = next((c for c in candidates if c and Path(c).exists()), None)
    subprocess.run([browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000", f"--print-to-pdf={pdf}", html_path.resolve().as_uri()], check=True, capture_output=True)
    return pdf


if __name__ == "__main__":
    if "--video" in sys.argv:
        src = ROOT / "submission" / "video" / "scenes.template.json"
        filled = fill_numbers(src.read_text(encoding="utf8")).replace("&lt;", "<")
        json.loads(filled)
        (ROOT / "submission" / "video" / "scenes.json").write_text(filled, encoding="utf8")
        print("Video scenes: submission/video/scenes.json")
        sys.exit(0)
    if "--slides" in sys.argv:
        sp = build_slides()
        print(f"Slides HTML: {sp}")
        print(f"Slides PDF:  {print_pdf(sp, ROOT / 'submission' / 'slides.pdf')}")
        sys.exit(0)
    path = build()
    print(f"HTML: {path}")
    if "--html" not in sys.argv:
        print(f"PDF:  {to_pdf(path)}")
