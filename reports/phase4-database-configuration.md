# Phase 4 — Database Configuration and Connection

## 1. Provider

- **Service:** Supabase (hosted PostgreSQL)
- **Project URL:** configured via `SUPABASE_URL` environment variable
- **Access:** server-side only, via the Supabase Python SDK using the project secret key. The secret is never exposed to clients.

## 2. Table

Table `library_games` created in Supabase:

```sql
create table if not exists library_games (
  id uuid primary key default gen_random_uuid(),
  app_id bigint not null unique,
  name text not null,
  library_status text not null check (library_status in ('owned','wishlist')),
  playtime_minutes integer not null default 0 check (playtime_minutes >= 0),
  source text not null default 'manual' check (source in ('steam','manual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_games_name_idx on library_games (name);
create index if not exists library_games_status_idx on library_games (library_status);