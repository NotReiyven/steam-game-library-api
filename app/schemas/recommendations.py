from pydantic import BaseModel

from app.schemas.games import GameRead


class RecommendationItem(BaseModel):
    game: GameRead
    score: int
    reasons: list[str]
    typical_session_minutes: int | None = None
    priority: int
    progress_percent: float


class RecommendationResponse(BaseModel):
    mood: str | None = None
    available_minutes: int | None = None
    total_candidates: int
    note: str
    data: list[RecommendationItem]