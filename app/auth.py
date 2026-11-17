import secrets
from enum import Enum

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings


class Role(str, Enum):
    NORMAL = "normal"
    MASTER = "master"


bearer_scheme = HTTPBearer(auto_error=False)


def _match(token: str) -> Role | None:
    settings = get_settings()
    if secrets.compare_digest(token, settings.api_master_token.get_secret_value()):
        return Role.MASTER
    if secrets.compare_digest(token, settings.api_normal_token.get_secret_value()):
        return Role.NORMAL
    return None


def get_current_role(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Role:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    role = _match(credentials.credentials)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return role


def require_role(*allowed: Role):
    def checker(role: Role = Depends(get_current_role)) -> Role:
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return role

    return checker