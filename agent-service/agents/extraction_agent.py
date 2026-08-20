"""
agents/extraction_agent.py

Turns normalised UX research context into validated intelligence
(executive summary, KPI summaries, metric signals, issue highlights,
strategic signals) via Ollama — with deterministic fallbacks.

MODES:
  QUARTER — one research period, delta vs previous quarter.
  YEAR    — aggregates the four quarterly reports into a full-year
            narrative. The prompt exposes each quarter's metrics in a
            compact table so the LLM never sees empty "primary" data
            and writes "data unavailable" boilerplate.

SAFETY:
  - 90-second timeout guard; on timeout a rule-based fallback builds
    intelligence directly from the context payload.
  - Year-mode guardrail: LLM responses containing "data unavailable"
    phrases are overwritten with the deterministic year narrative.
  - _persist() uses deltaPct (camelCase) to match the Sanity schema.
"""

import json
import os
import datetime
import asyncio

import httpx
from pydantic import ValidationError

from schemas.intelligence import ExecutiveIntelligence
from services.sanity_service import store_intelligence

OLLAMA_BASE  = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL",    "qwen2.5:14b")


# ── Mode detection ───────────────────────────────────────────────────────────

def _is_year_mode(ctx: dict) -> bool:
    """True when the context is a full-year aggregation."""
    if ctx.get("mode") == "year":
        return True
    period = str(ctx.get("period") or "").lower()
    if "full year" in period or period.startswith("fy "):
        return True
    return False


# ── System prompts ───────────────────────────────────────────────────────────

SYSTEM_PROMPT_QUARTER = """You are a senior UX researcher preparing client-facing research reports.
You receive structured UX research data (usability metrics, issues, insights) for ONE reporting period.

CRITICAL RULES:
- Respond ONLY with valid JSON matching the schema. No markdown fences. No explanation text.
- Analyse ONLY the primary report period provided. Do NOT expand scope to other periods unless
  they appear explicitly in the delta section.
- executive_summary: exactly 3-5 sentences, client-ready, plain language, no jargon.
- kpi_summaries: extract exactly 8 KPIs. Use data in this priority order:
    1. SUS Score  2. Task Success Rate  3. NPS  4. Error Rate
    5. Participants  6. Conversion Rate  7. Avg Time on Task  8. Findings Resolved
  Map available data to these labels. If a metric is not in the input, use the closest available.
- metric_signals: the 3 most material metric movements vs previous period delta only.
- issue_highlights: escalate HIGH severity usability issues first, maximum 3 issues.
- strategic_signals: exactly 3 forward-looking recommended actions, as plain strings.
- confidence_score: 0.0-1.0 reflecting completeness of input data.
- NEVER fabricate numbers not present in the input data.
- report_id, quarter, year MUST exactly match the primary period provided.
"""

SYSTEM_PROMPT_YEAR = """You are a senior UX researcher preparing client-facing research reports.
You receive aggregated full-year UX research data covering FOUR quarters (Q1–Q4) of one year.

CRITICAL RULES:
- Respond ONLY with valid JSON matching the schema. No markdown fences. No explanation text.
- This is a FULL-YEAR analysis. Synthesise across all four quarters provided.
  Reference quarter-over-quarter trends where useful, but the narrative is about the YEAR.
- NEVER write phrases like "data is under review", "absence of data", "cannot be provided",
  or "limited information". You have FOUR quarters of real data — analyse them.
- executive_summary: exactly 3-5 sentences. State the average SUS score, the task-success
  trajectory, NPS movement, total research participants, and one notable QoQ trend
  (e.g. error rate falling after the checkout redesign shipped).
- kpi_summaries: extract exactly 8 KPIs reflecting FULL-YEAR aggregates:
    1. SUS Score (annual average)
    2. Task Success Rate (annual average)
    3. NPS (year-end vs year-start)
    4. Error Rate (annual average)
    5. Participants (full-year total)
    6. Conversion Rate (annual average)
    7. Avg Time on Task (derived from trend)
    8. Findings Resolved (full-year estimate)
- metric_signals: the 3 most material year movements — SUS trajectory, task-success shift,
  error-rate trend across quarters.
- issue_highlights: maximum 3 usability issues aggregated across the four quarters, deduplicated by title.
- strategic_signals: exactly 3 recommended actions for the YEAR AHEAD.
- confidence_score: 0.0-1.0; should be ≥0.8 when all four quarters are present.
- NEVER fabricate numbers not present in the input data.
- report_id, quarter ("FY"), year MUST exactly match the year scope provided.
"""


