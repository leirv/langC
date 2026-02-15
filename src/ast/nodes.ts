import type { Loc } from "../lexer/tokens.js";

// ── Top-level ──

export interface Program {
  kind: "Program";
  imports: ImportDecl[];
  declarations: Declaration[];
  loc: Loc;
}

export type Declaration = ProjectDecl | ProfileDecl;

// ── Imports ──

export interface ImportDecl {
  kind: "ImportDecl";
  name: string;
  from: string | null; // null = built-in, string = file path
  version: string | null; // @v2
  loc: Loc;
}

// ── Project ──

export interface ProjectDecl {
  kind: "ProjectDecl";
  name: string;
  properties: ProjectProperty[];
  blocks: Block[];
  loc: Loc;
}

export type ProjectProperty = ScopeProperty | ReferenceProperty | ProfilesProperty | GateProperty;

export interface ScopeProperty {
  kind: "ScopeProperty";
  value: string; // full | skeleton | prototype | update
  loc: Loc;
}

export interface ReferenceProperty {
  kind: "ReferenceProperty";
  value: string; // path or "none"
  loc: Loc;
}

export interface ProfilesProperty {
  kind: "ProfilesProperty";
  names: ProfileRef[];
  loc: Loc;
}

export interface GateProperty {
  kind: "GateProperty";
  value: string; // manual | phase-by-phase | auto | confirm-on-warning
  loc: Loc;
}

export interface ProfileRef {
  kind: "ProfileRef";
  name: string;
  except: string | null; // EXCEPT = "auth"
  loc: Loc;
}

// ── Blocks (inside PROJECT) ──

export type Block = CreateBlock | UpdateBlock;

export interface CreateBlock {
  kind: "CreateBlock";
  componentType: ComponentType;
  name: string;
  properties: ComponentProperty[];
  members: ComponentMember[];
  loc: Loc;
}

export interface UpdateBlock {
  kind: "UpdateBlock";
  target: QualifiedRef;
  members: UpdateMember[];
  loc: Loc;
}

export type ComponentType = "DB" | "API" | "WEBUI" | "FNC";

// ── Component properties (inside CREATE/UPDATE) ──

export type ComponentProperty =
  | LngProperty
  | FrameworkProperty
  | ScopeProperty
  | DependsProperty
  | ProfilesAddProperty;

export interface LngProperty {
  kind: "LngProperty";
  value: string;
  loc: Loc;
}

export interface FrameworkProperty {
  kind: "FrameworkProperty";
  value: string;
  loc: Loc;
}

export interface DependsProperty {
  kind: "DependsProperty";
  refs: QualifiedRef[];
  loc: Loc;
}

export interface ProfilesAddProperty {
  kind: "ProfilesAddProperty";
  names: ProfileRef[];
  loc: Loc;
}

// ── Members (inside CREATE blocks) ──

export type ComponentMember = MethodDecl | DisplayDecl | TableDecl;

// ── METHOD GET "/users" -> "description" ──

export interface MethodDecl {
  kind: "MethodDecl";
  isPublic: boolean;
  httpMethod: string; // GET, POST, PUT, DELETE, PATCH
  path: string;
  description: string;
  loc: Loc;
}

// ── DISPLAY API.users.GET("/users") -> "description" ──

export interface DisplayDecl {
  kind: "DisplayDecl";
  target: QualifiedRef;
  path: string | null;
  description: string;
  loc: Loc;
}

// ── TABLE "users" { ... } ──

export interface TableDecl {
  kind: "TableDecl";
  name: string;
  columns: ColumnDecl[];
  loc: Loc;
}

export interface ColumnDecl {
  kind: "ColumnDecl";
  name: string;
  dataType: string;
  description: string | null;
  loc: Loc;
}

// ── UPDATE members ──

export type UpdateMember = AddMethodDecl | AddDisplayDecl | RemoveMethodDecl;

export interface AddMethodDecl {
  kind: "AddMethodDecl";
  method: MethodDecl;
  loc: Loc;
}

export interface AddDisplayDecl {
  kind: "AddDisplayDecl";
  display: DisplayDecl;
  loc: Loc;
}

export interface RemoveMethodDecl {
  kind: "RemoveMethodDecl";
  httpMethod: string;
  path: string;
  loc: Loc;
}

// ── Qualified references: DB.users-db, API.users.GET ──

export interface QualifiedRef {
  kind: "QualifiedRef";
  parts: string[];
  loc: Loc;
}

// ── Profile declaration ──

export interface ProfileDecl {
  kind: "ProfileDecl";
  name: string;
  role: string | null;
  extends_: string[] | null;
  rules: string[];
  patterns: PatternEntry[];
  onReview: string[];
  loc: Loc;
}

export interface PatternEntry {
  kind: "PatternEntry";
  componentType: string;
  pattern: string;
  loc: Loc;
}
