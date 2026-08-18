"""
Thin orchestration wrapper that the FastAPI endpoints call.
Keeps main.py clean.
"""
from agents.coordinator_agent import CoordinatorAgent
from schemas.pipeline_state   import PipelineState

_coordinator = CoordinatorAgent()   # singleton — cheap to keep alive


async def run(
    task: str,
    context: dict | None = None,
    agents: list[str] | None = None,
) -> PipelineState:
    """Blocking pipeline run — returns a completed PipelineState."""
    return await _coordinator.run_pipeline(
        task=task,
        context=context,
        agents_requested=agents,
    )


async def stream(
    task: str,
    context: dict | None = None,
    agents: list[str] | None = None,
):
    """Async generator of SSE event dicts."""
    async for event in _coordinator.run_pipeline_stream(
        task=task,
        context=context,
        agents_requested=agents,
    ):
        yield event