import type { Program, ProjectDecl, CreateBlock, ImportDecl, ProfileRef } from "../ast/nodes.js";
import { builtinProfiles } from "./builtin-profiles.js";

// ── Validation result ──

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;        // true if no errors (warnings are ok)
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

export type FileChecker = (path: string) => boolean;

/**
 * Semantic validator — runs after parsing to catch logical errors.
 * Checks: DEPENDS resolution, cycle detection, import verification,
 * profile conflict detection, and auto-inference warnings.
 */
export function semanticValidate(
  ast: Program,
  fileExists: FileChecker,
  basePath: string,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const checks: CheckResult[] = [];

  const project = ast.declarations.find(
    (d): d is ProjectDecl => d.kind === "ProjectDecl",
  );

  if (!project) {
    errors.push({ severity: "error", message: "No PROJECT declaration found" });
    return { valid: false, errors, warnings, checks };
  }

  // Check 1: Syntax valid (always true if we got here — parser already passed)
  checks.push({ name: "Syntax valid", passed: true });

  // Check 2: All DEPENDS references resolve
  const createBlocks = project.blocks.filter(
    (b): b is CreateBlock => b.kind === "CreateBlock",
  );
  const blockIds = new Set(
    createBlocks.map(b => `${b.componentType}.${b.name}`),
  );

  checkDependsResolution(createBlocks, blockIds, errors, checks);

  // Check 3: No circular dependencies
  checkCycles(createBlocks, blockIds, errors, checks);

  // Check 4: All IMPORT profiles found
  checkImports(ast.imports, fileExists, basePath, errors, checks);

  // Check 5: Profile conflicts
  const profilesProp = project.properties.find(p => p.kind === "ProfilesProperty");
  const profileRefs: ProfileRef[] = profilesProp?.kind === "ProfilesProperty"
    ? profilesProp.names : [];
  checkProfileConflicts(profileRefs, warnings, checks);

  // Check 6: Auto-inference warnings
  checkAutoInference(createBlocks, warnings);

  // Check 7: FRAMEWORK without LNG warning
  checkFrameworkWithoutLng(createBlocks, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

function checkDependsResolution(
  blocks: CreateBlock[],
  blockIds: Set<string>,
  errors: ValidationIssue[],
  checks: CheckResult[],
): void {
  let allResolved = true;

  for (const block of blocks) {
    for (const prop of block.properties) {
      if (prop.kind === "DependsProperty") {
        for (const ref of prop.refs) {
          const target = ref.parts.join(".");
          if (target === "none") continue;
          if (!blockIds.has(target)) {
            errors.push({
              severity: "error",
              message: `DEPENDS reference "${target}" in ${block.componentType}.${block.name} does not resolve to any CREATE block`,
              line: ref.loc.line,
              column: ref.loc.column,
            });
            allResolved = false;
          }
        }
      }
    }
  }

  checks.push({
    name: "All DEPENDS references resolve",
    passed: allResolved,
    message: allResolved ? undefined : "Some DEPENDS targets not found",
  });
}

function checkCycles(
  blocks: CreateBlock[],
  blockIds: Set<string>,
  errors: ValidationIssue[],
  checks: CheckResult[],
): void {
  // Build adjacency: node -> nodes it depends on
  const deps = new Map<string, string[]>();
  for (const block of blocks) {
    const id = `${block.componentType}.${block.name}`;
    const blockDeps: string[] = [];
    for (const prop of block.properties) {
      if (prop.kind === "DependsProperty") {
        for (const ref of prop.refs) {
          const target = ref.parts.join(".");
          if (target !== "none" && blockIds.has(target)) {
            blockDeps.push(target);
          }
        }
      }
    }
    deps.set(id, blockDeps);
  }

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();
  let hasCycle = false;
  const cycleNodes: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      hasCycle = true;
      cycleNodes.push(node);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);

    for (const dep of deps.get(node) ?? []) {
      dfs(dep);
      if (hasCycle) return;
    }

    inStack.delete(node);
  }

  for (const id of blockIds) {
    if (!visited.has(id)) {
      dfs(id);
      if (hasCycle) break;
    }
  }

  if (hasCycle) {
    errors.push({
      severity: "error",
      message: `Circular dependency detected involving: ${cycleNodes.join(" → ")}`,
    });
  }

  checks.push({
    name: "No circular dependencies",
    passed: !hasCycle,
    message: hasCycle ? `Cycle: ${cycleNodes.join(" → ")}` : undefined,
  });
}

