"""
In-memory pipeline state store.
Each pipeline_id maps to a PipelineState instance.
Next.js can poll GET /api/agents/status/{pipeline_id} for progress.
"""
import asyncio
from collections import OrderedDict
from schemas.pipeline_state import PipelineState

# Keep the last 100 pipelines in memory
_store: OrderedDict[str, PipelineState] = OrderedDict()
_lock  = asyncio.Lock()
MAX    = 100


async def save(state: PipelineState):
    async with _lock:
        _store[state.pipeline_id] = state
        if len(_store) > MAX:
            _store.popitem(last=False)


async def get(pipeline_id: str) -> PipelineState | None:
    async with _lock:
        return _store.get(pipeline_id)


async def list_recent(n: int = 20) -> list[dict]:
    async with _lock:
        items = list(_store.values())[-n:]
        return [
            {
                "pipeline_id": s.pipeline_id,
                "task":        s.task,
                "status":      s.status,
                "started_at":  s.started_at.isoformat(),
                "duration_ms": s.total_duration_ms(),
                "summary":     s.summary[:120],
            }
            for s in reversed(items)
        ]