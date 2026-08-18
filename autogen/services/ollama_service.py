"""
services/ollama_service.py

Direct httpx wrapper for the Ollama OpenAI-compatible endpoint.
Used by ExtractionAgent and PlanningAgent (which call Ollama directly,
not through AutoGen). The CoordinatorAgent uses OllamaChatCompletionClient
from autogen-ext instead — see coordinator_agent.py.
"""
import os
import json
import httpx
from typing import AsyncIterator

# AutoGen 0.4 expects just the host:port, no /v1 suffix on OllamaChatCompletionClient.
# For direct httpx calls we still need the full /v1 path.
OLLAMA_BASE  = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL",    "qwen2.5:14b")
TIMEOUT      = 180

# Full endpoint for direct httpx calls
_COMPLETIONS = f"{OLLAMA_BASE.rstrip('/')}/v1/chat/completions"


async def chat_completion(
    messages:    list[dict],
    temperature: float = 0.1,
    max_tokens:  int   = 2048,
    json_mode:   bool  = False,
) -> str:
    payload: dict = {
        "model":       OLLAMA_MODEL,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(_COMPLETIONS, json=payload)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def chat_completion_stream(
    messages:    list[dict],
    temperature: float = 0.1,
    max_tokens:  int   = 2048,
) -> AsyncIterator[str]:
    payload = {
        "model":       OLLAMA_MODEL,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
        "stream":      True,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        async with client.stream("POST", _COMPLETIONS, json=payload) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    chunk = json.loads(line[6:])
                    delta = chunk["choices"][0].get("delta", {})
                    if token := delta.get("content", ""):
                        yield token