from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthContext, get_current_user
from app.schemas.profiles import ProfileRead, ProfileUpdate
from app.services import profile_service

router = APIRouter(tags=["Profile"])


def _read(ctx_profile: dict, email: str | None) -> dict:
    return {
        "id": ctx_profile["id"],
        "email": email,
        "display_name": ctx_profile["display_name"],
        "steam_id": ctx_profile["steam_id"],
    }


@router.get("/me", response_model=ProfileRead)
def read_me(ctx: AuthContext = Depends(get_current_user)):
    return _read(ctx.profile, ctx.email)


@router.patch("/me", response_model=ProfileRead)
def update_me(payload: ProfileUpdate, ctx: AuthContext = Depends(get_current_user)):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(422, "Provide at least one field to update.")
    profile = profile_service.update_profile(ctx.user_id, changes)
    return _read(profile, ctx.email)