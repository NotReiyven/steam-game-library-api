# Phase 3 — System Architecture and Integration Design

## 1. Introduction

The Steam Game Library API will use FastAPI as its REST API framework. The application will allow a user to manage owned and wishlist games, with Steam providing owned-game information and playtime where available.

The selected cloud database will serve as the persistent source of application data. Postman will be used as the API client during development and testing.

The database provider has not yet been finalized because the project requires the selection made at the end of Part I.

## 2. System Architecture

The system will consist of the following components:

| Component | Responsibility |
|---|---|
| Postman | Sends HTTP requests and receives API responses |
| FastAPI | Handles incoming requests and routes them to the appropriate operations |
| Authentication layer | Verifies the private API bearer token |
| Pydantic schemas | Validates incoming request data and structures API responses |
| Game service | Implements game-library rules, CRUD operations, and filtering |
| Steam service | Retrieves and processes information from Steam |
| Database repository | Provides a consistent interface for database operations |
| Database adapter | Implements the selected provider's connection and query methods |
| Cloud database | Permanently stores the user's game-library records |
| Steam Web API | Provides external owned-game and playtime information |

### System Architecture Diagram

```mermaid
flowchart TD
    A[Postman / API Client] --> B[FastAPI REST API]
    B --> C[Authentication and Validation]
    C --> D[Application Services]

    D --> E[Game Service]
    D --> F[Steam Service]

    E --> G[Repository / Database Adapter]
    G --> H[(Selected Cloud Database)]

    F --> I[Steam Web API]
    I --> F
    F --> G
```

The application will use a server-side integration approach. Postman will communicate with FastAPI, and FastAPI will communicate with the database and Steam.

The client will not access database credentials or connect directly to the database.

## 3. Request and Data Flow

### 3.1 Retrieve All Games

1. Postman sends a GET request to `/api/v1/games`.
2. FastAPI verifies the bearer token.
3. The request parameters are validated.
4. The game service processes the requested filters.
5. The repository retrieves matching records from the cloud database.
6. FastAPI returns the results in JSON format.

### 3.2 Retrieve an Individual Game

1. Postman sends a GET request to `/api/v1/games/{app_id}`.
2. FastAPI verifies authentication.
3. The repository searches for the specified App ID.
4. If the record exists, FastAPI returns it.
5. If it does not exist, the API returns an appropriate not-found response.

### 3.3 Create a Game

1. Postman sends a POST request to `/api/v1/games`.
2. FastAPI verifies authentication.
3. Pydantic validates the request body.
4. The game service checks whether the App ID already exists.
5. The repository inserts the new record.
6. FastAPI returns the created record.

Manually created records will use `source = manual`, with default playtime of zero unless a supported value is explicitly provided.

### 3.4 Update a Game

1. Postman sends a PATCH request to `/api/v1/games/{app_id}`.
2. FastAPI verifies authentication.
3. The submitted fields are validated.
4. The repository retrieves the existing record.
5. The service updates only the permitted submitted fields.
6. The repository saves the changes.
7. FastAPI returns the updated record.

### 3.5 Delete a Game

1. Postman sends a DELETE request to `/api/v1/games/{app_id}`.
2. FastAPI verifies authentication.
3. The repository checks whether the record exists.
4. The record is removed from the cloud database.
5. FastAPI returns a deletion confirmation.

Deleting an entry from the application does not uninstall the game or remove ownership from Steam.

### 3.6 Search and Filter

The GET `/api/v1/games` endpoint will support useful filters, including:

- Searching by game title.
- Filtering by `library_status`, such as `owned` or `wishlist`.
- Filtering by minimum playtime.

The filters will be applied through the game service and repository rather than retrieving all records unnecessarily.

## 4. Steam Integration and Synchronization

Steam integration will be handled by a separate service.

The planned synchronization endpoint is:

`POST /api/v1/steam/sync`

The synchronization process will:

1. Verify the API bearer token.
2. Read the Steam API key and SteamID from protected environment variables.
3. Request the user's owned games using Steam's documented `GetOwnedGames` method.
4. Validate and normalize the returned game information.
5. Match each game using its Steam App ID.
6. Insert games that do not already exist.
7. Update existing Steam-managed fields.
8. Change matching wishlist entries to owned.
9. Preserve personal notes.
10. Update the synchronization timestamp after successful processing.

Records will not automatically be deleted merely because they are absent from one synchronization response.

Wishlist entries will initially be managed manually because the reviewed Steam `IPlayerService` documentation does not establish a personal wishlist retrieval method.

## 5. Database Integration Approach

The application will use a repository or adapter pattern to separate application logic from database-specific implementation.

The game service will interact with repository operations instead of directly depending on a particular provider's SDK.

