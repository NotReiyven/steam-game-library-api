from datetime import datetime

from postgrest.exceptions import APIError

from app.db.client import get_supabase_client
from app.db.utils import fetch_all, fetch_page, is_pg_code
from app.services.errors import ConflictError

SORT_COLUMNS = {
    "priority": "priority",
    "name": "games(name)",
    "updated_at": "updated_at",
    "steam_playtime_minutes": "steam_playtime_minutes",
}

SELECT_JOINED = "*, games!inner(*)"


def _flatten(row: dict) -> dict:
    g = row["games"]
    return {
        "id": row["id"],
        "game_id": row["game_id"],
        "platform": g["platform"],
        "steam_app_id": g["steam_app_id"],
        "name": g["name"],
        "store_url": g["store_url"],
        "acquisition_status": row["acquisition_status"],
        "play_status": row["play_status"],
        "priority": row["priority"],
        "mood_tags": row["mood_tags"] or [],
        "typical_session_minutes": row["typical_session_minutes"],
        "estimated_remaining_minutes": row["estimated_remaining_minutes"],
        "progress_percent": float(row["progress_percent"]),
        "steam_playtime_minutes": row["steam_playtime_minutes"],
        "legacy_manual_playtime_minutes": row["legacy_manual_playtime_minutes"],
        "steam_last_synced_at": row["steam_last_synced_at"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_games(
    user_id: str,
    *,
    search: str | None,
    platform: str | None,
    acquisition_status: str | None,
    play_status: str | None,
    mood: str | None,
    sort_by: str,
    order: str,
    limit: int,
    offset: int,
) -> dict:
    client = get_supabase_client()

    def build():
        q = (
            client.table("user_games")
            .select(SELECT_JOINED, count="exact")
            .eq("user_id", user_id)
        )
        if platform:
            q = q.eq("games.platform", platform)
        if acquisition_status:
            q = q.eq("acquisition_status", acquisition_status)
        if play_status:
            q = q.eq("play_status", play_status)
        if mood:
            q = q.contains("mood_tags", [mood])
        if search and search.strip():
            q = q.ilike("games.name", f"%{_escape_like(search.strip())}%")
        return q.order(SORT_COLUMNS[sort_by], desc=(order == "desc")).order("id")

    rows, total = fetch_page(build, offset, limit)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "data": [_flatten(r) for r in rows],
    }


def get_user_game(user_game_id: str, user_id: str) -> dict | None:
    res = (
        get_supabase_client()
        .table("user_games")
        .select(SELECT_JOINED)
        .eq("id", user_game_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return _flatten(res.data[0]) if res.data else None


def user_owns_user_game(user_game_id: str, user_id: str) -> bool:
    res = (
        get_supabase_client()
        .table("user_games")
        .select("id")
        .eq("id", user_game_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def fetch_recommendation_candidates(user_id: str) -> list[dict]:
    client = get_supabase_client()
    rows = fetch_all(
        lambda: client.table("user_games")
        .select(SELECT_JOINED)
        .eq("user_id", user_id)
        .eq("acquisition_status", "owned")
        .in_("play_status", ["backlog", "playing", "paused"])
    )
    return [_flatten(r) for r in rows]


def get_stats(user_id: str) -> dict:
    client = get_supabase_client()

    library = fetch_all(
        lambda: client.table("user_games")
        .select(
            "id, acquisition_status, play_status, steam_playtime_minutes, "
            "legacy_manual_playtime_minutes, steam_last_synced_at"
        )
        .eq("user_id", user_id)
    )
    sessions = fetch_all(
        lambda: client.table("play_sessions")
        .select("id, duration_minutes")
        .eq("user_id", user_id)
    )

    owned = [r for r in library if r["acquisition_status"] == "owned"]

    def count_status(status: str) -> int:
        return sum(1 for r in owned if r["play_status"] == status)

    synced = [
        datetime.fromisoformat(r["steam_last_synced_at"])
        for r in library
        if r["steam_last_synced_at"]
    ]

    return {
        "total_games": len(library),
        "owned_games": len(owned),
        "wishlist_games": len(library) - len(owned),
        "backlog_games": count_status("backlog"),
        "playing_games": count_status("playing"),
        "paused_games": count_status("paused"),
        "completed_games": count_status("completed"),
        "dropped_games": count_status("dropped"),
        "total_steam_playtime_minutes": sum(r["steam_playtime_minutes"] for r in library),
        "legacy_manual_playtime_minutes": sum(r["legacy_manual_playtime_minutes"] for r in library),
        "manual_session_minutes": sum(s["duration_minutes"] for s in sessions),
        "session_count": len(sessions),
        "last_steam_sync_at": max(synced).isoformat() if synced else None,
    }


def _find_or_create_catalog_game(payload: dict, user_id: str) -> str:
    client = get_supabase_client()
    games = client.table("games")

    if payload["platform"] == "steam":
        def lookup():
            res = games.select("id").eq("steam_app_id", payload["steam_app_id"]).limit(1).execute()
            return res.data[0]["id"] if res.data else None

        found = lookup()
        if found:
            return found
        try:
            res = games.insert(
                {
                    "platform": "steam",
                    "steam_app_id": payload["steam_app_id"],
                    "name": payload["name"],
                    "store_url": payload.get("store_url")
                    or f"https://store.steampowered.com/app/{payload['steam_app_id']}",
                }
            ).execute()
            return res.data[0]["id"]
        except APIError as exc:
            if is_pg_code(exc, "23505"):
                found = lookup()
                if found:
                    return found
            raise

    normalized = payload["name"].strip().lower()

    def lookup_other():
        res = (
            games.select("id")
            .eq("catalog_owner_id", user_id)
            .eq("normalized_name", normalized)
            .limit(1)
            .execute()
        )
        return res.data[0]["id"] if res.data else None

    found = lookup_other()
    if found:
        return found
    try:
        res = games.insert(
            {
                "platform": "other",
                "catalog_owner_id": user_id,
                "name": payload["name"],
                "store_url": payload.get("store_url"),
            }
        ).execute()
        return res.data[0]["id"]
    except APIError as exc:
        if is_pg_code(exc, "23505"):
            found = lookup_other()
            if found:
                return found
        raise


def create_game(payload: dict, user_id: str) -> dict:
    client = get_supabase_client()
    game_id = _find_or_create_catalog_game(payload, user_id)

    existing = (
        client.table("user_games")
        .select("id")
        .eq("user_id", user_id)
        .eq("game_id", game_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise ConflictError("This game is already in your library.")

    entry = {
        "user_id": user_id,
        "game_id": game_id,
        "acquisition_status": payload["acquisition_status"],
        "play_status": payload["play_status"],
        "priority": payload["priority"],
        "mood_tags": payload["mood_tags"],
        "typical_session_minutes": payload["typical_session_minutes"],
        "estimated_remaining_minutes": payload["estimated_remaining_minutes"],
        "progress_percent": payload["progress_percent"],
        "notes": payload["notes"],
    }
    try:
        res = client.table("user_games").insert(entry).execute()
    except APIError as exc:
        if is_pg_code(exc, "23505"):
            raise ConflictError("This game is already in your library.")
        raise
    return get_user_game(res.data[0]["id"], user_id)


def update_user_game(user_game_id: str, changes: dict, user_id: str) -> dict | None:
    res = (
        get_supabase_client()
        .table("user_games")
        .update(changes)
        .eq("id", user_game_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        return None
    return get_user_game(user_game_id, user_id)


def delete_user_game(user_game_id: str, user_id: str) -> bool:
    existing = get_user_game(user_game_id, user_id)
    if not existing:
        return False

    client = get_supabase_client()
    # Sessions cascade-delete through the composite foreign key.
    client.table("user_games").delete().eq("id", user_game_id).eq("user_id", user_id).execute()

    if existing["platform"] == "other":
        remaining = (
            client.table("user_games")
            .select("id")
            .eq("game_id", existing["game_id"])
            .limit(1)
            .execute()
        )
        if not remaining.data:
            (
                client.table("games")
                .delete()
                .eq("id", existing["game_id"])
                .eq("platform", "other")
                .eq("catalog_owner_id", user_id)
                .execute()
            )
    return True