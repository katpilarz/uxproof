"""
agents/coordinator_agent.py

Drives the deterministic Context → Extraction → Planning sequence.
Python owns the control flow; Ollama does the intelligence work inside
each agent (via services/ollama_service.py).
"""

import datetime
import uuid
from typing import AsyncGenerator

from orchestration.tools import (
    tool_build_context,
    tool_extract_intelligence,
    tool_generate_slide_plan,
)

from orchestration.state import save as save_state
from schemas.pipeline_state import AgentStatus, PipelineState


# ──────────────────────────────────────────────────────────────────────────────
# COORDINATOR
# ──────────────────────────────────────────────────────────────────────────────

class CoordinatorAgent:

    # ──────────────────────────────────────────────────────────────────────
    # SYNC PIPELINE  — Python drives the sequence, Ollama does extraction
    # ──────────────────────────────────────────────────────────────────────

    async def run_pipeline(
        self,
        task: str,
        context: dict | None = None,
        agents_requested: list[str] | None = None,
    ) -> PipelineState:

        pipeline_id = f"pipeline_{uuid.uuid4().hex[:12]}"
        state = PipelineState(pipeline_id=pipeline_id, task=task)
        state.status = AgentStatus.RUNNING

        ctx_step  = state.log_step("context")
        ext_step  = state.log_step("extraction")
        plan_step = state.log_step("planning")
        plan_step.status = AgentStatus.SKIPPED

        await save_state(state)

        try:
            # ── Step 1: ContextAgent → Sanity ─────────────────────────────
            ctx_step.start()
            await save_state(state)

            context_payload = await tool_build_context(
                quarter=context.get("quarter") if context else None,
                year=context.get("year")       if context else None,
                mode=context.get("mode", "single") if context else "single",
                user_id=context.get("user_id") if context else None,
            )

            ctx_step.complete(
                output_keys=list(context_payload.keys()),
                metadata={"period": context_payload.get("period", "")},
            )
            await save_state(state)

            # ── Step 2: ExtractionAgent → Ollama ──────────────────────────
            ext_step.start()
            await save_state(state)

            intelligence = await tool_extract_intelligence(context_payload)

            ext_step.complete(
                output_keys=list(intelligence.keys()),
                metadata={"confidence": intelligence.get("confidence_score", 0)},
            )
            await save_state(state)

            # ── Step 3: PlanningAgent → Ollama (only if requested) ────────
            slide_plan = None
            if agents_requested and "planning" in agents_requested:
                plan_step.status = AgentStatus.RUNNING
                plan_step.start()
                await save_state(state)

                slide_plan = await tool_generate_slide_plan(
                    context_payload,
                    intelligence,
                    "executive",
                )

                plan_step.complete(
                    output_keys=list(slide_plan.keys()),
                    metadata={"slide_count": slide_plan.get("total_slides", 0)},
                )
                await save_state(state)

            # ── Finalise state ────────────────────────────────────────────
            state.context      = context_payload
            state.intelligence = intelligence
            state.slide_plan   = slide_plan
            state.summary      = intelligence.get(
                "executive_summary", "Pipeline complete."
            )
            state.status      = AgentStatus.COMPLETED
            state.finished_at = datetime.datetime.utcnow()

        except Exception as exc:
            state.status      = AgentStatus.FAILED
            state.error       = str(exc)
            state.finished_at = datetime.datetime.utcnow()
            for step in state.steps.values():
                if step.status == AgentStatus.RUNNING:
                    step.fail(str(exc))

        await save_state(state)
        return state

    # ──────────────────────────────────────────────────────────────────────
    # STREAMING PIPELINE
    # ──────────────────────────────────────────────────────────────────────

    async def run_pipeline_stream(
        self,
        task: str,
        context: dict | None = None,
        agents_requested: list[str] | None = None,
    ) -> AsyncGenerator[dict, None]:

        pipeline_id = f"pipeline_{uuid.uuid4().hex[:12]}"
        state = PipelineState(pipeline_id=pipeline_id, task=task)
        state.status = AgentStatus.RUNNING

        ctx_step  = state.log_step("context")
        ext_step  = state.log_step("extraction")
        plan_step = state.log_step("planning")
        plan_step.status = AgentStatus.SKIPPED

        await save_state(state)

        try:
            # ── Step 1 ────────────────────────────────────────────────────
            ctx_step.start()
            await save_state(state)
            yield state.to_event("tool_start")

            context_payload = await tool_build_context(
                quarter=context.get("quarter") if context else None,
                year=context.get("year")       if context else None,
                mode=context.get("mode", "single") if context else "single",
                user_id=context.get("user_id") if context else None,
            )

            ctx_step.complete(
                output_keys=list(context_payload.keys()),
                metadata={"period": context_payload.get("period", "")},
            )
            state.context = context_payload
            await save_state(state)
            yield state.to_event("tool_done")

            # ── Step 2 ────────────────────────────────────────────────────
            ext_step.start()
            await save_state(state)
            yield state.to_event("tool_start")

            intelligence = await tool_extract_intelligence(context_payload)

            ext_step.complete(
                output_keys=list(intelligence.keys()),
                metadata={"confidence": intelligence.get("confidence_score", 0)},
            )
            state.intelligence = intelligence
            await save_state(state)
            yield state.to_event("tool_done")

            # ── Step 3 (optional) ─────────────────────────────────────────
            slide_plan = None
            if agents_requested and "planning" in agents_requested:
                plan_step.status = AgentStatus.RUNNING
                plan_step.start()
                await save_state(state)
                yield state.to_event("tool_start")

                slide_plan = await tool_generate_slide_plan(
                    context_payload,
                    intelligence,
                    "executive",
                )

                plan_step.complete(
                    output_keys=list(slide_plan.keys()),
                    metadata={"slide_count": slide_plan.get("total_slides", 0)},
                )
                state.slide_plan = slide_plan
                await save_state(state)
                yield state.to_event("tool_done")

            # ── Finalise ──────────────────────────────────────────────────
            state.summary     = intelligence.get(
                "executive_summary", "Pipeline complete."
            )
            state.status      = AgentStatus.COMPLETED
            state.finished_at = datetime.datetime.utcnow()
            await save_state(state)
            yield state.to_event("pipeline_complete")

        except Exception as exc:
            state.status      = AgentStatus.FAILED
            state.error       = str(exc)
            state.finished_at = datetime.datetime.utcnow()
            for step in state.steps.values():
                if step.status == AgentStatus.RUNNING:
                    step.fail(str(exc))
            await save_state(state)
            yield state.to_event("pipeline_error")