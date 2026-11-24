## Table `legacy_steam_users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `steam_id` | `text` |  Unique |
| `display_name` | `text` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `legacy_games`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `app_id` | `int8` |  Unique |
| `name` | `text` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `legacy_user_library`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  Nullable |
| `game_id` | `uuid` |  Nullable |
| `library_status` | `text` |  |
| `playtime_minutes` | `int4` |  Nullable |
| `source` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `last_synced_at` | `timestamptz` |  Nullable |

## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `display_name` | `varchar` |  |
| `steam_id` | `text` |  Nullable Unique |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `games`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `platform` | `text` |  |
| `steam_app_id` | `int8` |  Nullable Unique |
| `catalog_owner_id` | `uuid` |  Nullable |
| `name` | `varchar` |  |
| `normalized_name` | `text` |  Nullable |
| `store_url` | `varchar` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `user_games`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `game_id` | `uuid` |  |
| `acquisition_status` | `text` |  |
| `play_status` | `text` |  |
| `priority` | `int2` |  |
| `mood_tags` | `_text` |  |
| `typical_session_minutes` | `int4` |  Nullable |
| `estimated_remaining_minutes` | `int4` |  Nullable |
| `progress_percent` | `numeric` |  |
| `steam_playtime_minutes` | `int4` |  |
| `legacy_manual_playtime_minutes` | `int4` |  |
| `steam_last_synced_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `play_sessions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `user_game_id` | `uuid` |  |
| `played_at` | `timestamptz` |  |
| `duration_minutes` | `int4` |  |
| `mood` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## RLS Policies

### `profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `profiles_select_self` | SELECT | authenticated | PERMISSIVE | `(id = ( SELECT auth.uid() AS uid))` | — |

### `games`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `games_select_catalog_or_owner` | SELECT | authenticated | PERMISSIVE | `((platform = 'steam'::text) OR (catalog_owner_id = ( SELECT auth.uid() AS uid)))` | — |

### `user_games`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `user_games_select_own` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

### `play_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `play_sessions_select_own` | SELECT | authenticated | PERMISSIVE | `(user_id = ( SELECT auth.uid() AS uid))` | — |

