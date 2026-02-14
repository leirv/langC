import { Token, TokenType } from "./tokens.js";
import { keywords } from "./keywords.js";

export interface LexerError {
  message: string;
  line: number;
  column: number;
}

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private errors: LexerError[] = [];

  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private startLine = 1;
  private startColumn = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): { tokens: Token[]; errors: LexerError[] } {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.startLine = this.line;
      this.startColumn = this.column;
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      lexeme: "",
      literal: null,
      line: this.line,
      column: this.column,
    });

    return { tokens: this.tokens, errors: this.errors };
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      case "{": this.addToken(TokenType.LeftBrace); break;
      case "}": this.addToken(TokenType.RightBrace); break;
      case "[": this.addToken(TokenType.LeftBracket); break;
      case "]": this.addToken(TokenType.RightBracket); break;
      case "(": this.addToken(TokenType.LeftParen); break;
      case ")": this.addToken(TokenType.RightParen); break;
      case ",": this.addToken(TokenType.Comma); break;
      case ":": this.addToken(TokenType.Colon); break;
      case ".": this.addToken(TokenType.Dot); break;
      case "@": this.addToken(TokenType.At); break;
      case "=": this.addToken(TokenType.Equals); break;

      case "+":
        if (this.match("=")) {
          this.addToken(TokenType.PlusEquals);
        } else {
          this.addError(`Unexpected character '+'`);
        }
        break;

      case "-":
        if (this.match(">")) {
          this.addToken(TokenType.Arrow);
        } else {
          this.addError(`Unexpected character '-'`);
        }
        break;

      case "/":
        if (this.match("/")) {
          // Line comment — skip to end of line
          while (!this.isAtEnd() && this.peek() !== "\n") {
            this.advance();
          }
        } else {
          this.addError(`Unexpected character '/'`);
        }
        break;

      case '"': this.scanString(); break;

      case " ":
      case "\r":
      case "\t":
        // Whitespace — skip
        break;

      case "\n":
        this.line++;
        this.column = 1;
        break;

      default:
        if (this.isDigit(c)) {
          this.scanNumber();
        } else if (this.isAlpha(c)) {
          this.scanIdentifier();
        } else {
          this.addError(`Unexpected character '${c}'`);
        }
        break;
    }
  }

  private scanString(): void {
    const startLine = this.startLine;
    const startCol = this.startColumn;

    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === "\n") {
        this.line++;
        this.column = 1;
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      this.errors.push({
        message: "Unterminated string",
        line: startLine,
        column: startCol,
      });
      return;
    }

    // Closing quote
    this.advance();

    const lexeme = this.source.slice(this.start, this.current);
    const value = this.source.slice(this.start + 1, this.current - 1);
    this.tokens.push({
      type: TokenType.StringLiteral,
      lexeme,
      literal: value,
      line: this.startLine,
      column: this.startColumn,
    });
  }

  private scanNumber(): void {
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      this.advance();
    }

    const lexeme = this.source.slice(this.start, this.current);
    this.tokens.push({
      type: TokenType.NumberLiteral,
      lexeme,
      literal: parseInt(lexeme, 10),
      line: this.startLine,
      column: this.startColumn,
    });
  }

  private scanIdentifier(): void {
    // Identifiers can contain alphanumeric, underscore, and hyphens
    // But hyphens must be followed by an alphanumeric (not at end, not before `>`)
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (this.isAlphaNumeric(ch) || ch === "_") {
        this.advance();
      } else if (ch === "-") {
        // Peek ahead: if next char after `-` is `>`, this is an arrow, stop
        const nextIdx = this.current + 1;
        if (nextIdx < this.source.length && this.source[nextIdx] === ">") {
          break;
        }
        // If next char is alphanumeric, it's a hyphenated identifier
        if (nextIdx < this.source.length && this.isAlphaNumeric(this.source[nextIdx])) {
          this.advance(); // consume `-`
          this.advance(); // consume next char
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const lexeme = this.source.slice(this.start, this.current);

    // Check if it's a keyword
    const type = keywords[lexeme] ?? TokenType.Identifier;
    this.tokens.push({
      type,
      lexeme,
      literal: null,
      line: this.startLine,
      column: this.startColumn,
    });
  }

  // --- Helpers ---

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    const ch = this.source[this.current];
    this.current++;
    this.column++;
    return ch;
  }

  private peek(): string {
    return this.source[this.current];
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source[this.current] !== expected) return false;
    this.current++;
    this.column++;
    return true;
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isDigit(c) || this.isAlpha(c);
  }

  private addToken(type: TokenType): void {
    const lexeme = this.source.slice(this.start, this.current);
    this.tokens.push({
      type,
      lexeme,
      literal: null,
      line: this.startLine,
      column: this.startColumn,
    });
  }

  private addError(message: string): void {
    this.errors.push({
      message,
      line: this.startLine,
      column: this.startColumn,
    });
  }
}
