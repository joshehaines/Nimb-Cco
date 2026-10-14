"""Bearer-token authentication for the API.

With OIDC_ISSUER and OIDC_AUDIENCE set, every request must carry an access token from that issuer
(Microsoft Entra ID, Okta, Keycloak...). Tokens are verified against the issuer's JWKS; roles come
from the `roles` or `groups` claims, with ADMIN_EMAILS as a fallback allowlist. Without OIDC
configuration the API accepts an X-Demo-User header so the demo personas work end to end.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field

import httpx
import jwt
from fastapi import Depends, HTTPException, Request

OIDC_ISSUER = os.environ.get("OIDC_ISSUER", "").rstrip("/")
OIDC_AUDIENCE = os.environ.get("OIDC_AUDIENCE", "")
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
CONFIGURED = bool(OIDC_ISSUER and OIDC_AUDIENCE)
LOCAL = bool(os.environ.get("LOCAL_AUTH_SECRET"))
# The demo header is accepted only when no real sign-in is configured.
DEMO_ALLOWED = not CONFIGURED and not LOCAL

DEMO_USERS = {
    "demo-agent": ("Demo agent", "agent@example.internal", ["agent"]),
    "demo-compliance": ("Demo compliance officer", "compliance@example.internal", ["agent", "compliance"]),
    "demo-admin": ("Demo administrator", "admin@example.internal", ["agent", "compliance", "admin"]),
}


@dataclass
class User:
    id: str
    name: str
    email: str | None
    roles: list[str] = field(default_factory=lambda: ["agent"])

    def has(self, role: str) -> bool:
        return role in self.roles


_jwks: dict | None = None
_jwks_at = 0.0


async def jwks() -> dict:
    global _jwks, _jwks_at
    if _jwks is None or time.time() - _jwks_at > 3600:
        async with httpx.AsyncClient(timeout=10) as c:
            conf = (await c.get(f"{OIDC_ISSUER}/.well-known/openid-configuration")).json()
            _jwks = (await c.get(conf["jwks_uri"])).json()
            _jwks_at = time.time()
    return _jwks


def roles_from_claims(claims: dict) -> list[str]:
    raw = {str(r).lower() for r in (claims.get("roles") or []) + (claims.get("groups") or [])}
    email = str(claims.get("email") or claims.get("preferred_username") or "").lower()
    roles = ["agent"]
    if raw & {"compliance", "cpi.compliance"}:
        roles.append("compliance")
    if raw & {"admin", "cpi.admin"} or email in ADMIN_EMAILS:
        roles += ["compliance", "admin"]
    return sorted(set(roles))


async def current_user(request: Request) -> User:
    auth = request.headers.get("authorization", "")
    if not CONFIGURED and not LOCAL:
        demo = request.headers.get("x-demo-user", "demo-agent")
        name, email, roles = DEMO_USERS.get(demo, DEMO_USERS["demo-agent"])
        return User(id=demo, name=name, email=email, roles=roles)
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    token = auth.split(" ", 1)[1]
    if LOCAL and (not CONFIGURED or _looks_local(token)):
        from . import accounts

        try:
            claims = accounts.read_token(token)
        except jwt.PyJWTError as e:
            raise HTTPException(401, f"invalid session: {e}")
        pool = getattr(request.app.state, "pool", None)
        if pool is not None:
            async with pool.acquire() as c:
                row = await c.fetchrow("select disabled, token_version, roles, name, office from accounts where user_id = $1", claims["sub"])
            if not row or row["disabled"] or int(row["token_version"]) != int(claims.get("ver", 0)):
                raise HTTPException(401, "session no longer valid")
            return User(id=claims["sub"], name=row["name"], email=claims.get("email"), roles=list(row["roles"]))
        return User(id=claims["sub"], name=claims.get("name", ""), email=claims.get("email"), roles=list(claims.get("roles", ["agent"])))
    try:
        header = jwt.get_unverified_header(token)
        key = next(k for k in (await jwks())["keys"] if k.get("kid") == header.get("kid"))
        claims = jwt.decode(token, jwt.PyJWK(key).key, algorithms=[header.get("alg", "RS256")], audience=OIDC_AUDIENCE, issuer=OIDC_ISSUER)
    except StopIteration:
        raise HTTPException(401, "unknown signing key")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"invalid token: {e}")
    email = claims.get("email") or claims.get("preferred_username")
    return User(id=str(claims.get("sub") or claims.get("oid") or email), name=str(claims.get("name") or email), email=email, roles=roles_from_claims(claims))


def _looks_local(token: str) -> bool:
    try:
        return jwt.get_unverified_header(token).get("alg") == "HS256"
    except jwt.PyJWTError:
        return False


def require_role(role: str):
    async def dep(user: User = Depends(current_user)) -> User:
        if not user.has(role):
            raise HTTPException(403, f"requires role {role}")
        return user

    return dep
