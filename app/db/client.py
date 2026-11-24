from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase_client() -> Client:
    """Service-role client for data access only.

    It is never used to authenticate callers, so no user session is ever
    attached to it. Every query must filter by the verified user UUID.
    """
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key.get_secret_value(),
    )