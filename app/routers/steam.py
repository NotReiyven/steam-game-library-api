from fastapi import APIRouter, Depends

from app.auth import AuthContext, get_current_user
from app.schemas.steam import SteamPreviewResponse, SteamSyncResponse
from app.services import steam_service
from app.services.errors import BadRequestError

router = APIRouter(prefix="/steam", tags=["Steam Integration"])


def _steam_id(ctx: AuthContext) -> str:
    steam_id = ctx.profile.get("steam_id")
    if not steam_id:
        raise BadRequestError("Set your SteamID64 in Settings before using Steam features.")
    return steam_id


@router.get("/owned-games", response_model=SteamPreviewResponse)
def preview_owned_games(ctx: AuthContext = Depends(get_current_user)):
    _, games = steam_service.fetch_owned_games(_steam_id(ctx))
    return {
        "total_games": len(games),
        "games": games,
        "warning": steam_service.EMPTY_WARNING if not games else None,
    }


@router.post("/sync", response_model=SteamSyncResponse)
def sync_library(ctx: AuthContext = Depends(get_current_user)):
    raw_count, games = steam_service.fetch_owned_games(_steam_id(ctx))

    if not games:
        return {
            "message": "Steam sync skipped",
            "steam_games_returned": raw_count,
            "records_processed": 0,
            "last_synced_at": steam_service.latest_sync_time(ctx.user_id),
            "warning": steam_service.EMPTY_WARNING,
        }

    processed = steam_service.apply_sync(ctx.user_id, games)
    return {
        "message": "Steam sync completed",
        "steam_games_returned": raw_count,
        "records_processed": processed,
        "last_synced_at": steam_service.latest_sync_time(ctx.user_id),
        "warning": None,
    }