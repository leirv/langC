import type { GeneratedFile, CompilationContext } from "./types.js";

export interface Generator {
  name: string;
  generate(ctx: CompilationContext): GeneratedFile[];
}
