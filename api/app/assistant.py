"""Claude-backed assistant proxy.

The browser owns the tools (they change the user's own map and pages), so this endpoint is a
thin, stateless relay: it adds the platform system prompt, forwards the conversation and the
tool specs to the Claude Messages API, and returns the content blocks. Tool execution happens in
the browser; results come back as the next user turn. Set ANTHROPIC_API_KEY (and optionally
ASSISTANT_MODEL) to enable; without a key the endpoint returns 503 and the app answers locally.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.environ.get("ASSISTANT_MODEL", "claude-sonnet-5-5")

SYSTEM = """You are the in-app assistant for Property Intelligence, Christie & Co's internal property platform
(business property advisers: pubs, restaurants, hotels, care homes, childcare, dental, medical, pharmacy,
convenience retail, leisure, garden centres). Staff ask you to find sites and companies, move and style the
map, source a sector, set up alerts for distressed ("dirty") deals, run competition analysis and explain terms.

Rules:
- Prefer calling a tool to describing one. Chain tools when a request needs several steps.
- Be brief: one or two sentences, British English, no marketing tone.
- Never claim to have sent, ordered, exported or approved anything; those actions stay with the user.
- HM Land Registry CCOD/OCOD data must not be used for direct marketing; say so if asked to contact an owner known only from it.
- Demo areas are Leamington Spa & Warwick and Bristol; elsewhere only the real national layers exist. Demo businesses are fictional.
- If a request is outside the platform, say what the nearest thing the platform can do is."""


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


async def complete(messages: list[dict[str, Any]], tools: list[dict[str, Any]], context: dict[str, Any] | None = None, *, client: httpx.AsyncClient | None = None, user_name: str | None = None) -> dict[str, Any]:
    """One Messages API call. Returns {"content": [...blocks], "stop_reason": str}."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    system = SYSTEM + (f"\nThe user is {user_name}." if user_name else "") + (f"\nThe app is currently at {context.get('path')}." if context and context.get("path") else "")
    body = {"model": MODEL, "max_tokens": 700, "system": system, "messages": messages[-24:], "tools": tools, "tool_choice": {"type": "auto"}}
    headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    c = client or httpx.AsyncClient(timeout=60)
    try:
        r = await c.post(ANTHROPIC_URL, json=body, headers=headers)
    finally:
        if client is None:
            await c.aclose()
    if r.status_code >= 300:
        raise RuntimeError(f"assistant upstream {r.status_code}: {r.text[:200]}")
    data = r.json()
    return {"content": data.get("content", []), "stop_reason": data.get("stop_reason", "end_turn"), "model": data.get("model", MODEL)}
