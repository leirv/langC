/**
 * CLI formatting utilities for box-style output.
 */

const BOX_WIDTH = 55;

export function boxTop(title: string): string {
  const pad = BOX_WIDTH - 4 - title.length;
  return `╔═ ${title} ${"═".repeat(Math.max(0, pad))}╗`;
}

export function boxBottom(): string {
  return `╚${"═".repeat(BOX_WIDTH - 2)}╝`;
}

export function boxSep(): string {
  return `╠${"═".repeat(BOX_WIDTH - 2)}╣`;
}

export function boxLine(text: string): string {
  const padLen = BOX_WIDTH - 4 - text.length;
  return `║ ${text}${" ".repeat(Math.max(0, padLen))} ║`;
}

export function boxEmpty(): string {
  return boxLine("");
}

export function checkMark(passed: boolean): string {
  return passed ? "✓" : "✗";
}

export function warnMark(): string {
  return "⚠";
}
