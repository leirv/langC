import type { LexerError } from "../lexer/lexer.js";
import type { ParseError } from "../parser/errors.js";

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}

export function formatDiagnostics(
  file: string,
  lexerErrors: LexerError[],
  parseErrors: ParseError[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const err of lexerErrors) {
    diagnostics.push({ file, line: err.line, column: err.column, message: err.message });
  }
  for (const err of parseErrors) {
    diagnostics.push({ file, line: err.line, column: err.column, message: err.message });
  }

  // Sort by line, then column
  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return diagnostics;
}

export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    console.error(`${d.file}:${d.line}:${d.column}  error: ${d.message}`);
  }
}
