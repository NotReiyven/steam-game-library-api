from datetime import datetime, timezone
from app.db.client import get_supabase_client

def get_default_user_id() -> str:
    response = get_supabase_client().table("steam_users").select("id").limit(1).execute()
    if not response.data:
        raise Exception("No steam_user found in database.")
    return response.data[0]["id"]

def list_games(status: str | None = None, search: str | None = None) -> list[dict]:
    # We join user_library with games to get the title!
    query = (
        get_supabase_client()
        .table("user_library")
        .select("*, games(app_id, name)")
        .order("created_at", desc=True)
    )

    if status:
        query = query.eq("library_status", status)

    if search and search.strip():
        query = query.ilike("games.name", f"%{search.strip()}%")

    raw_data = query.execute().data
    
    # Flatten the nested JSON so the frontend still works
    results = []
    for row in raw_data:
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
    return results

def get_game(app_id: int) -> dict | None:
    # Join through the catalog
    response = (
        get_supabase_client()
        .table("user_library")
        .select("*, games!inner(app_id, name)")
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

def create_game(game: dict) -> dict:
    existing = get_game(game["app_id"])
    if existing:
        raise ValueError("A game with this Steam App ID already exists.")

    client = get_supabase_client()
    user_id = get_default_user_id()

    # 1. Add to the Game Catalog (Ignore if it already exists)
    client.table("games").upsert(
        {"app_id": game["app_id"], "name": game["name"]}, 
        on_conflict="app_id"
    ).execute()

    # 2. Get the internal Game ID
    game_record = client.table("games").select("id").eq("app_id", game["app_id"]).execute().data[0]

    # 3. Add to the User's Library (The Junction table)
    library_entry = {
        "user_id": user_id,
        "game_id": game_record["id"],
        "library_status": game["library_status"],
        "playtime_minutes": game.get("playtime_minutes", 0),
        "source": game.get("source", "manual"),
        "notes": game.get("notes")
    }
    
    response = client.table("user_library").insert(library_entry).execute()
    
    # Fetch it back to flatten it for the frontend
    return get_game(game["app_id"])

def update_game(app_id: int, changes: dict) -> dict | None:
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Find the library entry ID
    existing = get_game(app_id)
    if not existing:
        return None

    response = (
        get_supabase_client()
        .table("user_library")
        .update(changes)
        .eq("id", existing["id"])
        .execute()
    )

    return get_game(app_id) if response.data else None

def delete_game(app_id: int) -> bool:
    existing = get_game(app_id)
    if not existing:
        return False

    (
        get_supabase_client()
        .table("user_library")
        .delete()
        .eq("id", existing["id"])
        .execute()
    )

    return True