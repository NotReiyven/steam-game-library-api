from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["Public"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/config")
def public_config():
    s = get_settings()
    return {
        "supabase_url": s.supabase_url,
        "supabase_publishable_key": s.supabase_publishable_key,
    }