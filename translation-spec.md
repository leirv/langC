# LangC Translation Specification — DSL to .claude Compilation Target

## Overview

This document defines how every LangC construct translates into concrete artifacts
in the `.claude` ecosystem. The transpiler's job is to take a `.langc` file and
produce a fully configured `.claude/` directory that Claude can execute autonomously.

## 1. Translation Map (Summary)

| LangC Construct | Claude Artifact | Location |
|----------------|-----------------|----------|
| `PROJECT` | CLAUDE.md | `./CLAUDE.md` |
| `PROFILES` | Subagents | `.claude/agents/<profile>.md` |
| `PROFILES.RULES` | CLAUDE.md rules + agent instructions | `CLAUDE.md` + `.claude/agents/` |
| `PROFILES.PATTERNS` | Rules (path-specific) | `.claude/rules/<component>.md` |
| `PROFILES.ON_REVIEW` | Hooks (PreToolUse / Stop) | `.claude/settings.json` hooks |
| `CREATE` blocks | Skills (one per component) | `.claude/skills/<component>/SKILL.md` |
| `UPDATE` blocks | Skills (update variant) | `.claude/skills/<component>-update/SKILL.md` |
| `DEPENDS` graph | Orchestration skill | `.claude/skills/orchestrate/SKILL.md` |
| `REFERENCE` | Context in CLAUDE.md | `CLAUDE.md` |
| `SCOPE` / `FRAMEWORK` | Constraints in skills + rules | `.claude/rules/` + skill instructions |
| `LNG` profiles | Rules (language conventions) | `.claude/rules/<language>.md` |
| `langc plan` | Plan mode skill | `.claude/skills/plan/SKILL.md` |
| `langc apply` | Orchestrate skill execution | `.claude/skills/orchestrate/SKILL.md` |
| State file | Agent memory | `.claude/agent-memory/langc/MEMORY.md` + `.langc/state.json` |

## 2. PROJECT → CLAUDE.md

The PROJECT block compiles into the root `CLAUDE.md` file — the primary context
that Claude loads at session start.

### LangC Input:

```langc
PROJECT "test-app" {
    SCOPE = full,
    REFERENCE = "./test-app",
    PROFILES = [Architect, Security, QA],

    CREATE API "users" { ... },
    CREATE WEBUI "users-display" { ... }
}
```

### Compiled Output: `CLAUDE.md`

```markdown
# Project: test-app

## Scope
Full build — generate complete implementation with all files, tests, and configuration.

## Reference Codebase
This project extends an existing codebase at `./test-app`.
When generating code, match the existing patterns, naming conventions, and project structure.

## Architecture Overview
- **API.users** — Python/FastAPI REST API (5 endpoints)
- **WEBUI.users-display** — React/Next.js frontend (5 views)

## Dependency Order
1. DB.users-db (no dependencies)
2. API.users (depends on: DB.users-db)
3. WEBUI.users-display (depends on: API.users)

## Active Profiles
The following expert personas govern all code generation:
- **Architect** — see `.claude/agents/architect.md`
- **Security** — see `.claude/agents/security.md`
- **QA** — see `.claude/agents/qa.md`

## Global Rules
> These rules apply to ALL components. Violations must be flagged.

### Architect Rules
- Separate domain logic from infrastructure
- Controllers must be thin — delegate to services
- Use dependency injection, no hard-coded dependencies
- One responsibility per module

### Security Rules
- All endpoints require authentication unless marked PUBLIC
- Validate and sanitize all user input at the boundary
- Never expose internal errors or stack traces to clients
- Use parameterized queries — never string concatenation for SQL

### QA Rules
- Every endpoint must have unit tests and integration tests
- Use fixtures and factories for test data
- Test both success and failure paths
- Minimum 80% code coverage target

## Build Instructions
To build this project, execute the skills in dependency order:
1. `/build-db-users-db`
2. `/build-api-users`
3. `/build-webui-users-display`

Or use `/orchestrate` to run the full build automatically.
```

## 3. PROFILES → Subagents (.claude/agents/)

Each profile compiles into a **subagent** — a specialized AI agent with its own
instructions, tools, and review capabilities. Profiles become the experts that
Claude delegates to.

### LangC Input:

```langc
PROFILE Architect {
    ROLE = "Senior Software Architect",
    RULES { ... },
    PATTERNS { API -> "router/ services/ repositories/ models/ schemas/" },
    ON_REVIEW { "Flag any file that mixes business logic with HTTP handling" }
}
```

### Compiled Output: `.claude/agents/architect.md`

