import { readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

/**
 * Scan results from a reference codebase.
 */
export interface ReferenceScan {
  path: string;
  scannedAt: string;
  fileTree: string[];
  detectedStack: DetectedStack;
  conventions: string[];
}

export interface DetectedStack {
  languages: string[];
  frameworks: string[];
  testing: string[];
  database: string[];
  buildTools: string[];
}

// File extension → language mapping
const extToLang: Record<string, string> = {
  ".py": "Python",
  ".js": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript (React)",
  ".jsx": "JavaScript (React)",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".sql": "SQL",
};

// Filename → framework/tool detection
const fileDetectors: { file: string; category: keyof DetectedStack; value: string }[] = [
  // Frameworks
  { file: "requirements.txt", category: "frameworks", value: "" },  // parse contents
  { file: "package.json", category: "frameworks", value: "" },       // parse contents
  { file: "go.mod", category: "buildTools", value: "Go modules" },
  { file: "Cargo.toml", category: "buildTools", value: "Cargo" },
  { file: "pom.xml", category: "buildTools", value: "Maven" },
  { file: "build.gradle", category: "buildTools", value: "Gradle" },
  { file: "Gemfile", category: "buildTools", value: "Bundler" },
  { file: "composer.json", category: "buildTools", value: "Composer" },

  // Testing
  { file: "pytest.ini", category: "testing", value: "pytest" },
  { file: "setup.cfg", category: "testing", value: "" },  // may contain pytest
  { file: "jest.config.js", category: "testing", value: "Jest" },
  { file: "jest.config.ts", category: "testing", value: "Jest" },
  { file: "vitest.config.ts", category: "testing", value: "Vitest" },
  { file: ".mocharc.yml", category: "testing", value: "Mocha" },

  // Database
  { file: "docker-compose.yml", category: "database", value: "" },  // may contain db services
  { file: "alembic.ini", category: "database", value: "Alembic (SQLAlchemy)" },
  { file: "knexfile.js", category: "database", value: "Knex" },
  { file: "prisma", category: "database", value: "Prisma" },

  // Build tools
  { file: "Dockerfile", category: "buildTools", value: "Docker" },
  { file: "Makefile", category: "buildTools", value: "Make" },
  { file: "tsconfig.json", category: "buildTools", value: "TypeScript" },
  { file: "pyproject.toml", category: "buildTools", value: "pyproject.toml" },
  { file: ".eslintrc.js", category: "buildTools", value: "ESLint" },
  { file: "ruff.toml", category: "buildTools", value: "Ruff" },
];

// Directory patterns → conventions
const dirConventions: { dir: string; convention: string }[] = [
  { dir: "src/", convention: "Source code in src/ directory" },
  { dir: "tests/", convention: "Tests in tests/ directory" },
  { dir: "test/", convention: "Tests in test/ directory" },
  { dir: "__tests__/", convention: "Tests in __tests__/ directory" },
  { dir: "migrations/", convention: "Database migrations present" },
  { dir: "router/", convention: "Router pattern used" },
  { dir: "routes/", convention: "Route handlers in routes/ directory" },
  { dir: "controllers/", convention: "MVC controllers pattern" },
  { dir: "services/", convention: "Service layer pattern" },
  { dir: "repositories/", convention: "Repository pattern" },
  { dir: "models/", convention: "Models directory present" },
  { dir: "components/", convention: "Component-based architecture" },
  { dir: "hooks/", convention: "Custom hooks directory" },
  { dir: "pages/", convention: "Page-based routing" },
  { dir: "middleware/", convention: "Middleware directory present" },
  { dir: "utils/", convention: "Utilities directory present" },
];

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "dist", "build", ".next", ".cache", "coverage",
  ".langc", ".claude",
]);

/**
 * Scan a reference codebase and detect stack, patterns, conventions.
 */
export function scanReference(refPath: string): ReferenceScan | null {
  if (!existsSync(refPath)) return null;

  const fileTree = collectFileTree(refPath, refPath, 0);
  const detectedStack = detectStack(refPath, fileTree);
  const conventions = detectConventions(fileTree);

  return {
    path: refPath,
    scannedAt: new Date().toISOString(),
    fileTree,
    detectedStack,
    conventions,
  };
}

function collectFileTree(
  basePath: string,
  currentPath: string,
  depth: number,
): string[] {
  if (depth > 5) return [];  // max depth

  const results: string[] = [];
  let entries: string[];

  try {
    entries = readdirSync(currentPath);
  } catch {
    return results;
  }

  for (const entry of entries.sort()) {
    if (entry.startsWith(".") && entry !== ".env.example") continue;
    if (IGNORED_DIRS.has(entry)) continue;

    const fullPath = join(currentPath, entry);
    const relPath = relative(basePath, fullPath).replace(/\\/g, "/");

    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(relPath + "/");
        results.push(...collectFileTree(basePath, fullPath, depth + 1));
      } else {
        results.push(relPath);
      }
    } catch {
      // skip inaccessible files
    }
  }

  return results;
}

function detectStack(basePath: string, fileTree: string[]): DetectedStack {
  const stack: DetectedStack = {
    languages: [],
    frameworks: [],
    testing: [],
    database: [],
    buildTools: [],
  };

  // Detect languages from extensions
  const langCounts = new Map<string, number>();
  for (const file of fileTree) {
    if (file.endsWith("/")) continue;
    const ext = extname(file);
    const lang = extToLang[ext];
    if (lang) {
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    }
  }
  // Sort by frequency
  stack.languages = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);

  // Detect from known files
  const seenValues = new Set<string>();
  for (const detector of fileDetectors) {
    const found = fileTree.some(f => {
      const name = f.split("/").pop() ?? "";
      return name === detector.file || f.endsWith("/" + detector.file);
    });

    if (found && detector.value && !seenValues.has(detector.value)) {
      stack[detector.category].push(detector.value);
      seenValues.add(detector.value);
    }
  }

  // Detect frameworks from package.json-style markers
  const frameworkMarkers: { pattern: string; value: string }[] = [
    { pattern: "next.config", value: "Next.js" },
    { pattern: "nuxt.config", value: "Nuxt" },
    { pattern: "angular.json", value: "Angular" },
    { pattern: "vite.config", value: "Vite" },
    { pattern: "webpack.config", value: "Webpack" },
  ];

  for (const marker of frameworkMarkers) {
    if (fileTree.some(f => f.includes(marker.pattern)) && !seenValues.has(marker.value)) {
      stack.frameworks.push(marker.value);
      seenValues.add(marker.value);
    }
  }

  return stack;
}

function detectConventions(fileTree: string[]): string[] {
  const conventions: string[] = [];
  const seen = new Set<string>();

  for (const dc of dirConventions) {
    if (fileTree.some(f => f.includes(dc.dir)) && !seen.has(dc.convention)) {
      conventions.push(dc.convention);
      seen.add(dc.convention);
    }
  }

  return conventions;
}

/**
 * Format a ReferenceScan into markdown for CLAUDE.md injection.
 */
export function formatReferenceScanMd(scan: ReferenceScan): string {
  const lines: string[] = [];

  lines.push("## Reference Codebase Analysis");
  lines.push("");
  lines.push(`**Scanned**: \`${scan.path}\` on ${scan.scannedAt.split("T")[0]}`);
  lines.push("");

  // Detected stack
  if (scan.detectedStack.languages.length > 0) {
    lines.push("### Detected Stack");
    lines.push(`- **Languages**: ${scan.detectedStack.languages.join(", ")}`);
    if (scan.detectedStack.frameworks.length > 0) {
      lines.push(`- **Frameworks**: ${scan.detectedStack.frameworks.join(", ")}`);
    }
    if (scan.detectedStack.testing.length > 0) {
      lines.push(`- **Testing**: ${scan.detectedStack.testing.join(", ")}`);
    }
    if (scan.detectedStack.database.length > 0) {
      lines.push(`- **Database**: ${scan.detectedStack.database.join(", ")}`);
    }
    if (scan.detectedStack.buildTools.length > 0) {
      lines.push(`- **Build Tools**: ${scan.detectedStack.buildTools.join(", ")}`);
    }
    lines.push("");
  }

  // File tree (limited)
  const treeLimit = 30;
  const treeFiles = scan.fileTree.slice(0, treeLimit);
  if (treeFiles.length > 0) {
    lines.push("### Existing File Tree");
    lines.push("```");
    for (const f of treeFiles) {
      lines.push(f);
    }
    if (scan.fileTree.length > treeLimit) {
      lines.push(`... and ${scan.fileTree.length - treeLimit} more files`);
    }
    lines.push("```");
    lines.push("");
  }

  // Conventions
  if (scan.conventions.length > 0) {
    lines.push("### Conventions Detected");
    for (const c of scan.conventions) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  lines.push("> When generating code, match the existing patterns, naming conventions, and project structure.");
  lines.push("");

  return lines.join("\n");
}
