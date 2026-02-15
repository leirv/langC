import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GeneratedFile } from "./types.js";

/**
 * Write generated files to disk under the given output directory.
 * This is the ONLY module that touches the filesystem.
 */
export function writeFiles(outputDir: string, files: GeneratedFile[]): void {
  for (const file of files) {
    const fullPath = join(outputDir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, "utf-8");
  }
}
