import httpx

from fastapi import APIRouter, Depends, HTTPException

from app.routers.games import require_api_token
from app.services.steam_service import (
    fetch_owned_games,
    sync_owned_games,
)


router = APIRouter(
    prefix="/steam",
    tags=["Steam Integration"],
    dependencies=[Depends(require_api_token)],
)


@router.get("/owned-games")
async def preview_owned_games():
    try:
        games = await fetch_owned_games()

        return {
            "total_games": len(games),
            "games": games,
        }

    except ValueError as error:
        raise HTTPException(503, str(error))
    except httpx.HTTPError:
        raise HTTPException(502, "Unable to retrieve games from Steam.")
    except Exception:
        raise HTTPException(500, "Unable to process Steam game data.")


@router.post("/sync-owned-games")
async def import_owned_games():
    try:
        games = await fetch_owned_games()
        imported = sync_owned_games(games)

        return {
            "message": "Steam library synchronization completed.",
            "steam_games_found": len(games),
            "records_upserted": imported,
        }

    except ValueError as error:
        raise HTTPException(503, str(error))
    except httpx.HTTPError:
        raise HTTPException(502, "Unable to retrieve games from Steam.")
    except Exception:
        raise HTTPException(500, "Unable to synchronize your Steam library.")