from datetime import datetime, timezone
from app.db.client import get_supabase_client

def list_games(user_id: str, status: str | None = None, search: str | None = None, sort_by: str = "created_at", order: str = "desc", limit: int = 50, offset: int = 0) -> dict:
    query = (
        get_supabase_client()
        .table("user_library")
        .select("*, games(app_id, name)", count="exact")
        .eq("user_id", user_id)  # <--- ISOLATION
    )

    if status:
        query = query.eq("library_status", status)

    if search and search.strip():
        query = query.ilike("games.name", f"%{search.strip()}%")

    if sort_by == "name":
        query = query.order("name", foreign_table="games", desc=(order == "desc"))
    else:
        query = query.order(sort_by, desc=(order == "desc"))

    query = query.range(offset, offset + limit - 1)
    raw_data = query.execute()
    
    results = []
    for row in raw_data.data:
        results.append({
            "id": row["id"],
            "app_id": row["games"]["app_id"],
            "name": row["games"]["name"],
            "library_status": row["library_status"],
            "playtime_minutes": row["playtime_minutes"],
            "source": row["source"],
            "notes": row["notes"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        })
        
    return {"total": raw_data.count, "data": results}

def get_stats(user_id: str) -> dict:
    client = get_supabase_client()
    response = client.table("user_library").select("library_status, playtime_minutes, games(name)").eq("user_id", user_id).execute()
    
    games = response.data
    total_games = len(games)
    owned = sum(1 for g in games if g["library_status"] == "owned")
    wishlist = sum(1 for g in games if g["library_status"] == "wishlist")
    total_playtime = sum(g["playtime_minutes"] for g in games)
    
    most_played = None
    if games:
        most_played = max(games, key=lambda g: g["playtime_minutes"])
        if most_played["playtime_minutes"] == 0:
            most_played = None

    return {
        "total_games": total_games,
        "owned_games": owned,
        "wishlist_games": wishlist,
        "total_playtime_minutes": total_playtime,
        "most_played": {
            "name": most_played["games"]["name"],
            "playtime": most_played["playtime_minutes"]
        } if most_played else None
    }

def get_game(app_id: int, user_id: str) -> dict | None:
    response = (
        get_supabase_client()
        .table("user_library")
        .select("*, games!inner(app_id, name)")
        .eq("user_id", user_id)  # <--- ISOLATION
        .eq("games.app_id", app_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    row = response.data[0]
    return {
        "id": row["id"],
        "app_id": row["games"]["app_id"],
        "name": row["games"]["name"],
        "library_status": row["library_status"],
        "playtime_minutes": row["playtime_minutes"],
        "source": row["source"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }

def create_game(game: dict, user_id: str) -> dict:
    existing = get_game(game["app_id"], user_id)
    if existing:
        raise ValueError("A game with this Steam App ID already exists.")

    client = get_supabase_client()

    # Upsert into catalog
    client.table("games").upsert(
        {"app_id": game["app_id"], "name": game["name"]}, 
        on_conflict="app_id"
    ).execute()

    game_record = client.table("games").select("id").eq("app_id", game["app_id"]).execute().data[0]

    library_entry = {
        "user_id": user_id,  # <--- ISOLATION
        "game_id": game_record["id"],
        "library_status": game["library_status"],
        "playtime_minutes": game.get("playtime_minutes", 0),
        "source": game.get("source", "manual"),
        "notes": game.get("notes")
    }
    
    client.table("user_library").insert(library_entry).execute()
    return get_game(game["app_id"], user_id)

def update_game(app_id: int, changes: dict, user_id: str) -> dict | None:
    existing = get_game(app_id, user_id)
    if not existing:
        return None

    response = (
        get_supabase_client()
        .table("user_library")
        .update(changes)
        .eq("id", existing["id"])
        .execute()
    )
    return get_game(app_id, user_id) if response.data else None

def delete_game(app_id: int, user_id: str) -> bool:
    existing = get_game(app_id, user_id)
    if not existing:
        return False
    get_supabase_client().table("user_library").delete().eq("id", existing["id"]).execute()
    return True