import { Token, TokenType, Loc } from "../lexer/tokens.js";
import { ParseErrorCollector, ParseError } from "./errors.js";
import {
  Program, ImportDecl, Declaration, ProjectDecl, ProfileDecl,
  ProjectProperty, ScopeProperty, ReferenceProperty, ProfilesProperty,
  ProfileRef, Block, CreateBlock, UpdateBlock,
  ComponentType, ComponentProperty, ComponentMember,
  LngProperty, FrameworkProperty, DependsProperty, ProfilesAddProperty,
  MethodDecl, DisplayDecl, TableDecl, ColumnDecl,
  UpdateMember, AddMethodDecl, AddDisplayDecl, RemoveMethodDecl,
  QualifiedRef, PatternEntry,
} from "../ast/nodes.js";

export class Parser {
  private tokens: Token[];
  private current = 0;
  private collector = new ParseErrorCollector();

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): { ast: Program; errors: ParseError[] } {
    const loc = this.loc();
    const imports: ImportDecl[] = [];
    const declarations: Declaration[] = [];

    // Parse imports first
    while (!this.isAtEnd() && this.check(TokenType.IMPORT)) {
      const imp = this.parseImport();
      if (imp) imports.push(imp);
    }

    // Parse declarations (PROJECT or PROFILE)
    while (!this.isAtEnd()) {
      const decl = this.parseDeclaration();
      if (decl) declarations.push(decl);
    }

    return {
      ast: { kind: "Program", imports, declarations, loc },
      errors: this.collector.errors,
    };
  }

  // ── Imports ──

  private parseImport(): ImportDecl | null {
    const loc = this.loc();
    this.consume(TokenType.IMPORT, "Expected 'IMPORT'");

    const name = this.consumeIdentifierOrKeyword("Expected profile name after 'IMPORT'");
    if (!name) return null;

    // Optional @version
    let version: string | null = null;
    if (this.match(TokenType.At)) {
      const v = this.consumeIdentifierOrKeyword("Expected version after '@'");
      if (v) version = v;
    }

    // Optional FROM "path"
    let from: string | null = null;
    if (this.match(TokenType.FROM)) {
      const pathToken = this.consume(TokenType.StringLiteral, "Expected string after 'FROM'");
      if (pathToken) from = pathToken.literal as string;
    }

    this.optionalComma();
    return { kind: "ImportDecl", name, from, version, loc };
  }

  // ── Declarations ──

  private parseDeclaration(): Declaration | null {
    if (this.check(TokenType.PROJECT)) return this.parseProjectDecl();
    if (this.check(TokenType.PROFILE)) return this.parseProfileDecl();

    this.error(`Expected 'PROJECT' or 'PROFILE', got '${this.peek().lexeme}'`);
    this.synchronize();
    return null;
  }

  // ── PROJECT ──

  private parseProjectDecl(): ProjectDecl | null {
    const loc = this.loc();
    this.consume(TokenType.PROJECT, "Expected 'PROJECT'");

    const nameToken = this.consume(TokenType.StringLiteral, "Expected project name string");
    if (!nameToken) return null;
    const name = nameToken.literal as string;

    this.consume(TokenType.LeftBrace, "Expected '{' after project name");

    const properties: ProjectProperty[] = [];
    const blocks: Block[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      if (this.check(TokenType.SCOPE)) {
        const prop = this.parseScopeProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.REFERENCE)) {
        const prop = this.parseReferenceProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.PROFILES)) {
        const prop = this.parseProfilesProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.CREATE)) {
        const block = this.parseCreateBlock();
        if (block) blocks.push(block);
      } else if (this.check(TokenType.UPDATE)) {
        const block = this.parseUpdateBlock();
        if (block) blocks.push(block);
      } else {
        this.error(`Unexpected token '${this.peek().lexeme}' in project body`);
        this.advance();
      }
    }

    this.consume(TokenType.RightBrace, "Expected '}' to close project");
    return { kind: "ProjectDecl", name, properties, blocks, loc };
  }

  // ── Project properties ──

  private parseScopeProperty(): ScopeProperty | null {
    const loc = this.loc();
    this.advance(); // SCOPE
    this.consume(TokenType.Equals, "Expected '=' after SCOPE");
    const value = this.consumeIdentifierOrKeyword("Expected scope value");
    if (!value) return null;
    this.optionalComma();
    return { kind: "ScopeProperty", value, loc };
  }

  private parseReferenceProperty(): ReferenceProperty | null {
    const loc = this.loc();
    this.advance(); // REFERENCE
    this.consume(TokenType.Equals, "Expected '=' after REFERENCE");

    let value: string;
    if (this.check(TokenType.None)) {
      value = "none";
      this.advance();
    } else if (this.check(TokenType.StringLiteral)) {
      value = this.advance().literal as string;
    } else {
      this.error("Expected string or 'none' for REFERENCE value");
      return null;
    }

    this.optionalComma();
    return { kind: "ReferenceProperty", value, loc };
  }

  private parseProfilesProperty(): ProfilesProperty | null {
    const loc = this.loc();
    this.advance(); // PROFILES

    // PROFILES = [...] or PROFILES += [...]
    if (this.match(TokenType.PlusEquals) || this.match(TokenType.Equals)) {
      // handled
    } else {
      this.error("Expected '=' or '+=' after PROFILES");
      return null;
    }

    this.consume(TokenType.LeftBracket, "Expected '[' for profiles list");
    const names = this.parseProfileRefList();
    this.consume(TokenType.RightBracket, "Expected ']' to close profiles list");
    this.optionalComma();
    return { kind: "ProfilesProperty", names, loc };
  }

  private parseProfileRefList(): ProfileRef[] {
    const refs: ProfileRef[] = [];
    while (!this.isAtEnd() && !this.check(TokenType.RightBracket)) {
      const loc = this.loc();
      const name = this.consumeIdentifierOrKeyword("Expected profile name");
      if (!name) break;

      let except: string | null = null;
      if (this.match(TokenType.LeftParen)) {
        this.consume(TokenType.EXCEPT, "Expected 'EXCEPT'");
        this.consume(TokenType.Equals, "Expected '='");
        const excToken = this.consume(TokenType.StringLiteral, "Expected exception string");
        if (excToken) except = excToken.literal as string;
        this.consume(TokenType.RightParen, "Expected ')'");
      }

      refs.push({ kind: "ProfileRef", name, except, loc });
      this.optionalComma();
    }
    return refs;
  }

  // ── CREATE block ──

  private parseCreateBlock(): CreateBlock | null {
    const loc = this.loc();
    this.advance(); // CREATE

    const componentType = this.parseComponentType();
    if (!componentType) return null;

    const nameToken = this.consume(TokenType.StringLiteral, "Expected component name string");
    if (!nameToken) return null;
    const name = nameToken.literal as string;

    this.consume(TokenType.LeftBrace, "Expected '{' after component name");

    const properties: ComponentProperty[] = [];
    const members: ComponentMember[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      if (this.check(TokenType.LNG)) {
        const prop = this.parseLngProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.FRAMEWORK)) {
        const prop = this.parseFrameworkProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.SCOPE)) {
        const prop = this.parseScopeProperty() as ComponentProperty;
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.DEPENDS)) {
        const prop = this.parseDependsProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.PROFILES)) {
        const prop = this.parseProfilesAddProperty();
        if (prop) properties.push(prop);
      } else if (this.check(TokenType.METHOD) || this.check(TokenType.PUBLIC)) {
        const m = this.parseMethodDecl();
        if (m) members.push(m);
      } else if (this.check(TokenType.DISPLAY)) {
        const d = this.parseDisplayDecl();
        if (d) members.push(d);
      } else if (this.check(TokenType.TABLE)) {
        const t = this.parseTableDecl();
        if (t) members.push(t);
      } else {
        this.error(`Unexpected token '${this.peek().lexeme}' in CREATE block`);
        this.advance();
      }
    }

    this.consume(TokenType.RightBrace, "Expected '}' to close CREATE block");
    this.optionalComma();
    return { kind: "CreateBlock", componentType, name, properties, members, loc };
  }

  private parseComponentType(): ComponentType | null {
    const tok = this.peek();
    switch (tok.type) {
      case TokenType.DB: this.advance(); return "DB";
      case TokenType.API: this.advance(); return "API";
      case TokenType.WEBUI: this.advance(); return "WEBUI";
      case TokenType.FNC: this.advance(); return "FNC";
      default:
        this.error(`Expected component type (DB, API, WEBUI, FNC), got '${tok.lexeme}'`);
        return null;
    }
  }

  // ── Component properties ──

  private parseLngProperty(): LngProperty | null {
    const loc = this.loc();
    this.advance(); // LNG
    this.consume(TokenType.Equals, "Expected '=' after LNG");
    const value = this.consumeIdentifierOrKeyword("Expected language value");
    if (!value) return null;
    this.optionalComma();
    return { kind: "LngProperty", value, loc };
  }

  private parseFrameworkProperty(): FrameworkProperty | null {
    const loc = this.loc();
    this.advance(); // FRAMEWORK
    this.consume(TokenType.Equals, "Expected '=' after FRAMEWORK");
    const value = this.consumeIdentifierOrKeyword("Expected framework value");
    if (!value) return null;
    this.optionalComma();
    return { kind: "FrameworkProperty", value, loc };
  }

  private parseDependsProperty(): DependsProperty | null {
    const loc = this.loc();
    this.advance(); // DEPENDS
    this.consume(TokenType.Equals, "Expected '=' after DEPENDS");

    if (this.check(TokenType.None)) {
      this.advance();
      this.optionalComma();
      return { kind: "DependsProperty", refs: [], loc };
    }

    this.consume(TokenType.LeftBracket, "Expected '[' or 'none' for DEPENDS");
    const refs: QualifiedRef[] = [];
    while (!this.isAtEnd() && !this.check(TokenType.RightBracket)) {
      const ref = this.parseQualifiedRef();
      if (ref) refs.push(ref);
      this.optionalComma();
    }
    this.consume(TokenType.RightBracket, "Expected ']' to close DEPENDS list");
    this.optionalComma();
    return { kind: "DependsProperty", refs, loc };
  }

  private parseProfilesAddProperty(): ProfilesAddProperty | null {
    const loc = this.loc();
    this.advance(); // PROFILES
    this.consume(TokenType.PlusEquals, "Expected '+=' after PROFILES in block scope");
    this.consume(TokenType.LeftBracket, "Expected '[' for profiles list");
    const names = this.parseProfileRefList();
    this.consume(TokenType.RightBracket, "Expected ']' to close profiles list");
    this.optionalComma();
    return { kind: "ProfilesAddProperty", names, loc };
  }

  // ── METHOD ──

  private parseMethodDecl(): MethodDecl | null {
    const loc = this.loc();
    let isPublic = false;

    // PUBLIC can come before or after METHOD: `PUBLIC METHOD GET` or `METHOD PUBLIC GET`
    if (this.check(TokenType.PUBLIC)) {
      isPublic = true;
      this.advance();
    }

    this.consume(TokenType.METHOD, "Expected 'METHOD'");

    if (!isPublic && this.check(TokenType.PUBLIC)) {
      isPublic = true;
      this.advance();
    }

    const httpMethod = this.parseHttpMethod();
    if (!httpMethod) return null;

    const pathToken = this.consume(TokenType.StringLiteral, "Expected path string");
    if (!pathToken) return null;
    const path = pathToken.literal as string;

    this.consume(TokenType.Arrow, "Expected '->' after path");

    const descToken = this.consume(TokenType.StringLiteral, "Expected description string");
    if (!descToken) return null;
    const description = descToken.literal as string;

    this.optionalComma();
    return { kind: "MethodDecl", isPublic, httpMethod, path, description, loc };
  }

  private parseHttpMethod(): string | null {
    const tok = this.peek();
    switch (tok.type) {
      case TokenType.GET:
      case TokenType.POST:
      case TokenType.PUT:
      case TokenType.DELETE:
      case TokenType.PATCH:
        return this.advance().lexeme;
      default:
        this.error(`Expected HTTP method (GET, POST, PUT, DELETE, PATCH), got '${tok.lexeme}'`);
        return null;
    }
  }

  // ── DISPLAY ──

  private parseDisplayDecl(): DisplayDecl | null {
    const loc = this.loc();
    this.advance(); // DISPLAY

    const target = this.parseQualifiedRef();
    if (!target) return null;

    // Optional path in parens: API.users.GET("/users")
    let path: string | null = null;
    if (this.match(TokenType.LeftParen)) {
      const pathToken = this.consume(TokenType.StringLiteral, "Expected path string");
      if (pathToken) path = pathToken.literal as string;
      this.consume(TokenType.RightParen, "Expected ')'");
    }

    this.consume(TokenType.Arrow, "Expected '->'");
    const descToken = this.consume(TokenType.StringLiteral, "Expected description string");
    if (!descToken) return null;
    const description = descToken.literal as string;

    this.optionalComma();
    return { kind: "DisplayDecl", target, path, description, loc };
  }

  // ── TABLE ──

  private parseTableDecl(): TableDecl | null {
    const loc = this.loc();
    this.advance(); // TABLE

    const nameToken = this.consume(TokenType.StringLiteral, "Expected table name string");
    if (!nameToken) return null;
    const name = nameToken.literal as string;

    this.consume(TokenType.LeftBrace, "Expected '{' after table name");

    const columns: ColumnDecl[] = [];
    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      const col = this.parseColumnDecl();
      if (col) columns.push(col);
    }

    this.consume(TokenType.RightBrace, "Expected '}' to close TABLE");
    this.optionalComma();
    return { kind: "TableDecl", name, columns, loc };
  }

  private parseColumnDecl(): ColumnDecl | null {
    const loc = this.loc();
    const name = this.consumeIdentifierOrKeyword("Expected column name");
    if (!name) return null;

    this.consume(TokenType.Colon, "Expected ':' after column name");

    const dataType = this.consumeIdentifierOrKeyword("Expected data type");
    if (!dataType) return null;

    let description: string | null = null;
    if (this.match(TokenType.Arrow)) {
      const descToken = this.consume(TokenType.StringLiteral, "Expected column description");
      if (descToken) description = descToken.literal as string;
    }

    this.optionalComma();
    return { kind: "ColumnDecl", name, dataType, description, loc };
  }

  // ── UPDATE block ──

  private parseUpdateBlock(): UpdateBlock | null {
    const loc = this.loc();
    this.advance(); // UPDATE

    const target = this.parseQualifiedRef();
    if (!target) return null;

    this.consume(TokenType.LeftBrace, "Expected '{' after update target");

    const members: UpdateMember[] = [];
    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      if (this.check(TokenType.ADD)) {
        const m = this.parseAddMember();
        if (m) members.push(m);
      } else if (this.check(TokenType.REMOVE)) {
        const m = this.parseRemoveMember();
        if (m) members.push(m);
      } else {
        this.error(`Expected 'ADD' or 'REMOVE' in UPDATE block, got '${this.peek().lexeme}'`);
        this.advance();
      }
    }

    this.consume(TokenType.RightBrace, "Expected '}' to close UPDATE block");
    this.optionalComma();
    return { kind: "UpdateBlock", target, members, loc };
  }

  private parseAddMember(): UpdateMember | null {
    const loc = this.loc();
    this.advance(); // ADD

    if (this.check(TokenType.METHOD) || this.check(TokenType.PUBLIC)) {
      const method = this.parseMethodDecl();
      if (!method) return null;
      return { kind: "AddMethodDecl", method, loc };
    }

    if (this.check(TokenType.DISPLAY)) {
      const display = this.parseDisplayDecl();
      if (!display) return null;
      return { kind: "AddDisplayDecl", display, loc };
    }

    this.error(`Expected 'METHOD' or 'DISPLAY' after 'ADD', got '${this.peek().lexeme}'`);
    return null;
  }

  private parseRemoveMember(): RemoveMethodDecl | null {
    const loc = this.loc();
    this.advance(); // REMOVE
    this.consume(TokenType.METHOD, "Expected 'METHOD' after 'REMOVE'");

    const httpMethod = this.parseHttpMethod();
    if (!httpMethod) return null;

    const pathToken = this.consume(TokenType.StringLiteral, "Expected path string");
    if (!pathToken) return null;

    this.optionalComma();
    return { kind: "RemoveMethodDecl", httpMethod, path: pathToken.literal as string, loc };
  }

  // ── PROFILE declaration ──

  private parseProfileDecl(): ProfileDecl | null {
    const loc = this.loc();
    this.advance(); // PROFILE

    const name = this.consumeIdentifierOrKeyword("Expected profile name");
    if (!name) return null;

    this.consume(TokenType.LeftBrace, "Expected '{' after profile name");

    let role: string | null = null;
    let extends_: string[] | null = null;
    const rules: string[] = [];
    const patterns: PatternEntry[] = [];
    const onReview: string[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      if (this.check(TokenType.ROLE)) {
        this.advance();
        this.consume(TokenType.Equals, "Expected '=' after ROLE");
        const roleToken = this.consume(TokenType.StringLiteral, "Expected role string");
        if (roleToken) role = roleToken.literal as string;
        this.optionalComma();
      } else if (this.check(TokenType.EXTENDS)) {
        this.advance();
        this.consume(TokenType.Equals, "Expected '=' after EXTENDS");
        this.consume(TokenType.LeftBracket, "Expected '['");
        extends_ = [];
        while (!this.isAtEnd() && !this.check(TokenType.RightBracket)) {
          const n = this.consumeIdentifierOrKeyword("Expected profile name");
          if (n) extends_.push(n);
          this.optionalComma();
        }
        this.consume(TokenType.RightBracket, "Expected ']'");
        this.optionalComma();
      } else if (this.check(TokenType.RULES)) {
        this.advance();
        this.consume(TokenType.LeftBrace, "Expected '{'");
        while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
          const s = this.consume(TokenType.StringLiteral, "Expected rule string");
          if (s) rules.push(s.literal as string);
          this.optionalComma();
        }
        this.consume(TokenType.RightBrace, "Expected '}'");
        this.optionalComma();
      } else if (this.check(TokenType.PATTERNS)) {
        this.advance();
        this.consume(TokenType.LeftBrace, "Expected '{'");
        while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
          const pLoc = this.loc();
          const compType = this.consumeIdentifierOrKeyword("Expected component type");
          if (!compType) break;
          this.consume(TokenType.Arrow, "Expected '->'");
          const patToken = this.consume(TokenType.StringLiteral, "Expected pattern string");
          if (patToken) {
            patterns.push({
              kind: "PatternEntry",
              componentType: compType,
              pattern: patToken.literal as string,
              loc: pLoc,
            });
          }
          this.optionalComma();
        }
        this.consume(TokenType.RightBrace, "Expected '}'");
        this.optionalComma();
      } else if (this.check(TokenType.ON_REVIEW)) {
        this.advance();
        this.consume(TokenType.LeftBrace, "Expected '{'");
        while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
          const s = this.consume(TokenType.StringLiteral, "Expected review string");
          if (s) onReview.push(s.literal as string);
          this.optionalComma();
        }
        this.consume(TokenType.RightBrace, "Expected '}'");
        this.optionalComma();
      } else {
        this.error(`Unexpected token '${this.peek().lexeme}' in PROFILE body`);
        this.advance();
      }
    }

    this.consume(TokenType.RightBrace, "Expected '}' to close PROFILE");
    return { kind: "ProfileDecl", name, role, extends_, rules, patterns, onReview, loc };
  }

  // ── Qualified references ──

  parseQualifiedRef(): QualifiedRef | null {
    const loc = this.loc();
    const first = this.consumeIdentifierOrKeyword("Expected identifier");
    if (!first) return null;

    const parts: string[] = [first];
    while (this.match(TokenType.Dot)) {
      const part = this.consumeIdentifierOrKeyword("Expected identifier after '.'");
      if (!part) break;
      parts.push(part);
    }

    return { kind: "QualifiedRef", parts, loc };
  }

  // ── Helpers ──

  private peek(): Token {
    return this.tokens[this.current];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1];
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token | null {
    if (this.check(type)) return this.advance();
    this.error(message);
    return null;
  }

  /**
   * Consume the current token as an identifier. Keywords are allowed in
   * identifier position (for qualified refs like API.users.GET).
   */
  private consumeIdentifierOrKeyword(message: string): string | null {
    const tok = this.peek();
    // Accept identifiers and any keyword token
    if (tok.type === TokenType.Identifier || tok.type === TokenType.StringLiteral) {
      this.advance();
      return tok.type === TokenType.StringLiteral ? (tok.literal as string) : tok.lexeme;
    }
    // Accept any keyword as identifier
    if (this.isKeywordToken(tok.type)) {
      this.advance();
      return tok.lexeme;
    }
    this.error(message);
    return null;
  }

  private isKeywordToken(type: TokenType): boolean {
    const keywordTypes = [
      TokenType.IMPORT, TokenType.FROM, TokenType.PROJECT, TokenType.PROFILE,
      TokenType.CREATE, TokenType.UPDATE, TokenType.ADD, TokenType.REMOVE,
      TokenType.METHOD, TokenType.DISPLAY, TokenType.TABLE,
      TokenType.DB, TokenType.API, TokenType.WEBUI, TokenType.FNC,
      TokenType.LNG, TokenType.FRAMEWORK, TokenType.SCOPE, TokenType.REFERENCE,
      TokenType.DEPENDS, TokenType.PROFILES, TokenType.ROLE, TokenType.RULES,
      TokenType.PATTERNS, TokenType.ON_REVIEW, TokenType.EXTENDS, TokenType.EXCEPT,
      TokenType.PUBLIC, TokenType.GET, TokenType.POST, TokenType.PUT,
      TokenType.DELETE, TokenType.PATCH,
      TokenType.None, TokenType.Full, TokenType.Skeleton, TokenType.Prototype,
      TokenType.Auto, TokenType.Update,
    ];
    return keywordTypes.includes(type);
  }

  private optionalComma(): void {
    this.match(TokenType.Comma);
  }

  private loc(): Loc {
    const tok = this.peek();
    return { line: tok.line, column: tok.column };
  }

  private error(message: string): void {
    const tok = this.peek();
    this.collector.add(message, tok.line, tok.column);
  }

  /** Panic-mode recovery: skip to next '}' or top-level keyword */
  private synchronize(): void {
    while (!this.isAtEnd()) {
      const tok = this.peek();
      if (tok.type === TokenType.RightBrace) {
        this.advance();
        return;
      }
      if (
        tok.type === TokenType.PROJECT ||
        tok.type === TokenType.PROFILE ||
        tok.type === TokenType.CREATE ||
        tok.type === TokenType.UPDATE ||
        tok.type === TokenType.IMPORT
      ) {
        return;
      }
      this.advance();
    }
  }
}