```markdown
---
name: architect
description: Senior Software Architect — reviews and enforces clean architecture.
  Delegate to this agent when making structural decisions, reviewing layer
  separation, or validating component organization.
tools: Read, Glob, Grep
disallowedTools: Write, Edit, Bash
model: sonnet
maxTurns: 15
memory: project
---

# Role

You are a Senior Software Architect. Your job is to review code and plans
for architectural quality.

# Rules You Enforce

- Separate domain logic from infrastructure
- Controllers must be thin — delegate to services
- Never import infrastructure in the domain layer
- Use dependency injection, no hard-coded dependencies
- One responsibility per module
- Prefer composition over inheritance
- Define interfaces/contracts between layers

# Structural Patterns You Expect

When reviewing an API component, expect this structure:
- `router/` — HTTP route handlers (thin, no business logic)
- `services/` — Business logic layer
- `repositories/` — Data access layer
- `models/` — Domain models
- `schemas/` — Request/response validation schemas

# Review Checklist

When asked to review, check for:
- [ ] Any file that mixes business logic with HTTP handling
- [ ] Circular dependencies between modules
- [ ] Files exceeding 300 lines (suggest splitting)
- [ ] Hard-coded dependencies (suggest injection)

# Output Format

Return your review as:
- ✓ for passing checks
- ⚠ for warnings (suggest improvement)
- ✗ for violations (must fix before proceeding)
```

### Why Subagents (Not Just CLAUDE.md Rules)?

| Approach | Pros | Cons |
|----------|------|------|
| Rules in CLAUDE.md only | Simple, always loaded | Bloats context, passive |
| Subagents | Active reviewers, delegatable, isolated context | More files to manage |
| **Both** (our approach) | Rules in CLAUDE.md for generation, agents for review | Best of both worlds |

The transpiler generates **both**: rules in CLAUDE.md for passive guidance during
generation, and subagents for active review during the plan phase.

## 4. CREATE Blocks → Skills (.claude/skills/)

Each CREATE block compiles into a **skill** — an executable command that Claude
can invoke to build that specific component.

### LangC Input:

```langc
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
}
```

### Compiled Output: `.claude/skills/build-api-users/SKILL.md`

```markdown
---
name: build-api-users
description: Builds the users REST API. Python + FastAPI with 5 endpoints.
  Invoke this skill to generate the complete API component.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: [--dry-run]
---

# Task: Build API Component "users"

## Specification
- **Language**: Python
- **Framework**: FastAPI
- **Scope**: full (complete implementation with all files)
- **Depends on**: DB.users-db (must be built first)

## Endpoints to Implement

| Method | Path | Description |
|--------|------|-------------|
| GET | /users | List all users with pagination |
| POST | /users | Create a user with name, email |
| GET | /users/{id} | Get user by id |
| PUT | /users/{id} | Update user name or email |
| DELETE | /users/{id} | Delete user by id |

## Architectural Constraints (from Architect profile)

Structure the API as:
```
api/
├── router/
│   └── users.py          # Route definitions only — no business logic
├── services/
│   └── user_service.py   # Business logic
├── repositories/
│   └── user_repository.py # Database access
├── models/
│   └── user.py           # Domain model
├── schemas/
│   ├── user_request.py   # Input validation
│   └── user_response.py  # Response serialization
├── main.py               # FastAPI app entry point
└── requirements.txt      # Dependencies
```

## Security Constraints (from Security profile)

- All endpoints require JWT authentication (add auth middleware)
- POST and PUT: validate and sanitize `name` and `email` inputs
- Use parameterized queries for all database access
- Error responses must use structured JSON: `{"code": int, "message": str, "timestamp": str}`
- Never expose stack traces

## Testing Constraints (from QA profile)

- Create `tests/unit/` for unit tests of services and repositories
- Create `tests/integration/` for endpoint integration tests
- Use pytest fixtures in `tests/conftest.py` for test data
- Cover success and failure paths for every endpoint
- Target 80% code coverage

## Reference Context

!`find ./test-app -type f -name "*.py" | head -20`

> If a reference codebase exists, match its patterns. If not, follow the
> structure above.

## Completion Criteria

After building, verify:
- [ ] All 5 endpoints are implemented and return correct responses
- [ ] Auth middleware is attached to all endpoints
- [ ] Input validation exists on POST and PUT
- [ ] Unit tests pass: `pytest tests/unit/`
- [ ] Integration tests pass: `pytest tests/integration/`
- [ ] No linting errors: `ruff check .`
```

## 5. UPDATE Blocks → Update Skills

UPDATE blocks compile into separate skills that modify existing components.

### LangC Input:

