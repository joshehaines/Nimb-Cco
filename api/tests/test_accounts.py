"""Local accounts: hashing, tokens, login and admin endpoints (fake pool)."""
from __future__ import annotations

import importlib
from datetime import datetime, timezone

import pytest
from conftest import Row

from app import accounts


def test_hash_and_verify_and_temp_password():
    h = accounts.hash_password("correct horse battery")
    assert h.startswith("scrypt$") and accounts.verify_password("correct horse battery", h)
    assert not accounts.verify_password("wrong", h)
    assert not accounts.verify_password("x", "garbage")
    pw = accounts.temp_password()
    assert len(pw) == 14 and pw.count("-") == 2


def test_roles_cleaning():
    assert accounts.clean_roles(None) == ["agent"]
    assert accounts.clean_roles(["admin"]) == ["admin", "agent", "compliance"]
    assert accounts.clean_roles(["superuser", "compliance"]) == ["agent", "compliance"]


def test_token_roundtrip(monkeypatch):
    monkeypatch.setattr(accounts, "SECRET", "s3cret")
    tok = accounts.issue_token({"user_id": "local-1", "email": "a@b.c", "name": "A", "roles": ["agent"], "token_version": 2})
    claims = accounts.read_token(tok)
    assert claims["sub"] == "local-1" and claims["ver"] == 2 and claims["exp"] > claims["iat"]


def _local_mode(monkeypatch):
    monkeypatch.setenv("LOCAL_AUTH_SECRET", "s3cret")
    monkeypatch.setattr(accounts, "SECRET", "s3cret")
    monkeypatch.setattr(accounts, "ENABLED", True)
    import app.auth as auth

    monkeypatch.setattr(auth, "LOCAL", True)
    monkeypatch.setattr(auth, "DEMO_ALLOWED", False)
    return auth


def test_login_and_admin_flow(make_client, monkeypatch):
    _local_mode(monkeypatch)
    h = accounts.hash_password("start-1234-abcd")
    admin = Row(user_id="local-a", email="admin@x", name="Admin", password_hash=h, roles=["admin", "agent", "compliance"], office=None, must_reset=False, disabled=False, token_version=0, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc), last_login_at=None)
    client, conn = make_client([("from accounts where lower(email)", [admin]), ("select disabled, token_version, roles, name, office from accounts", [admin]), ("from accounts order by", [admin])])
    # wrong password
    r = client.post("/api/auth/login", json={"email": "admin@x", "password": "nope"})
    assert r.status_code == 401
    # right password
    r = client.post("/api/auth/login", json={"email": "admin@x", "password": "start-1234-abcd"})
    assert r.status_code == 200 and r.json()["user"]["roles"] == ["admin", "agent", "compliance"]
    token = r.json()["token"]
    # demo header no longer works in local mode
    assert client.get("/api/me", headers={"X-Demo-User": "demo-admin"}).status_code == 401
    # the token does
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).json()["id"] == "local-a"
    # admin creates a user and gets a temporary password once
    conn.script.insert(0, ("from accounts where lower(email) = lower($1)", []))
    conn.script = [("insert into accounts", None), ("insert into users", None), ("insert into audit_log", None), ("from accounts where lower(email)", []), ("select disabled, token_version, roles, name, office from accounts", [admin])]
    r = client.post("/api/admin/users", json={"email": "Priya@x", "name": "Priya Ahuja", "roles": ["compliance"], "office": "Birmingham"}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == "priya@x" and body["user"]["roles"] == ["agent", "compliance"] and len(body["temporaryPassword"]) == 14
    ins = next(c for c in conn.calls if c[0].startswith("insert into accounts"))
    assert ins[1][1] == "priya@x" and accounts.verify_password(body["temporaryPassword"], ins[1][3])


def test_non_admin_cannot_manage_users(make_client, monkeypatch):
    _local_mode(monkeypatch)
    agent = Row(user_id="local-u", email="u@x", name="U", password_hash="x", roles=["agent"], office=None, must_reset=False, disabled=False, token_version=0, created_at=None, last_login_at=None)
    client, _ = make_client([("select disabled, token_version, roles, name, office from accounts", [agent])])
    tok = accounts.issue_token(dict(agent))
    assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"}).status_code == 403


def test_disabled_account_token_rejected(make_client, monkeypatch):
    _local_mode(monkeypatch)
    gone = Row(user_id="local-g", email="g@x", name="G", password_hash="x", roles=["agent"], office=None, must_reset=False, disabled=True, token_version=0, created_at=None, last_login_at=None)
    client, _ = make_client([("select disabled, token_version, roles, name, office from accounts", [gone])])
    tok = accounts.issue_token(dict(gone))
    assert client.get("/api/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


@pytest.fixture(autouse=True)
def _reload_auth_after(monkeypatch):
    yield
    import app.auth as auth

    importlib.reload(auth)
