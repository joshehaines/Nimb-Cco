"""Assistant relay: configuration gate, upstream call shape, and the response passed back unchanged."""
from __future__ import annotations

import asyncio
import json

import httpx

from app import assistant


def test_unconfigured_returns_503(make_client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client, _ = make_client([])
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "content": "hi"}], "tools": []}, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 503


def test_complete_sends_system_tools_and_returns_blocks(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"content": [{"type": "tool_use", "id": "t1", "name": "search", "input": {"query": "Copper Kettle"}}], "stop_reason": "tool_use", "model": "claude-sonnet-5-5"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await assistant.complete([{"role": "user", "content": "find the copper kettle"}], [{"name": "search", "description": "d", "input_schema": {"type": "object"}}], {"path": "/map"}, client=c, user_name="Demo agent")

    out = asyncio.run(run())
    assert out["content"][0]["name"] == "search" and out["stop_reason"] == "tool_use"
    assert seen["headers"]["x-api-key"] == "k" and seen["headers"]["anthropic-version"]
    assert "Christie" in seen["body"]["system"] and "Demo agent" in seen["body"]["system"] and "/map" in seen["body"]["system"]
    assert seen["body"]["tools"][0]["name"] == "search" and seen["body"]["messages"][-1]["content"] == "find the copper kettle"


def test_endpoint_relays_and_audits(make_client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")

    async def fake_complete(messages, tools, context=None, *, client=None, user_name=None):
        return {"content": [{"type": "text", "text": "Opened the map."}], "stop_reason": "end_turn", "model": "x"}

    monkeypatch.setattr(assistant, "complete", fake_complete)
    client, conn = make_client([])
    r = client.post("/api/assistant", json={"messages": [{"role": "user", "content": "open the map"}], "tools": []}, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200 and r.json()["content"][0]["text"] == "Opened the map."
    assert any(c[0].startswith("insert into audit_log") and "'assistant'" in c[0] and c[1][1] == "demo-agent" for c in conn.calls)