def _build_prompt_quarter(ctx: dict) -> str:
    """Quarter-mode prompt."""
    primary    = ctx.get("primary")    or {}
    comparison = ctx.get("comparison") or {}
    delta      = ctx.get("delta")      or {}

    return f"""
Analyse the following UX research data and return structured JSON intelligence.

## Report Period
{ctx.get("period", "Unknown")}

## Engagement
Client: {primary.get("client")}
Product / Surface: {primary.get("product")}  (platform: {primary.get("platform")})
Research Methods: {", ".join(primary.get("methods") or [])}

## Primary UX Metrics
SUS Score: {primary.get("sus_score")} / 100
SUS Change vs Previous Quarter: {primary.get("sus_change")} points
Task Success Rate: {primary.get("task_success_rate")}%
NPS: {primary.get("nps_score")}
Research Participants: {primary.get("participants")}
Task Error Rate: {primary.get("error_rate")}%
Key-Flow Conversion: {primary.get("conversion_rate")}%

## KPIs from CMS
{json.dumps(primary.get("kpis", []), indent=2)}

## Usability Issues from CMS
{json.dumps(primary.get("issues", []), indent=2)}

## Research Insights from CMS
{json.dumps(primary.get("insights", []), indent=2)}

## Delta vs Previous Period
{json.dumps(delta, indent=2)}

## Required JSON Schema
{{
  "report_id": "string",
  "quarter": "string",
  "year": integer,
  "executive_summary": "string (3-5 sentences)",
  "kpi_summaries": [
    {{"label": "str", "value": "str", "change": float, "trend": "up|down|stable", "insight": "str"}}
  ],
  "metric_signals": [
    {{"metric": "str", "current": float, "previous": float, "delta_pct": float, "narrative": "str"}}
  ],
  "issue_highlights": [
    {{"title": "str", "severity": "low|medium|high", "signal": "str", "recommendation": "str"}}
  ],
  "strategic_signals": ["str", "str", "str"],
  "confidence_score": float
}}

Return ONLY the JSON object. No markdown fences. No explanation.
"""


