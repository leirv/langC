export enum TokenType {
  // Literals
  Identifier = "Identifier",
  StringLiteral = "StringLiteral",
  NumberLiteral = "NumberLiteral",

  // Keywords
  IMPORT = "IMPORT",
  FROM = "FROM",
  PROJECT = "PROJECT",
  PROFILE = "PROFILE",
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  ADD = "ADD",
  REMOVE = "REMOVE",
  METHOD = "METHOD",
  DISPLAY = "DISPLAY",
  TABLE = "TABLE",
  DB = "DB",
  API = "API",
  WEBUI = "WEBUI",
  FNC = "FNC",
  LNG = "LNG",
  FRAMEWORK = "FRAMEWORK",
  SCOPE = "SCOPE",
  REFERENCE = "REFERENCE",
  DEPENDS = "DEPENDS",
  PROFILES = "PROFILES",
  ROLE = "ROLE",
  RULES = "RULES",
  PATTERNS = "PATTERNS",
  ON_REVIEW = "ON_REVIEW",
  EXTENDS = "EXTENDS",
  EXCEPT = "EXCEPT",
  PUBLIC = "PUBLIC",

  // HTTP methods (used in METHOD declarations)
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",

  GATE = "GATE",
  CTX = "CTX",

  // Special identifiers
  None = "none",
  Full = "full",
  Skeleton = "skeleton",
  Prototype = "prototype",
  Auto = "auto",
  Update = "update",

  // Punctuation
  LeftBrace = "LeftBrace",       // {
  RightBrace = "RightBrace",     // }
  LeftBracket = "LeftBracket",   // [
  RightBracket = "RightBracket", // ]
  LeftParen = "LeftParen",       // (
  RightParen = "RightParen",     // )
  Equals = "Equals",             // =
  Comma = "Comma",               // ,
  Colon = "Colon",               // :
  Dot = "Dot",                   // .
  Arrow = "Arrow",               // ->
  PlusEquals = "PlusEquals",     // +=
  At = "At",                     // @

  // Special
  EOF = "EOF",
  Error = "Error",
}

export interface Token {
  type: TokenType;
  lexeme: string;
  literal: string | number | null;
  line: number;
  column: number;
}

export interface Loc {
  line: number;
  column: number;
}
