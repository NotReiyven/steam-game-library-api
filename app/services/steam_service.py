import logging

import httpx

from app.config import get_settings
from app.db.client import get_supabase_client
from app.services.errors import ServiceUnavailableError, UpstreamError

logger = logging.getLogger(__name__)

STEAM_OWNED_GAMES_URL = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/"
MAX_STEAM_GAMES = 20_000
MAX_INT = 2_147_483_647

EMPTY_WARNING = (
    "Steam returned no games. Nothing was changed. Check that your Steam "
    "'Game details' privacy setting is Public, then try again."
)


def fetch_owned_games(steam_id: str) -> tuple[int, list[dict]]:
    """Return (raw_count, normalized_games). Never exposes the API key in errors."""
    settings = get_settings()
    api_key = settings.steam_api_key.get_secret_value() if settings.steam_api_key else ""
    if not api_key:
        raise ServiceUnavailableError("Steam integration is not configured on the server.")

    params = {
        "key": api_key,
        "steamid": steam_id,
        "include_appinfo": "true",
        "include_played_free_games": "true",
    }
    try:
        with httpx.Client(timeout=settings.steam_api_timeout_seconds) as client:
            response = client.get(STEAM_OWNED_GAMES_URL, params=params)
    except httpx.HTTPError as exc:
        logger.error("Steam request failed: %s", type(exc).__name__)
        raise UpstreamError("Unable to reach Steam.")

    if response.status_code != 200:
        logger.error("Steam returned HTTP %s", response.status_code)
        raise UpstreamError("Steam rejected the request or is unavailable.")

    try:
        payload = response.json()
        inner = payload["response"]
        if not isinstance(inner, dict):
            raise ValueError
        raw_games = inner.get("games", [])
        if not isinstance(raw_games, list):
            raise ValueError
    except Exception:
        logger.error("Steam returned an unexpected payload")
        raise UpstreamError("Steam returned an invalid response.")

    if len(raw_games) > MAX_STEAM_GAMES:
        raise UpstreamError("Steam returned an unreasonably large library.")

    normalized: dict[int, dict] = {}
    skipped = 0
    for item in raw_games:
        try:
            appid = int(item["appid"])
            name = str(item.get("name") or "").strip()[:200]
            playtime = int(item.get("playtime_forever") or 0)
        except (KeyError, TypeError, ValueError, AttributeError):
            skipped += 1
            continue
        if appid <= 0 or not name or playtime < 0 or playtime > MAX_INT:
            skipped += 1
            continue
        normalized[appid] = {"appid": appid, "name": name, "playtime_forever": playtime}

    if skipped:
        logger.warning("Skipped %s invalid Steam records", skipped)
    return len(raw_games), list(normalized.values())


def apply_sync(user_id: str, games: list[dict]) -> int:
    res = get_supabase_client().rpc(
        "apply_steam_library_sync",
        {"p_user_id": user_id, "p_games": games},
    ).execute()
    return int(res.data or 0)


def latest_sync_time(user_id: str) -> str | None:
    res = (
        get_supabase_client()
        .table("user_games")
        .select("steam_last_synced_at")
        .eq("user_id", user_id)
        .not_.is_("steam_last_synced_at", "null")
        .order("steam_last_synced_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0]["steam_last_synced_at"] if res.data else None