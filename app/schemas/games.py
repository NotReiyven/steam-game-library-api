from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Platform = Literal["steam", "other"]
AcquisitionStatus = Literal["owned", "wishlist"]
PlayStatus = Literal["backlog", "playing", "paused", "completed", "dropped"]

MAX_BIGINT = 9_223_372_036_854_775_807
MAX_INT = 2_147_483_647


def normalize_tags(tags: list[str]) -> list[str]:
    seen: list[str] = []
    for raw in tags:
        tag = raw.strip().lower()
        if not tag:
            continue
        if len(tag) > 30:
            raise ValueError("Each mood tag must be 30 characters or fewer")
        if tag not in seen:
            seen.append(tag)
    if len(seen) > 10:
        raise ValueError("At most 10 mood tags are allowed")
    return seen


def _check_url(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not v.lower().startswith(("http://", "https://")):
        raise ValueError("store_url must start with http:// or https://")
    return v


class GameCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    platform: Platform
    name: str = Field(min_length=1, max_length=200)
    steam_app_id: int | None = Field(default=None, gt=0, le=MAX_BIGINT)
    store_url: str | None = Field(default=None, max_length=2048)
    acquisition_status: AcquisitionStatus = "owned"
    play_status: PlayStatus = "backlog"
    priority: int = Field(default=3, ge=1, le=5)
    mood_tags: list[str] = Field(default_factory=list)
    typical_session_minutes: int | None = Field(default=None, ge=5, le=1440)
    estimated_remaining_minutes: int | None = Field(default=None, ge=0, le=MAX_INT)
    progress_percent: float = Field(default=0, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("mood_tags")
    @classmethod
    def _tags(cls, v):
        return normalize_tags(v)

    @field_validator("store_url")
    @classmethod
    def _url(cls, v):
        return _check_url(v)

    @model_validator(mode="after")
    def _platform_identity(self):
        if self.platform == "steam" and self.steam_app_id is None:
            raise ValueError("steam_app_id is required for Steam games")
        if self.platform == "other" and self.steam_app_id is not None:
            raise ValueError("steam_app_id must be null for non-Steam games")
        return self


class GameUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    acquisition_status: AcquisitionStatus | None = None
    play_status: PlayStatus | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    mood_tags: list[str] | None = None
    typical_session_minutes: int | None = Field(default=None, ge=5, le=1440)
    estimated_remaining_minutes: int | None = Field(default=None, ge=0, le=MAX_INT)
    progress_percent: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("mood_tags")
    @classmethod
    def _tags(cls, v):
        return None if v is None else normalize_tags(v)

    @model_validator(mode="after")
    def _non_nullable(self):
        for name in ("acquisition_status", "play_status", "priority", "mood_tags", "progress_percent"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class GameRead(BaseModel):
    id: UUID
    game_id: UUID
    platform: Platform
    steam_app_id: int | None = None
    name: str
    store_url: str | None = None
    acquisition_status: AcquisitionStatus
    play_status: PlayStatus
    priority: int
    mood_tags: list[str]
    typical_session_minutes: int | None = None
    estimated_remaining_minutes: int | None = None
    progress_percent: float
    steam_playtime_minutes: int
    legacy_manual_playtime_minutes: int
    steam_last_synced_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class GameListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    data: list[GameRead]


class GameStats(BaseModel):
    total_games: int
    owned_games: int
    wishlist_games: int
    backlog_games: int
    playing_games: int
    paused_games: int
    completed_games: int
    dropped_games: int
    total_steam_playtime_minutes: int
    legacy_manual_playtime_minutes: int
    manual_session_minutes: int
    session_count: int
    last_steam_sync_at: datetime | None = None