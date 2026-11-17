from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import Role, get_current_role, require_role
from app.schemas.games import GameCreate, GameRead, GameUpdate, LibraryStatus
from app.services import game_service


router = APIRouter(prefix="/games", tags=["Games"])


@router.get("", response_model=list[GameRead])
def read_games(
    library_status: LibraryStatus | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=100),
    _role: Role = Depends(get_current_role),
):
    try:
        return game_service.list_games(
            status=library_status.value if library_status else None,
            search=search,
        )
    except Exception:
        raise HTTPException(500, "Unable to retrieve games from the database.")


@router.get("/{app_id}", response_model=GameRead)
def read_game(
    app_id: int,
    _role: Role = Depends(get_current_role),
):
    try:
        game = game_service.get_game(app_id)
        if not game:
            raise HTTPException(404, "Game not found.")
        return game
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Unable to retrieve the game.")


@router.post(
    "",
    response_model=GameRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(Role.NORMAL, Role.MASTER))],
)
def add_game(payload: GameCreate):
    try:
        return game_service.create_game(payload.model_dump())
    except ValueError as error:
        raise HTTPException(409, str(error))
    except Exception:
        raise HTTPException(500, "Unable to add the game.")


@router.patch(
    "/{app_id}",
    response_model=GameRead,
    dependencies=[Depends(require_role(Role.NORMAL, Role.MASTER))],
)
def edit_game(app_id: int, payload: GameUpdate):
    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(422, "Provide at least one field to update.")

    try:
        game = game_service.update_game(app_id, changes)
        if not game:
            raise HTTPException(404, "Game not found.")
        return game
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Unable to update the game.")


@router.delete(
    "/{app_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(Role.MASTER))],
)
def remove_game(app_id: int):
    try:
        deleted = game_service.delete_game(app_id)
        if not deleted:
            raise HTTPException(404, "Game not found.")
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Unable to delete the game.")