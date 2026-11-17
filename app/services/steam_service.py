from datetime import datetime, timezone

import httpx

from app.config import get_settings
from app.db.client import get_supabase_client


STEAM_OWNED_GAMES_URL = (
    "https://api.steampowered.com/"
    "IPlayerService/GetOwnedGames/v1/"
)


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
        response = await client.get(
            STEAM_OWNED_GAMES_URL,
            params=params,
        )
        response.raise_for_status()

    data = response.json()
    return data.get("response", {}).get("games", [])


def sync_owned_games(games: list[dict]) -> int:
    if not games:
        return 0

    synced_at = datetime.now(timezone.utc).isoformat()

    records = [
        {
            "app_id": game["appid"],
            "name": game["name"],
            "library_status": "owned",
            "playtime_minutes": game.get("playtime_forever", 0),
            "source": "steam",
            "updated_at": synced_at,
        }
        for game in games
        if game.get("appid") and game.get("name")
    ]

    if not records:
        return 0

    (
        get_supabase_client()
        .table("library_games")
        .upsert(records, on_conflict="app_id")
        .execute()
    )

    return len(records)