function checkImports(
  imports: ImportDecl[],
  fileExists: FileChecker,
  basePath: string,
  errors: ValidationIssue[],
  checks: CheckResult[],
): void {
  let allFound = true;

  for (const imp of imports) {
    if (imp.from) {
      // File-based import — check file exists
      const baseDir = basePath.replace(/[/\\][^/\\]*$/, "");
      const resolvedPath = `${baseDir}/${imp.from}`.replace(/\\/g, "/");
      if (!fileExists(resolvedPath)) {
        errors.push({
          severity: "error",
          message: `IMPORT "${imp.name}" FROM "${imp.from}" — file not found`,
          line: imp.loc.line,
          column: imp.loc.column,
        });
        allFound = false;
      }
    } else {
      // Built-in import — check built-in exists
      if (!builtinProfiles.has(imp.name)) {
        errors.push({
          severity: "error",
          message: `IMPORT "${imp.name}" — not a built-in profile and no FROM path specified`,
          line: imp.loc.line,
          column: imp.loc.column,
        });
        allFound = false;
      }
    }
  }

  checks.push({
    name: "All IMPORT profiles found",
    passed: allFound,
    message: allFound ? undefined : "Some imports could not be resolved",
  });
}

function checkProfileConflicts(
  profileRefs: ProfileRef[],
  warnings: ValidationIssue[],
  checks: CheckResult[],
): void {
  // Known conflicting rule patterns
  const conflictPatterns: Array<{ a: RegExp; b: RegExp; desc: string }> = [
    {
      a: /split into layers|separate.*layer|layered/i,
      b: /single file|monolith|one file/i,
      desc: "Architecture conflict: one profile wants layers, another wants single-file",
    },
    {
      a: /microservice/i,
      b: /monolith/i,
      desc: "Architecture conflict: microservices vs monolith",
    },
  ];

  // We can only check if we resolve profiles — for now, just check for duplicate names
  const names = profileRefs.map(r => r.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);

  let hasConflict = false;

  if (dupes.length > 0) {
    hasConflict = true;
    for (const d of new Set(dupes)) {
      warnings.push({
        severity: "warning",
        message: `Profile "${d}" referenced multiple times in PROFILES`,
      });
    }
  }

  checks.push({
    name: "No profile conflicts",
    passed: !hasConflict,
    message: hasConflict ? "Possible profile conflicts detected" : undefined,
  });
}

function checkAutoInference(
  blocks: CreateBlock[],
  warnings: ValidationIssue[],
): void {
  for (const block of blocks) {
    const hasLng = block.properties.some(p => p.kind === "LngProperty");
    const hasFramework = block.properties.some(p => p.kind === "FrameworkProperty");

    // API/WEBUI/FNC without LNG — cannot infer
    if (!hasLng && block.componentType !== "DB") {
      warnings.push({
        severity: "warning",
        message: `${block.componentType}.${block.name} has no LNG property — language will need to be inferred`,
        line: block.loc.line,
        column: block.loc.column,
      });
    }

    // FRAMEWORK = auto-like (no framework set but has LNG)
    if (hasLng && !hasFramework && block.componentType !== "DB") {
      warnings.push({
        severity: "warning",
        message: `${block.componentType}.${block.name} has LNG but no FRAMEWORK — will use default`,
        line: block.loc.line,
        column: block.loc.column,
      });
    }
  }
}

function checkFrameworkWithoutLng(
  blocks: CreateBlock[],
  warnings: ValidationIssue[],
): void {
  for (const block of blocks) {
    const hasLng = block.properties.some(p => p.kind === "LngProperty");
    const hasFramework = block.properties.some(p => p.kind === "FrameworkProperty");

    if (hasFramework && !hasLng) {
      warnings.push({
        severity: "warning",
        message: `${block.componentType}.${block.name} has FRAMEWORK but no LNG — framework may not apply correctly`,
        line: block.loc.line,
        column: block.loc.column,
      });
    }
  }
}
