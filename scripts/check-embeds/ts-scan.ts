/**
 * Escaneo ESTÁTICO de los `.select(...)` de supabase-js en el código TS/TSX.
 *
 * Usa el parser de TypeScript (solo AST, sin type-checker: rápido y sin
 * depender de la configuración de Next). Para cada `.select(arg)`:
 *   - resuelve `arg` a uno o varios strings posibles ("variantes"):
 *     literales, template literals (cada `${cond ? "a" : "b"}` genera sus
 *     variantes; lo que no se puede resolver queda como texto opaco),
 *     concatenaciones `+`, constantes locales o importadas (`@/…`, `./…`),
 *     funciones locales que devuelven el string, parámetros (vía las
 *     llamadas a la función dentro del mismo archivo) y `[...].join(sep)`.
 *   - resuelve la tabla padre recorriendo la cadena del builder hasta el
 *     `.from("tabla")` (o `.rpc("fn")`), también a través de variables.
 */
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { OPAQUE, SourceText, concatSourceText, mayHaveEmbeds, sourceTextFrom } from "./select-parser";

export type ParentRef =
  | { kind: "table"; name: string }
  | { kind: "rpc"; name: string }
  | { kind: "schema"; name: string }
  | { kind: "unknown"; name: string };

export interface SelectSite {
  /** Ruta relativa (posix) del archivo con el `.select(...)`. */
  file: string;
  line: number;
  variants: SourceText[];
  parents: ParentRef[];
  /** El argumento no se pudo resolver a ningún string. */
  unresolved: boolean;
  /** Se alcanzó el tope de variantes (se analizaron solo las primeras). */
  truncated: boolean;
}

const MAX_VARIANTS = 64;
const MAX_DEPTH = 14;

type Resolved = SourceText[] | null;

function unwrap(e: ts.Expression): ts.Expression {
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) {
      e = e.expression;
      continue;
    }
    if (ts.isSatisfiesExpression(e)) {
      e = e.expression;
      continue;
    }
    return e;
  }
}

function product(a: SourceText[], b: SourceText[]): { out: SourceText[]; truncated: boolean } {
  const out: SourceText[] = [];
  let truncated = false;
  for (const x of a) {
    for (const y of b) {
      if (out.length >= MAX_VARIANTS) {
        truncated = true;
        break;
      }
      out.push(concatSourceText([x, y]));
    }
  }
  return { out, truncated };
}

function dedupe(list: SourceText[]): SourceText[] {
  const seen = new Set<string>();
  const out: SourceText[] = [];
  for (const v of list) {
    if (seen.has(v.text)) continue;
    seen.add(v.text);
    out.push(v);
  }
  return out;
}

type FunctionLikeWithBody = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

type Decl =
  | { kind: "var"; node: ts.VariableDeclaration; sf: ts.SourceFile }
  | { kind: "func"; node: FunctionLikeWithBody; sf: ts.SourceFile; name: string }
  | { kind: "param"; node: ts.ParameterDeclaration; fn: ts.SignatureDeclaration; index: number; sf: ts.SourceFile }
  | { kind: "namespace"; moduleFile: string }
  | { kind: "opaque" };

function bindsName(n: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(n)) return n.text === name;
  for (const el of n.elements) {
    if (ts.isOmittedExpression(el)) continue;
    if (bindsName(el.name, name)) return true;
  }
  return false;
}

function statementsOf(n: ts.Node): ts.NodeArray<ts.Statement> | null {
  if (ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n)) return n.statements;
  return null;
}

export class TsScanner {
  private sfCache = new Map<string, ts.SourceFile | null>();
  private truncatedFlag = false;

  /** `vfs`: archivos en memoria (ruta absoluta → contenido), para el auto-test. */
  constructor(private root: string, private vfs?: Map<string, string>) {}

  rel(abs: string): string {
    return path.relative(this.root, abs).split(path.sep).join("/");
  }

