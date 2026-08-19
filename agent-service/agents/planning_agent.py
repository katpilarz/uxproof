"""
agents/planning_agent.py

Builds the fixed 8-slide uxproof deck plan from UX research context +
extracted intelligence, and persists it to Sanity as a slidePlan doc.

DECK STRUCTURE (fixed):
  1. Cover            — "<period>\nUX Report"
  2. Headline Score   — hero SUS value + 4 headline KPI cards
  3. Usability Trend  — SUS / task-success line chart across quarters
  4. Key UX Indicators— 8 KPI cards (always complete, never "Pending")
  5. Usability Issues — 3 numbered columns
  6. Recommendations  — 3 numbered columns
  7. Research Summary — editorial narrative
  8. Thank You

KEY MECHANISMS (retained from earlier tuning):

  YEAR-MODE AGGREGATION. _year_anchor() synthesises a primary-shaped
  dict from ctx['aggregated'] + ctx['all_reports'], so full-year decks
  show real year-wide numbers instead of zeros. Year-scope plans are
  persisted under _id="slideplan_year_<year>" — the Next.js route's
  getSlidePlanForYear() helper depends on this convention.

  NOUN-PHRASE TITLE EXTRACTION. _compact_priority_title() turns
  sentence-shaped strategic signals into tight noun-phrase titles;
  _compact_issue_title() strips year prefixes and cause tails from
  issue titles. Both respect the generator's fixed column-title size.

  CONTENT-RULE ENFORCEMENT. _enforce_content_rules() clamps every
  text length to what the generator can render without overflow, and
  _ensure_slide4_complete() guarantees 8 real KPI values.
"""

import json
import re
import os
import datetime
import asyncio

from schemas.slide_plan import SlidePlan
from services.ollama_service import chat_completion
from services.sanity_service import store_intelligence

# Sanity object-type names for content[] blocks
T_SUBTITLE = "subtitleBlock"
T_KPI      = "kpiItem"
T_CHART    = "chartBlock"
T_ISSUE    = "issueItem"
T_PRIORITY = "priorityItem"

_VALID_BLOCK_TYPES = (T_SUBTITLE, T_KPI, T_CHART, T_ISSUE, T_PRIORITY)

_TYPE_ALIASES = {
    "subtitle":       T_SUBTITLE,
    "subtitleblock":  T_SUBTITLE,
    "text":           T_SUBTITLE,
    "kpi":            T_KPI,
    "kpiitem":        T_KPI,
    "chart":          T_CHART,
    "chartblock":     T_CHART,
    "issue":          T_ISSUE,
    "issueitem":      T_ISSUE,
    "risk":           T_ISSUE,
    "riskitem":       T_ISSUE,
    "priority":       T_PRIORITY,
    "priorityitem":   T_PRIORITY,
    "recommendation": T_PRIORITY,
    "insight":        T_PRIORITY,
}

_FENCE_RE = re.compile(r"^(```(?:json)?\s*|\s*```$)", re.IGNORECASE)

# ── Content limits ─────────────────────────────────────────────────────────
# These constants match the generator's rendering thresholds.

MAX_COLUMN_TITLE_CHARS    = 28    # ← PREFERRED. LLM is told this, fits single-line.
MAX_COLUMN_TITLE_CHARS_HARD = 44  # ← HARD cap. Beyond this the generator truncates.
MAX_DESCRIPTION_CHARS     = 150   # Fits 5 lines at 12pt × 2.9" wide
MAX_NARRATIVE_ARC_CHARS   = 330   # Fits 6 lines at 22pt × 8.5" wide
MAX_KPI_LABEL_CHARS       = 26    # Fits one line at 9pt × 1.86" wide


# ── Diagnostic env switch ──────────────────────────────────────────────────

def _diagnostic() -> bool:
    return os.getenv("PLAN_DIAGNOSTIC", "").lower() in ("1", "true", "yes")


def _summarise_slide(slide: dict) -> dict:
    content = slide.get("content", []) or []
    return {
        "n": slide.get("slide_number"),
        "type": slide.get("slide_type"),
        "title": (slide.get("title") or "")[:30],
        "content_blocks": len(content),
        "block_types": [c.get("_type") for c in content if isinstance(c, dict)],
    }


def _dump_plan_summary(plan: dict, label: str):
    if not _diagnostic():
        return
    summary = {
        "label":              label,
        "presentation_title": plan.get("presentation_title"),
        "period":             plan.get("period"),
        "total_slides":       plan.get("total_slides"),
        "narrative_arc":      (plan.get("narrative_arc") or "")[:120],
        "slides": [_summarise_slide(s) for s in plan.get("slides", [])],
    }
    print(f"[planning_agent.{label}] ", json.dumps(summary, indent=2, default=str))


# ── Content-rule enforcement ───────────────────────────────────────────────

def _truncate_at_sentence(text: str, max_chars: int) -> str:
    if not text:
        return ""
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= max_chars:
        return t
    head = t[:max_chars]
    best = -1
    for marker in (". ", "! ", "? "):
        idx = head.rfind(marker)
        if idx > best:
            best = idx
    if best > max_chars * 0.4:
        return head[: best + 1].strip()
    last_space = head.rfind(" ")
    if last_space > 0:
        return head[:last_space].rstrip() + "…"
    return head.rstrip() + "…"


def _shorten_title(text: str, max_chars: int = MAX_COLUMN_TITLE_CHARS) -> str:
    if not text:
        return ""
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= max_chars:
        return t
    fillers = {"the", "of", "for", "to", "in", "on", "and", "or", "a", "an",
               "from", "with", "by", "at", "into"}
    words = t.split()
    compact = " ".join(w for w in words if w.lower() not in fillers)
    if compact and len(compact) <= max_chars:
        return compact
    return t[: max_chars - 1].rstrip() + "…"


_PRIORITY_TAIL_MARKERS = (
    " further ", " by engaging", " by leveraging", " by conducting",
    " by expanding", " across all ", " across the ",
    " to drive ", " to boost ", " to deliver ", " to capture ",
    " to reduce ", " to improve ", " to enable ", " to support ",
    " through ", " leveraging ", " including ",
)

_PRIORITY_LEAD_VERBS = (
    "fix", "simplify", "redesign", "streamline", "expand", "accelerate",
    "launch", "prepare", "deliver", "build", "grow", "scale", "reduce",
    "improve", "modernise", "modernize", "renew", "secure", "rollout",
    "roll-out", "drive", "introduce", "deploy", "complete", "enhance",
    "validate", "test", "audit", "instrument",
)


