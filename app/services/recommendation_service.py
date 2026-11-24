from app.services import game_service

NOTE = (
    "Deterministic rule-based score (priority, mood, time fit, status). "
    "It is a planning aid, not an objective or AI-generated ranking."
)


def score_candidate(
    row: dict, mood: str | None, available_minutes: int | None
) -> tuple[int, list[str]]:
    priority = row["priority"]
    score = priority * 20
    reasons = [f"Priority {priority}/5 (+{priority * 20})"]

    if mood:
        tags = [t.lower() for t in (row.get("mood_tags") or [])]
        if mood in tags:
            score += 25
            reasons.append(f'Matches your "{mood}" mood (+25)')
        else:
            reasons.append(f'No "{mood}" mood tag (no change)')

    if available_minutes is not None:
        typical = row.get("typical_session_minutes")
        if typical is None:
            reasons.append("Typical session length unknown (no time adjustment)")
        elif typical <= available_minutes:
            score += 15
            reasons.append(f"Typical session {typical} min fits in {available_minutes} min (+15)")
        else:
            score -= 15
            reasons.append(f"Typical session {typical} min is longer than {available_minutes} min (-15)")

    status = row["play_status"]
    if status == "playing":
        score += 10
        reasons.append("Currently playing (+10)")
    elif status == "paused":
        score -= 10
        reasons.append("Paused (-10)")

    return score, reasons


def rank(
    candidates: list[dict], mood: str | None, available_minutes: int | None, limit: int
) -> list[dict]:
    scored = []
    for row in candidates:
        score, reasons = score_candidate(row, mood, available_minutes)
        scored.append(
            {
                "game": row,
                "score": score,
                "reasons": reasons,
                "typical_session_minutes": row["typical_session_minutes"],
                "priority": row["priority"],
                "progress_percent": row["progress_percent"],
            }
        )
    scored.sort(key=lambda s: (-s["score"], -s["priority"], s["game"]["name"].lower()))
    return scored[:limit]


def recommend_next(
    user_id: str, mood: str | None, available_minutes: int | None, limit: int
) -> dict:
    mood = mood.strip().lower() if mood else None
    mood = mood or None
    candidates = game_service.fetch_recommendation_candidates(user_id)
    return {
        "mood": mood,
        "available_minutes": available_minutes,
        "total_candidates": len(candidates),
        "note": NOTE,
        "data": rank(candidates, mood, available_minutes, limit),
    }