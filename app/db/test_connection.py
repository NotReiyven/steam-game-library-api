from app.db.client import get_supabase_client


def main() -> None:
    print("Connecting to Supabase...")

    try:
        supabase = get_supabase_client()

        response = (
            supabase
            .table("library_games")
            .select("*")
            .limit(5)
            .execute()
        )

        print("Supabase connection successful!")
        print(f"Records retrieved: {len(response.data)}")
        print(f"Returned data: {response.data}")

    except Exception as error:
        print("Supabase connection or query failed.")
        print(f"Error: {error}")
        raise


if __name__ == "__main__":
    main()
