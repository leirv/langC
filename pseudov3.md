# LangC Pseudocode v3 — Full Specification Draft

## 1. Project Declaration (New Project — No Reference)

```langc
PROJECT "test-app" {

    SCOPE = full,                   // full | skeleton | prototype
    REFERENCE = none,               // new project, nothing exists yet

    // ─── Database Layer ───
    CREATE DB "users-db" {
        LNG = postgresql,
        DEPENDS = none,
        TABLE "users" {
            id: int -> "primary key, auto increment",
            name: string -> "required, max 100 chars",
            email: string -> "required, unique",
            created_at: datetime -> "auto-set on creation"
        }
    },

    // ─── API Layer ───
    CREATE API "users" {
        LNG = python,
        FRAMEWORK = fastapi,
        SCOPE = full,
        DEPENDS = [DB.users-db],

        METHOD GET    "/users"      -> "list all users with pagination",
        METHOD POST   "/users"      -> "create a user with name, email",
        METHOD GET    "/users/{id}" -> "get user by id",
        METHOD PUT    "/users/{id}" -> "update user name or email",
        METHOD DELETE "/users/{id}" -> "delete user by id"
    },

    // ─── UI Layer ───
    CREATE WEBUI "users-display" {
        LNG = React,
        FRAMEWORK = nextjs,
        SCOPE = full,
        DEPENDS = [API.users],

        DISPLAY API.users.GET("/users")      -> "Table with all users, paginated",
        DISPLAY API.users.POST("/users")     -> "Form to create a new user",
        DISPLAY API.users.GET("/users/{id}") -> "Search bar to find user by id",
        DISPLAY API.users.PUT("/users/{id}") -> "Edit form, pre-filled with user data",
        DISPLAY API.users.DELETE("/users/{id}") -> "Delete button with confirmation dialog"
    }
}
```

## 2. Dependency Graph (Transpiler Resolves This)

```
DB.users-db  ──>  API.users  ──>  WEBUI.users-display

Execution order:
  Step 1: DB.users-db        (no dependencies)
  Step 2: API.users          (waits for DB)
  Step 3: WEBUI.users-display (waits for API)

If independent nodes exist, transpiler runs them in parallel via sub-agents.
```

## 3. Update Operations (Existing Project — With Reference)

```langc
PROJECT "test-app" {

    SCOPE = update,
    REFERENCE = "./test-app",       // points to existing codebase

    // ─── Add a new endpoint to existing API ───
    UPDATE API.users {
        ADD METHOD DELETE "/users/{id}" -> "soft delete, set is_active=false",
        ADD METHOD GET "/users/search?q={query}" -> "search users by name or email"
    },

    // ─── Modify existing UI to support new endpoints ───
    UPDATE WEBUI.users-display {
        ADD DISPLAY API.users.DELETE("/users/{id}") -> "Delete button with undo option",
        ADD DISPLAY API.users.GET("/users/search") -> "Live search with debounce"
    }
}
```

## 4. Reference with Override (Existing Project, Transpiler Reads Context)

```langc
PROJECT "legacy-app" {

    SCOPE = full,
    REFERENCE = "./legacy-app",     // transpiler scans this path

    // Transpiler detects: python, flask, unittest, SQLAlchemy
    // Profile says: fastapi, pytest
    // REFERENCE wins — transpiler adapts to existing patterns

    CREATE API "products" {
        LNG = python,               // transpiler sees flask in REFERENCE, uses flask
        FRAMEWORK = auto,           // auto = infer from REFERENCE
        DEPENDS = [DB.products-db],

        METHOD GET  "/products"      -> "list all products",
        METHOD POST "/products"      -> "create product with name, price, category"
    }
}
```

## 5. Priority Cascade

```
REFERENCE (real code)  >  User explicit values  >  Language profile  >  Transpiler defaults
       highest                                                              lowest

Example:
  - REFERENCE project uses flask     → flask wins over profile default
  - User writes FRAMEWORK = fastapi  → user override wins over REFERENCE
  - Neither specified                 → profile default (e.g., fastapi for python)
  - No profile exists                → transpiler asks user (human-in-the-loop)
```

## 6. Transpiler Flow: plan / apply

```
$ langc plan test-app.langc

╔══════════════════════════════════════════════╗
║  LangC Plan — project "test-app"            ║
╠══════════════════════════════════════════════╣
║                                              ║
║  Step 1: CREATE DB "users-db"                ║
║    → PostgreSQL table "users" (4 columns)    ║
║    → Generate migration script               ║
║    → Dependencies: none                      ║
║                                              ║
║  Step 2: CREATE API "users"                  ║
║    → Python + FastAPI                        ║
║    → 5 endpoints (GET, POST, GET, PUT, DEL)  ║
║    → Dependencies: DB.users-db               ║
║                                              ║
║  Step 3: CREATE WEBUI "users-display"        ║
║    → React + Next.js                         ║
║    → 5 views mapped to API endpoints         ║
║    → Dependencies: API.users                 ║
║                                              ║
║  Profile: python (fastapi, pytest, ruff)     ║
║  Profile: react (nextjs, vitest, eslint)     ║
║  Scope: full                                 ║
║                                              ║
║  Proceed? [yes / no / edit]                  ║
╚══════════════════════════════════════════════╝

$ langc apply test-app.langc

→ Generating Claude instructions...
→ Dispatching Step 1 (DB.users-db) to Claude...
→ Step 1 complete. Dispatching Step 2 (API.users)...
→ Step 2 complete. Dispatching Step 3 (WEBUI.users-display)...
→ All steps complete.
→ State saved to .langc/state.json
```

## 7. State File (Generated After Apply)

```json
{
    "project": "test-app",
    "version": 1,
    "last_applied": "2026-02-14T10:30:00Z",
    "components": {
        "DB.users-db": {
            "status": "created",
            "type": "DB",
            "lng": "postgresql",
            "tables": ["users"],
            "path": "./test-app/db/"
        },
        "API.users": {
            "status": "created",
            "type": "API",
            "lng": "python",
            "framework": "fastapi",
            "methods": [
                "GET /users",
                "POST /users",
                "GET /users/{id}",
                "PUT /users/{id}",
                "DELETE /users/{id}"
            ],
            "path": "./test-app/api/"
        },
        "WEBUI.users-display": {
            "status": "created",
            "type": "WEBUI",
            "lng": "React",
            "framework": "nextjs",
            "views": 5,
            "path": "./test-app/web/"
        }
    },
    "dependency_graph": {
        "DB.users-db": [],
        "API.users": ["DB.users-db"],
        "WEBUI.users-display": ["API.users"]
    }
}
```

## Open Questions for v4

1. **Error handling in DSL** — What if `UPDATE API.users` references something that doesn't exist in state?
2. **Conditional logic** — Do we need `IF` / `WHEN` blocks? (e.g., "if LNG=python, add requirements.txt")
3. **Variables / Reuse** — Can you define shared values? (e.g., `$AUTH = "JWT middleware"` used across blocks)
4. **Multi-project references** — Can one LangC file reference another project's components?
5. **Rollback** — If Step 3 fails, should the transpiler offer to undo Steps 1 and 2?
