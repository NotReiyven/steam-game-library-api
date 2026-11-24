from datetime import datetime

from pydantic import BaseModel


class SteamGame(BaseModel):
    appid: int
    name: str
    playtime_forever: int


class SteamPreviewResponse(BaseModel):
    total_games: int
    games: list[SteamGame]
    warning: str | None = None


class SteamSyncResponse(BaseModel):
    message: str
    steam_games_returned: int
    records_processed: int
    last_synced_at: datetime | None = None
    warning: str | None = None