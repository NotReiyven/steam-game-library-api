from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers.games import router as games_router
from app.routers.steam import router as steam_router

app = FastAPI(
    title="Steam Game Library API",
    description="Manage owned games and wishlist entries using Steam.",
    version="1.0.0",
)

app.include_router(games_router, prefix="/api/v1")
app.include_router(steam_router, prefix="/api/v1")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}

@app.get("/", include_in_schema=False)
def frontend():
    return FileResponse(STATIC_DIR / "index.html")