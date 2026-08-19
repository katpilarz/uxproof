"""
ContextAgent

Responsibilities:
  1. Accept a natural-language query (or explicit quarter/year params)
  2. Fetch all relevant UX research reports from Sanity
  3. Aggregate UX metrics, KPIs, issues, insights
  4. Return a deterministic, normalised AIContext dict
     that downstream agents can consume without knowing Sanity's schema
"""

import asyncio
from dataclasses import dataclass, asdict
from typing import Any

from services.sanity_service import (
    fetch_report,
    fetch_reports_by_year,
    fetch_all_reports,
)


# ── Normalised output schema ──────────────────────────────────────────────────

@dataclass
class NormalisedKPI:
    label: str
    value: str
    change: float
    trend: str            # up | down | stable


@dataclass
class NormalisedIssue:
    title: str
    severity: str
    description: str
    recommendation: str


@dataclass
class NormalisedInsight:
    category: str
    title: str
    summary: str


@dataclass
class NormalisedReport:
    report_id: str
    quarter: str
    year: int
    client: str
    product: str
    platform: str
    methods: list[str]
    sus_score: float
    sus_change: float
    task_success_rate: float
    nps_score: float
    participants: int
    error_rate: float
    conversion_rate: float
    kpis: list[NormalisedKPI]
    issues: list[NormalisedIssue]
    insights: list[NormalisedInsight]


@dataclass
class AIContextPayload:
    """
    The single artefact this agent produces.
    Everything downstream needs is here — no Sanity calls required after this.
    """
    mode: str                          # single | year | comparison | all
    period: str                        # human label, e.g. "Q3 2025"
    primary: NormalisedReport | None
    comparison: NormalisedReport | None
    all_reports: list[NormalisedReport]
    aggregated: dict[str, float]       # totals/averages across all_reports
    delta: dict[str, float] | None     # primary vs comparison deltas
    metadata: dict[str, Any]           # arbitrary pass-through


# ── Normalisation helpers ─────────────────────────────────────────────────────

def _norm_report(r: dict) -> NormalisedReport:
    return NormalisedReport(
        report_id         = r.get("reportId", r.get("_id", "")),
        quarter           = r["quarter"],
        year              = r["year"],
        client            = r.get("client", ""),
        product           = r.get("product", ""),
        platform          = r.get("platform", ""),
        methods           = list(r.get("methods") or []),
        # `or 0`, not a .get default: the GROQ projection returns an explicit
        # null for any metric an uploaded report doesn't carry, so the key is
        # present with a None value and a .get default would never apply.
        sus_score         = float(r.get("susScore") or 0),
        sus_change        = float(r.get("susChange") or 0),
        task_success_rate = float(r.get("taskSuccessRate") or 0),
        nps_score         = float(r.get("npsScore") or 0),
        participants      = int(r.get("participants") or 0),
        error_rate        = float(r.get("errorRate") or 0),
        conversion_rate   = float(r.get("conversionRate") or 0),
        # `or []` + per-field defaults: uploaded reports may lack these
        # arrays entirely, and model-extracted entries may omit subfields.
        kpis     = [NormalisedKPI(
                        label=kpi.get("label") or "",
                        value=str(kpi.get("value") or ""),
                        change=float(kpi.get("change") or 0),
                        trend=kpi.get("trend") or "stable")
                    for kpi in (r.get("kpis") or [])],
        issues   = [NormalisedIssue(
                        title=issue.get("title") or "",
                        severity=issue.get("severity") or "medium",
                        description=issue.get("description") or "",
                        recommendation=issue.get("recommendation") or "")
                    for issue in (r.get("issues") or [])],
        insights = [NormalisedInsight(
                        category=ins.get("category") or "usability",
                        title=ins.get("title") or "",
                        summary=ins.get("summary") or "")
                    for ins in (r.get("insights") or [])],
    )


def _aggregate(reports: list[NormalisedReport]) -> dict[str, float]:
    if not reports:
        return {}
    n = len(reports)
    return {
        "avg_sus_score":         round(sum(r.sus_score for r in reports) / n, 1),
        "avg_sus_change":        round(sum(r.sus_change for r in reports) / n, 1),
        "avg_task_success_rate": round(sum(r.task_success_rate for r in reports) / n, 1),
        "avg_nps_score":         round(sum(r.nps_score for r in reports) / n, 1),
        "total_participants":    sum(r.participants for r in reports),
        "avg_error_rate":        round(sum(r.error_rate for r in reports) / n, 2),
        "avg_conversion_rate":   round(sum(r.conversion_rate for r in reports) / n, 2),
    }


