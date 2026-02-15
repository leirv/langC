import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import type { ImportDecl, ProfileDecl, ProfileRef } from "../ast/nodes.js";
import type { ResolvedProfile } from "./types.js";
import { builtinProfiles } from "./builtin-profiles.js";

export type FileReader = (path: string) => string;

/**
 * Resolves imports by reading and parsing FROM files.
 * Returns resolved profiles with EXTENDS flattened and EXCEPT applied.
 */
export function resolveImports(
  imports: ImportDecl[],
  inlineProfiles: ProfileDecl[],
  profileRefs: ProfileRef[],
  fileReader: FileReader,
  basePath: string,
): ResolvedProfile[] {
  // Build a map of all available profiles
  const profileMap = new Map<string, ProfileDecl>();

  // Build version map from imports
  const versionMap = new Map<string, string | null>();
  for (const imp of imports) {
    versionMap.set(imp.name, imp.version);
  }

  // Add inline profiles first
  for (const p of inlineProfiles) {
    profileMap.set(p.name, p);
  }

  // Resolve imports from files or built-in profiles
  for (const imp of imports) {
    if (imp.from) {
      const resolvedPath = resolvePath(basePath, imp.from);
      const profile = parseProfileFromFile(resolvedPath, imp.name, fileReader);
      if (profile) {
        profileMap.set(imp.name, profile);
      }
    } else {
      // No FROM path — look up built-in profiles
      const builtin = builtinProfiles.get(imp.name);
      if (builtin) {
        profileMap.set(imp.name, builtin);
      }
    }
  }

  // Resolve EXTENDS chains and flatten
  const resolved: ResolvedProfile[] = [];
  for (const ref of profileRefs) {
    const profile = profileMap.get(ref.name);
    if (!profile) continue;

    const flat = flattenProfile(profile, profileMap, new Set());
    const filtered = applyExcept(flat, ref.except);
    // Attach version from import
    filtered.version = versionMap.get(ref.name) ?? null;
    resolved.push(filtered);
  }

  return resolved;
}

function parseProfileFromFile(
  filePath: string,
  expectedName: string,
  fileReader: FileReader,
): ProfileDecl | null {
  let source: string;
  try {
    source = fileReader(filePath);
  } catch {
    return null;
  }

  const { tokens } = new Lexer(source).tokenize();
  const { ast } = new Parser(tokens).parse();

  for (const decl of ast.declarations) {
    if (decl.kind === "ProfileDecl" && decl.name === expectedName) {
      return decl;
    }
  }

  // If name doesn't match, return the first profile
  for (const decl of ast.declarations) {
    if (decl.kind === "ProfileDecl") {
      return { ...decl, name: expectedName };
    }
  }

  return null;
}

function flattenProfile(
  profile: ProfileDecl,
  allProfiles: Map<string, ProfileDecl>,
  visited: Set<string>,
): ResolvedProfile {
  if (visited.has(profile.name)) {
    // Cycle detected — return what we have
    return {
      name: profile.name,
      version: null,
      role: profile.role,
      rules: [...profile.rules],
      patterns: profile.patterns.map(p => ({
        componentType: p.componentType,
        pattern: p.pattern,
      })),
      onReview: [...profile.onReview],
    };
  }

  visited.add(profile.name);

  // Start with this profile's own data
  const result: ResolvedProfile = {
    name: profile.name,
    version: null,
    role: profile.role,
    rules: [],
    patterns: [],
    onReview: [],
  };

  // Merge parent profiles first (EXTENDS)
  if (profile.extends_ && profile.extends_.length > 0) {
    for (const parentName of profile.extends_) {
      const parent = allProfiles.get(parentName);
      if (parent) {
        const parentResolved = flattenProfile(parent, allProfiles, visited);
        result.rules.push(...parentResolved.rules);
        result.patterns.push(...parentResolved.patterns);
        result.onReview.push(...parentResolved.onReview);
        if (!result.role && parentResolved.role) {
          result.role = parentResolved.role;
        }
      }
    }
  }

  // Then add own rules (child overrides/adds)
  result.rules.push(...profile.rules);
  result.patterns.push(
    ...profile.patterns.map(p => ({
      componentType: p.componentType,
      pattern: p.pattern,
    })),
  );
  result.onReview.push(...profile.onReview);

  return result;
}

function applyExcept(
  profile: ResolvedProfile,
  except: string | null,
): ResolvedProfile {
  if (!except) return profile;

  return {
    ...profile,
    rules: profile.rules.filter(r =>
      !r.toLowerCase().includes(except.toLowerCase()),
    ),
  };
}

function resolvePath(basePath: string, relativePath: string): string {
  // Simple path resolution: join base directory with relative path
  const baseDir = basePath.replace(/[/\\][^/\\]*$/, "");
  // Normalize to forward slashes
  const combined = `${baseDir}/${relativePath}`.replace(/\\/g, "/");

  // Resolve ../ and ./
  const parts = combined.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join("/");
}

export { resolvePath, flattenProfile, applyExcept, parseProfileFromFile };
