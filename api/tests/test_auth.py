import asyncio

from app import auth as auth_mod


def test_demo_mode_user_from_header(make_client):
    client, _ = make_client([("from audit_log", [])])
    r = client.get("/api/me", headers={"X-Demo-User": "demo-admin"})
    assert r.status_code == 200 and "admin" in r.json()["roles"]
    r = client.get("/api/me")
    assert r.json()["roles"] == ["agent"]


def test_audit_requires_compliance(make_client):
    client, conn = make_client([("from audit_log", [])])
    assert client.get("/api/audit", headers={"X-Demo-User": "demo-agent"}).status_code == 403
    assert client.get("/api/audit", headers={"X-Demo-User": "demo-compliance"}).status_code == 200
    r = client.post("/api/audit", json={"id": "A1", "kind": "export", "summary": "Exported 12 rows", "licences": ["HMLR-CCOD"]}, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200
    sql, args = conn.calls[-1]
    assert sql.startswith("insert into audit_log") and args[2] == "demo-agent" and args[4] == "export"


def test_roles_from_claims():
    assert auth_mod.roles_from_claims({"roles": ["CPI.Admin"]}) == ["admin", "agent", "compliance"]
    assert auth_mod.roles_from_claims({"groups": ["compliance"]}) == ["agent", "compliance"]
    assert auth_mod.roles_from_claims({}) == ["agent"]


def test_oidc_mode_rejects_missing_token(monkeypatch, make_client):
    monkeypatch.setattr(auth_mod, "CONFIGURED", True)
    client, _ = make_client([])
    r = client.get("/api/me")
    assert r.status_code == 401
    assert client.get("/api/health").status_code == 200
