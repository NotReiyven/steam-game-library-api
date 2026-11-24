from postgrest.exceptions import APIError

from app.db.client import get_supabase_client
from app.db.utils import is_pg_code
from app.services.errors import ConflictError, NotFoundError


def get_profile(user_id: str) -> dict | None:
    res = (
        get_supabase_client()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def update_profile(user_id: str, changes: dict) -> dict:
    try:
        res = (
            get_supabase_client()
            .table("profiles")
            .update(changes)
            .eq("id", user_id)
            .execute()
        )
    except APIError as exc:
        if is_pg_code(exc, "23505"):
            raise ConflictError("That Steam ID is already linked to another account.")
        raise
    if not res.data:
        raise NotFoundError("Profile not found.")
    return res.data[0]