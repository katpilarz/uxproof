"""
orchestration/tools.py

Every capability the CoordinatorAgent can invoke is registered here as a
plain async function. Python drives the pipeline sequence — Ollama handles
the actual intelligence extraction inside each agent.
"""
import asyncio
from agents.context_agent    import ContextAgent
from agents.extraction_agent import ExtractionAgent
from agents.planning_agent   import PlanningAgent

_ctx  = ContextAgent()
_ext  = ExtractionAgent()
_plan = PlanningAgent()


# ── Tool 1: Fetch & normalise report context ──────────────────────────────────

async def tool_build_context(
    query: str = "",
    quarter: str | None = None,
    year: int | None = None,
    mode: str = "single",
    comparison_quarter: str | None = None,
    comparison_year: int | None = None,
) -> dict:
    """
    Retrieves and normalises enterprise data from Sanity CMS.
    Returns a deterministic AIContextPayload dict.
    """
    return await _ctx.build_context(
        query=query,
        quarter=quarter,
        year=year,
        mode=mode,
        comparison_quarter=comparison_quarter,
        comparison_year=comparison_year,
    )


# ── Tool 2: Extract structured intelligence ───────────────────────────────────

async def tool_extract_intelligence(context_payload: dict) -> dict:
    """
    Calls Ollama to transform raw CMS data into validated
    ExecutiveIntelligence JSON. Persists result to Sanity automatically.
    Receives and returns a plain dict — no JSON serialisation needed.
    """
    return await _ext.extract(context_payload)


# ── Tool 3: Generate slide plan ───────────────────────────────────────────────

async def tool_generate_slide_plan(
    context_payload: dict,
    intelligence: dict,
    presentation_style: str = "executive",
) -> dict:
    """
    Calls Ollama to produce a structured slide plan from the context +
    intelligence artefacts. Persists to Sanity.
    """
    return await _plan.generate(
        context_payload=context_payload,
        intelligence=intelligence,
        style=presentation_style,
    )