import logging
from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.services import profile_service

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)
_http = httpx.Client(timeout=10.0)


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    email: str | None
    profile: dict


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def _verify_token(token: str) -> dict:
    """Stateless verification against Supabase Auth (signature, expiry, revocation)."""
    settings = get_settings()
    try:
        response = _http.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {token}",
            },
        )
    except httpx.HTTPError:
        logger.error("Supabase Auth request failed")
        raise HTTPException(503, "Authentication service unavailable.")

    if response.status_code in (401, 403):
        raise _unauthorized("Invalid or expired token.")
    if response.status_code != 200:
        logger.error("Supabase Auth returned status %s", response.status_code)
        raise HTTPException(503, "Authentication service unavailable.")

    try:
        data = response.json()
        UUID(str(data["id"]))
    except Exception:
        raise _unauthorized("Invalid token.")
    return data


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthContext:
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Missing bearer token.")

    auth_user = _verify_token(credentials.credentials)
    user_id = str(auth_user["id"])

    profile = profile_service.get_profile(user_id)
    if profile is None:
        logger.error("Auth user %s has no profile row (trigger/migration problem)", user_id)
        raise HTTPException(403, "Your account has no profile. Contact the administrator.")

    return AuthContext(user_id=user_id, email=auth_user.get("email"), profile=profile)