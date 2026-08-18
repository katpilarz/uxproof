"""
schemas/intelligence.py

Validated intelligence extracted from UX research reports.

NOTE: KPISummary.value and KPISummary.change accept None from Ollama and
coerce to safe defaults ("—" and 0.0) via validators. Ollama sometimes
returns null for KPI fields it can't map — without coercion, Pydantic
validation fails and blocks all presentation generation.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional


class KPISummary(BaseModel):
    label:   str
    value:   Optional[str]   = None
    change:  Optional[float] = None
    trend:   Literal["up", "down", "stable"] = "stable"
    insight: str = ""

    @field_validator("value", mode="before")
    @classmethod
    def coerce_value(cls, v):
        if v is None:
            return "—"
        return str(v)

    @field_validator("change", mode="before")
    @classmethod
    def coerce_change(cls, v):
        if v is None:
            return 0.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    @field_validator("trend", mode="before")
    @classmethod
    def coerce_trend(cls, v):
        if v not in ("up", "down", "stable"):
            return "stable"
        return v


class IssueSummary(BaseModel):
    title:          str
    severity:       Literal["low", "medium", "high"] = "medium"
    signal:         str = ""
    recommendation: str = ""

    @field_validator("severity", mode="before")
    @classmethod
    def coerce_severity(cls, v):
        if v not in ("low", "medium", "high"):
            return "medium"
        return v

    @field_validator("signal", "recommendation", mode="before")
    @classmethod
    def coerce_str(cls, v):
        return str(v) if v is not None else ""


class MetricSignal(BaseModel):
    metric:    str
    current:   Optional[float] = None
    previous:  Optional[float] = None
    delta_pct: Optional[float] = None
    narrative: str = ""

    @field_validator("current", "previous", "delta_pct", mode="before")
    @classmethod
    def coerce_float(cls, v):
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    @field_validator("narrative", mode="before")
    @classmethod
    def coerce_narrative(cls, v):
        return str(v) if v is not None else ""


class ExecutiveIntelligence(BaseModel):
    report_id:         str
    quarter:           str
    year:              int
    executive_summary: str   = Field(..., description="3-5 sentence client-ready summary")
    kpi_summaries:     list[KPISummary]
    metric_signals:    list[MetricSignal]
    issue_highlights:  list[IssueSummary]
    strategic_signals: list[str] = Field(..., description="Top 3-5 recommended actions")
    confidence_score:  float     = Field(ge=0, le=1, description="0-1 confidence in extraction")

    @field_validator("strategic_signals", mode="before")
    @classmethod
    def coerce_signals(cls, v):
        if not isinstance(v, list):
            return []
        return [str(s) for s in v if s is not None]

    @field_validator("confidence_score", mode="before")
    @classmethod
    def coerce_confidence(cls, v):
        if v is None:
            return 0.5
        try:
            f = float(v)
            return max(0.0, min(1.0, f))
        except (TypeError, ValueError):
            return 0.5
