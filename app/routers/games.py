from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import AuthContext, get_current_user
from app.schemas.games import (
    AcquisitionStatus,
    GameCreate,
    GameListResponse,
    GameRead,
    GameStats,
    GameUpdate,
    Platform,
    PlayStatus,
)
from app.services import game_service
from app.services.errors import NotFoundError

router = APIRouter(prefix="/games", tags=["Games"])


@router.get("", response_model=GameListResponse)
def read_games(
    search: str | None = Query(default=None, min_length=1, max_length=100),
    platform: Platform | None = None,
    acquisition_status: AcquisitionStatus | None = None,
    play_status: PlayStatus | None = None,
    mood: str | None = Query(default=None, min_length=1, max_length=30),
    sort_by: Literal["priority", "name", "updated_at", "steam_playtime_minutes"] = "updated_at",
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    ctx: AuthContext = Depends(get_current_user),
):
    return game_service.list_games(
        ctx.user_id,
        search=search,
        platform=platform,
        acquisition_status=acquisition_status,
        play_status=play_status,
        mood=mood.strip().lower() if mood else None,
        sort_by=sort_by,
        order=order,
        limit=limit,
        offset=offset,
    )


@router.get("/stats", response_model=GameStats)
def read_stats(ctx: AuthContext = Depends(get_current_user)):
    return game_service.get_stats(ctx.user_id)


@router.get("/{user_game_id}", response_model=GameRead)
def read_game(user_game_id: UUID, ctx: AuthContext = Depends(get_current_user)):
    game = game_service.get_user_game(str(user_game_id), ctx.user_id)
    if not game:
        raise NotFoundError("Game not found.")
    return game


@router.post("", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def add_game(payload: GameCreate, ctx: AuthContext = Depends(get_current_user)):
    return game_service.create_game(payload.model_dump(), ctx.user_id)


@router.patch("/{user_game_id}", response_model=GameRead)
def edit_game(
    user_game_id: UUID,
    payload: GameUpdate,
    ctx: AuthContext = Depends(get_current_user),
):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(422, "Provide at least one field to update.")
    game = game_service.update_user_game(str(user_game_id), changes, ctx.user_id)
    if not game:
        raise NotFoundError("Game not found.")
    return game


@router.delete("/{user_game_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_game(user_game_id: UUID, ctx: AuthContext = Depends(get_current_user)):
    if not game_service.delete_user_game(str(user_game_id), ctx.user_id):
        raise NotFoundError("Game not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)