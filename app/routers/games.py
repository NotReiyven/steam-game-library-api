from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from app.auth import Role, get_current_user, require_role, UserAuth
from app.schemas.games import GameCreate, GameRead, GameUpdate, LibraryStatus
from app.services import game_service

router = APIRouter(prefix="/games", tags=["Games"])

@router.get("/stats")
def read_stats(user: UserAuth = Depends(get_current_user)):
    try:
        return game_service.get_stats(user.user_id)
    except Exception:
        raise HTTPException(500, "Unable to retrieve stats.")

@router.get("")
def read_games(
    library_status: LibraryStatus | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=100),
    sort_by: str = Query(default="created_at", pattern="^(created_at|playtime_minutes|name)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserAuth = Depends(get_current_user),
):
    try:
        return game_service.list_games(
            user_id=user.user_id,
            status=library_status.value if library_status else None,
            search=search,
            sort_by=sort_by,
            order=order,
            limit=limit,
            offset=offset
        )
    except Exception:
        raise HTTPException(500, "Unable to retrieve games from the database.")

@router.get("/{app_id}", response_model=GameRead)
def read_game(app_id: int, user: UserAuth = Depends(get_current_user)):
    try:
        game = game_service.get_game(app_id, user.user_id)
        if not game:
            raise HTTPException(404, "Game not found.")
        return game
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Unable to retrieve the game.")

@router.post("", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def add_game(payload: GameCreate, user: UserAuth = Depends(require_role(Role.NORMAL, Role.MASTER))):
    try:
        return game_service.create_game(payload.model_dump(), user.user_id)
    except ValueError as error:
        raise HTTPException(409, str(error))
    except Exception:
        raise HTTPException(500, "Unable to add the game.")

@router.patch("/{app_id}", response_model=GameRead)
def edit_game(app_id: int, payload: GameUpdate, user: UserAuth = Depends(require_role(Role.NORMAL, Role.MASTER))):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(422, "Provide at least one field to update.")
    try:
        game = game_service.update_game(app_id, changes, user.user_id)
        if not game:
            raise HTTPException(404, "Game not found.")
        return game
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Unable to update the game.")

@router.delete("/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_game(app_id: int, user: UserAuth = Depends(require_role(Role.MASTER))):
    try:
        deleted = game_service.delete_game(app_id, user.user_id)
        if not deleted:
            raise HTTPException(404, "Game not found.")
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Unable to delete the game.")