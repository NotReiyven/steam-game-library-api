from datetime import datetime, timezone

from app.db.client import get_supabase_client


def list_games(
    status: str | None = None,
    search: str | None = None,
) -> list[dict]:
    query = (
        get_supabase_client()
        .table("library_games")
        .select("*")
        .order("created_at", desc=True)
    )

    if status:
        query = query.eq("library_status", status)

    if search and search.strip():
        query = query.ilike("name", f"%{search.strip()}%")

    return query.execute().data


def get_game(app_id: int) -> dict | None:
    response = (
        get_supabase_client()
        .table("library_games")
        .select("*")
        .eq("app_id", app_id)
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def create_game(game: dict) -> dict:
    existing = get_game(game["app_id"])

    if existing:
        raise ValueError("A game with this Steam App ID already exists.")

    response = (
        get_supabase_client()
        .table("library_games")
        .insert(game)
        .execute()
    )

    return response.data[0]


def update_game(app_id: int, changes: dict) -> dict | None:
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    response = (
        get_supabase_client()
        .table("library_games")
        .update(changes)
        .eq("app_id", app_id)
        .execute()
    )

    return response.data[0] if response.data else None


def delete_game(app_id: int) -> bool:
    existing = get_game(app_id)

    if not existing:
        return False

    (
        get_supabase_client()
        .table("library_games")
        .delete()
        .eq("app_id", app_id)
        .execute()
    )

    return True