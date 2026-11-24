from app.db.client import get_supabase_client


def main() -> None:
    print("Connecting to Supabase...")
    try:
        response = get_supabase_client().table("profiles").select("id, display_name").limit(5).execute()
        print("Supabase connection successful!")
        print(f"Profiles retrieved: {len(response.data)}")
    except Exception as error:
        print("Supabase connection or query failed.")
        print(f"Error: {error}")
        raise


if __name__ == "__main__":
    main()