```langc
UPDATE API.users {
    ADD METHOD DELETE "/users/{id}" -> "soft delete, set is_active=false",
    ADD METHOD GET "/users/search?q={query}" -> "search users by name or email"
}
```

### Compiled Output: `.claude/skills/update-api-users/SKILL.md`

```markdown
---
name: update-api-users
description: Updates the existing users API with new endpoints.
  Only modifies — does not rebuild existing functionality.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Task: Update API Component "users"

## Operation: ADD (do not modify existing endpoints)

## Reference
Read the existing implementation first:
!`find ./test-app/api -type f -name "*.py"`

## Changes to Apply

### New Endpoint 1: Soft Delete
- **Method**: DELETE
- **Path**: /users/{id}
- **Behavior**: Soft delete — set `is_active=false` in database, do not remove record
- **Files to modify**:
  - `router/users.py` — add route
  - `services/user_service.py` — add delete logic
  - `repositories/user_repository.py` — add soft delete query
- **Tests to add**:
  - Unit test: service correctly sets is_active=false
  - Integration test: DELETE returns 200, subsequent GET excludes user

### New Endpoint 2: Search
- **Method**: GET
- **Path**: /users/search?q={query}
- **Behavior**: Search users by name or email using query parameter
- **Files to modify**:
  - `router/users.py` — add route
  - `services/user_service.py` — add search logic
  - `repositories/user_repository.py` — add search query (parameterized!)
- **Tests to add**:
  - Unit test: search returns matching users
  - Integration test: query parameter filters correctly

## Constraints
All active profile rules still apply (Architect, Security, QA).
Follow the same patterns used in the existing implementation.

## Completion Criteria
- [ ] New endpoints work without breaking existing ones
- [ ] All existing tests still pass
- [ ] New tests pass
- [ ] Auth middleware on new endpoints
```

## 6. DEPENDS Graph → Orchestration Skill

The dependency graph compiles into a **master orchestration skill** that runs
the build in the correct order, dispatching to subagents where possible.

### Compiled Output: `.claude/skills/orchestrate/SKILL.md`

```markdown
---
name: orchestrate
description: Runs the full project build in dependency order.
  Dispatches independent components in parallel via subagents.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Orchestration Plan: test-app

## Dependency Graph

```
DB.users-db ──> API.users ──> WEBUI.users-display
```

## Execution Steps

### Phase 1 (Parallel: none — single root)
Execute: `/build-db-users-db`
Wait for completion before proceeding.

### Phase 2 (Sequential — depends on Phase 1)
Execute: `/build-api-users`
Wait for completion before proceeding.

### Phase 3 (Sequential — depends on Phase 2)
Execute: `/build-webui-users-display`
Wait for completion.

## Parallel Execution Example (When Graph Allows)

If the graph were:
```
DB.users-db ──> API.users ──────> WEBUI.dashboard
DB.logs-db  ──> API.analytics ──/
```

Then Phase 2 would run `API.users` and `API.analytics` **in parallel**
using separate subagents via the Task tool.

## Post-Build Verification

After all phases complete:
1. Delegate to `architect` agent: "Review the full project structure"
2. Delegate to `security` agent: "Audit all endpoints for security rules"
3. Delegate to `qa` agent: "Verify all tests pass and coverage meets target"

## State Update

After successful build, update `.langc/state.json` with:
- Component statuses
- File paths created
- Timestamps
- Profile versions used
```

## 7. ON_REVIEW → Hooks (.claude/settings.json)

Profile ON_REVIEW rules compile into **hooks** that run automatically during
Claude's workflow, acting as automated guardrails.

### LangC Input:

```langc
ON_REVIEW {
    "Flag any endpoint without auth middleware",
    "Flag any raw SQL string construction"
}
```

### Compiled Output: `.claude/settings.json` (hooks section)

```json
{
  "permissions": {
    "allow": [
      "Bash(pytest *)",
      "Bash(ruff check *)",
      "Read(./**)",
      "Write(./test-app/**)",
      "Edit(./test-app/**)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Write(./.env*)",
      "Edit(./.env*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/review-security.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Review all files created/modified in this session. Check: (1) Every endpoint has auth middleware unless marked PUBLIC. (2) No raw SQL string construction — only parameterized queries. (3) No files mix business logic with HTTP handling. Report violations as ✗, warnings as ⚠, passes as ✓.",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### Compiled Output: `.claude/hooks/review-security.sh`

```bash
#!/bin/bash
# Auto-generated by LangC transpiler — Security profile ON_REVIEW
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