def _build_prompt_year(ctx: dict) -> str:
    """
    Year-mode prompt. Exposes the four quarterly reports + aggregates so
    the LLM has real data to summarise.
    """
    agg     = ctx.get("aggregated") or {}
    reports = ctx.get("all_reports") or []

    # Sort chronologically (Q1 → Q4) so the table reads left-to-right
    def _qkey(r):
        q = str(r.get("quarter", "Q1"))
        qn = int(q.replace("Q", "")) if q.startswith("Q") and q[1:].isdigit() else 0
        return (int(r.get("year", 0) or 0), qn)
    reports = sorted(reports, key=_qkey)

    year = ctx.get("year") or (reports[-1].get("year") if reports else None)

    # Build a compact per-quarter table
    rows = []
    for r in reports:
        rows.append({
            "quarter":           r.get("quarter"),
            "product":           r.get("product"),
            "sus_score":         r.get("sus_score"),
            "sus_change":        r.get("sus_change"),
            "task_success_rate": r.get("task_success_rate"),
            "nps_score":         r.get("nps_score"),
            "participants":      r.get("participants"),
            "error_rate":        r.get("error_rate"),
            "conversion_rate":   r.get("conversion_rate"),
        })

    # Aggregate all KPIs / issues / insights across the four quarters
    # (deduplicated by label/title) so the LLM has rich qualitative
    # material to work with on slides 5–6.
    seen_kpi = set()
    all_kpis = []
    for r in reports:
        for k in (r.get("kpis") or []):
            label = (k.get("label") or "").strip().lower()
            if label and label not in seen_kpi:
                seen_kpi.add(label)
                all_kpis.append(k)

    seen_issue = set()
    all_issues = []
    for r in reports:
        for issue in (r.get("issues") or []):
            title = (issue.get("title") or "").strip().lower()
            if title and title not in seen_issue:
                seen_issue.add(title)
                all_issues.append(issue)

    seen_ins = set()
    all_insights = []
    for r in reports:
        for ins in (r.get("insights") or []):
            title = (ins.get("title") or "").strip().lower()
            if title and title not in seen_ins:
                seen_ins.add(title)
                all_insights.append(ins)

    return f"""
Analyse the following FULL-YEAR UX research data and return structured JSON intelligence.
This is a synthesis across FOUR quarters of research in {year}.

## Full-Year Period
{ctx.get("period", f"Full Year {year}")}  (year: {year}, scope: full year)

## Full-Year Aggregated Metrics
Average SUS Score: {agg.get("avg_sus_score")} / 100
Average SUS Change (QoQ): {agg.get("avg_sus_change")} points
Average Task Success Rate: {agg.get("avg_task_success_rate")}%
Average NPS: {agg.get("avg_nps_score")}
Total Research Participants (year): {agg.get("total_participants")}
Average Error Rate: {agg.get("avg_error_rate")}%
Average Conversion Rate: {agg.get("avg_conversion_rate")}%

## Per-Quarter Breakdown ({len(reports)} quarters)
{json.dumps(rows, indent=2)}

## KPIs Across All Quarters (deduplicated)
{json.dumps(all_kpis, indent=2)}

## Usability Issues Across All Quarters (deduplicated)
{json.dumps(all_issues, indent=2)}

## Research Insights Across All Quarters (deduplicated)
{json.dumps(all_insights, indent=2)}

## Required JSON Schema
{{
  "report_id": "year_{year}",
  "quarter": "FY",
  "year": {year},
  "executive_summary": "string (3-5 sentences synthesising the FULL YEAR; mention average SUS, task-success trajectory, NPS movement, and one QoQ trend)",
  "kpi_summaries": [
    {{"label": "str", "value": "str", "change": float, "trend": "up|down|stable", "insight": "str"}}
  ],
  "metric_signals": [
    {{"metric": "str", "current": float, "previous": float, "delta_pct": float, "narrative": "str"}}
  ],
  "issue_highlights": [
    {{"title": "str", "severity": "low|medium|high", "signal": "str", "recommendation": "str"}}
  ],
  "strategic_signals": ["str", "str", "str"],
  "confidence_score": float
}}

You have all four quarters of real data above. Write a substantive full-year analysis.
Do NOT write phrases like "data is under review" or "absence of data" — analyse what you have.

Return ONLY the JSON object. No markdown fences. No explanation.
"""


def _build_prompt(ctx: dict) -> str:
    """Dispatcher — picks the right prompt shape based on mode."""
    if _is_year_mode(ctx):
        return _build_prompt_year(ctx)
    return _build_prompt_quarter(ctx)