def _delta(p: NormalisedReport, c: NormalisedReport) -> dict[str, float]:
    def pct(a, b): return round((a - b) / abs(b) * 100, 1) if b else 0
    def pp(a, b):  return round(a - b, 2)
    return {
        # Point/percentage-point deltas for scores and rates,
        # percent delta for participant volume.
        "sus_score":         pp(p.sus_score, c.sus_score),
        "sus_change":        pp(p.sus_change, c.sus_change),
        "task_success_rate": pp(p.task_success_rate, c.task_success_rate),
        "nps_score":         pp(p.nps_score, c.nps_score),
        "participants":      pct(p.participants, c.participants),
        "error_rate":        pp(p.error_rate, c.error_rate),
        "conversion_rate":   pp(p.conversion_rate, c.conversion_rate),
    }


# ── Public API ────────────────────────────────────────────────────────────────

class ContextAgent:
    """
    Stateless agent — call build_context() for every request.
    """

    async def build_context(
        self,
        query: str = "",
        quarter: str | None = None,
        year: int | None = None,
        mode: str = "single",   # single | year | comparison | all
        comparison_quarter: str | None = None,
        comparison_year: int | None = None,
        user_id: str | None = None,   # scope every fetch to this owner
    ) -> dict:
        """
        Returns AIContextPayload as a plain dict (JSON-serialisable).
        """
        payload = await self._resolve(query, quarter, year, mode,
                                      comparison_quarter, comparison_year,
                                      user_id)
        return asdict(payload)

    async def _resolve(self, query, quarter, year, mode,
                       comp_q, comp_y, user_id=None) -> AIContextPayload:

        # ── All ───────────────────────────────────────────────────────────────
        if mode == "all" or "all" in query.lower():
            reports = [_norm_report(r) for r in await fetch_all_reports(user_id)]
            return AIContextPayload(
                mode="all", period="All Available Periods",
                primary=None, comparison=None,
                all_reports=reports,
                aggregated=_aggregate(reports),
                delta=None,
                metadata={"report_count": len(reports), "user_id": user_id},
            )

        # ── Year ──────────────────────────────────────────────────────────────
        if mode == "year" and year:
            raws = await fetch_reports_by_year(year, user_id)
            reports = [_norm_report(r) for r in raws]
            return AIContextPayload(
                mode="year", period=f"Full Year {year}",
                primary=None, comparison=None,
                all_reports=reports,
                aggregated=_aggregate(reports),
                delta=None,
                metadata={"year": year, "user_id": user_id},
            )

        # ── Comparison ────────────────────────────────────────────────────────
        if mode == "comparison" and quarter and year and comp_q and comp_y:
            raw_p, raw_c = await asyncio.gather(
                fetch_report(quarter, year, user_id),
                fetch_report(comp_q, comp_y, user_id),
            )
            p = _norm_report(raw_p) if raw_p else None
            c = _norm_report(raw_c) if raw_c else None
            return AIContextPayload(
                mode="comparison",
                period=f"{quarter} {year}",
                primary=p, comparison=c,
                all_reports=[r for r in [p, c] if r],
                aggregated=_aggregate([r for r in [p, c] if r]),
                delta=_delta(p, c) if p and c else None,
                metadata={"comparison_period": f"{comp_q} {comp_y}", "user_id": user_id},
            )

        # ── Single (default) ──────────────────────────────────────────────────
        q  = quarter or "Q1"
        yr = year    or 2026
        raw = await fetch_report(q, yr, user_id)
        p   = _norm_report(raw) if raw else None

        # Auto-fetch previous quarter for delta
        qmap = {"Q1": ("Q4", yr - 1), "Q2": ("Q1", yr),
                "Q3": ("Q2", yr),     "Q4": ("Q3", yr)}
        prev_q, prev_y = qmap.get(q, ("Q4", yr - 1))
        raw_c  = await fetch_report(prev_q, prev_y, user_id)
        c      = _norm_report(raw_c) if raw_c else None

        return AIContextPayload(
            mode="single",
            period=f"{q} {yr}",
            primary=p, comparison=c,
            all_reports=[r for r in [p, c] if r],
            aggregated=_aggregate([p] if p else []),
            delta=_delta(p, c) if p and c else None,
            metadata={"prev_period": f"{prev_q} {prev_y}", "user_id": user_id},
        )