# Flag raw SQL string construction
if grep -qE "(f\".*SELECT|f\".*INSERT|f\".*UPDATE|f\".*DELETE|\+.*SELECT|\+.*INSERT)" "$FILE" 2>/dev/null; then
  echo "⚠ Security: Possible raw SQL string construction detected in $FILE" >&2
  echo "  Use parameterized queries instead." >&2
fi

exit 0
```

## 8. PATTERNS → Rules (.claude/rules/)

Profile PATTERNS compile into **path-specific rules** that Claude loads
contextually based on what it's working on.

### LangC Input:

```langc
PATTERNS {
    API -> "router/ services/ repositories/ models/ schemas/",
    WEBUI -> "pages/ components/ hooks/ services/ types/ utils/"
}
```

### Compiled Output: `.claude/rules/api.md`

```markdown
# API Component Rules

When working on API components, follow this structure:
- `router/` — HTTP route handlers only. No business logic here.
- `services/` — All business logic lives here.
- `repositories/` — Data access layer. Only database operations.
- `models/` — Domain models. No framework dependencies.
- `schemas/` — Request/response validation schemas.

Layer dependencies flow one direction: router → services → repositories → models
Never import from router in services. Never import from services in repositories.
```

### Compiled Output: `.claude/rules/webui.md`

```markdown
# WEBUI Component Rules

When working on frontend components, follow this structure:
- `pages/` — Route-level page components
- `components/` — Reusable UI components
- `hooks/` — Custom React hooks
- `services/` — API client functions
- `types/` — TypeScript type definitions
- `utils/` — Pure utility functions

Components should be functional. Use hooks for state and side effects.
API calls go through services/ — never call fetch directly in components.
```

## 9. REFERENCE → Context Injection

The REFERENCE path triggers the transpiler to scan the existing codebase and
inject discovered context into CLAUDE.md and skill files.

### What the Transpiler Does:

1. **Scans** the reference path for project structure
2. **Detects** language, framework, patterns, dependencies
3. **Injects** findings into CLAUDE.md as reference context
4. **Overrides** profile defaults where real code differs

### Compiled Output (appended to CLAUDE.md):

```markdown
## Reference Codebase Analysis

**Scanned**: `./test-app` on 2026-02-14

### Detected Stack
- Language: Python 3.11
- Framework: Flask (not FastAPI — adapt to existing)
- Testing: unittest (not pytest — match existing)
- Database: SQLAlchemy ORM
- Structure: MVC pattern

### Existing File Tree
```
test-app/
├── app/
│   ├── __init__.py
│   ├── routes/
│   │   └── users.py
│   ├── models/
│   │   └── user.py
│   └── config.py
├── tests/
│   └── test_users.py
├── requirements.txt
└── README.md
```

### Conventions Detected
- Route handlers use `@app.route()` decorator pattern
- Models use SQLAlchemy declarative base
- Tests use `unittest.TestCase`
- Single `requirements.txt` (no pyproject.toml)

> **Override note**: Profile defaults (FastAPI, pytest) are overridden by
> reference detection (Flask, unittest). User explicit values override both.
```

## 10. State → Agent Memory + State File

Build state is tracked in two places: LangC's own state file and Claude's
agent memory system.

### `.langc/state.json` (Machine-readable — transpiler manages)

```json
{
  "project": "test-app",
  "version": 1,
  "last_applied": "2026-02-14T10:30:00Z",
  "profiles_used": {
    "Architect": "v1",
    "Security": "v1",
    "QA": "v1"
  },
  "components": {
    "DB.users-db": {
      "status": "created",
      "path": "./test-app/db/",
      "checksum": "a1b2c3d4"
    },
    "API.users": {
      "status": "created",
      "path": "./test-app/api/",
      "methods": ["GET /users", "POST /users", "GET /users/{id}"],
      "checksum": "e5f6g7h8"
    }
  }
}
```

### `.claude/agent-memory/langc/MEMORY.md` (Claude-readable — context for future sessions)

```markdown
# LangC Build Memory

## Project: test-app
Last built: 2026-02-14

## What Exists
- DB.users-db: PostgreSQL, table "users" with 4 columns
- API.users: Python/FastAPI, 5 endpoints at /users
- WEBUI.users-display: React/Next.js, 5 views

## Known Issues
- None yet

## Build History
- v1: Initial full build (2026-02-14)
```

## 11. Full Compilation Example

### Input: `test-app.langc`

```langc
IMPORT Architect FROM "./profiles/architect.langc"
IMPORT Security FROM "./profiles/security.langc"
IMPORT QA FROM "./profiles/qa.langc"

