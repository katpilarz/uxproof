"""
Pydantic models that describe the execution state of the pipeline.
The CoordinatorAgent updates this as each step completes.
Next.js receives the final PipelineResult (or incremental SSE events).
"""
from __future__ import annotations
import datetime
from enum import Enum
from pydantic import BaseModel, Field
from typing import Any


class AgentStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    SKIPPED   = "skipped"


class AgentStepLog(BaseModel):
    agent:       str
    status:      AgentStatus = AgentStatus.PENDING
    started_at:  datetime.datetime | None = None
    finished_at: datetime.datetime | None = None
    duration_ms: int | None = None
    input_keys:  list[str] = Field(default_factory=list)
    output_keys: list[str] = Field(default_factory=list)
    error:       str | None = None
    metadata:    dict[str, Any] = Field(default_factory=dict)

    def start(self):
        self.status     = AgentStatus.RUNNING
        self.started_at = datetime.datetime.utcnow()

    def complete(self, output_keys: list[str] | None = None, metadata: dict | None = None):
        self.status      = AgentStatus.COMPLETED
        self.finished_at = datetime.datetime.utcnow()
        if self.started_at:
            self.duration_ms = int(
                (self.finished_at - self.started_at).total_seconds() * 1000
            )
        if output_keys:
            self.output_keys = output_keys
        if metadata:
            self.metadata = metadata

    def fail(self, error: str):
        self.status      = AgentStatus.FAILED
        self.finished_at = datetime.datetime.utcnow()
        if self.started_at:
            self.duration_ms = int(
                (self.finished_at - self.started_at).total_seconds() * 1000
            )
        self.error = error


class PipelineState(BaseModel):
    """Mutable execution state — passed through the entire pipeline."""
    pipeline_id:   str
    task:          str
    started_at:    datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    finished_at:   datetime.datetime | None = None
    status:        AgentStatus = AgentStatus.PENDING
    steps:         dict[str, AgentStepLog] = Field(default_factory=dict)
    # Artefacts produced by each agent
    context:       dict[str, Any] | None = None
    intelligence:  dict[str, Any] | None = None
    slide_plan:    dict[str, Any] | None = None
    # Final summary for the client
    summary:       str = ""
    error:         str | None = None

    def log_step(self, agent: str) -> AgentStepLog:
        step = AgentStepLog(agent=agent)
        self.steps[agent] = step
        return step

    def total_duration_ms(self) -> int | None:
        if self.finished_at:
            return int((self.finished_at - self.started_at).total_seconds() * 1000)
        return None

    def to_event(self, event_type: str) -> dict:
        """Serialise to an SSE-compatible payload."""
        return {
            "event":       event_type,
            "pipeline_id": self.pipeline_id,
            "status":      self.status,
            "steps":       {k: v.model_dump() for k, v in self.steps.items()},
            "summary":     self.summary,
            "error":       self.error,
        }