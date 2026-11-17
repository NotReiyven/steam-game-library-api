from fastapi import FastAPI

from app.routers.games import router as games_router
from app.routers.steam import router as steam_router


app = FastAPI(
    title="Steam Game Library API",
    description="Manage owned games and wishlist entries using Steam.",
    version="1.0.0",
)

app.include_router(games_router)
app.include_router(steam_router)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}