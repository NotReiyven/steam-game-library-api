from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration_minutes: int = Field(ge=1, le=1440)
    played_at: datetime | None = None
    mood: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("played_at")
    @classmethod
    def _tz(cls, v):
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("mood")
    @classmethod
    def _mood(cls, v):
        if v is None:
            return None
        v = v.strip().lower()
        return v or None


class SessionRead(BaseModel):
    id: UUID
    user_game_id: UUID
    played_at: datetime
    duration_minutes: int
    mood: str | None = None
    notes: str | None = None
    created_at: datetime


class SessionListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    data: list[SessionRead]