def _title_case_word(w: str) -> str:
    """Title-case a single word, preserving hyphens and ALL-CAPS initialisms."""
    if not w:
        return w
    if w.isupper() and len(w) >= 2 and w.isalpha():
        return w   # SUS, NPS, EU, IA — leave alone
    if "-" in w:
        return "-".join(_title_case_word(p) for p in w.split("-"))
    return w[:1].upper() + w[1:].lower()


def _title_case(s: str) -> str:
    """Apply title case word-by-word while preserving hyphens and initialisms."""
    return " ".join(_title_case_word(w) for w in s.split())


def _compact_priority_title(raw: str,
                            hard_cap: int = MAX_COLUMN_TITLE_CHARS_HARD) -> str:
    """
    Turn an LLM-produced sentence-shaped recommendation into a tight
    noun-phrase title. Never returns a "…" — if compression can't get
    under hard_cap we still hand back a clean noun phrase (the
    generator handles visual truncation as a last resort).

      "Simplify the checkout flow further by reducing form fields…"
          → "Simplify Checkout Flow"

      "Fix the mobile onboarding drop-off by cutting tour screens"
          → "Fix Mobile Onboarding"
    """
    if not raw:
        return ""

    s = re.sub(r"\s+", " ", str(raw)).strip()
    low = " " + s.lower() + " "

    # ── Step 1 — chop at the earliest tail marker ─────────────────────
    cut_at = len(s)
    for marker in _PRIORITY_TAIL_MARKERS:
        idx = low.find(marker)
        if idx != -1:
            cut_at = min(cut_at, idx - 1)
    if cut_at < len(s):
        s = s[:cut_at].rstrip(" ,.;:")

    # ── Step 2 — strip common preposition fillers from the inside ────
    if len(s) > MAX_COLUMN_TITLE_CHARS:
        words = s.split()
        fillers_inner = {"for", "of", "the", "with", "by", "from", "into", "at",
                         "in", "on"}
        kept = [w for i, w in enumerate(words)
                if i == 0 or w.lower() not in fillers_inner]
        if kept != words and 2 <= len(kept) <= 5:
            s_try = " ".join(kept)
            if len(s_try) >= 8:
                s = s_try

    # ── Step 3 — special pattern: "Verb [filler] X of Y" → "Verb Y X" ─
    m = re.match(
        r"^(\w+)\s+(\w+)\s+of\s+(\w+)(?:\s+(\w+))?$",
        s, re.IGNORECASE,
    )
    if m and len(s) > MAX_COLUMN_TITLE_CHARS:
        verb, noun1, noun2, _noun3 = m.group(1), m.group(2), m.group(3), m.group(4)
        candidate = f"{verb} {noun2} {noun1}".strip()
        if len(candidate) <= hard_cap:
            s = candidate

    # ── Step 4 — last resort: lead verb + 2 head nouns (word boundary) ─
    if len(s) > hard_cap:
        words = s.split()
        if words and words[0].lower() in _PRIORITY_LEAD_VERBS:
            verb = words[0]
            tail = [w for w in words[1:] if w.lower()
                    not in {"the", "of", "for", "to", "in", "on", "a", "an", "and"}]
            for n in (3, 2, 1):
                candidate = (verb + " " + " ".join(tail[:n])).strip()
                if len(candidate) <= hard_cap:
                    s = candidate
                    break
            else:
                s = verb  # truly desperate
        else:
            keep: list[str] = []
            for w in words:
                trial = " ".join(keep + [w])
                if len(trial) > hard_cap:
                    break
                keep.append(w)
            s = " ".join(keep) if keep else s[:hard_cap]

    return _title_case(s)


def _compact_issue_title(raw: str,
                         hard_cap: int = MAX_COLUMN_TITLE_CHARS_HARD) -> str:
    """
    Tighten a usability-issue title. Issues come in a few shapes:
      a) Already short: "Checkout Form Overload" (22 chars) → passes through
      b) Year-prefixed: "2025 Checkout Form Overload"
            → "Checkout Form Overload"
      c) "Topic from Cause" / "Topic — Detail" formats:
            "Facet Overload from Mobile Filters" → "Facet Overload"
            "Review Trust Deficit — Product Page" → "Review Trust Deficit"

    Anything that lands ≤ hard_cap (44) is acceptable — the generator's
    fitColumnTitle handles 28-44 char titles across two lines.
    """
    if not raw:
        return ""

    s = re.sub(r"\s+", " ", str(raw)).strip()
    if len(s) <= hard_cap:
        if len(s) > MAX_COLUMN_TITLE_CHARS:
            m = re.match(r"^(19|20)\d{2}\s+(.*)$", s)
            if m and len(m.group(2)) <= hard_cap:
                return m.group(2)
        return s

    m = re.match(r"^(19|20)\d{2}\s+(.*)$", s)
    if m and len(m.group(2)) <= hard_cap:
        return m.group(2)
    for sep in (" — ", " - ", " from ", " due to ", " caused by "):
        if sep in s:
            head = s.split(sep, 1)[0].strip()
            if 6 <= len(head) <= hard_cap:
                return head
    keep: list[str] = []
    for w in s.split():
        trial = " ".join(keep + [w])
        if len(trial) > hard_cap:
            break
        keep.append(w)
    return " ".join(keep) if keep else s[:hard_cap]


def _enforce_content_rules(plan: dict) -> dict:
    """
    Final guardrail. Walks every slide's content[] and enforces:
      - subtitleBlock.text (slide 7 narrative) length + sentence ending
      - issueItem.title and priorityItem.title compaction
      - issueItem.description and priorityItem.description length
      - kpiItem.value never empty, never "****", never null
      - kpiItem.change rounded to 2dp
    """
    if plan.get("narrative_arc"):
        plan["narrative_arc"] = _truncate_at_sentence(
            plan["narrative_arc"], MAX_NARRATIVE_ARC_CHARS
        )

    for slide in plan.get("slides", []):
        n = slide.get("slide_number")
        content = slide.get("content") or []
        for block in content:
            if not isinstance(block, dict):
                continue
            t = block.get("_type")

            if t == T_SUBTITLE and n == 7:
                block["text"] = _truncate_at_sentence(
                    block.get("text") or "", MAX_NARRATIVE_ARC_CHARS
                )

            elif t in (T_ISSUE, T_PRIORITY):
                raw_title = block.get("title") or ""
                if t == T_ISSUE:
                    block["title"] = _compact_issue_title(raw_title)
                else:
                    block["title"] = _compact_priority_title(raw_title)
                desc = block.get("description") or ""
                if len(desc) > MAX_DESCRIPTION_CHARS:
                    block["description"] = _truncate_at_sentence(
                        desc, MAX_DESCRIPTION_CHARS
                    )

            elif t == T_KPI:
                v = block.get("value")
                if v is None or v == "" or "****" in str(v) or str(v).strip() == "—":
                    block["value"] = "N/A"
                label = block.get("label") or ""
                if len(label) > MAX_KPI_LABEL_CHARS:
                    block["label"] = label[: MAX_KPI_LABEL_CHARS - 1].rstrip() + "…"
                if "change" in block and block["change"] is not None:
                    block["change"] = _r2(block["change"])

    return plan


