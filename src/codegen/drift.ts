import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeChecksum } from "./checksum.js";

/**
 * Drift detection — compares the stored state.json checksums against
 * actual generated file contents to detect external modifications.
 */

export interface DriftResult {
  hasDrift: boolean;
  drifted: DriftedComponent[];
  clean: string[];
  missing: string[];
}

export interface DriftedComponent {
  id: string;
  expectedChecksum: string;
  actualChecksum: string;
  path: string;
}

interface StateJson {
  components: Record<string, {
    checksum: string;
    status: string;
    path?: string;
  }>;
  phases?: string[][];
}

/**
 * Detect drift by comparing state.json checksums against generated SKILL.md files.
 * When a SKILL.md has been hand-edited, its content checksum won't match the stored one.
 */
export function detectDrift(outputDir: string): DriftResult {
  const statePath = join(outputDir, ".langc", "state.json");

  if (!existsSync(statePath)) {
    return { hasDrift: false, drifted: [], clean: [], missing: [] };
  }

  let state: StateJson;
  try {
    state = JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return { hasDrift: false, drifted: [], clean: [], missing: [] };
  }

  const drifted: DriftedComponent[] = [];
  const clean: string[] = [];
  const missing: string[] = [];

  for (const [id, comp] of Object.entries(state.components)) {
    // Find the corresponding SKILL.md
    const [type, name] = id.split(".");
    const skillPath = join(
      outputDir,
      ".claude",
      "skills",
      `build-${type.toLowerCase()}-${name}`,
      "SKILL.md",
    );

    if (!existsSync(skillPath)) {
      missing.push(id);
      continue;
    }

    const content = readFileSync(skillPath, "utf-8");
    const actualChecksum = computeChecksum(content);

    // Compare against stored checksum of the SKILL content
    // We store the source block checksum in state.json, not the file checksum.
    // So we store a separate "fileChecksum" field for drift detection.
    // For now, we check if a .langc/checksums/<id>.checksum file exists
    const checksumFile = join(outputDir, ".langc", "checksums", `${id}.checksum`);
    if (existsSync(checksumFile)) {
      const storedFileChecksum = readFileSync(checksumFile, "utf-8").trim();
      if (actualChecksum !== storedFileChecksum) {
        drifted.push({
          id,
          expectedChecksum: storedFileChecksum,
          actualChecksum,
          path: skillPath,
        });
      } else {
        clean.push(id);
      }
    } else {
      // No checksum file yet — first compile, assume clean
      clean.push(id);
    }
  }

  return {
    hasDrift: drifted.length > 0,
    drifted,
    clean,
    missing,
  };
}

/**
 * Format drift results for CLI display.
 */
export function formatDriftReport(result: DriftResult): string[] {
  const lines: string[] = [];

  if (!result.hasDrift && result.missing.length === 0) {
    lines.push("No drift detected — all generated files match.");
    return lines;
  }

  if (result.drifted.length > 0) {
    lines.push(`Drift detected in ${result.drifted.length} component(s):`);
    for (const d of result.drifted) {
      lines.push(`  ${d.id}: modified externally (${d.path})`);
    }
  }

  if (result.missing.length > 0) {
    lines.push(`Missing files for ${result.missing.length} component(s):`);
    for (const m of result.missing) {
      lines.push(`  ${m}: SKILL.md not found`);
    }
  }

  return lines;
}