PROJECT "test-app" {
    SCOPE = full,
    REFERENCE = none,
    PROFILES = [Architect, Security, QA],

    CREATE DB "users-db" {
        LNG = postgresql,
        DEPENDS = none,
        TABLE "users" { id: int, name: string, email: string }
    },

    CREATE API "users" {
        LNG = python,
        FRAMEWORK = fastapi,
        DEPENDS = [DB.users-db],
        METHOD GET "/users" -> "list all users",
        METHOD POST "/users" -> "create user"
    },

    CREATE WEBUI "users-display" {
        LNG = React,
        FRAMEWORK = nextjs,
        DEPENDS = [API.users],
        DISPLAY API.users.GET("/users") -> "user list table"
    }
}
```

### Output: Generated File Tree

```
test-app/
├── CLAUDE.md                                    ← PROJECT (master context)
├── .mcp.json                                    ← (if MCP servers needed)
├── .langc/
│   └── state.json                               ← State tracking
│
└── .claude/
    ├── settings.json                            ← ON_REVIEW hooks + permissions
    │
    ├── agents/                                  ← PROFILES as subagents
    │   ├── architect.md                         ← Architect profile → agent
    │   ├── security.md                          ← Security profile → agent
    │   └── qa.md                                ← QA profile → agent
    │
    ├── skills/                                  ← CREATE/UPDATE blocks as skills
    │   ├── build-db-users-db/
    │   │   └── SKILL.md                         ← CREATE DB → skill
    │   ├── build-api-users/
    │   │   └── SKILL.md                         ← CREATE API → skill
    │   ├── build-webui-users-display/
    │   │   └── SKILL.md                         ← CREATE WEBUI → skill
    │   ├── orchestrate/
    │   │   └── SKILL.md                         ← DEPENDS graph → master skill
    │   └── plan/
    │       └── SKILL.md                         ← langc plan → review skill
    │
    ├── rules/                                   ← PATTERNS as path rules
    │   ├── api.md                               ← API structure rules
    │   ├── webui.md                             ← WEBUI structure rules
    │   ├── python.md                            ← LNG profile rules
    │   └── react.md                             ← LNG profile rules
    │
    ├── hooks/                                   ← ON_REVIEW as shell scripts
    │   └── review-security.sh                   ← Security review hook
    │
    └── agent-memory/
        └── langc/
            └── MEMORY.md                        ← Build state for Claude
```

## 12. Translation Rules (Quick Reference)

| When the transpiler sees... | It generates... |
|---|---|
| `PROJECT "name"` | `CLAUDE.md` with project context, rules, build order |
| `PROFILE Name { ROLE, RULES }` | `.claude/agents/name.md` with persona instructions |
| `PROFILE Name { PATTERNS }` | `.claude/rules/<component>.md` with structure rules |
| `PROFILE Name { ON_REVIEW }` | `.claude/settings.json` hooks + `.claude/hooks/*.sh` |
| `CREATE <TYPE> "name" { ... }` | `.claude/skills/build-<type>-<name>/SKILL.md` |
| `UPDATE <TYPE>.<name> { ... }` | `.claude/skills/update-<type>-<name>/SKILL.md` |
| `DEPENDS = [X, Y]` | Execution order in `.claude/skills/orchestrate/SKILL.md` |
| `LNG = python` | `.claude/rules/python.md` with language conventions |
| `FRAMEWORK = fastapi` | Framework constraints in skill + rules |
| `SCOPE = full\|skeleton\|prototype` | Scope instructions in skill |
| `REFERENCE = "./path"` | Codebase scan results appended to `CLAUDE.md` |
| `IMPORT Profile FROM "path"` | Resolves profile file → generates agent + rules |
| `PROFILES = [A, B, C]` | Links agents in `CLAUDE.md`, merges rules |
| `Profile(EXCEPT = "rule")` | Omits matching rules from that context |
| `METHOD GET "/path" -> "desc"` | Endpoint spec in skill instructions |
| `DISPLAY API.ref -> "desc"` | View spec in skill with API cross-reference |
| `TABLE "name" { fields }` | Schema spec in DB skill |

## 13. Open Questions

1. **MCP servers** — Should `CREATE DB` auto-configure a database MCP server in `.mcp.json`?
2. **Skill chaining** — Should skills call other skills, or should orchestration be centralized?
3. **Incremental compilation** — Can the transpiler regenerate only changed skills on UPDATE?
4. **Dry run** — Should `langc plan` generate the `.claude/` folder but mark skills as `user-invocable: false` until approved?
5. **Rollback** — Should the transpiler keep previous `.claude/` versions for undo capability?
6. **Validation** — Should the transpiler verify that generated hooks/agents/skills are valid before writing them?
