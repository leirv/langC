# LangC Profiles Specification — Synthesized Persona Artifacts

## Overview

Profiles in LangC are **synthesized persona artifacts** — portable, reusable packages of expert knowledge that the transpiler injects into Claude's context during code generation. Each profile represents a specialist (Architect, Security Engineer, QA, etc.) whose rules, patterns, and review criteria shape how Claude builds every component.

Profiles are **not configuration files**. They are behavioral contracts that define *how* code should be built, not *what* code to build.

## 1. Profile Anatomy

A profile consists of four sections:

```langc
PROFILE <Name> {
    ROLE = "<human-readable specialist title>",

    RULES {
        "<imperative constraint>",
        "<imperative constraint>",
        ...
    },

    PATTERNS {
        <ComponentType> -> "<structure or convention>",
        ...
    },

    ON_REVIEW {
        "<condition to flag during plan phase>",
        ...
    }
}
```

### 1.1 ROLE

A short description of the persona. Used by the transpiler to frame Claude's perspective when generating instructions.

```langc
ROLE = "Senior Software Architect with 15 years of experience in distributed systems"
```

### 1.2 RULES

Imperative constraints that Claude must follow. Every rule applies to all components unless overridden by scoping or exceptions.

```langc
RULES {
    "Separate domain logic from infrastructure",
    "Controllers must be thin — delegate to services",
    "Never import infrastructure in the domain layer",
    "Use dependency injection, no hard-coded dependencies",
    "One responsibility per module"
}
```

Rules are **non-negotiable by default**. If Claude's generated plan violates a rule, the transpiler should flag it during the `langc plan` phase.

### 1.3 PATTERNS

Structural conventions that define how specific component types should be organized. These map component types (API, WEBUI, DB, FNC) to folder structures, file conventions, or architectural patterns.

```langc
PATTERNS {
    API -> "router/ services/ repositories/ models/ schemas/",
    WEBUI -> "pages/ components/ hooks/ services/ types/ utils/",
    DB -> "migrations/ seeds/ models/",
    FNC -> "one function per file, grouped by domain in utils/"
}
```

When the transpiler encounters a `CREATE API` block, it loads the API pattern from all active profiles and merges them into the Claude instructions.

### 1.4 ON_REVIEW

Conditions that the transpiler evaluates during the `langc plan` phase. These act as **automated review comments** from the persona — warnings or errors surfaced before Claude executes.

```langc
ON_REVIEW {
    "Flag any file that mixes business logic with HTTP handling",
    "Flag circular dependencies between modules",
    "Warn if a CREATE block has more than 10 methods — suggest splitting"
}
```

ON_REVIEW rules generate output like:

```
╔══════════════════════════════════════════════════════╗
║  Plan Review — Architect                             ║
╠══════════════════════════════════════════════════════╣
║  ⚠ API.users has 12 methods — consider splitting    ║
║    into API.users-read and API.users-write           ║
║  ✓ All components follow layered structure           ║
╚══════════════════════════════════════════════════════╝
```

## 2. Built-in Profiles

The transpiler ships with a set of default profiles. These represent common software engineering roles and can be used out of the box.

### 2.1 Architect

```langc
PROFILE Architect {
    ROLE = "Senior Software Architect",

    RULES {
        "Separate domain logic from infrastructure",
        "Controllers must be thin — delegate to services",
        "Never import infrastructure in the domain layer",
        "Use dependency injection, no hard-coded dependencies",
        "One responsibility per module",
        "Prefer composition over inheritance",
        "Define interfaces/contracts between layers"
    },

    PATTERNS {
        API -> "router/ services/ repositories/ models/ schemas/",
        WEBUI -> "pages/ components/ hooks/ services/ types/ utils/",
        DB -> "migrations/ seeds/ models/"
    },

    ON_REVIEW {
        "Flag any file that mixes business logic with HTTP handling",
        "Flag circular dependencies between modules",
        "Warn if any single file exceeds 300 lines"
    }
}
```

### 2.2 Security

