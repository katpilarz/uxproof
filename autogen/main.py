"""
FastAPI service — fixed main.py

KEY FIXES:
  1. CORS wildcard *.vercel.app replaced with explicit allow_origin_regex
     (browser CORS rejects wildcard subdomains in some environments)
  2. /health endpoint now checks Ollama and Sanity reachability
  3. AgentRunRequest.status returns enum value not enum object for JSON serialisation
  4. pipeline_routes mounted at /pipeline so the Next.js /api/presentations
     route can trigger CoordinatorAgent.run_pipeline on demand for
     year-scope and missing-quarter slide plan generation.
"""
import os
from dotenv import load_dotenv
load_dotenv()

import asyncio, json, uuid
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from orchestration.pipeline   import run as run_pipeline, stream as stream_pipeline
from orchestration.state      import get as get_state, list_recent
from agents.context_agent     import ContextAgent
from agents.extraction_agent  import ExtractionAgent
from agents.planning_agent    import PlanningAgent
from schemas.pipeline_state   import AgentStatus
from pipeline_routes          import router as pipeline_router   # NEW

OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("✅  uxproof agent service started")
    print(f"    Ollama: {OLLAMA_BASE}")
    print(f"    Sanity project: {os.getenv('SANITY_PROJECT_ID', '(not set)')}")
    yield
    print("🛑  AutoGen service stopped")


app = FastAPI(title="uxproof Agent Service", lifespan=lifespan)

# FIX: use allow_origin_regex instead of wildcard subdomain
# Wildcard *.vercel.app is not supported in CORS spec for credentialled requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_ctx  = ContextAgent()
_ext  = ExtractionAgent()
_plan = PlanningAgent()

# Mount the on-demand pipeline trigger used by the Next.js
# /api/presentations route. Exposes POST /pipeline/run.
app.include_router(pipeline_router, prefix="/pipeline")   # NEW


# ── Request models ────────────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    task:    str
    context: dict       = {}
    agents:  list[str]  = ["context", "extraction"]
    stream:  bool       = False

class ContextRequest(BaseModel):
    query:              str        = ""
    quarter:            str | None = None
    year:               int | None = None
    mode:               str        = "single"
    comparison_quarter: str | None = None
    comparison_year:    int | None = None

class ExtractRequest(BaseModel):
    context_payload: dict

class PlanRequest(BaseModel):
    context_payload:    dict
    intelligence:       dict
    presentation_style: str = "executive"


# ── Health — checks Ollama + Sanity reachability ─────────────────────────────

@app.get("/health")
async def health():
    checks: dict = {
        "status": "ok",
        "agents": ["coordinator", "context", "extraction", "planning"],
        "version": "day10",
        "ollama": "unknown",
        "sanity": "unknown",
    }

    # Check Ollama
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{OLLAMA_BASE}/api/tags")
            checks["ollama"] = "ok" if r.status_code == 200 else f"error:{r.status_code}"
    except Exception as e:
        checks["ollama"] = f"unreachable: {str(e)[:60]}"
        checks["status"] = "degraded"

    # Check Sanity env vars
    project_id = os.getenv("SANITY_PROJECT_ID", "")
    token      = os.getenv("SANITY_API_TOKEN", "")
    if not project_id or not token:
        checks["sanity"] = "missing env vars (SANITY_PROJECT_ID or SANITY_API_TOKEN)"
        checks["status"] = "degraded"
    else:
        checks["sanity"] = f"configured (project: {project_id})"

    return checks


# ── Full pipeline — sync ──────────────────────────────────────────────────────

@app.post("/api/agents/run")
async def agents_run(req: AgentRunRequest):
    try:
        state = await run_pipeline(
            task=req.task,
            context=req.context,
            agents=req.agents,
        )
        return {
            # FIX: convert enum to its string value for JSON serialisation
            "success":      state.status == AgentStatus.COMPLETED,
            "pipeline_id":  state.pipeline_id,
            "status":       state.status.value,
            "summary":      state.summary,
            "context":      state.context,
            "intelligence": state.intelligence,
            "slide_plan":   state.slide_plan,
            "steps":        {k: v.model_dump() for k, v in state.steps.items()},
            "duration_ms":  state.total_duration_ms(),
            "error":        state.error,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Full pipeline — SSE streaming ─────────────────────────────────────────────

@app.post("/api/agents/run/stream")
async def agents_run_stream(req: AgentRunRequest):
    async def event_generator():
        async for event in stream_pipeline(
            task=req.task,
            context=req.context,
            agents=req.agents,
        ):
            # FIX: serialise enum values in steps before JSON encoding
            if "steps" in event:
                for step in event["steps"].values():
                    if hasattr(step.get("status"), "value"):
                        step["status"] = step["status"].value
            yield {"data": json.dumps(event, default=str)}

    return EventSourceResponse(event_generator())


# ── Pipeline status ───────────────────────────────────────────────────────────

@app.get("/api/agents/status/{pipeline_id}")
async def pipeline_status(pipeline_id: str):
    state = await get_state(pipeline_id)
    if not state:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return state.to_event("status")


@app.get("/api/agents/history")
async def pipeline_history():
    return {"pipelines": await list_recent(20)}


# ── Standalone agent endpoints ────────────────────────────────────────────────

@app.post("/api/context")
async def run_context(req: ContextRequest):
    try:
        result = await _ctx.build_context(
            query=req.query,
            quarter=req.quarter,
            year=req.year,
            mode=req.mode,
            comparison_quarter=req.comparison_quarter,
            comparison_year=req.comparison_year,
        )
        return {"success": True, "context": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/extract")
async def run_extraction(req: ExtractRequest):
    try:
        intel = await _ext.extract(req.context_payload)
        return {"success": True, "intelligence": intel}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/plan")
async def run_planning(req: PlanRequest):
    try:
        plan = await _plan.generate(
            context_payload=req.context_payload,
            intelligence=req.intelligence,
            style=req.presentation_style,
        )
        return {"success": True, "slide_plan": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)