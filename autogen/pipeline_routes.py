"""
pipeline_routes.py

Exposes CoordinatorAgent.run_pipeline as an HTTP endpoint so the
Next.js /api/presentations route can trigger the multi-agent pipeline
on demand when no slidePlan exists for the requested period.

MOUNT in main.py:

    from pipeline_routes import router as pipeline_router
    app.include_router(pipeline_router, prefix="/pipeline")

ENDPOINT:
    POST /pipeline/run
    body: {
      "mode":             "year" | "single",
      "year":             2025,
      "quarter":          "Q3",                  # optional, single mode only
      "agents_requested": ["planning"]           # optional, controls which agents run
    }

    response: {
      "status":      "completed" | "failed",
      "pipeline_id": "pipeline_abc123",
      "slide_plan_id": "slideplan_year_2025" | "slideplan_<report-id>",
      "summary":     "...",
      "elapsed_ms":  91234
    }

The route is SYNCHRONOUS — the caller blocks until the pipeline finishes
or hits the FastAPI worker timeout. This matches what the Next.js route
expects: trigger, wait, re-fetch from Sanity.

For a long-running async variant (SSE / WebSocket) use the existing
streaming endpoint in your codebase; this one is for the simple
trigger-and-wait pattern used by the presentation generation flow.
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from agents.coordinator_agent import CoordinatorAgent
from schemas.pipeline_state import AgentStatus


log = logging.getLogger(__name__)

router = APIRouter(tags=["pipeline"])


# ── Request / response models ──────────────────────────────────────────────

class PipelineRunRequest(BaseModel):
    mode:    Literal["year", "single"] = Field(
        ...,
        description="'year' aggregates all quarters of `year`; 'single' targets one quarter.",
    )
    year:    int = Field(..., ge=2000, le=2100)
    quarter: Optional[str] = Field(
        None,
        description="Q1|Q2|Q3|Q4 — required when mode='single', ignored when mode='year'.",
    )
    agents_requested: list[str] = Field(
        default_factory=lambda: ["planning"],
        description="Which downstream agents to invoke. Always include 'planning' for presentations.",
    )

    @field_validator("quarter")
    @classmethod
    def _quarter_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().upper()
        if v not in {"Q1", "Q2", "Q3", "Q4"}:
            raise ValueError("quarter must be one of Q1, Q2, Q3, Q4")
        return v


class PipelineRunResponse(BaseModel):
    status:        str
    pipeline_id:   str
    slide_plan_id: Optional[str]
    summary:       Optional[str]
    error:         Optional[str] = None


# ── Route handler ──────────────────────────────────────────────────────────

@router.post("/run", response_model=PipelineRunResponse)
async def run_pipeline(req: PipelineRunRequest) -> PipelineRunResponse:
    """
    Trigger a full Context → Extraction → Planning pipeline for the
    requested period. Blocks until completion. Returns the resulting
    pipeline_id and the slide_plan_id under which the planning agent
    persisted its output to Sanity.

    The slide_plan_id pattern depends on mode:
      - mode='year'   → "slideplan_year_<year>"     (e.g. "slideplan_year_2025")
      - mode='single' → "slideplan_<report-id>"     (e.g. "slideplan_report-ux-q3-2024")

    These conventions are enforced by planning_agent.py v7's _persist().
    """
    if req.mode == "single" and not req.quarter:
        raise HTTPException(
            status_code=400,
            detail="quarter is required when mode='single'",
        )

    log.info(
        "[pipeline.run] mode=%s year=%s quarter=%s agents=%s",
        req.mode, req.year, req.quarter, req.agents_requested,
    )

    # Build the context dict that CoordinatorAgent expects.
    #   - mode='year' → ContextAgent aggregates all quarters of `year`
    #   - mode='single' → ContextAgent loads the single quarter and the
    #                     previous quarter for delta comparison
    coordinator = CoordinatorAgent()
    context = {
        "mode":    req.mode,
        "year":    req.year,
        "quarter": req.quarter,
    }
    task = (
        f"Generate full-year presentation for {req.year}"
        if req.mode == "year"
        else f"Generate {req.quarter} {req.year} presentation"
    )

    try:
        state = await coordinator.run_pipeline(
            task=task,
            context=context,
            agents_requested=req.agents_requested,
        )
    except Exception as exc:  # pragma: no cover — defensive
        log.exception("[pipeline.run] coordinator raised")
        raise HTTPException(status_code=500, detail=str(exc))

    # Derive the slide_plan_id from the persisted plan (if any).
    # planning_agent.py v7 sets the _id based on context mode, so we
    # mirror its logic here for the response.
    slide_plan_id: Optional[str] = None
    if state.slide_plan:
        if req.mode == "year":
            slide_plan_id = f"slideplan_year_{req.year}"
        else:
            primary  = (state.context or {}).get("primary") or {}
            report_id = primary.get("report_id", "unknown")
            slide_plan_id = f"slideplan_{report_id}"

    if state.status != AgentStatus.COMPLETED:
        return PipelineRunResponse(
            status        = state.status.value if hasattr(state.status, "value") else str(state.status),
            pipeline_id   = state.pipeline_id,
            slide_plan_id = slide_plan_id,
            summary       = state.summary,
            error         = state.error,
        )

    return PipelineRunResponse(
        status        = "completed",
        pipeline_id   = state.pipeline_id,
        slide_plan_id = slide_plan_id,
        summary       = state.summary,
    )