```langc
PROFILE Security {
    ROLE = "Application Security Engineer",

    RULES {
        "All endpoints require authentication unless marked PUBLIC",
        "Validate and sanitize all user input at the boundary",
        "Never expose internal errors or stack traces to clients",
        "Use parameterized queries — never string concatenation for SQL",
        "Hash passwords with bcrypt, minimum 12 rounds",
        "Enforce HTTPS in production configuration",
        "Apply rate limiting on authentication endpoints",
        "Set CORS policies explicitly — never use wildcard in production"
    },

    PATTERNS {
        API -> "middleware/auth.* middleware/validation.*",
        WEBUI -> "utils/sanitize.* hooks/useAuth.*"
    },

    ON_REVIEW {
        "Flag any endpoint without auth middleware",
        "Flag any raw SQL string construction",
        "Flag any endpoint accepting user input without validation",
        "Warn if no rate limiting is configured on POST endpoints"
    }
}
```

### 2.3 QA

```langc
PROFILE QA {
    ROLE = "Quality Assurance Engineer",

    RULES {
        "Every endpoint must have unit tests and integration tests",
        "Use fixtures and factories for test data — never hardcode",
        "Test both success and failure paths",
        "Mock external dependencies in unit tests",
        "Integration tests use a real test database",
        "Minimum 80% code coverage target"
    },

    PATTERNS {
        API -> "tests/unit/ tests/integration/ tests/fixtures/ tests/conftest.*",
        WEBUI -> "tests/ __tests__/ *.test.* *.spec.*"
    },

    ON_REVIEW {
        "Flag any CREATE block without corresponding test generation",
        "Warn if test files don't cover all defined methods/endpoints"
    }
}
```

### 2.4 DevOps

```langc
PROFILE DevOps {
    ROLE = "DevOps / Infrastructure Engineer",

    RULES {
        "Every project must include a Dockerfile",
        "Use environment variables for all configuration — never hardcode secrets",
        "Include a docker-compose.yml for local development",
        "Add health check endpoints for every service",
        "Log in structured JSON format"
    },

    PATTERNS {
        API -> "Dockerfile docker-compose.yml .env.example",
        DB -> "Dockerfile init-scripts/"
    },

    ON_REVIEW {
        "Flag any hardcoded port, URL, or credential",
        "Warn if no Dockerfile is generated for a service"
    }
}
```

## 3. Loading and Scoping

### 3.1 Import Syntax

Profiles are loaded via IMPORT statements at the top of a `.langc` file:

```langc
// Import from built-in profiles
IMPORT Architect
IMPORT Security

// Import from file
IMPORT Architect FROM "./profiles/architect.langc"
IMPORT Security FROM "./profiles/security.langc"

// Import custom profiles
IMPORT MyCompanyStandards FROM "./profiles/company.langc"
```

### 3.2 Global Scope (Project Level)

When assigned at the project level, all profiles apply to every block:

```langc
PROJECT "test-app" {

    PROFILES = [Architect, Security, QA],

    CREATE API "users" {
        // Architect + Security + QA rules all apply here
        ...
    },

    CREATE WEBUI "dashboard" {
        // Architect + Security + QA rules all apply here too
        ...
    }
}
```

### 3.3 Block Scope (Component Level)

Profiles can be added or restricted per block:

```langc
PROJECT "test-app" {

    PROFILES = [Architect, Security],

    CREATE API "users" {
        // Inherits: Architect, Security
        // Adds: QA (only for this block)
        PROFILES += [QA],
        ...
    },

    CREATE API "internal-tools" {
        // Inherits: Architect, Security
        // No QA — internal tools have lighter testing
        ...
    }
}
```

### 3.4 Exceptions (Override a Profile's Rule)

Specific rules from a profile can be relaxed using the EXCEPT keyword:

```langc
CREATE API "public-health" {
    // Security applies, but auth rule is relaxed
    PROFILES = [Architect, Security(EXCEPT = "auth")],

    METHOD PUBLIC GET "/health" -> "healthcheck, no auth needed"
}
```

The EXCEPT value matches against RULES entries using keyword matching. `EXCEPT = "auth"` disables any rule containing the word "auth."

### 3.5 Priority Cascade (Full)

When multiple profiles or overrides conflict, the transpiler resolves using this priority:

```
Inline exceptions (PUBLIC, EXCEPT)     →  highest priority
Block-scoped profiles (PROFILES +=)    →
Project-scoped profiles (PROFILES =)   →
Imported profile defaults              →
Built-in transpiler defaults           →  lowest priority
```

