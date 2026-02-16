import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { TokenType } from "../src/lexer/tokens.js";

function lex(source: string) {
  return new Lexer(source).tokenize();
}

function types(source: string): TokenType[] {
  const { tokens } = lex(source);
  return tokens.map(t => t.type).filter(t => t !== TokenType.EOF);
}

describe("Lexer", () => {
  describe("single tokens", () => {
    it("punctuation", () => {
      expect(types("{ } [ ] ( ) = , : . @")).toEqual([
        TokenType.LeftBrace, TokenType.RightBrace,
        TokenType.LeftBracket, TokenType.RightBracket,
        TokenType.LeftParen, TokenType.RightParen,
        TokenType.Equals, TokenType.Comma, TokenType.Colon,
        TokenType.Dot, TokenType.At,
      ]);
    });

    it("arrow ->", () => {
      expect(types("->")).toEqual([TokenType.Arrow]);
    });

    it("plus-equals +=", () => {
      expect(types("+=")).toEqual([TokenType.PlusEquals]);
    });

    it("string literal", () => {
      const { tokens } = lex('"hello world"');
      expect(tokens[0].type).toBe(TokenType.StringLiteral);
      expect(tokens[0].literal).toBe("hello world");
    });

    it("number literal", () => {
      const { tokens } = lex("42");
      expect(tokens[0].type).toBe(TokenType.NumberLiteral);
      expect(tokens[0].literal).toBe(42);
    });
  });

  describe("keywords", () => {
    it("recognizes all keywords", () => {
      expect(types("PROJECT")).toEqual([TokenType.PROJECT]);
      expect(types("PROFILE")).toEqual([TokenType.PROFILE]);
      expect(types("CREATE")).toEqual([TokenType.CREATE]);
      expect(types("UPDATE")).toEqual([TokenType.UPDATE]);
      expect(types("METHOD")).toEqual([TokenType.METHOD]);
      expect(types("GET")).toEqual([TokenType.GET]);
      expect(types("POST")).toEqual([TokenType.POST]);
      expect(types("TABLE")).toEqual([TokenType.TABLE]);
      expect(types("IMPORT")).toEqual([TokenType.IMPORT]);
      expect(types("FROM")).toEqual([TokenType.FROM]);
      expect(types("DISPLAY")).toEqual([TokenType.DISPLAY]);
      expect(types("ON_REVIEW")).toEqual([TokenType.ON_REVIEW]);
      expect(types("none")).toEqual([TokenType.None]);
      expect(types("full")).toEqual([TokenType.Full]);
      expect(types("CTX")).toEqual([TokenType.CTX]);
    });
  });

  describe("identifiers", () => {
    it("simple identifier", () => {
      const { tokens } = lex("myVar");
      expect(tokens[0].type).toBe(TokenType.Identifier);
      expect(tokens[0].lexeme).toBe("myVar");
    });

    it("hyphenated identifier", () => {
      const { tokens } = lex("users-db");
      expect(tokens[0].type).toBe(TokenType.Identifier);
      expect(tokens[0].lexeme).toBe("users-db");
    });

    it("hyphenated identifier with multiple hyphens", () => {
      const { tokens } = lex("my-cool-service");
      expect(tokens[0].type).toBe(TokenType.Identifier);
      expect(tokens[0].lexeme).toBe("my-cool-service");
    });
  });

  describe("edge cases", () => {
    it("arrow vs hyphen: identifier followed by arrow", () => {
      const toks = types('name -> "desc"');
      expect(toks).toEqual([
        TokenType.Identifier, TokenType.Arrow, TokenType.StringLiteral,
      ]);
    });

    it("dot-separated identifiers", () => {
      const toks = types("API.users.GET");
      expect(toks).toEqual([
        TokenType.API, TokenType.Dot, TokenType.Identifier,
        TokenType.Dot, TokenType.GET,
      ]);
    });

    it("comments are skipped", () => {
      const toks = types("PROJECT // this is a comment\n\"name\"");
      expect(toks).toEqual([TokenType.PROJECT, TokenType.StringLiteral]);
    });

    it("unterminated string produces error", () => {
      const { errors } = lex('"unterminated');
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Unterminated string");
    });

    it("tracks line and column", () => {
      const { tokens } = lex("A\nB\n  C");
      expect(tokens[0]).toMatchObject({ lexeme: "A", line: 1, column: 1 });
      expect(tokens[1]).toMatchObject({ lexeme: "B", line: 2, column: 1 });
      expect(tokens[2]).toMatchObject({ lexeme: "C", line: 3, column: 3 });
    });
  });

  describe("full file tokenization", () => {
    it("tokenizes a CREATE block", () => {
      const source = `CREATE API "users" {
  LNG = python,
  METHOD GET "/users" -> "list users"
}`;
      const { tokens, errors } = lex(source);
      expect(errors).toHaveLength(0);
      const toks = tokens.filter(t => t.type !== TokenType.EOF);
      expect(toks.map(t => t.type)).toEqual([
        TokenType.CREATE, TokenType.API, TokenType.StringLiteral,
        TokenType.LeftBrace,
        TokenType.LNG, TokenType.Equals, TokenType.Identifier, TokenType.Comma,
        TokenType.METHOD, TokenType.GET, TokenType.StringLiteral,
        TokenType.Arrow, TokenType.StringLiteral,
        TokenType.RightBrace,
      ]);
    });
  });
});
