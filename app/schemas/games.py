from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LibraryStatus(str, Enum):
    OWNED = "owned"
    WISHLIST = "wishlist"


class GameCreate(BaseModel):
    app_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=200)
    library_status: LibraryStatus
    playtime_minutes: int = Field(default=0, ge=0)
    source: str = Field(default="manual", min_length=1, max_length=50)


class GameUpdate(BaseModel):
    library_status: LibraryStatus | None = None
    playtime_minutes: int | None = Field(default=None, ge=0)


class GameRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    app_id: int
    name: str
    library_status: LibraryStatus
    playtime_minutes: int
    source: str
    created_at: datetime
    updated_at: datetime