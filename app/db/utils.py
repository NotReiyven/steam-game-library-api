from typing import Any, Callable

from postgrest.exceptions import APIError

PAGE_SIZE = 1000


def is_pg_code(exc: Exception, code: str) -> bool:
    return isinstance(exc, APIError) and str(getattr(exc, "code", None)) == code


def fetch_page(build: Callable[[], Any], offset: int, limit: int) -> tuple[list[dict], int]:
    """Run a count='exact' query for one page. Offsets past the end return an empty page."""
    try:
        res = build().range(offset, offset + limit - 1).execute()
        total = res.count if res.count is not None else len(res.data)
        return res.data, total
    except APIError as exc:
        if is_pg_code(exc, "PGRST103"):  # range not satisfiable
            res = build().range(0, 0).execute()
            return [], res.count or 0
        raise


def fetch_all(build: Callable[[], Any]) -> list[dict]:
    """Fetch every row (stable order by id), paging past the API row limit."""
    rows: list[dict] = []
    start = 0
    while True:
        batch = build().order("id").range(start, start + PAGE_SIZE - 1).execute().data
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE