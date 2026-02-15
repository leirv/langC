import type { Program, ProjectDecl, CreateBlock, ImportDecl, ProfileRef } from "../ast/nodes.js";
import type { ResolvedProfile } from "./types.js";
import { builtinProfiles } from "./builtin-profiles.js";
import type { ReferenceScan } from "./reference-scanner.js";

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
 * profile conflict detection, smart ON_REVIEW, reference overrides, and auto-inference warnings.
 *
 * @param resolvedProfiles Optional — if provided, enables deep conflict detection and smart ON_REVIEW
 * @param referenceScan Optional — if provided, enables REFERENCE override detection
 */
export function semanticValidate(
  ast: Program,
  fileExists: FileChecker,
  basePath: string,
  resolvedProfiles?: ResolvedProfile[],
  referenceScan?: ReferenceScan | null,
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

  // Check 5: Profile conflicts (deep if resolvedProfiles available)
  const profilesProp = project.properties.find(p => p.kind === "ProfilesProperty");
  const profileRefs: ProfileRef[] = profilesProp?.kind === "ProfilesProperty"
    ? profilesProp.names : [];

  if (resolvedProfiles && resolvedProfiles.length > 0) {
    checkDeepProfileConflicts(resolvedProfiles, warnings, checks);
  } else {
    checkProfileConflicts(profileRefs, warnings, checks);
  }

  // Check 6: Smart ON_REVIEW evaluation
  if (resolvedProfiles && resolvedProfiles.length > 0) {
    evaluateOnReview(resolvedProfiles, createBlocks, warnings, checks);
  }

  // Check 7: REFERENCE override detection
  if (referenceScan) {
    checkReferenceOverrides(createBlocks, referenceScan, warnings, checks);
  }

  // Check 8: Auto-inference warnings
  checkAutoInference(createBlocks, warnings);

  // Check 9: FRAMEWORK without LNG warning
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

// ── Shallow conflict check (no resolved profiles) ──

function checkProfileConflicts(
  profileRefs: ProfileRef[],
  warnings: ValidationIssue[],
  checks: CheckResult[],
): void {
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

// ── Deep conflict check (with resolved profiles) ──

/** Known opposing rule pattern pairs */
const conflictPatterns: Array<{ a: RegExp; b: RegExp; desc: string }> = [
  {
    a: /split into layers|separate.*layer|layered architecture/i,
    b: /single file|monolith|one file|flat structure/i,
    desc: "Architecture conflict: layered vs single-file",
  },
  {
    a: /microservice/i,
    b: /monolith/i,
    desc: "Architecture conflict: microservices vs monolith",
  },
  {
    a: /composition over inheritance/i,
    b: /inherit|class hierarchy|extend base class/i,
    desc: "Design conflict: composition vs inheritance preference",
  },
  {
    a: /functional.*style|pure functions|immutable/i,
    b: /class-based|OOP|object-oriented/i,
    desc: "Paradigm conflict: functional vs object-oriented",
  },
  {
    a: /no framework|vanilla|framework-free/i,
    b: /use framework|framework required/i,
    desc: "Framework conflict: vanilla vs framework-based",
  },
];

function checkDeepProfileConflicts(
  profiles: ResolvedProfile[],
  warnings: ValidationIssue[],
  checks: CheckResult[],
): void {
  let hasConflict = false;

  // Check all pairs of profiles for conflicting rules
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const pA = profiles[i];
      const pB = profiles[j];

      for (const cp of conflictPatterns) {
        const aHasA = pA.rules.some(r => cp.a.test(r));
        const aHasB = pA.rules.some(r => cp.b.test(r));
        const bHasA = pB.rules.some(r => cp.a.test(r));
        const bHasB = pB.rules.some(r => cp.b.test(r));

        // Conflict: profile A has pattern A and profile B has pattern B (or vice versa)
        if ((aHasA && bHasB) || (aHasB && bHasA)) {
          hasConflict = true;
          warnings.push({
            severity: "warning",
            message: `${cp.desc}: ${pA.name} vs ${pB.name}`,
          });
        }
      }

      // Also check for directly contradicting rules (same topic, opposite instruction)
      checkRuleContradictions(pA, pB, warnings, () => { hasConflict = true; });
    }
  }

  // Check duplicate profiles
  const names = profiles.map(p => p.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    hasConflict = true;
    for (const d of new Set(dupes)) {
      warnings.push({
        severity: "warning",
        message: `Profile "${d}" referenced multiple times`,
      });
    }
  }

  checks.push({
    name: "No profile conflicts",
    passed: !hasConflict,
    message: hasConflict ? "Profile rule conflicts detected — review warnings" : undefined,
  });
}

/** Check if two profiles have contradicting "never X" vs "always X" rules */
function checkRuleContradictions(
  pA: ResolvedProfile,
  pB: ResolvedProfile,
  warnings: ValidationIssue[],
  onConflict: () => void,
): void {
  // Extract "never" and "always" rules
  const neverPattern = /^never\s+(.+)/i;
  const alwaysPattern = /^always\s+(.+)/i;

  for (const ruleA of pA.rules) {
    const neverMatch = ruleA.match(neverPattern);
    if (!neverMatch) continue;
    const topic = neverMatch[1].toLowerCase();

    for (const ruleB of pB.rules) {
      const alwaysMatch = ruleB.match(alwaysPattern);
      if (!alwaysMatch) continue;

      if (alwaysMatch[1].toLowerCase().includes(topic.slice(0, 15)) ||
          topic.includes(alwaysMatch[1].toLowerCase().slice(0, 15))) {
        onConflict();
        warnings.push({
          severity: "warning",
          message: `Rule contradiction: ${pA.name} says "never ${topic}" but ${pB.name} says "${ruleB}"`,
        });
      }
    }
  }

  // And the reverse
  for (const ruleA of pA.rules) {
    const alwaysMatch = ruleA.match(alwaysPattern);
    if (!alwaysMatch) continue;
    const topic = alwaysMatch[1].toLowerCase();

    for (const ruleB of pB.rules) {
      const neverMatch = ruleB.match(neverPattern);
      if (!neverMatch) continue;

      if (neverMatch[1].toLowerCase().includes(topic.slice(0, 15)) ||
          topic.includes(neverMatch[1].toLowerCase().slice(0, 15))) {
        onConflict();
        warnings.push({
          severity: "warning",
          message: `Rule contradiction: ${pA.name} says "always ${topic}" but ${pB.name} says "${ruleB}"`,
        });
      }
    }
  }
}

// ── Smart ON_REVIEW evaluation ──

/** Evaluate ON_REVIEW rules against the AST to produce actionable warnings */
function evaluateOnReview(
  profiles: ResolvedProfile[],
  blocks: CreateBlock[],
  warnings: ValidationIssue[],
  checks: CheckResult[],
): void {
  let issueCount = 0;

  for (const profile of profiles) {
    for (const rule of profile.onReview) {
      const ruleLower = rule.toLowerCase();

      // "Warn if any single file exceeds N lines" / "suggest splitting" / "more than N methods"
      if (ruleLower.includes("more than") && ruleLower.includes("method")) {
        const limitMatch = ruleLower.match(/more than (\d+) method/);
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 10;

        for (const block of blocks) {
          const methodCount = block.members.filter(m => m.kind === "MethodDecl").length;
          if (methodCount > limit) {
            warnings.push({
              severity: "warning",
              message: `${profile.name}: ${block.componentType}.${block.name} has ${methodCount} methods (limit: ${limit}) — consider splitting`,
            });
            issueCount++;
          }
        }
      }

      // "Flag any CREATE block without corresponding test generation"
      if (ruleLower.includes("without") && ruleLower.includes("test")) {
        // This is a plan-time check — flag as informational
        // (actual test generation happens during build, not transpilation)
      }

      // "Flag any endpoint without auth middleware"
      if (ruleLower.includes("without auth") || ruleLower.includes("no auth")) {
        for (const block of blocks) {
          if (block.componentType !== "API") continue;
          const publicMethods = block.members.filter(
            m => m.kind === "MethodDecl" && m.isPublic,
          );
          const totalMethods = block.members.filter(m => m.kind === "MethodDecl");

          // All methods are public = no auth at all
          if (publicMethods.length === totalMethods.length && totalMethods.length > 0) {
            warnings.push({
              severity: "warning",
              message: `${profile.name}: ${block.componentType}.${block.name} — all ${totalMethods.length} endpoint(s) are PUBLIC (no auth)`,
            });
            issueCount++;
          }
        }
      }

      // "Warn if no rate limiting" on POST endpoints
      if (ruleLower.includes("rate limit") && ruleLower.includes("post")) {
        for (const block of blocks) {
          if (block.componentType !== "API") continue;
          const postMethods = block.members.filter(
            m => m.kind === "MethodDecl" && m.httpMethod === "POST",
          );
          if (postMethods.length > 0) {
            warnings.push({
              severity: "warning",
              message: `${profile.name}: ${block.componentType}.${block.name} has ${postMethods.length} POST endpoint(s) — no rate limiting specified`,
            });
            issueCount++;
          }
        }
      }

      // "Flag circular dependencies" — already checked by cycle detection
      // "Warn if test files don't cover all defined methods" — build-time check
    }
  }

  checks.push({
    name: "ON_REVIEW evaluation",
    passed: issueCount === 0,
    message: issueCount > 0 ? `${issueCount} issue(s) flagged by profile reviews` : undefined,
  });
}

function checkAutoInference(
  blocks: CreateBlock[],
  warnings: ValidationIssue[],
): void {
  for (const block of blocks) {
    const hasLng = block.properties.some(p => p.kind === "LngProperty");
    const hasFramework = block.properties.some(p => p.kind === "FrameworkProperty");

    if (!hasLng && block.componentType !== "DB") {
      warnings.push({
        severity: "warning",
        message: `${block.componentType}.${block.name} has no LNG property — language will need to be inferred`,
        line: block.loc.line,
        column: block.loc.column,
      });
    }

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

// ── REFERENCE override detection ──

/** Normalized language names for matching */
const lngNormalize: Record<string, string[]> = {
  python: ["python"],
  javascript: ["javascript", "js"],
  typescript: ["typescript", "ts", "typescript (react)"],
  react: ["typescript (react)", "javascript (react)"],
  go: ["go"],
  rust: ["rust"],
  java: ["java"],
  ruby: ["ruby"],
  php: ["php"],
  postgresql: ["sql"],
  mysql: ["sql"],
  sqlite: ["sql"],
};

/** Normalized framework names for matching */
const fwNormalize: Record<string, string[]> = {
  nextjs: ["next.js", "next"],
  nuxt: ["nuxt"],
  angular: ["angular"],
  fastapi: ["fastapi"],
  flask: ["flask"],
  django: ["django"],
  express: ["express"],
  vite: ["vite"],
};

function checkReferenceOverrides(
  blocks: CreateBlock[],
  scan: ReferenceScan,
  warnings: ValidationIssue[],
  checks: CheckResult[],
): void {
  let hasOverride = false;
  const refLangs = scan.detectedStack.languages.map(l => l.toLowerCase());
  const refFrameworks = scan.detectedStack.frameworks.map(f => f.toLowerCase());

  for (const block of blocks) {
    const lngProp = block.properties.find(p => p.kind === "LngProperty");
    const fwProp = block.properties.find(p => p.kind === "FrameworkProperty");

    if (lngProp && lngProp.kind === "LngProperty") {
      const declaredLng = lngProp.value.toLowerCase();
      const expectedRefLangs = lngNormalize[declaredLng] ?? [declaredLng];

      // Check if the declared LNG exists at all in the reference codebase
      const found = expectedRefLangs.some(expected =>
        refLangs.some(rl => rl.includes(expected) || expected.includes(rl)),
      );

      if (!found && refLangs.length > 0) {
        hasOverride = true;
        warnings.push({
          severity: "warning",
          message: `REFERENCE override: ${block.componentType}.${block.name} declares LNG=${lngProp.value} but reference uses ${scan.detectedStack.languages.join(", ")}`,
          line: block.loc.line,
          column: block.loc.column,
        });
      }
    }

    if (fwProp && fwProp.kind === "FrameworkProperty") {
      const declaredFw = fwProp.value.toLowerCase();
      const expectedRefFws = fwNormalize[declaredFw] ?? [declaredFw];

      const found = expectedRefFws.some(expected =>
        refFrameworks.some(rf => rf.includes(expected) || expected.includes(rf)),
      );

      if (!found && refFrameworks.length > 0) {
        hasOverride = true;
        warnings.push({
          severity: "warning",
          message: `REFERENCE override: ${block.componentType}.${block.name} declares FRAMEWORK=${fwProp.value} but reference uses ${scan.detectedStack.frameworks.join(", ")}`,
          line: block.loc.line,
          column: block.loc.column,
        });
      }
    }
  }

  checks.push({
    name: "REFERENCE compatibility",
    passed: !hasOverride,
    message: hasOverride ? "Some components override the reference stack" : undefined,
  });
}
