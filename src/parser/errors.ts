export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export class ParseErrorCollector {
  errors: ParseError[] = [];

  add(message: string, line: number, column: number): void {
    this.errors.push({ message, line, column });
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
