import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import Role, require_role, UserAuth
from app.services.steam_service import fetch_owned_games, sync_owned_games

router = APIRouter(prefix="/steam", tags=["Steam Integration"])

class MockGame(BaseModel):
    appid: int
    name: str
    playtime_forever: int = 0

class MockSyncRequest(BaseModel):
    games: list[MockGame]

@router.get("/owned-games")
async def preview_owned_games(user: UserAuth = Depends(require_role(Role.MASTER))):
    try:
        games = await fetch_owned_games()
        return {"total_games": len(games), "games": games}
    except ValueError as error:
        raise HTTPException(503, str(error))
    except httpx.HTTPError:
        raise HTTPException(502, "Unable to retrieve games from Steam.")
    except Exception:
        raise HTTPException(500, "Unable to process Steam game data.")

@router.post("/sync")
async def import_owned_games(user: UserAuth = Depends(require_role(Role.MASTER))):
    try:
        games = await fetch_owned_games()
        imported = sync_owned_games(games, user.user_id)
        return {"message": "Steam sync completed.", "records_upserted": imported}
    except ValueError as error:
        raise HTTPException(503, str(error))
    except Exception:
        raise HTTPException(500, "Unable to synchronize your Steam library.")

@router.post("/mock-sync")
async def mock_import_owned_games(payload: MockSyncRequest, user: UserAuth = Depends(require_role(Role.MASTER))):
    try:
        games_data = [game.model_dump() for game in payload.games]
        imported = sync_owned_games(games_data, user.user_id)
        return {"message": "Mock sync completed.", "records_upserted": imported}
    except Exception as e:
        raise HTTPException(500, f"Mock sync failed: {str(e)}")