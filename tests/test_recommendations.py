from app.services.recommendation_service import rank, score_candidate


def row(name, priority=3, status="backlog", tags=None, typical=None):
    return {
        "name": name,
        "priority": priority,
        "play_status": status,
        "mood_tags": tags or [],
        "typical_session_minutes": typical,
        "progress_percent": 0,
    }


def test_base_score_is_priority_times_20():
    score, _ = score_candidate({"priority": 4, "play_status": "backlog", "mood_tags": [], "typical_session_minutes": None}, None, None)
    assert score == 80


def test_mood_time_and_status_adjustments():
    r = row("A", 3, "playing", ["cozy"], 30)
    score, _ = score_candidate(r, "cozy", 45)
    assert score == 60 + 25 + 15 + 10

    r = row("B", 3, "paused", [], 90)
    score, _ = score_candidate(r, "cozy", 45)
    assert score == 60 - 15 - 10


def test_tie_break_priority_then_name():
    items = [row("Zeta", 3), row("Alpha", 3)]
    assert [i["game"]["name"] for i in rank(items, None, None, 5)] == ["Alpha", "Zeta"]