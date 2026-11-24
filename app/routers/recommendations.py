from fastapi import APIRouter, Depends, Query

from app.auth import AuthContext, get_current_user
from app.schemas.recommendations import RecommendationResponse
from app.services import recommendation_service

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get("/next", response_model=RecommendationResponse)
def next_up(
    mood: str | None = Query(default=None, max_length=30),
    available_minutes: int | None = Query(default=None, ge=1, le=1440),
    limit: int = Query(default=3, ge=1, le=10),
    ctx: AuthContext = Depends(get_current_user),
):
    return recommendation_service.recommend_next(ctx.user_id, mood, available_minutes, limit)