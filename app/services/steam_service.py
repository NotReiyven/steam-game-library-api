import httpx
from app.config import get_settings
from app.db.client import get_supabase_client
from datetime import datetime, timezone

STEAM_OWNED_GAMES_URL = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/"

async def fetch_owned_games() -> list[dict]:
    settings = get_settings()
    if not settings.steam_api_key or not settings.steam_id:
        raise ValueError("Steam API key or Steam ID is not configured.")
    params = {
        "key": settings.steam_api_key.get_secret_value(),
        "steamid": settings.steam_id,
        "include_appinfo": True,
        "include_played_free_games": True,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(STEAM_OWNED_GAMES_URL, params=params)
        response.raise_for_status()
    return response.json().get("response", {}).get("games", [])

def sync_owned_games(games: list[dict], user_id: str) -> int:
    if not games:
        return 0

    client = get_supabase_client()
    valid_games = [{"app_id": g["appid"], "name": g["name"]} for g in games if g.get("appid") and g.get("name")]
    
    if not valid_games:
        return 0

    client.table("games").upsert(valid_games, on_conflict="app_id").execute()

    app_ids = [g["app_id"] for g in valid_games]
    catalog_rows = client.table("games").select("id, app_id").in_("app_id", app_ids).execute().data
    game_id_map = {row["app_id"]: row["id"] for row in catalog_rows}

    library_records = []
    for g in games:
        if not g.get("appid") or not g.get("name"): continue
        game_uuid = game_id_map.get(g["appid"])
        if game_uuid:
            library_records.append({
                "user_id": user_id,
                "game_id": game_uuid,
                "library_status": "owned",
                "playtime_minutes": g.get("playtime_forever", 0),
                "source": "steam"
            })

    if library_records:
        client.table("user_library").upsert(library_records, on_conflict="user_id,game_id").execute()

    return len(library_records)