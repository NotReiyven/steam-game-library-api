import secrets
from enum import Enum
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import get_settings
from app.db.client import get_supabase_client

class Role(str, Enum):
    NORMAL = "normal"
    MASTER = "master"

class UserAuth:
    def __init__(self, role: Role, user_id: str):
        self.role = role
        self.user_id = user_id

bearer_scheme = HTTPBearer(auto_error=False)

def _match(token: str) -> UserAuth | None:
    settings = get_settings()
    client = get_supabase_client()
    
    # Get the users we just created
    users = client.table("steam_users").select("id").order("created_at").execute().data
    if len(users) < 2:
        return None

    # Map Normal token to User 1, Master token to User 2
    if secrets.compare_digest(token, settings.api_master_token.get_secret_value()):
        return UserAuth(Role.MASTER, users[1]["id"])
    if secrets.compare_digest(token, settings.api_normal_token.get_secret_value()):
        return UserAuth(Role.NORMAL, users[0]["id"])
    return None

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserAuth:
    if credentials is None:
        raise HTTPException(401, "Missing bearer token.", headers={"WWW-Authenticate": "Bearer"})
    match = _match(credentials.credentials)
    if match is None:
        raise HTTPException(401, "Invalid bearer token.", headers={"WWW-Authenticate": "Bearer"})
    return match

def require_role(*allowed: Role):
    def checker(user: UserAuth = Depends(get_current_user)) -> UserAuth:
        if user.role not in allowed:
            raise HTTPException(403, "Insufficient permissions.")
        return user
    return checker