  private read(abs: string): string | null {
    if (this.vfs) return this.vfs.has(abs) ? (this.vfs.get(abs) as string) : null;
    try {
      return fs.statSync(abs).isFile() ? fs.readFileSync(abs, "utf8") : null;
    } catch {
      return null;
    }
  }

  getSourceFile(abs: string): ts.SourceFile | null {
    if (this.sfCache.has(abs)) return this.sfCache.get(abs) as ts.SourceFile | null;
    const text = this.read(abs);
    const sf =
      text == null
        ? null
        : ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    this.sfCache.set(abs, sf);
    return sf;
  }

  private resolveModule(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(this.root, spec.slice(2));
    else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec);
    else return null;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (/\.(ts|tsx)$/.test(cand) && this.read(cand) != null) return cand;
    }
    return null;
  }

  // ── Búsqueda de declaraciones ─────────────────────────────────────────

  private lookup(name: string, from: ts.Node, sf: ts.SourceFile): Decl | null {
    let cur: ts.Node | undefined = from;
    while (cur) {
      if (ts.isFunctionLike(cur)) {
        const params = cur.parameters;
        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          if (ts.isIdentifier(p.name) && p.name.text === name) return { kind: "param", node: p, fn: cur, index: i, sf };
          if (!ts.isIdentifier(p.name) && bindsName(p.name, name)) return { kind: "opaque" };
        }
      }
      const stmts = statementsOf(cur);
      if (stmts) {
        for (const st of stmts) {
          const d = this.declIn(st, name, sf);
          if (d) return d;
        }
      }
      cur = cur.parent;
    }
    return null;
  }

  private declIn(st: ts.Statement, name: string, sf: ts.SourceFile): Decl | null {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) return { kind: "var", node: d, sf };
        if (!ts.isIdentifier(d.name) && bindsName(d.name, name)) return { kind: "opaque" };
      }
    }
    if (ts.isFunctionDeclaration(st) && st.name && st.name.text === name) return { kind: "func", node: st, sf, name };
    if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const ic = st.importClause;
      const spec = st.moduleSpecifier.text;
      if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
        for (const el of ic.namedBindings.elements) {
          if (el.name.text !== name) continue;
          const exported = el.propertyName ? el.propertyName.text : el.name.text;
          const mod = this.resolveModule(spec, sf.fileName);
          return mod ? this.exportedDecl(mod, exported, 0) : { kind: "opaque" };
        }
      }
      if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings) && ic.namedBindings.name.text === name) {
        const mod = this.resolveModule(spec, sf.fileName);
        return mod ? { kind: "namespace", moduleFile: mod } : { kind: "opaque" };
      }
      if (ic.name && ic.name.text === name) return { kind: "opaque" };
    }
    return null;
  }

  private exportedDecl(modFile: string, name: string, depth: number): Decl | null {
    if (depth > 6) return null;
    const sf = this.getSourceFile(modFile);
    if (!sf) return null;
    for (const st of sf.statements) {
      const d = this.declIn(st, name, sf);
      if (d && d.kind !== "opaque") return d;
      if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.name.text !== name) continue;
          const local = el.propertyName ? el.propertyName.text : el.name.text;
          if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            const mod = this.resolveModule(st.moduleSpecifier.text, sf.fileName);
            return mod ? this.exportedDecl(mod, local, depth + 1) : null;
          }
          return this.exportedDecl(modFile, local, depth + 1);
        }
      }
    }
    for (const st of sf.statements) {
      if (ts.isExportDeclaration(st) && !st.exportClause && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const mod = this.resolveModule(st.moduleSpecifier.text, sf.fileName);
        const d = mod ? this.exportedDecl(mod, name, depth + 1) : null;
        if (d) return d;
      }
    }
    return null;
  }

  /** Expresiones que puede devolver una función local. */
  private returnsOf(fn: FunctionLikeWithBody): ts.Expression[] {
    if (!fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const out: ts.Expression[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isFunctionLike(n) && n !== fn) return;
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(fn.body, visit);
    return out;
  }

  private funcOf(decl: Decl | null): { fn: FunctionLikeWithBody; sf: ts.SourceFile } | null {
    if (!decl) return null;
    if (decl.kind === "func") return { fn: decl.node, sf: decl.sf };
    if (decl.kind === "var" && decl.node.initializer) {
      const init = unwrap(decl.node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return { fn: init, sf: decl.sf };
    }
    return null;
  }

  /** Nombre por el que se llama a una función (declaración o `const f = () => …`). */
  private fnName(fn: ts.SignatureDeclaration): string | null {
    if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
      return fn.parent.name.text;
    }
    return null;
  }

  /** Argumentos pasados en la posición `index` a la función `fn`, dentro del mismo archivo. */
  private callArgs(fn: ts.SignatureDeclaration, index: number, sf: ts.SourceFile): { expr: ts.Expression; sf: ts.SourceFile }[] {
    const name = this.fnName(fn);
    if (!name) return [];
    const out: { expr: ts.Expression; sf: ts.SourceFile }[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name && n.arguments.length > index) {
        const a = n.arguments[index];
        if (!ts.isSpreadElement(a)) out.push({ expr: a, sf });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
  }

  // ── Resolución de strings ─────────────────────────────────────────────

  private opaque(e: ts.Node, sf: ts.SourceFile): SourceText {
    return sourceTextFrom(OPAQUE, this.rel(sf.fileName), e.getStart(sf));
  }

  private union(parts: Resolved[], nodes: ts.Node[], sf: ts.SourceFile): Resolved {
    if (parts.every((p) => p == null)) return null;
    const out: SourceText[] = [];
    parts.forEach((p, i) => {
      for (const v of p || [this.opaque(nodes[i], sf)]) out.push(v);
    });
    if (out.length > MAX_VARIANTS) {
      this.truncatedFlag = true;
      return dedupe(out).slice(0, MAX_VARIANTS);
    }
    return dedupe(out);
  }

  str(e0: ts.Expression, sf: ts.SourceFile, depth = 0, seen: Set<ts.Node> = new Set()): Resolved {
    if (depth > MAX_DEPTH) return null;
    const e = unwrap(e0);
    if (seen.has(e)) return null;
    const file = this.rel(sf.fileName);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      return [sourceTextFrom(e.text, file, e.getStart(sf) + 1)];
    }
    const next = new Set(seen);
    next.add(e);
    if (ts.isTemplateExpression(e)) {
      let acc: SourceText[] = [sourceTextFrom(e.head.text, file, e.head.getStart(sf) + 1)];
      for (const span of e.templateSpans) {
        const v = this.str(span.expression, sf, depth + 1, next) || [this.opaque(span.expression, sf)];
        let r = product(acc, v);
        if (r.truncated) this.truncatedFlag = true;
        acc = r.out;
        r = product(acc, [sourceTextFrom(span.literal.text, file, span.literal.getStart(sf) + 1)]);
        acc = r.out;
      }
      return dedupe(acc);
    }
    if (ts.isConditionalExpression(e)) {
      return this.union(
        [this.str(e.whenTrue, sf, depth + 1, next), this.str(e.whenFalse, sf, depth + 1, next)],
        [e.whenTrue, e.whenFalse],
        sf,
      );
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken) {
        const l = this.str(e.left, sf, depth + 1, next);
        const r = this.str(e.right, sf, depth + 1, next);
        if (!l && !r) return null;
        const p = product(l || [this.opaque(e.left, sf)], r || [this.opaque(e.right, sf)]);
        if (p.truncated) this.truncatedFlag = true;
        return dedupe(p.out);
      }
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        return this.union([this.str(e.left, sf, depth + 1, next), this.str(e.right, sf, depth + 1, next)], [e.left, e.right], sf);
      }
      return null;
    }
    if (ts.isIdentifier(e)) return this.identStr(e, sf, depth, next);
    if (ts.isPropertyAccessExpression(e)) {
      // CONSTANTES.clave  |  ns.CONSTANTE (import * as ns)
      const obj = unwrap(e.expression);
      if (ts.isIdentifier(obj)) {
        const d = this.lookup(obj.text, obj, sf);
        if (d && d.kind === "namespace") {
          const inner = this.exportedDecl(d.moduleFile, e.name.text, 0);
          return this.declStr(inner, depth + 1, next);
        }
        if (d && d.kind === "var" && d.node.initializer) {
          const init = unwrap(d.node.initializer);
          if (ts.isObjectLiteralExpression(init)) {
            for (const p of init.properties) {
              if (ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === e.name.text) {
                return this.str(p.initializer, d.sf, depth + 1, next);
              }
            }
          }
        }
      }
      return null;
    }
    if (ts.isCallExpression(e)) {
      const callee = unwrap(e.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const m = callee.name.text;
        const recv = unwrap(callee.expression);
        if (m === "join" && ts.isArrayLiteralExpression(recv)) {
          const sepArg = e.arguments[0];
          const sep = sepArg ? this.str(sepArg, sf, depth + 1, next) : [sourceTextFrom(",", file, callee.getStart(sf))];
          if (!sep || sep.length !== 1) return null;
          let acc: SourceText[] = [sourceTextFrom("", file, recv.getStart(sf))];
          recv.elements.forEach((el, i) => {
            if (ts.isSpreadElement(el)) {
              acc = product(acc, [this.opaque(el, sf)]).out;
              return;
            }
            const v = this.str(el, sf, depth + 1, next) || [this.opaque(el, sf)];
            if (i > 0) acc = product(acc, sep).out;
            const p = product(acc, v);
            if (p.truncated) this.truncatedFlag = true;
            acc = p.out;
          });
          return dedupe(acc);
        }
        if (m === "trim" || m === "trimStart" || m === "trimEnd" || m === "toString") return this.str(recv, sf, depth + 1, next);
        return null;
      }
      if (ts.isIdentifier(callee)) {
        const f = this.funcOf(this.lookup(callee.text, callee, sf));
        if (!f) return null;
        const rets = this.returnsOf(f.fn);
        if (!rets.length) return null;
        return this.union(
          rets.map((r) => this.str(r, f.sf, depth + 1, next)),
          rets,
          f.sf,
        );
      }
    }
    return null;
  }

  private declStr(d: Decl | null, depth: number, seen: Set<ts.Node>): Resolved {
    if (!d) return null;
    if (d.kind === "var") return d.node.initializer ? this.str(d.node.initializer, d.sf, depth + 1, seen) : null;
    if (d.kind === "param") {
      const calls = this.callArgs(d.fn, d.index, d.sf);
      const parts: Resolved[] = calls.map((c) => this.str(c.expr, c.sf, depth + 1, seen));
      const nodes: ts.Node[] = calls.map((c) => c.expr);
      if (d.node.initializer) {
        parts.push(this.str(d.node.initializer, d.sf, depth + 1, seen));
        nodes.push(d.node.initializer);
      }
      if (!parts.length) return null;
      return this.union(parts, nodes, d.sf);
    }
    return null;
  }

  private identStr(id: ts.Identifier, sf: ts.SourceFile, depth: number, seen: Set<ts.Node>): Resolved {
    return this.declStr(this.lookup(id.text, id, sf), depth, seen);
  }

  // ── Tabla padre ───────────────────────────────────────────────────────

  private parentsOf(e0: ts.Expression, sf: ts.SourceFile, depth = 0, seen: Set<ts.Node> = new Set()): ParentRef[] {
    const unknown = (why: string): ParentRef[] => [{ kind: "unknown", name: why }];
    if (depth > MAX_DEPTH) return unknown("cadena demasiado profunda");
    const e = unwrap(ts.isAwaitExpression(e0) ? e0.expression : e0);
    if (seen.has(e)) return unknown("ciclo");
    const next = new Set(seen);
    next.add(e);
    if (ts.isCallExpression(e)) {
      const callee = unwrap(e.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const m = callee.name.text;
        if (m === "from" || m === "rpc") {
          const schema = this.schemaOf(callee.expression, sf);
          if (schema && schema !== "public") return [{ kind: "schema", name: schema }];
          const arg = e.arguments[0];
          const v = arg ? this.str(arg, sf, depth + 1) : null;
          if (!v) return unknown(`.${m}(<dinámico>)`);
          const out: ParentRef[] = [];
          for (const t of v) {
            const name = t.text.trim();
            if (!name || name.includes(OPAQUE)) out.push({ kind: "unknown", name: `.${m}(<dinámico>)` });
            else out.push(m === "from" ? { kind: "table", name } : { kind: "rpc", name });
          }
          return out;
        }
        return this.parentsOf(callee.expression, sf, depth + 1, next);
      }
      if (ts.isIdentifier(callee)) {
        const f = this.funcOf(this.lookup(callee.text, callee, sf));
        if (!f) return unknown(`${callee.text}()`);
        const rets = this.returnsOf(f.fn);
        if (!rets.length) return unknown(`${callee.text}()`);
        return rets.flatMap((r) => this.parentsOf(r, f.sf, depth + 1, next));
      }
      return unknown("llamada no reconocida");
    }
    if (ts.isPropertyAccessExpression(e)) return this.parentsOf(e.expression, sf, depth + 1, next);
    if (ts.isConditionalExpression(e)) {
      return [...this.parentsOf(e.whenTrue, sf, depth + 1, next), ...this.parentsOf(e.whenFalse, sf, depth + 1, next)];
    }
    if (ts.isIdentifier(e)) {
      const d = this.lookup(e.text, e, sf);
      if (d && d.kind === "var" && d.node.initializer) return this.parentsOf(d.node.initializer, d.sf, depth + 1, next);
      if (d && d.kind === "param") {
        const calls = this.callArgs(d.fn, d.index, d.sf);
        if (!calls.length) return unknown(`parámetro ${e.text}`);
        return calls.flatMap((c) => this.parentsOf(c.expr, c.sf, depth + 1, next));
      }
      return unknown(e.text);
    }
    return unknown("expresión no reconocida");
  }

  /** Si el receptor de `.from()` es `x.schema("s")`, devuelve "s". */
  private schemaOf(recv: ts.Expression, sf: ts.SourceFile): string | null {
    const r = unwrap(recv);
    if (ts.isCallExpression(r)) {
      const c = unwrap(r.expression);
      if (ts.isPropertyAccessExpression(c) && c.name.text === "schema" && r.arguments[0]) {
        const v = this.str(r.arguments[0], sf);
        return v && v.length === 1 ? v[0].text : "?";
      }
    }
    return null;
  }

  // ── Escaneo de un archivo ─────────────────────────────────────────────

  scanFile(abs: string): SelectSite[] {
    const sf = this.getSourceFile(abs);
    if (!sf) return [];
    const sites: SelectSite[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.arguments.length >= 1) {
        const callee = unwrap(n.expression);
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "select") {
          this.truncatedFlag = false;
          const variants = this.str(n.arguments[0], sf);
          const truncated = this.truncatedFlag;
          const line = sf.getLineAndCharacterOfPosition(callee.name.getStart(sf)).line + 1;
          if (variants == null) {
            // Solo interesa si es de verdad una consulta de supabase.
            const parents = this.parentsOf(callee.expression, sf);
            if (parents.some((p) => p.kind === "table" || p.kind === "rpc")) {
              sites.push({ file: this.rel(abs), line, variants: [], parents, unresolved: true, truncated });
            }
          } else if (variants.some((v) => mayHaveEmbeds(v.text) || v.text.includes(OPAQUE))) {
            const parents = this.parentsOf(callee.expression, sf);
            sites.push({ file: this.rel(abs), line, variants, parents, unresolved: false, truncated });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return sites;
  }
}

/** Lista recursiva de .ts/.tsx bajo `dirs` (relativos a root), sin node_modules/.next. */
export function listSourceFiles(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name.startsWith(".")) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) out.push(p);
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return out.sort();
}
