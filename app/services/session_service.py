from app.db.client import get_supabase_client
from app.db.utils import fetch_page
from app.services import game_service
from app.services.errors import NotFoundError


def _require_game(user_game_id: str, user_id: str) -> None:
    if not game_service.user_owns_user_game(user_game_id, user_id):
        raise NotFoundError("Game not found.")


def list_sessions(user_game_id: str, user_id: str, limit: int, offset: int) -> dict:
    _require_game(user_game_id, user_id)
    client = get_supabase_client()

    def build():
        return (
            client.table("play_sessions")
            .select("*", count="exact")
            .eq("user_id", user_id)
            .eq("user_game_id", user_game_id)
            .order("played_at", desc=True)
            .order("id")
        )

    rows, total = fetch_page(build, offset, limit)
    return {"total": total, "limit": limit, "offset": offset, "data": rows}


def create_session(user_game_id: str, user_id: str, payload: dict) -> dict:
    _require_game(user_game_id, user_id)
    record = {k: v for k, v in payload.items() if v is not None}
    record["user_id"] = user_id
    record["user_game_id"] = user_game_id
    res = get_supabase_client().table("play_sessions").insert(record).execute()
    return res.data[0]


def delete_session(session_id: str, user_id: str) -> bool:
    res = (
        get_supabase_client()
        .table("play_sessions")
        .delete()
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(res.data)