The final connection method will depend on the database selected in Part I.

Potential approaches include:

| Provider | Proposed Connection Method |
|---|---|
| Neon | PostgreSQL driver and/or SQLAlchemy or SQLModel |
| Supabase | PostgreSQL driver and/or supported Supabase Python client |
| Firebase Firestore | Firestore Python SDK |

Only one provider-specific implementation will be selected.

The application will obtain database access through server-side configuration and a controlled connection or client lifecycle. No database connection will be exposed to Postman.

## 6. Planned Dependencies

| Dependency | Purpose |
|---|---|
| FastAPI | REST API framework |
| Uvicorn | Local ASGI development server |
| HTTPX | HTTP communication with Steam |
| Pydantic | Request and response validation |
| Pydantic Settings | Environment-based application configuration |
| Provider-specific driver or SDK | Cloud database communication |
| Pytest | Automated testing |

The final dependency versions and database-specific packages will be selected during implementation.

## 7. Environment Variables

The application will use environment variables to protect configuration values.

| Variable | Purpose |
|---|---|
| `STEAM_API_KEY` | Private Steam Web API key |
| `STEAM_ID` | SteamID64 for the personal Steam account |
| `API_BEARER_TOKEN` | Private token used to access protected API endpoints |
| `DATABASE_URL` | PostgreSQL connection URL, if a PostgreSQL provider is selected |

For local development, real values will be placed in `.env`, which is excluded from Git.

For deployment, values will be configured through the hosting platform's environment-variable settings.

If Firestore is selected, its recommended service-credential configuration will replace the PostgreSQL connection URL.

## 8. Security and Access Design

### 8.1 API Authentication

The initial project will use a single-owner bearer-token mechanism.

Protected requests will include:

`Authorization: Bearer YOUR_PRIVATE_API_TOKEN`

The token will be stored in `API_BEARER_TOKEN`.

FastAPI's HTTP Bearer security utility will extract the supplied token. Application code must verify the token against the configured secret.

The system will protect library retrieval, creation, updates, deletion, and Steam synchronization endpoints.

A minimal health-check endpoint may remain publicly accessible without exposing credentials, database details, or personal library data.

### 8.2 Database Credentials

Database credentials will remain on the server side.

The database will use the selected provider's appropriate access restrictions. Database passwords, private keys, and unrestricted administrative credentials will not be included in source code or public API responses.

### 8.3 Steam Credentials

The Steam API key will remain in a protected environment variable. It will not be returned to the client or committed to GitHub.

Logs must not expose request URLs or parameters containing the key.

### 8.4 Error Handling

The application will return meaningful HTTP status codes while avoiding disclosure of internal configuration.

Examples include:

| Status Code | Purpose |
|---|---|
| 200 | Successful retrieval or update |
| 201 | Successful creation |
| 204 | Successful deletion |
| 401 | Missing or invalid authentication |
| 404 | Requested game not found |
| 409 | Duplicate game record |
| 422 | Invalid request data |
| 502 | External Steam service failure |
| 503 | Database unavailable |

## 9. Deployment Considerations

The planned hosting platform is Vercel using its Python runtime.

The project will use Python 3.13, matching the local development environment.

The deployed application will communicate with the selected cloud database through server-side environment variables and the provider's recommended connection method.

The API will not rely on in-memory records for persistence.

Steam synchronization will initially be manually triggered through a protected request. More complicated background or scheduled synchronization can be considered later if required.

## 10. Conclusion

The proposed architecture separates client requests, application logic, Steam integration, and database access.

FastAPI will serve as the central component responsible for authentication, validation, application logic, and communication with external services.

The cloud database will provide persistent storage for both owned and wishlist games. Steam will serve as an external data source for owned-game information and playtime.

A repository/adapter approach will allow the database provider to be selected after Part I without requiring a complete redesign of the application's business logic.

The final database driver, SDK, credentials, and provider-specific access controls will be documented after the database selection is confirmed.

## 11. References

FastAPI. (n.d.). *Security tools*. Retrieved November 17, 2026, from https://fastapi.tiangolo.com/reference/security/

FastAPI. (n.d.). *SQL (relational) databases*. Retrieved November 17, 2026, from https://fastapi.tiangolo.com/tutorial/sql-databases/

Valve. (n.d.). *IPlayerService interface*. Steamworks Documentation. Retrieved November 17, 2026, from https://partner.steamgames.com/doc/webapi/iplayerservice?language=english

Vercel. (2026, November 14). *FastAPI on Vercel*. https://vercel.com/docs/frameworks/backend/fastapi

Vercel. (n.d.). *Using the Python runtime with Vercel Functions*. Retrieved November 17, 2026, from https://vercel.com/docs/functions/runtimes/python