If two profiles at the same level contradict each other (e.g., Architect says "split files" and a custom profile says "single file"), the transpiler should **flag the conflict during `langc plan`** and ask the user to resolve it.

## 4. Custom Profile Authoring

Users and teams can author their own profiles following the same structure:

```langc
// profiles/company.langc

PROFILE CompanyStandards {
    ROLE = "Company Engineering Standards",

    RULES {
        "All services must expose a /metrics endpoint for Prometheus",
        "Use structured logging with correlation IDs",
        "All database changes require migration scripts — no manual DDL",
        "API versioning is mandatory — use /v1/ prefix",
        "All services must have a README with setup instructions"
    },

    PATTERNS {
        API -> "src/v1/ src/common/ src/config/",
        DB -> "migrations/ scripts/"
    },

    ON_REVIEW {
        "Flag any API without /metrics endpoint",
        "Flag any service without version prefix in routes"
    }
}
```

### 4.1 Profile Composition

Profiles can compose other profiles to create higher-level personas:

```langc
PROFILE FullStack {
    EXTENDS = [Architect, Security, QA, DevOps],

    // Additional rules on top of all extended profiles
    RULES {
        "Frontend and backend must share type definitions",
        "API response types must match frontend interface types"
    }
}
```

EXTENDS merges all RULES, PATTERNS, and ON_REVIEW from parent profiles. Child rules take priority over parent rules if they conflict.

### 4.2 Versioning

Profiles can be versioned to prevent breaking changes when rules evolve:

```langc
IMPORT Security@v2 FROM "./profiles/security-v2.langc"
```

The transpiler tracks which profile version was used in the state file, enabling reproducible builds.

## 5. Transpiler Integration

### 5.1 How Profiles Affect Code Generation

When the transpiler generates Claude instructions for a block, it:

1. Collects all applicable profiles (global + scoped + extended)
2. Removes excepted rules
3. Checks for conflicts and flags them
4. Merges RULES into the Claude instruction as behavioral constraints
5. Merges PATTERNS into the Claude instruction as structural requirements
6. Stores active profile set in the state file

Example — what Claude receives for `CREATE API "users"` with [Architect, Security, QA]:

```markdown
## Create API: "users"
Language: Python | Framework: FastAPI | Scope: full

### Endpoints
- GET /users → list all users with pagination
- POST /users → create a user with name, email

### Architectural Rules (Architect)
- Separate into router/ services/ repositories/ models/ schemas/
- Controllers must be thin — delegate to services
- Use dependency injection

### Security Rules (Security)
- All endpoints require JWT authentication
- Validate and sanitize all input
- Use parameterized queries
- Return structured error JSON, never expose stack traces

### Testing Rules (QA)
- Write unit tests and integration tests for every endpoint
- Use fixtures for test data
- Cover success and failure paths
- Target 80% code coverage
```

### 5.2 How Profiles Affect Plan Review

During `langc plan`, each profile's ON_REVIEW rules are evaluated:

```
╔═══════════════════════════════════════════════════════╗
║  Plan Review                                          ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Architect:                                           ║
║    ✓ All components follow layered structure           ║
║    ✓ No circular dependencies detected                ║
║                                                       ║
║  Security:                                            ║
║    ✓ All non-PUBLIC endpoints have auth                ║
║    ⚠ API.users POST has no rate limiting specified     ║
║                                                       ║
║  QA:                                                  ║
║    ✓ Test generation planned for all endpoints         ║
║    ⚠ No integration test fixtures defined for DB       ║
║                                                       ║
║  Resolve warnings before apply? [yes / skip / edit]   ║
╚═══════════════════════════════════════════════════════╝
```

## 6. Open Questions

1. **Profile marketplace** — Should there be a registry (like npm) for community-shared profiles?
2. **Profile testing** — Can you test a profile against a sample project to verify its rules work?
3. **Profile analytics** — Should the transpiler track which rules fire most often?
4. **AI-assisted profiles** — Could Claude help write profiles by analyzing an existing codebase's patterns?
5. **Conditional rules** — Should rules support conditions? (e.g., "If LNG=python THEN use type hints")
