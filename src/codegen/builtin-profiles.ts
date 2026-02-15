import type { ProfileDecl } from "../ast/nodes.js";

const loc = { line: 0, column: 0 };

/**
 * Built-in profiles shipped with the transpiler.
 * Available via `IMPORT Architect` (no FROM path).
 */
export const builtinProfiles: Map<string, ProfileDecl> = new Map([
  ["Architect", {
    kind: "ProfileDecl",
    name: "Architect",
    role: "Senior Software Architect",
    extends_: null,
    rules: [
      "Separate domain logic from infrastructure",
      "Controllers must be thin — delegate to services",
      "Never import infrastructure in the domain layer",
      "Use dependency injection, no hard-coded dependencies",
      "One responsibility per module",
      "Prefer composition over inheritance",
      "Define interfaces/contracts between layers",
    ],
    patterns: [
      { kind: "PatternEntry", componentType: "API", pattern: "router/ services/ repositories/ models/ schemas/", loc },
      { kind: "PatternEntry", componentType: "WEBUI", pattern: "pages/ components/ hooks/ services/ types/ utils/", loc },
      { kind: "PatternEntry", componentType: "DB", pattern: "migrations/ seeds/ models/", loc },
    ],
    onReview: [
      "Flag any file that mixes business logic with HTTP handling",
      "Flag circular dependencies between modules",
      "Warn if any single file exceeds 300 lines",
    ],
    loc,
  }],
  ["Security", {
    kind: "ProfileDecl",
    name: "Security",
    role: "Application Security Engineer",
    extends_: null,
    rules: [
      "All endpoints require authentication unless marked PUBLIC",
      "Validate and sanitize all user input at the boundary",
      "Never expose internal errors or stack traces to clients",
      "Use parameterized queries — never string concatenation for SQL",
      "Hash passwords with bcrypt, minimum 12 rounds",
      "Enforce HTTPS in production configuration",
      "Apply rate limiting on authentication endpoints",
      "Set CORS policies explicitly — never use wildcard in production",
    ],
    patterns: [
      { kind: "PatternEntry", componentType: "API", pattern: "middleware/auth.* middleware/validation.*", loc },
      { kind: "PatternEntry", componentType: "WEBUI", pattern: "utils/sanitize.* hooks/useAuth.*", loc },
    ],
    onReview: [
      "Flag any endpoint without auth middleware",
      "Flag any raw SQL string construction",
      "Flag any endpoint accepting user input without validation",
      "Warn if no rate limiting is configured on POST endpoints",
    ],
    loc,
  }],
  ["QA", {
    kind: "ProfileDecl",
    name: "QA",
    role: "Quality Assurance Engineer",
    extends_: null,
    rules: [
      "Every endpoint must have unit tests and integration tests",
      "Use fixtures and factories for test data — never hardcode",
      "Test both success and failure paths",
      "Mock external dependencies in unit tests",
      "Integration tests use a real test database",
      "Minimum 80% code coverage target",
    ],
    patterns: [
      { kind: "PatternEntry", componentType: "API", pattern: "tests/unit/ tests/integration/ tests/fixtures/ tests/conftest.*", loc },
      { kind: "PatternEntry", componentType: "WEBUI", pattern: "tests/ __tests__/ *.test.* *.spec.*", loc },
    ],
    onReview: [
      "Flag any CREATE block without corresponding test generation",
      "Warn if test files don't cover all defined methods/endpoints",
    ],
    loc,
  }],
  ["DevOps", {
    kind: "ProfileDecl",
    name: "DevOps",
    role: "DevOps / Infrastructure Engineer",
    extends_: null,
    rules: [
      "Every project must include a Dockerfile",
      "Use environment variables for all configuration — never hardcode secrets",
      "Include a docker-compose.yml for local development",
      "Add health check endpoints for every service",
      "Log in structured JSON format",
    ],
    patterns: [
      { kind: "PatternEntry", componentType: "API", pattern: "Dockerfile docker-compose.yml .env.example", loc },
      { kind: "PatternEntry", componentType: "DB", pattern: "Dockerfile init-scripts/", loc },
    ],
    onReview: [
      "Flag any hardcoded port, URL, or credential",
      "Warn if no Dockerfile is generated for a service",
    ],
    loc,
  }],
]);