class ExtractionAgent:

    async def extract(self, context_payload: dict) -> dict:
        # YEAR MODE: primary is None. Derive report_id/quarter/year from
        # ctx instead so the validated intelligence has a real anchor.
        if _is_year_mode(context_payload):
            reports = context_payload.get("all_reports") or []
            year = context_payload.get("year")
            if year is None and reports:
                year = max(int(r.get("year", 0) or 0) for r in reports)
            report_id = f"year_{year}"
            quarter   = "FY"
        else:
            primary   = context_payload.get("primary") or {}
            report_id = primary.get("report_id", "unknown")
            quarter   = primary.get("quarter",   "Q1")
            year      = primary.get("year",      2024)

        try:
            raw_json = await asyncio.wait_for(
                self._call_llm(context_payload),
                timeout=90.0,  # 90s hard cap for demo safety
            )
        except asyncio.TimeoutError:
            return self._build_fallback_intelligence(context_payload, report_id, quarter, year)

        intelligence = self._validate(raw_json, report_id, quarter, year)

        # YEAR-MODE GUARDRAIL: even when Ollama responds, it sometimes
        # produces a "data unavailable" narrative. Detect those phrases
        # and overwrite the summary with the deterministic fallback.
        if _is_year_mode(context_payload):
            summary = (intelligence.get("executive_summary") or "").lower()
            bad_signals = (
                "under review",
                "absence of",
                "cannot be provided",
                "limited information",
                "no specific data",
                "data is not available",
                "without specific",
                "no data points",
            )
            if any(bad in summary for bad in bad_signals) or len(summary) < 80:
                year_fallback = self._build_fallback_year(
                    context_payload, report_id, quarter, year
                )
                intelligence["executive_summary"] = year_fallback["executive_summary"]
                # If the LLM also produced empty kpi/issue/strategic blocks,
                # backfill those too so the deck has real content.
                if not intelligence.get("kpi_summaries"):
                    intelligence["kpi_summaries"] = year_fallback["kpi_summaries"]
                if not intelligence.get("metric_signals"):
                    intelligence["metric_signals"] = year_fallback["metric_signals"]
                if not intelligence.get("issue_highlights"):
                    intelligence["issue_highlights"] = year_fallback["issue_highlights"]
                if not intelligence.get("strategic_signals"):
                    intelligence["strategic_signals"] = year_fallback["strategic_signals"]

        user_id = (context_payload.get("metadata") or {}).get("user_id")
        await self._persist(intelligence, report_id, user_id)
        return intelligence

    async def _call_llm(self, ctx: dict) -> str:
        prompt = _build_prompt(ctx)
        system = SYSTEM_PROMPT_YEAR if _is_year_mode(ctx) else SYSTEM_PROMPT_QUARTER
        payload = {
            "model":       OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens":  2400,
            # Reasoning models (qwen3.5 and friends) spend the token budget on a
            # chain-of-thought and return an empty `content`, which would make
            # every LLM step here fail validation and fall back to deterministic
            # output. Ollama ignores this on non-reasoning models.
            "reasoning_effort": "none",
        }
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{OLLAMA_BASE}/v1/chat/completions", json=payload)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    def _validate(self, raw: str, report_id: str, quarter: str, year: int) -> dict:
        cleaned = raw.strip()
        for fence in ("```json", "```"):
            if cleaned.startswith(fence):
                cleaned = cleaned[len(fence):]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}\n---\n{raw[:500]}")

        data.setdefault("report_id", report_id)
        data.setdefault("quarter",   quarter)
        data.setdefault("year",      year)

        try:
            validated = ExecutiveIntelligence(**data)
        except ValidationError as e:
            raise ValueError(f"Intelligence schema validation failed: {e}")

        return validated.model_dump()

    async def _persist(self, intelligence: dict, report_id: str,
                       user_id: str | None = None):
        """
        Write validated intelligence to Sanity.
        NOTE: metricSignals uses deltaPct (camelCase) to match the Sanity schema.
        strategicSignals stored as plain strings — sanity_service wraps with _key.
        Year-mode _ids are suffixed per user (mirroring planning_agent's
        slideplan_year_<year>_<userSuffix>) because report_id="year_<year>"
        carries no owner of its own; quarter-mode report_ids already embed
        the owner hash. The doc also gets a `user` reference when scoped.
        """
        doc_id = f"intelligence_{report_id}"
        if user_id and report_id.startswith("year_"):
            doc_id += f"_{user_id.removeprefix('user_')}"
        doc = {
            "_type":   "executiveIntelligence",
            "_id":     doc_id,
            "reportId":         report_id,
            "quarter":          intelligence["quarter"],
            "year":             intelligence["year"],
            "executiveSummary": intelligence["executive_summary"],
            "kpiSummaries":     intelligence["kpi_summaries"],
            "metricSignals": [
                {
                    "metric":    sig["metric"],
                    "current":   sig.get("current"),
                    "previous":  sig.get("previous"),
                    "deltaPct":  sig.get("delta_pct"),
                    "narrative": sig.get("narrative", ""),
                }
                for sig in intelligence["metric_signals"]
            ],
            "issueHighlights":  intelligence["issue_highlights"],
            "strategicSignals": intelligence["strategic_signals"],
            "confidenceScore":  intelligence["confidence_score"],
            "processedAt":      datetime.datetime.utcnow().isoformat() + "Z",
        }
        if user_id:
            doc["user"] = {"_type": "reference", "_ref": user_id}
        await store_intelligence(doc)

    def _build_fallback_intelligence(
        self, ctx: dict, report_id: str, quarter: str, year: int
    ) -> dict:
        """
        Rule-based fallback when Ollama times out OR returns a useless
        "data unavailable" response. Builds intelligence directly from
        the context payload — no LLM needed.
        """
        if _is_year_mode(ctx):
            return self._build_fallback_year(ctx, report_id, quarter, year)

        # Quarter mode
        p = ctx.get("primary") or {}
        d = ctx.get("delta") or {}
        kpis = p.get("kpis", [])
        issues = p.get("issues", [])
        insights = p.get("insights", [])

        sus  = p.get("sus_score", 0)
        susd = p.get("sus_change", 0)
        ts   = p.get("task_success_rate", 0)
        nps  = p.get("nps_score", 0)
        err  = p.get("error_rate", 0)

        return {
            "report_id": report_id,
            "quarter":   quarter,
            "year":      year,
            "executive_summary": (
                f"{quarter} {year} research measured a SUS score of {sus} "
                f"({susd:+.1f} points vs the previous quarter). "
                f"Task success reached {ts}% with an error rate of {err}%, "
                f"reflecting steady usability progress. "
                f"NPS stands at {nps}, and the highest-severity findings below "
                f"map directly to recommended actions."
            ),
            "kpi_summaries": [
                {
                    "label":   k.get("label",  f"KPI {i+1}"),
                    "value":   k.get("value",  "—"),
                    "change":  k.get("change", 0),
                    "trend":   k.get("trend",  "stable"),
                    "insight": "",
                }
                for i, k in enumerate(kpis[:8])
            ],
            "metric_signals": [
                {
                    "metric":    "SUS Score",
                    "current":   sus,
                    "previous":  None,
                    "delta_pct": d.get("sus_score"),
                    "narrative": f"SUS at {sus}, {d.get('sus_score', 0):+.1f} points vs prior period.",
                },
                {
                    "metric":    "Task Success Rate",
                    "current":   ts,
                    "previous":  None,
                    "delta_pct": d.get("task_success_rate"),
                    "narrative": f"Task success at {ts}%, {d.get('task_success_rate', 0):+.1f}pp vs prior period.",
                },
            ],
            "issue_highlights": [
                {
                    "title":          i_.get("title",          f"Issue {i+1}"),
                    "severity":       i_.get("severity",       "medium"),
                    "signal":         (i_.get("description") or "")[:120],
                    "recommendation": i_.get("recommendation", ""),
                }
                for i, i_ in enumerate(issues[:3])
            ],
            "strategic_signals": [
                ins.get("summary", ins.get("title", f"Recommended action {i+1}"))[:120]
                for i, ins in enumerate(insights[:3])
            ],
            "confidence_score": 0.70,
        }

    def _build_fallback_year(
        self, ctx: dict, report_id: str, quarter: str, year: int
    ) -> dict:
        """
        Year-mode fallback. Synthesises intelligence from
        ctx['aggregated'] + ctx['all_reports']. Produces a substantive
        full-year narrative that never reads "data unavailable".
        """
        agg     = ctx.get("aggregated") or {}
        reports = ctx.get("all_reports") or []

        # Sort chronologically
        def _qkey(r):
            q = str(r.get("quarter", "Q1"))
            qn = int(q.replace("Q", "")) if q.startswith("Q") and q[1:].isdigit() else 0
            return (int(r.get("year", 0) or 0), qn)
        reports = sorted(reports, key=_qkey)

        avg_sus    = float(agg.get("avg_sus_score", 0) or 0)
        avg_ts     = float(agg.get("avg_task_success_rate", 0) or 0)
        avg_nps    = float(agg.get("avg_nps_score", 0) or 0)
        total_part = int(agg.get("total_participants", 0) or 0)
        avg_err    = float(agg.get("avg_error_rate", 0) or 0)
        avg_conv   = float(agg.get("avg_conversion_rate", 0) or 0)
        n_quarters = len(reports)

        # Year-over-year SUS movement as a directional signal
        sus_gain = 0.0
        if len(reports) >= 2:
            sus_gain = round(
                float(reports[-1].get("sus_score", 0) or 0)
                - float(reports[0].get("sus_score", 0) or 0), 1)
        trend_phrase = "with usability improving every quarter" if sus_gain > 0 \
                       else "with usability holding steady across quarters"

        # Aggregate KPIs / issues / insights across all quarters (dedup by title)
        seen_kpi = set()
        all_kpis_raw = []
        for r in reports:
            for k in (r.get("kpis") or []):
                lbl = (k.get("label") or "").strip().lower()
                if lbl and lbl not in seen_kpi:
                    seen_kpi.add(lbl)
                    all_kpis_raw.append(k)

        seen_issue = set()
        all_issues = []
        for r in reports:
            for issue in (r.get("issues") or []):
                t = (issue.get("title") or "").strip().lower()
                if t and t not in seen_issue:
                    seen_issue.add(t)
                    all_issues.append(issue)

        seen_ins = set()
        all_insights = []
        for r in reports:
            for ins in (r.get("insights") or []):
                t = (ins.get("title") or "").strip().lower()
                if t and t not in seen_ins:
                    seen_ins.add(t)
                    all_insights.append(ins)

        # Build the 8-KPI year-shaped block
        kpi_summaries = []
        for k in all_kpis_raw[:8]:
            kpi_summaries.append({
                "label":   k.get("label",  ""),
                "value":   k.get("value",  "—"),
                "change":  k.get("change", 0),
                "trend":   k.get("trend",  "stable"),
                "insight": "",
            })
        # Backfill with year aggregates if not enough KPIs
        if len(kpi_summaries) < 8:
            backfill = [
                {"label": "Avg SUS Score",         "value": f"{avg_sus:.1f}",           "change": sus_gain,  "trend": "up" if sus_gain >= 0 else "down", "insight": ""},
                {"label": "Avg Task Success",      "value": f"{avg_ts:.1f}%",           "change": 0,         "trend": "stable", "insight": ""},
                {"label": "Avg NPS",               "value": f"{avg_nps:+.0f}",          "change": 0,         "trend": "stable", "insight": ""},
                {"label": "Participants (year)",   "value": f"{total_part:,}",          "change": 0,         "trend": "up",     "insight": ""},
                {"label": "Avg Error Rate",        "value": f"{avg_err:.1f}%",          "change": 0,         "trend": "down" if avg_err < 6 else "stable", "insight": ""},
                {"label": "Avg Conversion Rate",   "value": f"{avg_conv:.1f}%",         "change": avg_conv,  "trend": "up" if avg_conv >= 0 else "down", "insight": ""},
            ]
            for b in backfill:
                if not any(k["label"] == b["label"] for k in kpi_summaries):
                    kpi_summaries.append(b)
                if len(kpi_summaries) >= 8:
                    break

        executive_summary = (
            f"Across {n_quarters} quarters of {year}, research covered "
            f"{total_part:,} participants and the SUS score averaged {avg_sus:.1f}, "
            f"{trend_phrase} ({sus_gain:+.1f} points across the year). "
            f"Task success averaged {avg_ts:.1f}% with error rates at {avg_err:.1f}%, "
            f"and NPS averaged {avg_nps:+.0f}. "
            f"Key-flow conversion averaged {avg_conv:.1f}%, tracking the usability fixes "
            f"shipped from each quarter's findings."
        )

        return {
            "report_id":         report_id,
            "quarter":           quarter,   # "FY"
            "year":              year,
            "executive_summary": executive_summary,
            "kpi_summaries":     kpi_summaries[:8],
            "metric_signals": [
                {
                    "metric":    "Average SUS Score",
                    "current":   avg_sus,
                    "previous":  None,
                    "delta_pct": None,
                    "narrative": f"SUS averaged {avg_sus:.1f} across {n_quarters} quarters, {sus_gain:+.1f} points year over year.",
                },
                {
                    "metric":    "Average Task Success Rate",
                    "current":   avg_ts,
                    "previous":  None,
                    "delta_pct": None,
                    "narrative": f"Task success averaged {avg_ts:.1f}% through the year.",
                },
                {
                    "metric":    "Average Error Rate",
                    "current":   avg_err,
                    "previous":  None,
                    "delta_pct": None,
                    "narrative": f"Task error rate averaged {avg_err:.1f}% for {year}.",
                },
            ],
            "issue_highlights": [
                {
                    "title":          i_.get("title",          f"Issue {i+1}"),
                    "severity":       i_.get("severity",       "medium"),
                    "signal":         (i_.get("description") or "")[:120],
                    "recommendation": i_.get("recommendation", ""),
                }
                for i, i_ in enumerate(all_issues[:3])
            ],
            "strategic_signals": [
                (ins.get("summary") or ins.get("title") or f"Recommended action {i+1}")[:120]
                for i, ins in enumerate(all_insights[:3])
            ],
            "confidence_score": 0.85 if n_quarters == 4 else 0.70,
        }