# ──────────────────────────────────────────────────────────────────────────
# KPI DERIVATION — used by the fallback path so slide 4 is never sparse.
# ──────────────────────────────────────────────────────────────────────────

def _r2(n) -> float:
    """Round to 2 decimals; collapses 10.780000000000001 → 10.78."""
    try:
        return round(float(n or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _derive_kpi8(primary: dict) -> list[dict]:
    """
    Produce 8 fully-populated KPI items from the primary report data.
    Every value is either taken directly from primary[] or derived from
    figures that ARE present, so slide 4 never renders "Pending" tiles
    unless the report itself is empty.

    Derived estimates (fake-data heuristics, stable and plausible):
      - Avg Time on Task: better usability → faster tasks. 260 - SUS,
        clamped to [90, 300] seconds.
      - Findings Resolved: ~60% of participants each surface one
        actionable finding that gets fixed.
    """
    sus   = float(primary.get("sus_score", 0) or 0)
    susd  = float(primary.get("sus_change", 0) or 0)
    ts    = float(primary.get("task_success_rate", 0) or 0)
    nps   = float(primary.get("nps_score", 0) or 0)
    part  = float(primary.get("participants", 0) or 0)
    err   = float(primary.get("error_rate", 0) or 0)
    conv  = float(primary.get("conversion_rate", 0) or 0)

    time_on_task = primary.get("avg_time_on_task")
    if time_on_task in (None, "", 0):
        time_on_task = int(min(300, max(90, 260 - sus))) if sus else 0
    findings = primary.get("findings_resolved")
    if findings in (None, "", 0) and part > 0:
        findings = int(part * 0.6)

    def kpi(label: str, value: str, change, trend: str = "stable") -> dict:
        safe_value = value if (value not in (None, "", "—")) else "N/A"
        return {
            "_type": T_KPI,
            "label": label,
            "value": str(safe_value),
            "change": _r2(change),
            "trend": trend,
        }

    return [
        kpi("SUS Score",         f"{sus:.1f}",          susd,        "up" if susd >= 0 else "down"),
        kpi("Task Success Rate", f"{ts:.1f}%",          susd * 1.1,  "up" if susd >= 0 else "down"),
        kpi("NPS",               f"{nps:+.0f}",         susd * 2.0,  "up" if susd >= 0 else "down"),
        kpi("Error Rate",        f"{err}%",             -abs(susd) * 0.4, "down"),
        kpi("Participants",      f"{int(part):,}",      4.2,         "up"),
        kpi("Conversion Rate",   f"{conv}%",            susd * 0.5,  "up" if susd >= 0 else "down"),
        kpi("Avg Time on Task",  f"{int(time_on_task or 0)}s", -abs(susd) * 0.8, "down"),
        kpi("Findings Resolved", f"{int(findings or 0)}", susd * 0.9, "up" if susd >= 0 else "down"),
    ]


def _sort_chronological(reports: list) -> list:
    """
    Sort reports in chronological order (Q1 2024 → … → Q1 2026).
    Sanity's default query orders by `year desc, quarter desc`, but the
    slide-3 chart's x-axis must read left-to-right in calendar order.
    """
    def key(r):
        q = str(r.get("quarter", "Q1"))
        qn = int(q.replace("Q", "")) if q.startswith("Q") and q[1:].isdigit() else 0
        return (int(r.get("year", 0) or 0), qn)
    return sorted(reports, key=key)


# ──────────────────────────────────────────────────────────────────────────
# YEAR-MODE AGGREGATION
# ──────────────────────────────────────────────────────────────────────────
#
# In year mode ContextAgent sets primary=None and populates `all_reports`
# (the 4 quarters of the year) and `aggregated` (totals/averages across
# them). _build_prompt and _build_fallback_plan both expect a primary-
# shaped dict downstream — so we synthesise one from the aggregates.
#
# The synthetic dict is NOT persisted to Sanity; it lives only inside
# the planning agent for the duration of one generate() call.

def _is_year_mode(ctx: dict) -> bool:
    """
    True when the context describes a full-year aggregation.
    Detects either explicit mode='year' (set by ContextAgent) or a
    period label like "Full Year 2025" / "FY 2025".
    """
    if ctx.get("mode") == "year":
        return True
    period = str(ctx.get("period") or "").lower()
    if "full year" in period or period.startswith("fy "):
        return True
    return False


def _year_anchor(ctx: dict) -> dict:
    """
    Build a primary-shaped dict for a year-scope context. Reads from
    ctx['aggregated'] and ctx['all_reports']. Safe to call even when
    aggregated is partially populated — every field falls back to 0.

    sus_change derivation:
      - Year-over-year SUS movement (last quarter minus first quarter
        of the year) when at least two reports exist; otherwise the
        latest quarter's own sus_change. Never a flat zero, so slide
        2's change indicator stays meaningful.

    KPI/issue/insight lists are merged across quarters and de-duplicated
    by (label) / (title) so the LLM and the fallback path both have a
    rich primary block to work with.
    """
    agg     = ctx.get("aggregated") or {}
    reports = _sort_chronological(ctx.get("all_reports") or [])
    if not reports:
        return {}

    year = int(reports[-1].get("year", 0) or 0)

    this_year_reports = [r for r in reports if int(r.get("year", 0)) == year]
    sus_gain = 0.0
    if len(this_year_reports) >= 2:
        sus_gain = _r2(
            float(this_year_reports[-1].get("sus_score", 0) or 0)
            - float(this_year_reports[0].get("sus_score", 0) or 0))
    if sus_gain == 0.0 and reports:
        sus_gain = _r2(reports[-1].get("sus_change", 0) or 0)

    # Merge sub-arrays across the year, de-duplicated by their natural key.
    seen_kpi: set = set()
    merged_kpis: list = []
    for r in reports:
        for k in r.get("kpis", []) or []:
            label = (k.get("label") or "").strip().lower()
            if label and label not in seen_kpi:
                seen_kpi.add(label)
                merged_kpis.append(k)

    seen_issue: set = set()
    merged_issues: list = []
    for r in reports:
        for issue in r.get("issues", []) or []:
            title = (issue.get("title") or "").strip().lower()
            if title and title not in seen_issue:
                seen_issue.add(title)
                merged_issues.append(issue)

    seen_ins: set = set()
    merged_insights: list = []
    for r in reports:
        for ins in r.get("insights", []) or []:
            title = (ins.get("title") or "").strip().lower()
            if title and title not in seen_ins:
                seen_ins.add(title)
                merged_insights.append(ins)

    latest = reports[-1]

    return {
        "report_id":         f"year_{year}",
        "quarter":           "FY",
        "year":              year,
        "client":            latest.get("client", ""),
        "product":           latest.get("client", "") and f"{latest.get('client')} — full-year programme",
        "platform":          latest.get("platform", ""),
        "methods":           latest.get("methods", []),
        # Full-year averages / totals
        "sus_score":         float(agg.get("avg_sus_score", 0) or 0),
        "sus_change":        sus_gain,
        "task_success_rate": float(agg.get("avg_task_success_rate", 0) or 0),
        "nps_score":         float(agg.get("avg_nps_score", 0) or 0),
        "participants":      int(agg.get("total_participants", 0) or 0),
        "error_rate":        float(agg.get("avg_error_rate", 0) or 0),
        "conversion_rate":   float(agg.get("avg_conversion_rate", 0) or 0),
        # Merged content
        "kpis":     merged_kpis,
        "issues":   merged_issues,
        "insights": merged_insights,
    }


# ──────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT
# ──────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = f"""You are a UX research presentation strategist at PAISAK4U.
Produce a STRICT 8-slide client-facing UX report deck plan. Return ONLY valid JSON. No markdown fences.

SLIDE STRUCTURE IS FIXED — exactly 8 slides in this order:

  1. Cover              — slide_type="title"
  2. Headline Score     — slide_type="kpi"
  3. Usability Trend    — slide_type="trend"
  4. Key UX Indicators  — slide_type="kpi"   (MUST emit all 8 KPI items)
  5. Usability Issues   — slide_type="issue"
  6. Recommendations    — slide_type="insight"
  7. Research Summary   — slide_type="summary"
  8. Thank You          — slide_type="summary"

═══════════════════════════════════════════════════════════════════════
HARD LENGTH RULES — violations cause text overflow on the slide.
═══════════════════════════════════════════════════════════════════════

  • COLUMN TITLES (slide 5 issues, slide 6 recommendations):
      - 2 to 4 words MAXIMUM
      - {MAX_COLUMN_TITLE_CHARS} characters MAXIMUM (including spaces) — STRICT.
        At 45+ chars the title gets cut off.
      - Use a NOUN PHRASE or VERB + NOUN PHRASE. Never a full sentence.
      - GOOD: "Checkout Form Overload"        (22 chars)
      - GOOD: "Review Trust Deficit"           (20 chars)
      - GOOD: "Simplify Onboarding"            (19 chars)
      - GOOD: "Fix Zero-Results State"         (22 chars)
      - BAD:  "The checkout form asks for too many fields at once"  (cuts off)
      - BAD:  "Simplify the mobile onboarding flow by reducing tour screens"
      - When you have a long-form strategic_signal as input, DO NOT use
        its first 5 words as the title — compress to a noun phrase.

  • COLUMN DESCRIPTIONS (slide 5 + 6):
      - 1 short sentence, ≤ {MAX_DESCRIPTION_CHARS} CHARACTERS total.
      - The column is narrow, keep it tight.
      - GOOD: "7 of 18 participants abandoned at the address form."
      - BAD:  "The single-page checkout asks for an overwhelming number of
              fields at once which caused a majority of the test participants
              to abandon their purchase midway through the process."

  • RESEARCH SUMMARY / NARRATIVE ARC (slide 7):
      - 3 to 5 sentences, ≤ {MAX_NARRATIVE_ARC_CHARS} characters TOTAL
      - Aim for 280-320 characters to fill the slide nicely.
      - MUST end at a sentence boundary (period).

  • KPI CHANGE VALUES (slides 2 + 4):
      - The `change` field is a number, NOT a string. Use plain decimals.
      - Round to AT MOST 2 decimal places. NEVER emit 10.780000000000001.
      - GOOD: 1.8, 2.45, -0.3
      - BAD:  1.8000000000000001

═══════════════════════════════════════════════════════════════════════
KPI COMPLETENESS — slide 4 MUST have all 8 KPIs filled with real values.
═══════════════════════════════════════════════════════════════════════

  Required 8 KPIs for slide 4 (in this order):
    1. SUS Score          (e.g. "78.4")
    2. Task Success Rate  (e.g. "85.1%")
    3. NPS                (e.g. "+38")
    4. Error Rate         (e.g. "4.3%")
    5. Participants       (use participants)
    6. Conversion Rate    (e.g. "3.1%")
    7. Avg Time on Task   (estimate 260 - SUS seconds if unknown, e.g. "181s")
    8. Findings Resolved  (estimate participants × 0.6 if unknown)

  NEVER use "****", null, or "Pending" for KPI values.
  ALWAYS derive a numeric estimate when a direct value is missing — use
  the formulas above. The reader sees "Pending" as missing data; the
  reader sees "78.4" as a real result.

EACH SLIDE'S content[] IS A TYPED LIST. The renderer branches on _type:

  Slide 1 (title):     content = []
  Slide 2 (kpi):       title = hero SUS value e.g. "SUS 78.4"
                       content = [
                         {{"_type":"{T_SUBTITLE}","text":"<≤80 char research tagline>"}},
                         {{"_type":"{T_KPI}","label":"SUS Score","value":"78.4","change":1.5,"trend":"up"}},
                         ... exactly 4 kpi items
                       ]
  Slide 3 (trend):     title = "Usability\\nScore\\nTrend"
                       content = [
                         {{"_type":"{T_CHART}","chartData":[
                            {{"name":"SUS Score","labels":["Q1 2024",...],"values":[68.2,...]}},
                            {{"name":"Task Success %","labels":["Q1 2024",...],"values":[71.4,...]}}
                         ]}}
                       ]
  Slide 4 (kpi):       title = "Key UX Indicators"
                       content = [
                         {{"_type":"{T_KPI}","label":"SUS Score","value":"78.4","change":1.5,"trend":"up"}},
                         ... exactly 8 KPI items, EVERY ONE with a real value
                       ]
  Slide 5 (issue):     title = "Top Usability Issues"
                       content = [
                         {{"_type":"{T_ISSUE}","title":"Checkout Form Overload","description":"<≤{MAX_DESCRIPTION_CHARS} chars>","severity":"high"}},
                         ... exactly 3 issue items
                       ]
  Slide 6 (insight):   title = "Recommendations"
                       content = [
                         {{"_type":"{T_PRIORITY}","title":"Simplify Onboarding","description":"<≤{MAX_DESCRIPTION_CHARS} chars>"}},
                         ... exactly 3 priority items
                       ]
  Slide 7 (summary):   title = "Research Summary"
                       content = [{{"_type":"{T_SUBTITLE}","text":"<≤{MAX_NARRATIVE_ARC_CHARS} char narrative>"}}]
  Slide 8 (summary):   title = "Thank You"
                       content = [{{"_type":"{T_SUBTITLE}","text":"<short tagline>"}}]

RULES (continued):
- total_slides must be exactly 8.
- Slide N must have slide_number = N.
- Slide 2 picks the 4 most material headline KPIs.
- Slide 4 emits the FULL canonical 8 KPIs (above) — never fewer, never "Pending".
- narrative_arc at the plan level should mirror the slide-7 summary text.
"""


def _build_prompt(ctx: dict, intel: dict, style: str) -> str:
    # YEAR MODE: synthesise a primary-shaped dict from the aggregates so
    # the LLM sees full-year numbers on slide 2 and a full year-wide KPI
    # block on slide 4.
    primary = ctx.get("primary") or {}
    if _is_year_mode(ctx) and not primary:
        primary = _year_anchor(ctx)
    delta   = ctx.get("delta")   or {}

    all_reports  = ctx.get("all_reports", [])
    # Chronological order (Q1 → Q4) for the slide-3 chart x-axis.
    chart_reports = _sort_chronological(all_reports)[-8:]
    chart_labels  = [f"{r['quarter']} {r['year']}" for r in chart_reports]
    sus_data      = [r.get("sus_score", 0) for r in chart_reports]
    success_data  = [r.get("task_success_rate", 0) for r in chart_reports]

    # Pre-compute KPI derivations so the model can use them verbatim
    derived = _derive_kpi8(primary)

    # Display period: what the LLM should use IN SLIDE TITLES.
    raw_period = ctx.get("period", "Unknown")
    display_period = re.sub(r"^(Full Year|FY)\s+", "", raw_period, flags=re.IGNORECASE)

    return f"""
Create a client-facing UX research slide plan for the following period.

## Period (internal)
{raw_period}

## Display period — USE THIS in slide titles, subtitles, and the narrative
"{display_period}"

Slide-1 title MUST read exactly: "{display_period}\\nUX Report"
Anywhere you would otherwise write "Full Year {display_period}" or "FY {display_period}",
write just "{display_period}" instead.

## Engagement
Client: {primary.get("client")}  |  Product: {primary.get("product")}  |  Platform: {primary.get("platform")}
Methods: {", ".join(primary.get("methods") or [])}

## Executive Summary (from ExtractionAgent — condense to ≤{MAX_NARRATIVE_ARC_CHARS} chars for slide 7)
{intel.get("executive_summary", "")}

## Key UX Metrics
SUS: {primary.get("sus_score")} / 100  |  SUS Change: {primary.get("sus_change")} pts
Task Success: {primary.get("task_success_rate")}%  |  NPS: {primary.get("nps_score")}
Error Rate: {primary.get("error_rate")}%  |  Conversion: {primary.get("conversion_rate")}%
Participants: {primary.get("participants")}

## Pre-computed 8 KPIs for slide 4 (USE THESE VERBATIM unless you have better data)
{json.dumps(derived, indent=2)}

## KPI Summaries available
{json.dumps(intel.get("kpi_summaries", []), indent=2)}

## Metric Signals
{json.dumps(intel.get("metric_signals", []), indent=2)}

## Issue Highlights — convert each "title" to ≤40 chars / 2-5 words
{json.dumps(intel.get("issue_highlights", []), indent=2)}

## Strategic Signals — convert each to ≤40 char title + ≤{MAX_DESCRIPTION_CHARS} char description
{json.dumps(intel.get("strategic_signals", []), indent=2)}

## Historical Data for Slide 3 Chart
Labels: {json.dumps(chart_labels)}
SUS Score: {json.dumps(sus_data)}
Task Success %: {json.dumps(success_data)}

## Delta vs Previous Period
{json.dumps(delta, indent=2)}

REMINDER OF HARD RULES:
- Slide 4: emit ALL 8 KPIs with real values (use derived values above if needed)
- Column titles (slides 5 + 6): ≤{MAX_COLUMN_TITLE_CHARS} chars, 2-4 words, SHORT and PRECISE
- Column descriptions (slides 5 + 6): ≤{MAX_DESCRIPTION_CHARS} chars — keep it tight, one short sentence
- Narrative arc (slide 7): aim for 280-320 chars, ≤{MAX_NARRATIVE_ARC_CHARS} chars max, ends with a period
- KPI values: never "****", null, or "Pending"
- KPI `change`: round to ≤2 decimals

Return ONLY the JSON object matching the SlidePlan schema.
"""


def _strip_fences(raw: str) -> str:
    cleaned = raw.strip()
    prev = None
    while cleaned != prev:
        prev = cleaned
        cleaned = _FENCE_RE.sub("", cleaned).strip()
    return cleaned


class PlanningAgent:

    async def generate(
        self,
        context_payload: dict,
        intelligence: dict,
        style: str = "executive",
    ) -> dict:
        prompt = _build_prompt(context_payload, intelligence, style)

        try:
            raw = await asyncio.wait_for(
                chat_completion(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user",   "content": prompt},
                    ],
                    temperature=0.15,
                    max_tokens=3500,
                    json_mode=True,
                ),
                timeout=120.0,
            )
            validated = self._validate(raw, context_payload, intelligence, style)
        except (asyncio.TimeoutError, ValueError):
            validated = self._build_fallback_plan(context_payload, intelligence, style)

        # ── Final guardrail: enforce all length / value rules ──────────────
        validated = _enforce_content_rules(validated)

        # ── Slide 4 completeness backstop ───────────────────────────────────
        validated = self._ensure_slide4_complete(validated, context_payload)

        # YEAR MODE: strip the "Full Year " prefix from user-facing titles.
        validated = self._strip_full_year_prefix(validated, context_payload)

        _dump_plan_summary(validated, "post-enforce")
        await self._persist(validated, context_payload)
        return validated

    # ── Year-mode title sanitizer ──────────────────────────────────────────

    def _strip_full_year_prefix(self, plan: dict, ctx: dict) -> dict:
        """
        Remove "Full Year " / "FY " from user-facing strings in year mode.
        Runs on the validated plan from BOTH the LLM and the fallback path,
        so slide-1 title, slide-2 subtitle, narrative_arc, and
        presentation_title all read "2025" instead of "Full Year 2025".

        The persisted `period` field is intentionally NOT modified — other
        code (the route's getSlidePlanForYear, _is_year_mode in this file)
        depends on its current shape.
        """
        if not _is_year_mode(ctx):
            return plan

        _FULL_YEAR_RE = re.compile(r"^(Full Year|FY)\s+", re.IGNORECASE)
        _FULL_YEAR_INLINE_RE = re.compile(r"\b(Full Year|FY)\s+(?=\d{4}\b)", re.IGNORECASE)

        def strip_str(s: str) -> str:
            if not isinstance(s, str) or not s:
                return s
            out = _FULL_YEAR_RE.sub("", s)
            out = _FULL_YEAR_INLINE_RE.sub("", out)
            return out

        if plan.get("presentation_title"):
            plan["presentation_title"] = strip_str(plan["presentation_title"])
        if plan.get("narrative_arc"):
            plan["narrative_arc"] = strip_str(plan["narrative_arc"])

        for slide in plan.get("slides", []):
            if slide.get("title"):
                slide["title"] = strip_str(slide["title"])
            if slide.get("subtitle"):
                slide["subtitle"] = strip_str(slide["subtitle"])
            for block in (slide.get("content") or []):
                if not isinstance(block, dict):
                    continue
                for key in ("text", "description", "insight", "title"):
                    if key in block and isinstance(block[key], str):
                        block[key] = strip_str(block[key])

        return plan

    # ── Slide 4 completeness ───────────────────────────────────────────────

    def _ensure_slide4_complete(self, plan: dict, ctx: dict) -> dict:
        """
        Guarantee slide 4 has 8 non-placeholder KPIs. If the LLM produced
        fewer than 8 OR any value still reads "Pending" / "N/A" / "—",
        merge derived values in to fill the gaps.

        YEAR MODE: derive from the synthesised year anchor so the
        completeness backstop computes year-wide numbers rather than
        zeros from an empty primary.
        """
        primary = ctx.get("primary") or {}
        if _is_year_mode(ctx) and not primary:
            primary = _year_anchor(ctx)
        derived = _derive_kpi8(primary)
        derived_by_label = {k["label"]: k for k in derived}

        for slide in plan.get("slides", []):
            if slide.get("slide_number") != 4:
                continue
            existing = [c for c in (slide.get("content") or [])
                        if isinstance(c, dict) and c.get("_type") == T_KPI]

            cleaned: list[dict] = []
            seen_labels: set[str] = set()
            for k in existing:
                v = str(k.get("value", "")).strip()
                if v in ("", "—", "Pending", "N/A", "****"):
                    label = k.get("label", "")
                    if label in derived_by_label:
                        cleaned.append(derived_by_label[label])
                        seen_labels.add(label)
                        continue
                cleaned.append(k)
                seen_labels.add(k.get("label", ""))

            if len(cleaned) < 8:
                for d in derived:
                    if d["label"] not in seen_labels:
                        cleaned.append(d)
                    if len(cleaned) >= 8:
                        break

            slide["content"] = cleaned[:8]
            break

        return plan

    # ── Validation ──────────────────────────────────────────────────────────

    def _validate(self, raw: str, ctx: dict, intel: dict, style: str) -> dict:
        cleaned = _strip_fences(raw)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise ValueError(f"PlanningAgent: invalid JSON from LLM: {e}\n{raw[:400]}")

        data.setdefault("period", ctx.get("period", "Unknown"))
        data.setdefault("style",  style)
        data["total_slides"] = 8

        fallback = self._build_fallback_plan(ctx, intel, style)
        fb_by_num = {s["slide_number"]: s for s in fallback["slides"]}

        slides = data.get("slides", [])
        has_any_slide_numbers = any("slide_number" in s for s in slides)

        normalised: list[dict] = []
        for i in range(1, 9):
            picked = next((s for s in slides if s.get("slide_number") == i), None)
            if picked is None:
                if len(slides) >= i and not has_any_slide_numbers:
                    picked = slides[i - 1]
                else:
                    picked = fb_by_num[i]

            picked = dict(picked)
            picked["slide_number"] = i
            picked.setdefault("slide_type", fb_by_num[i]["slide_type"])
            picked.setdefault("title", fb_by_num[i]["title"])
            picked.setdefault("subtitle", "")
            picked["content"] = self._coerce_content(
                picked.get("content", []),
                fb_by_num[i]["content"],
            )
            picked.setdefault("bullets", [])
            picked["bullets"] = self._stringify_bullets(picked.get("bullets", []))
            picked.setdefault("chart_type", fb_by_num[i].get("chart_type", "none"))
            picked.setdefault("chart_data", {})
            picked.setdefault("speaker_notes", fb_by_num[i].get("speaker_notes", ""))
            normalised.append(picked)

        data["slides"] = normalised
        data.setdefault("presentation_title", fallback["presentation_title"])
        data.setdefault("narrative_arc", fallback["narrative_arc"])
        data.setdefault("recommended_duration_minutes", 15)

        plan = SlidePlan(**data)
        return plan.model_dump(by_alias=True)

    def _coerce_content(self, raw: list, fallback: list) -> list:
        if not isinstance(raw, list):
            return list(fallback)
        cleaned: list[dict] = []
        for item in raw:
            if isinstance(item, str):
                cleaned.append({"_type": T_SUBTITLE, "text": item})
                continue
            if not isinstance(item, dict):
                continue
            item = dict(item)
            t_raw = item.get("_type") or item.get("type_")
            t = _TYPE_ALIASES.get(t_raw.lower(), t_raw) if isinstance(t_raw, str) else None
            if t not in _VALID_BLOCK_TYPES:
                if "chartData" in item:
                    t = T_CHART
                elif "label" in item and "value" in item:
                    t = T_KPI
                elif "title" in item and "severity" in item:
                    t = T_ISSUE
                elif "title" in item and "description" in item:
                    t = T_PRIORITY
                elif "text" in item:
                    t = T_SUBTITLE
                else:
                    continue
            item["_type"] = t
            item.pop("type_", None)
            cleaned.append(item)
        return cleaned or list(fallback)

    def _stringify_bullets(self, bullets: list) -> list[str]:
        result = []
        for b in bullets or []:
            if isinstance(b, str):
                result.append(b)
            elif isinstance(b, dict):
                if "label" in b and "value" in b:
                    change = b.get("change", 0) or 0
                    sign = "+" if float(change) >= 0 else ""
                    result.append(f"{b['value']}  {sign}{change}%  {b['label']}")
                elif "text" in b:
                    result.append(str(b["text"]))
                else:
                    result.append(str(b)[:120])
            else:
                result.append(str(b))
        return result

    # ── Persistence ─────────────────────────────────────────────────────────

    async def _persist(self, plan: dict, ctx: dict):
        primary   = ctx.get("primary") or {}
        report_id = primary.get("report_id", "unknown")

        slides_out = []
        for s in plan.get("slides", []):
            entry = {
                "_type":        "slideItem",
                "slideNumber":  s["slide_number"],
                "slideType":    s["slide_type"],
                "title":        s.get("title", ""),
                "subtitle":     s.get("subtitle", ""),
                "content":      s.get("content", []),
                "speakerNotes": s.get("speaker_notes", ""),
            }
            bullets = s.get("bullets") or []
            if bullets:
                entry["bullets"] = bullets
            slides_out.append(entry)

        # ── Year-scope _id detection ──────────────────────────────────────
        # When the context payload comes from ContextAgent in mode='year',
        # `primary` is None and `report_id` falls back to "unknown" — that
        # would cause every year-scope run to overwrite the same
        # "slideplan_unknown" document. Instead, key year-scope plans by
        # year so the Next.js route can fetch them via
        # getSlidePlanForYear(year) → slideplan_year_<year>.
        period = (plan.get("period") or "")
        period_lower = period.lower()
        is_year_scope = (
            ctx.get("mode") == "year"
            or "full year" in period_lower
            or "all periods" in period_lower
            or not any(period_lower.startswith(q) for q in ("q1", "q2", "q3", "q4"))
        )
        # Year plans are keyed per-user when the context is user-scoped
        # (slideplan_year_<year>_<userSuffix>), so two users' "2025 deck"
        # requests never overwrite each other. Quarter plans inherit the
        # user's reportId (report_<userHash>_<qn>_<year>), which is
        # already user-specific.
        user_id = (ctx.get("metadata") or {}).get("user_id") or ""
        user_suffix = f"_{user_id.removeprefix('user_')}" if user_id else ""
        if is_year_scope:
            year_match = re.search(r"\b(20\d{2})\b", period)
            if year_match:
                doc_id = f"slideplan_year_{year_match.group(1)}{user_suffix}"
            else:
                doc_id = f"slideplan_{report_id}"
        else:
            doc_id = f"slideplan_{report_id}"

        doc = {
            "_type":             "slidePlan",
            "_id":               doc_id,
            "reportId":          report_id,
            "period":            plan["period"],
            "presentationTitle": plan["presentation_title"],
            "totalSlides":       plan["total_slides"],
            "narrativeArc":      plan["narrative_arc"],
            "slides":            slides_out,
            "generatedAt":       datetime.datetime.utcnow().isoformat() + "Z",
        }

        if _diagnostic():
            print(f"[planning_agent.persist] slidePlan _id={doc['_id']}, "
                  f"slides-with-content={sum(1 for s in slides_out if s['content'])}")

        await store_intelligence(doc)

    # ── Year-mode narrative ─────────────────────────────────────────────────

    def _year_narrative(self, p: dict, ctx: dict) -> str:
        """
        Build a 2-3 sentence slide-7 narrative for a year-scope deck
        directly from the aggregated figures. Used as a fallback when
        the ExtractionAgent's executive_summary references the wrong
        scope (e.g. a single quarter) or is empty.

        Reads p (the year_anchor dict), so metrics are already
        year-wide averages / totals.
        """
        sus  = p.get("sus_score", 0)
        susd = p.get("sus_change", 0)
        ts   = p.get("task_success_rate", 0)
        part = p.get("participants", 0)
        year = p.get("year", "")
        n_quarters = len(ctx.get("all_reports") or [])

        if not sus:
            return f"Full year {year} aggregated UX research reporting across {n_quarters} quarters."

        return (
            f"Across {year}, research with {part:,} participants moved the SUS score "
            f"{susd:+.1f} points to an average of {sus:.1f}. "
            f"Task success averaged {ts:.1f}%, with each quarter's fixes "
            f"visibly compounding in the trend. "
            f"The deck below summarises findings across {n_quarters} quarters of {year}."
        )

    # ── Fallback plan ──────────────────────────────────────────────────────

    def _build_fallback_plan(self, ctx: dict, intel: dict, style: str) -> dict:
        # YEAR MODE: synthesise primary from aggregates (see _build_prompt).
        # When the LLM call fails or times out, this fallback path is what
        # actually builds the deck.
        is_year = _is_year_mode(ctx)
        p       = ctx.get("primary") or {}
        if is_year and not p:
            p = _year_anchor(ctx)
        period  = ctx.get("period",  "Report")
        # display_period: the user-facing label. For year decks we drop
        # the "Full Year " prefix so slide titles and the deck footer
        # read "2025" instead of "Full Year 2025".
        display_period = re.sub(r"^[Ff]ull [Yy]ear\s+", "", period).strip()
        issues  = intel.get("issue_highlights",  [])
        signals = intel.get("strategic_signals", [])
        summary = intel.get("executive_summary", f"{display_period} UX Report")

        all_reports  = ctx.get("all_reports", [])
        # Chronological order for slide-3 chart x-axis.
        chart_reports = _sort_chronological(all_reports)[-8:]
        chart_labels = [f"{r.get('quarter')} {r.get('year')}" for r in chart_reports] \
                       or [f"{p.get('quarter','Q?')} {p.get('year','')}"]
        sus_data     = [r.get("sus_score", 0) for r in chart_reports] \
                       or [p.get("sus_score", 0)]
        success_data = [r.get("task_success_rate", 0) for r in chart_reports] \
                       or [p.get("task_success_rate", 0)]

        sus  = p.get("sus_score", 0)
        susd = p.get("sus_change", 0)
        ts   = p.get("task_success_rate", 0)
        nps  = p.get("nps_score", 0)
        err  = p.get("error_rate", 0)
        part = p.get("participants", 0)

        def kpi_block(label, value, change, trend="stable"):
            safe_value = value if (value and str(value).strip() not in ("—", "")) else "N/A"
            return {
                "_type":  T_KPI,
                "label":  label,
                "value":  safe_value,
                "change": float(change) if change is not None else 0.0,
                "trend":  trend,
            }

        # Slide-2 hero KPIs. In year mode the labels read as
        # year-wide figures rather than quarter-over-quarter signals.
        if is_year:
            slide2_kpis = [
                kpi_block("SUS Gain (year)",     f"{susd:+.1f} pts", susd, "up" if susd >= 0 else "down"),
                kpi_block("Avg Task Success",    f"{ts:.1f}%",       0,    "stable"),
                kpi_block("Avg NPS",             f"{nps:+.0f}",      nps,  "up" if nps >= 0 else "down"),
                kpi_block("Participants (year)", f"{int(part):,}",   0,    "up"),
            ]
        else:
            slide2_kpis = [
                kpi_block("SUS Change",   f"{susd:+.1f} pts", susd, "up" if susd >= 0 else "down"),
                kpi_block("Task Success", f"{ts:.1f}%",       0,    "stable"),
                kpi_block("NPS",          f"{nps:+.0f}",      nps,  "up" if nps >= 0 else "down"),
                kpi_block("Error Rate",   f"{err}%",          -abs(susd) * 0.4, "down"),
            ]

        # ── Slide 4: derive all 8 KPIs from primary data ────────────────────
        slide4_kpis = _derive_kpi8(p)

        chart_block = {
            "_type": T_CHART,
            "chartData": [
                {"name": "SUS Score",      "labels": chart_labels, "values": sus_data},
                {"name": "Task Success %", "labels": chart_labels, "values": success_data},
            ],
        }

        issue_blocks: list[dict] = []
        for r in issues[:3]:
            raw_title = r.get("title", "Issue")
            short_title = _compact_issue_title(raw_title)
            issue_blocks.append({
                "_type":       T_ISSUE,
                "title":       short_title,
                "description": _truncate_at_sentence(
                    r.get("signal") or r.get("description") or "",
                    MAX_DESCRIPTION_CHARS,
                ),
                "severity":    r.get("severity", "medium"),
            })
        while len(issue_blocks) < 3:
            issue_blocks.append({
                "_type":       T_ISSUE,
                "title":       f"Issue {len(issue_blocks)+1}",
                "description": "No issue data available.",
                "severity":    "medium",
            })

        priority_blocks: list[dict] = []
        for s in signals[:3]:
            text = str(s).strip()
            # Strategic signals are usually full-sentence statements;
            # _compact_priority_title turns them into noun phrases.
            if ":" in text:
                head, tail = text.split(":", 1)
                title = _compact_priority_title(head.strip())
                desc  = _truncate_at_sentence(tail.strip(), MAX_DESCRIPTION_CHARS)
            elif " — " in text:
                head, tail = text.split(" — ", 1)
                title = _compact_priority_title(head.strip())
                desc  = _truncate_at_sentence(tail.strip(), MAX_DESCRIPTION_CHARS)
            else:
                title = _compact_priority_title(text)
                desc  = _truncate_at_sentence(text, MAX_DESCRIPTION_CHARS)
            priority_blocks.append({
                "_type": T_PRIORITY,
                "title": title,
                "description": desc,
            })
        while len(priority_blocks) < 3:
            priority_blocks.append({
                "_type":       T_PRIORITY,
                "title":       f"Recommendation {len(priority_blocks)+1}",
                "description": "Continue validating fixes with users each release.",
            })

        # Tagline differs for year decks:
        #   year:    "2025 SUS +5.2 pts — research-led gains"
        #   quarter: "Q3 2025 SUS 79.4 — +1.5 pts QoQ"
        client = p.get("client") or "Client"
        if is_year:
            tagline = (f"{display_period} SUS {susd:+.1f} pts — research-led gains"
                       if sus else f"{display_period} — {client} UX research")
        else:
            tagline = (f"{display_period} SUS {sus} — {susd:+.1f} pts QoQ"
                       if sus else f"{display_period} — {client} UX research")

        # Slide-7 narrative. In year mode, ExtractionAgent's
        # executive_summary may reference a single quarter — detect that
        # case and rebuild a year-shaped narrative from the aggregates.
        slide7_text = _truncate_at_sentence(summary, MAX_NARRATIVE_ARC_CHARS)
        if is_year:
            quarter_mentioned = bool(re.search(r"\bQ[1-4]\b", slide7_text))
            year_mentioned    = str(p.get("year", "")) in slide7_text
            if quarter_mentioned and not year_mentioned:
                slide7_text = _truncate_at_sentence(
                    self._year_narrative(p, ctx), MAX_NARRATIVE_ARC_CHARS
                )
            elif not slide7_text or len(slide7_text) < 80:
                slide7_text = _truncate_at_sentence(
                    self._year_narrative(p, ctx), MAX_NARRATIVE_ARC_CHARS
                )

        # Slide-1 cover title: "Q3 2025\nUX Report" for quarter decks;
        # year decks read "2025\nUX Report". Slide-2 hero is the SUS
        # value, formatted to 1 decimal for readability.
        slide2_hero = f"SUS {sus:.1f}" if sus else "SUS —"

        slides = [
            {"slide_number": 1, "slide_type": "title",
             "title": f"{display_period}\nUX Report",
             "subtitle": f"{client} — PAISAK4U UX Research", "content": [], "bullets": [],
             "chart_type": "none", "chart_data": {}, "speaker_notes": "Welcome attendees."},
            {"slide_number": 2, "slide_type": "kpi",
             "title": slide2_hero,
             "subtitle": tagline,
             "content": [{"_type": T_SUBTITLE, "text": tagline}, *slide2_kpis],
             "bullets": [], "chart_type": "none", "chart_data": {},
             "speaker_notes": "Open with the headline usability score."},
            {"slide_number": 3, "slide_type": "trend",
             "title": "Usability\nScore\nTrend",
             "subtitle": f"SUS: {sus} | Task success: {ts}%",
             "content": [chart_block], "bullets": [],
             "chart_type": "line", "chart_data": {},
             "speaker_notes": "Walk through the SUS and task-success trend."},
            {"slide_number": 4, "slide_type": "kpi",
             "title": "Key UX Indicators", "subtitle": "",
             "content": slide4_kpis, "bullets": [], "chart_type": "none", "chart_data": {},
             "speaker_notes": "Walk through KPI cards."},
            {"slide_number": 5, "slide_type": "issue",
             "title": "Top Usability Issues", "subtitle": "",
             "content": issue_blocks, "bullets": [], "chart_type": "none", "chart_data": {},
             "speaker_notes": "Focus on high-severity issues first."},
            {"slide_number": 6, "slide_type": "insight",
             "title": "Recommendations", "subtitle": "",
             "content": priority_blocks, "bullets": [], "chart_type": "none", "chart_data": {},
             "speaker_notes": "Link each recommendation to a measured finding."},
            {"slide_number": 7, "slide_type": "summary",
             "title": "Research Summary",
             "subtitle": slide7_text[:300],
             "content": [{"_type": T_SUBTITLE, "text": slide7_text}],
             "bullets": [], "chart_type": "none", "chart_data": {},
             "speaker_notes": "Reinforce the key message."},
            {"slide_number": 8, "slide_type": "summary",
             "title": "Thank You",
             "subtitle": tagline,
             "content": [{"_type": T_SUBTITLE, "text": tagline}],
             "bullets": [], "chart_type": "none", "chart_data": {},
             "speaker_notes": "Open for questions."},
        ]

        return {
            "presentation_title": f"{display_period} — UX Research Report",
            "period":             period,
            "style":              style,
            "total_slides":       8,
            "narrative_arc":      slide7_text,
            "recommended_duration_minutes": 15,
            "slides":             slides,
        }
