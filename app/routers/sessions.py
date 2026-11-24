from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.auth import AuthContext, get_current_user
from app.schemas.sessions import SessionCreate, SessionListResponse, SessionRead
from app.services import session_service
from app.services.errors import NotFoundError

router = APIRouter(tags=["Sessions"])


@router.get("/games/{user_game_id}/sessions", response_model=SessionListResponse)
def read_sessions(
    user_game_id: UUID,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    ctx: AuthContext = Depends(get_current_user),
):
    return session_service.list_sessions(str(user_game_id), ctx.user_id, limit, offset)


@router.post(
    "/games/{user_game_id}/sessions",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
)
def add_session(
    user_game_id: UUID,
    payload: SessionCreate,
    ctx: AuthContext = Depends(get_current_user),
):
    data = payload.model_dump(mode="json")
    return session_service.create_session(str(user_game_id), ctx.user_id, data)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_session(session_id: UUID, ctx: AuthContext = Depends(get_current_user)):
    if not session_service.delete_session(str(session_id), ctx.user_id):
        raise NotFoundError("Session not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)