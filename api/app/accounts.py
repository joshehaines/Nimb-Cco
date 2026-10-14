"""Local accounts: email and password sign-in managed by an admin inside the platform.

For a pilot without single sign-on. Passwords are hashed with scrypt (standard library); sessions
are HS256 tokens signed with LOCAL_AUTH_SECRET and valid for twelve hours. An admin creates each
account and hands over a temporary password; the user must change it at first sign-in. Setting
LOCAL_AUTH_SECRET turns the mode on; ADMIN_EMAIL and ADMIN_PASSWORD create the first admin at
start-up if no account with that email exists. Switch to OIDC later without touching the data.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from typing import Any

import jwt

SECRET = os.environ.get("LOCAL_AUTH_SECRET", "")
ENABLED = bool(SECRET)
TOKEN_HOURS = int(os.environ.get("LOCAL_AUTH_HOURS", "12"))
ROLES = {"agent", "compliance", "admin"}


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        expected = bytes.fromhex(digest_hex)
        got = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(expected, got)
    except Exception:  # noqa: BLE001
        return False


def temp_password() -> str:
    # 12 characters from an unambiguous alphabet, grouped for reading aloud: e.g. kf7m-29xq-tr4h
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def issue_token(account: dict[str, Any]) -> str:
    now = int(time.time())
    return jwt.encode({"sub": account["user_id"], "email": account["email"], "name": account["name"], "roles": list(account["roles"]), "office": account.get("office"), "mr": bool(account.get("must_reset")), "ver": int(account.get("token_version") or 0), "iat": now, "exp": now + TOKEN_HOURS * 3600}, SECRET, algorithm="HS256")


def read_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, SECRET, algorithms=["HS256"])


def clean_roles(roles: list[str] | None) -> list[str]:
    out = {"agent"} | ({r for r in (roles or []) if r in ROLES})
    if "admin" in out:
        out.add("compliance")
    return sorted(out)


async def get_by_email(conn, email: str):
    return await conn.fetchrow("select * from accounts where lower(email) = lower($1)", email)


async def create_account(conn, *, email: str, name: str, roles: list[str] | None, office: str | None, created_by: str, password: str | None = None) -> tuple[dict[str, Any], str]:
    """Insert an account; returns (row-ish dict, temporary password shown once)."""
    pw = password or temp_password()
    user_id = f"local-{secrets.token_hex(6)}"
    rs = clean_roles(roles)
    await conn.execute("insert into users (user_id, email, office) values ($1, $2, $3) on conflict (user_id) do nothing", user_id, email.lower(), office)
    await conn.execute(
        "insert into accounts (user_id, email, name, password_hash, roles, office, must_reset, created_by) values ($1, $2, $3, $4, $5, $6, true, $7)",
        user_id, email.lower(), name, hash_password(pw), rs, office, created_by,
    )
    return {"user_id": user_id, "email": email.lower(), "name": name, "roles": rs, "office": office, "must_reset": True, "disabled": False}, pw


async def authenticate(conn, email: str, password: str):
    row = await get_by_email(conn, email)
    if not row or row["disabled"] or not verify_password(password, row["password_hash"]):
        return None
    await conn.execute("update accounts set last_login_at = now() where user_id = $1", row["user_id"])
    return row


async def bootstrap_admin(conn) -> bool:
    """Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when the accounts table is empty of that email."""
    email, pw = os.environ.get("ADMIN_EMAIL", "").strip(), os.environ.get("ADMIN_PASSWORD", "")
    if not (ENABLED and email and pw):
        return False
    if await get_by_email(conn, email):
        return False
    acct, _ = await create_account(conn, email=email, name=os.environ.get("ADMIN_NAME", "Administrator"), roles=["admin"], office=None, created_by="bootstrap", password=pw)
    await conn.execute("update accounts set must_reset = false where user_id = $1", acct["user_id"])
    return True
