
from app.db.client import get_supabase_client


def main() -> None:
    supabase = get_supabase_client()

    app_id = 413150

    # Prevent duplicate insertion if this script is run again.
    existing = (
        supabase.table("library_games")
        .select("id, app_id, name, library_status, playtime_minutes")
        .eq("app_id", app_id)
        .execute()
    )

    if existing.data:
        print("Stardew Valley is already in your database.")
        print(existing.data[0])
        return

    game = {
        "app_id": app_id,
        "name": "Stardew Valley",
        "library_status": "owned",
        "source": "manual",
    }

    response = (
        supabase.table("library_games")
        .insert(game)
        .execute()
    )

    print("Game successfully inserted!")
    print(response.data)


if __name__ == "__main__":
    main()
