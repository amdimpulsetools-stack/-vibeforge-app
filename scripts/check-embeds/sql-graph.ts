/**
 * Grafo de relaciones (FKs) del esquema `public`, reconstruido SOLO leyendo
 * las migraciones SQL en orden. Es lo que PostgREST usa para resolver los
 * embeds `tabla(cols)` de un select: si entre dos tablas hay más de una
 * relación, el embed sin hint falla con PGRST201 (incidente 30-sep-2026).
 *
 * Deliberadamente tolerante: no es un parser de SQL completo. Lo que no
 * entiende lo salta y sigue. Cubre lo que usan las migraciones del repo:
 *   - FKs de columna: `col tipo [CONSTRAINT n] REFERENCES t[(c)]` en CREATE
 *     TABLE y en ALTER TABLE ... ADD [COLUMN] [IF NOT EXISTS].
 *   - FKs de tabla: `[CONSTRAINT n] FOREIGN KEY (cols) REFERENCES t[(cols)]`
 *     en CREATE TABLE y ALTER TABLE ... ADD.
 *   - Bajas: DROP CONSTRAINT [IF EXISTS], DROP [COLUMN], DROP TABLE.
 *   - RENAME TO / RENAME [COLUMN] / RENAME CONSTRAINT.
 *   - PKs (para detectar tablas puente many-to-many como PostgREST).
 *   - DDL dentro de bloques `DO $$ ... $$` (se ejecuta al migrar); el cuerpo
 *     de las funciones NO (se ejecuta al llamarlas) y se ignora.
 *   - `CREATE FUNCTION f(...) RETURNS [SETOF] tabla`: para saber sobre qué
 *     tabla embebe un `.rpc("f").select(...)`.
 *   - Vistas: solo se registran sus nombres (no se modelan sus relaciones).
 *
 * Nombres por defecto como Postgres (makeObjectName + ChooseConstraintName):
 * `<tabla>_<col1>[_<col2>...]_fkey`, truncado a 63 bytes recortando primero
 * la parte más larga, con sufijo numérico si el nombre ya estaba usado.
 */
import * as fs from "fs";
import * as path from "path";

export interface ForeignKey {
  name: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  /** "008_patients.sql:85" — dónde se creó. */
  origin: string;
  /** Orden de creación (migración, posición) — sirve para sugerir la FK "de siempre". */
  seq: number;
}

export interface TableInfo {
  name: string;
  columns: Set<string>;
  pk: { name: string; columns: string[] } | null;
  origin: string;
  /** true si la tabla solo se conoce por un ALTER TABLE (no se vio su CREATE). */
  implicit: boolean;
}

export interface SchemaGraph {
  tables: Map<string, TableInfo>;
  views: Set<string>;
  /** Clave: `${table}.${name}`. */
  fks: Map<string, ForeignKey>;
  /** RPC -> tabla que devuelve (RETURNS [SETOF] tabla). */
  functions: Map<string, string>;
  /** Avisos del parser (sentencias que se saltaron, SQL dinámico, etc.). */
  notes: string[];
  /** Migraciones con FK creada por SQL dinámico (EXECUTE): no verificables. */
  dynamicFkFiles: string[];
  migrationFiles: string[];
}

export interface SqlSource {
  name: string;
  sql: string;
}

const NAMEDATALEN = 64;

/** Réplica de makeObjectName() de Postgres (src/backend/commands/indexcmds.c). */
export function makeObjectName(name1: string, name2: string | null, label: string | null): string {
  const b1 = Buffer.from(name1, "utf8");
  const b2 = name2 != null ? Buffer.from(name2, "utf8") : null;
  let overhead = 0;
  let name1chars = b1.length;
  let name2chars = 0;
  if (b2) {
    name2chars = b2.length;
    overhead++;
  }
  if (label) overhead += Buffer.byteLength(label, "utf8") + 1;
  const availchars = NAMEDATALEN - 1 - overhead;
  while (name1chars + name2chars > availchars) {
    if (name1chars > name2chars) name1chars--;
    else name2chars--;
  }
  let out = b1.subarray(0, name1chars).toString("utf8");
  if (b2) out += "_" + b2.subarray(0, name2chars).toString("utf8");
  if (label) out += "_" + label;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Limpieza léxica: comentarios, literales y cuerpos de función fuera.
//    Devuelve un string del MISMO largo (los saltos de línea se conservan)
//    para que los offsets sigan sirviendo para calcular la línea.
// ─────────────────────────────────────────────────────────────────────────
export function cleanSql(src: string): string {
  const out = src.split("");
  const n = src.length;
  const blank = (a: number, b: number) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const doStack: string[] = [];
  let stmtStart = 0;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === "-" && src[i + 1] === "-") {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === "/" && src[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (src[j] === "*" && src[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "'") {
      const isE = i > 0 && (src[i - 1] === "E" || src[i - 1] === "e") && !(i > 1 && /[A-Za-z0-9_]/.test(src[i - 2]));
      let j = i + 1;
      while (j < n) {
        if (isE && src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = src.indexOf('"', i + 1);
      i = j === -1 ? n : j + 1;
      continue;
    }
    if (c === "$" && !(i > 0 && /[A-Za-z0-9_$]/.test(src[i - 1]))) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 80));
      if (m) {
        const tag = m[0];
        if (doStack.length && doStack[doStack.length - 1] === tag) {
          blank(i, i + tag.length);
          doStack.pop();
          i += tag.length;
          stmtStart = i;
          continue;
        }
        const before = out.slice(stmtStart, i).join("");
        if (/^\s*DO(\s+LANGUAGE\s+\w+)?\s*$/i.test(before)) {
          // Bloque anónimo: su DDL corre al migrar → se conserva.
          blank(i, i + tag.length);
          doStack.push(tag);
          i += tag.length;
          stmtStart = i;
          continue;
        }
        // Cuerpo de función / string con dólares: se ignora entero.
        const close = src.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        blank(i, end);
        i = end;
        continue;
      }
    }
    if (c === ";") stmtStart = i + 1;
    i++;
  }
  return out.join("");
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Tokenizador mínimo sobre SQL ya limpio.
// ─────────────────────────────────────────────────────────────────────────
interface Tok {
  /** Identificador normalizado (minúsculas si no va entre comillas) o símbolo. */
  v: string;
  kind: "id" | "p" | "x";
  pos: number;
}

function tokenize(s: string, base: number): Tok[] {
  const toks: Tok[] = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      const j = s.indexOf('"', i + 1);
      const end = j === -1 ? n : j;
      toks.push({ v: s.slice(i + 1, end), kind: "id", pos: base + i });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(s[j])) j++;
      toks.push({ v: s.slice(i, j).toLowerCase(), kind: "id", pos: base + i });
      i = j;
      continue;
    }
    if (c === "(" || c === ")" || c === "," || c === "." || c === ";") {
      toks.push({ v: c, kind: "p", pos: base + i });
      i++;
      continue;
    }
    // números, operadores, comillas vacías de literales, etc.
    let j = i + 1;
    while (j < n && !/[\sA-Za-z_"(),.;]/.test(s[j])) j++;
    toks.push({ v: s.slice(i, j), kind: "x", pos: base + i });
    i = j;
  }
  return toks;
}

/** Divide `toks[from..to)` por comas de profundidad 0. */
function splitTopLevel(toks: Tok[], from: number, to: number): Tok[][] {
  const parts: Tok[][] = [];
  let depth = 0;
  let cur: Tok[] = [];
  for (let k = from; k < to; k++) {
    const t = toks[k];
    if (t.v === "(" && t.kind === "p") depth++;
    if (t.v === ")" && t.kind === "p") depth--;
    if (t.v === "," && t.kind === "p" && depth === 0) {
      parts.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/** Índice del `)` que cierra el `(` en `open`. */
function matchParen(toks: Tok[], open: number): number {
  let depth = 0;
  for (let k = open; k < toks.length; k++) {
    if (toks[k].kind !== "p") continue;
    if (toks[k].v === "(") depth++;
    else if (toks[k].v === ")") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return toks.length;
}

interface QName {
  schema: string | null;
  name: string;
  next: number;
}

function readQName(toks: Tok[], k: number): QName | null {
  const a = toks[k];
  if (!a || a.kind !== "id") return null;
  if (toks[k + 1] && toks[k + 1].v === "." && toks[k + 2] && toks[k + 2].kind === "id") {
    return { schema: a.v, name: toks[k + 2].v, next: k + 3 };
  }
  return { schema: null, name: a.v, next: k + 1 };
}

/** Lee `(a, b, c)` de identificadores simples. */
function readIdentList(toks: Tok[], k: number): { cols: string[]; next: number } | null {
  if (!toks[k] || toks[k].v !== "(") return null;
  const close = matchParen(toks, k);
  const cols = splitTopLevel(toks, k + 1, close)
    .map((p) => (p[0] && p[0].kind === "id" ? p[0].v : ""))
    .filter(Boolean);
  return { cols, next: close + 1 };
}

const isPublic = (schema: string | null) => schema === null || schema === "public";

// ─────────────────────────────────────────────────────────────────────────
// 3. Constructor del grafo.
// ─────────────────────────────────────────────────────────────────────────
class GraphBuilder {
  g: SchemaGraph = {
    tables: new Map(),
    views: new Set(),
    fks: new Map(),
    functions: new Map(),
    notes: [],
    dynamicFkFiles: [],
    migrationFiles: [],
  };
  /** Nombres de constraint ya usados en el esquema (colisiones de nombres por defecto). */
  private usedNames = new Set<string>();
  private seq = 0;
  /** Uniendo un CREATE TABLE IF NOT EXISTS repetido: no duplicar FKs idénticas. */
  private merging = false;
  /** Primera vez que se vio cada FK (tabla.nombre): una FK que se borra y recrea conserva su antigüedad. */
  private firstSeen = new Map<string, number>();
  private file = "";
  private lineOf: (pos: number) => number = () => 0;

  origin(pos: number): string {
    return `${this.file}:${this.lineOf(pos)}`;
  }

  run(sources: SqlSource[]): SchemaGraph {
    for (const src of sources) {
      this.file = src.name;
      this.g.migrationFiles.push(src.name);
      const lineStarts: number[] = [0];
      for (let k = 0; k < src.sql.length; k++) if (src.sql[k] === "\n") lineStarts.push(k + 1);
      this.lineOf = (pos: number) => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (lineStarts[mid] <= pos) lo = mid;
          else hi = mid - 1;
        }
        return lo + 1;
      };
      // `EXECUTE 'ALTER TABLE … FOREIGN KEY …'` / `EXECUTE format('… REFERENCES …')`:
      // el string se descarta al limpiar, así que se avisa para revisarlo a mano.
      if (/\bEXECUTE\s+(?:format\s*\(\s*)?(?:E?'|\$[A-Za-z_]*\$)[^;]{0,400}?(FOREIGN\s+KEY|REFERENCES)/i.test(src.sql.replace(/--[^\n]*/g, ""))) {
        this.g.notes.push(`${src.name}: SQL dinámico (EXECUTE) con FOREIGN KEY/REFERENCES — no se modela; revisar a mano.`);
        this.g.dynamicFkFiles.push(src.name);
      }
      const clean = cleanSql(src.sql);
      let start = 0;
      for (let k = 0; k <= clean.length; k++) {
        if (k === clean.length || clean[k] === ";") {
          const frag = clean.slice(start, k);
          try {
            this.statement(frag, start);
          } catch (e) {
            this.g.notes.push(`${this.origin(start)}: sentencia no entendida, se salta (${(e as Error).message}).`);
          }
          start = k + 1;
        }
      }
    }
    return this.g;
  }

  private statement(frag: string, base: number) {
    const re =
      /\b(CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL|LOCAL)\s+)?(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW|DROP\s+(?:MATERIALIZED\s+)?VIEW|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION)\b/i;
    const m = re.exec(frag);
    if (!m) return;
    const kw = m[1].toUpperCase().replace(/\s+/g, " ");
    const body = frag.slice(m.index);
    const toks = tokenize(body, base + m.index);
    // Saltar las palabras clave de la cabecera.
    let k = 0;
    const kwWords = kw.split(" ").length;
    k += kwWords;
    if (kw.startsWith("CREATE") && kw.endsWith("TABLE")) {
      if (/TEMP|GLOBAL|LOCAL/.test(kw)) return;
      this.createTable(toks, k);
    } else if (kw === "ALTER TABLE") this.alterTable(toks, k);
    else if (kw === "DROP TABLE") this.dropTables(toks, k);
    else if (kw.endsWith("VIEW")) {
      let j = k;
      if (toks[j] && toks[j].v === "if") j += toks[j + 1] && toks[j + 1].v === "not" ? 3 : 2;
      if (kw.startsWith("DROP")) {
        for (const part of splitTopLevel(toks, j, toks.length)) {
          const q = readQName(part, 0);
          if (q && isPublic(q.schema)) this.g.views.delete(q.name);
        }
      } else {
        const q = readQName(toks, j);
        if (q && isPublic(q.schema)) this.g.views.add(q.name);
      }
    } else if (kw.endsWith("FUNCTION")) {
      let j = k;
      if (toks[j] && toks[j].v === "if") j += 2;
      const q = readQName(toks, j);
      if (!q || !isPublic(q.schema)) return;
      if (kw.startsWith("DROP")) {
        this.g.functions.delete(q.name);
        return;
      }
      if (!toks[q.next] || toks[q.next].v !== "(") return;
      let r = matchParen(toks, q.next) + 1;
      if (!toks[r] || toks[r].v !== "returns") {
        this.g.functions.delete(q.name);
        return;
      }
      r++;
      if (toks[r] && toks[r].v === "setof") r++;
      const t = readQName(toks, r);
      if (t && isPublic(t.schema) && (!toks[t.next] || toks[t.next].v !== "(")) this.g.functions.set(q.name, t.name);
      else this.g.functions.delete(q.name);
    }
  }

  private ensureTable(name: string, pos: number, implicit: boolean): TableInfo {
    let t = this.g.tables.get(name);
    if (!t) {
      t = { name, columns: new Set(), pk: null, origin: this.origin(pos), implicit };
      this.g.tables.set(name, t);
    }
    return t;
  }

  private createTable(toks: Tok[], k: number) {
    let ifNotExists = false;
    if (toks[k] && toks[k].v === "if" && toks[k + 1] && toks[k + 1].v === "not") {
      ifNotExists = true;
      k += 3;
    }
    const q = readQName(toks, k);
    if (!q || !isPublic(q.schema)) return;
    if (!toks[q.next] || toks[q.next].v !== "(") return; // AS SELECT / PARTITION OF / OF type
    // CREATE TABLE IF NOT EXISTS sobre una tabla que ya existe: Postgres no
    // hace nada, PERO las primeras migraciones se corrieron a mano en el SQL
    // Editor y en prod puede haber quedado la SEGUNDA definición (caso
    // payment_history: 003 vs 021). Conservador: se UNEN las definiciones
    // (columnas nuevas con sus FKs, FKs de tabla con nombre nuevo). Así el
    // grafo puede tener de más, nunca de menos, que es lo seguro para
    // detectar ambigüedades.
    let merge = false;
    if (this.g.tables.has(q.name)) {
      if (ifNotExists) {
        merge = true;
        this.g.notes.push(
          `${this.origin(toks[k].pos)}: CREATE TABLE IF NOT EXISTS ${q.name} sobre una tabla ya creada — se unen ambas definiciones (conservador).`,
        );
      } else this.forgetTable(q.name, false);
    }
    const table = this.ensureTable(q.name, toks[k].pos, false);
    const close = matchParen(toks, q.next);
    for (const el of splitTopLevel(toks, q.next + 1, close)) {
      if (!el.length) continue;
      const first = el[0].v;
      if (el[0].kind === "id" && ["constraint", "primary", "foreign", "unique", "check", "exclude"].includes(first)) {
        if (merge && (first !== "foreign" && first !== "constraint")) continue;
        if (merge && first === "constraint" && el[1] && this.g.fks.has(`${table.name}.${el[1].v}`)) continue;
        if (merge && first === "constraint" && el[2] && el[2].v !== "foreign") continue;
        this.merging = merge;
        try {
          this.tableConstraint(table, el, 0);
        } finally {
          this.merging = false;
        }
      } else if (first === "like") {
        continue;
      } else if (el[0].kind === "id") {
        this.columnDef(table, el, 0, merge);
      }
    }
  }

  /** `col tipo [restricciones...]` */
  private columnDef(table: TableInfo, el: Tok[], k: number, ifNotExists: boolean) {
    const col = el[k];
    if (!col || col.kind !== "id") return;
    if (ifNotExists && table.columns.has(col.v)) return; // ADD COLUMN IF NOT EXISTS: se salta entera.
    table.columns.add(col.v);
    let pendingName: string | null = null;
    let depth = 0;
    for (let j = k + 1; j < el.length; j++) {
      const t = el[j];
      if (t.kind === "p" && t.v === "(") depth++;
      if (t.kind === "p" && t.v === ")") depth--;
      if (depth > 0 || t.kind !== "id") continue;
      if (t.v === "constraint" && el[j + 1]) {
        pendingName = el[j + 1].v;
        j++;
        continue;
      }
      if (t.v === "references") {
        const r = readQName(el, j + 1);
        if (!r) continue;
        let refCols: string[] | null = null;
        let next = r.next;
        const lst = readIdentList(el, r.next);
        if (lst) {
          refCols = lst.cols;
          next = lst.next;
        }
        if (isPublic(r.schema)) this.addFk(table.name, [col.v], r.name, refCols, pendingName, t.pos);
        pendingName = null;
        j = next - 1;
        continue;
      }
      if (t.v === "primary" && el[j + 1] && el[j + 1].v === "key") {
        table.pk = { name: pendingName || this.defaultName(table.name, null, "pkey"), columns: [col.v] };
        this.usedNames.add(table.pk.name);
        pendingName = null;
        j++;
        continue;
      }
      if (["not", "null", "default", "check", "unique", "generated", "collate"].includes(t.v)) pendingName = null;
    }
  }

  /** `[CONSTRAINT n] PRIMARY KEY (...) | FOREIGN KEY (...) REFERENCES ... | ...` */
  private tableConstraint(table: TableInfo, el: Tok[], k: number) {
    let name: string | null = null;
    if (el[k] && el[k].v === "constraint") {
      name = el[k + 1] ? el[k + 1].v : null;
      k += 2;
    }
    const t = el[k];
    if (!t) return;
    if (t.v === "primary" && el[k + 1] && el[k + 1].v === "key") {
      const lst = readIdentList(el, k + 2);
      if (!lst) return;
      table.pk = { name: name || this.defaultName(table.name, null, "pkey"), columns: lst.cols };
      this.usedNames.add(table.pk.name);
      return;
    }
    if (t.v === "foreign" && el[k + 1] && el[k + 1].v === "key") {
      const lst = readIdentList(el, k + 2);
      if (!lst) return;
      if (!el[lst.next] || el[lst.next].v !== "references") return;
      const r = readQName(el, lst.next + 1);
      if (!r || !isPublic(r.schema)) return;
      const refLst = readIdentList(el, r.next);
      if (this.merging) {
        const same = [...this.g.fks.values()].some(
          (f) => f.table === table.name && f.refTable === r.name && f.columns.join(",") === lst.cols.join(","),
        );
        if (same) return;
      }
      this.addFk(table.name, lst.cols, r.name, refLst ? refLst.cols : null, name, t.pos);
      return;
    }
    if (name) this.usedNames.add(name); // UNIQUE/CHECK/EXCLUDE con nombre: solo ocupa el nombre.
  }

  private defaultName(table: string, cols: string | null, label: string): string {
    let pass = 0;
    for (;;) {
      const nm = makeObjectName(table, cols, pass === 0 ? label : `${label}${pass}`);
      if (!this.usedNames.has(nm)) return nm;
      pass++;
    }
  }

  private addFk(table: string, cols: string[], refTable: string, refCols: string[] | null, name: string | null, pos: number) {
    const fkName = name || this.defaultName(table, cols.join("_"), "fkey");
    this.usedNames.add(fkName);
    let resolvedRef = refCols;
    if (!resolvedRef || !resolvedRef.length) {
      const rt = this.g.tables.get(refTable);
      resolvedRef = rt && rt.pk ? rt.pk.columns.slice() : ["id"];
    }
    const key = `${table}.${fkName}`;
    if (!this.firstSeen.has(key)) this.firstSeen.set(key, this.seq++);
    this.g.fks.set(key, {
      name: fkName,
      table,
      columns: cols,
      refTable,
      refColumns: resolvedRef,
      origin: this.origin(pos),
      seq: this.firstSeen.get(key) as number,
    });
  }

  private dropFk(key: string) {
    const fk = this.g.fks.get(key);
    if (fk) {
      this.g.fks.delete(key);
      this.usedNames.delete(fk.name);
    }
  }

  private alterTable(toks: Tok[], k: number) {
    let ifExists = false;
    if (toks[k] && toks[k].v === "if" && toks[k + 1] && toks[k + 1].v === "exists") {
      ifExists = true;
      k += 2;
    }
    if (toks[k] && toks[k].v === "only") k++;
    const q = readQName(toks, k);
    if (!q || !isPublic(q.schema)) return;
    let j = q.next;
    if (toks[j] && toks[j].v === "*") j++;
    if (!this.g.tables.has(q.name)) {
      if (ifExists) return;
      this.ensureTable(q.name, toks[k].pos, true);
    }
    const table = this.g.tables.get(q.name) as TableInfo;
    for (const act of splitTopLevel(toks, j, toks.length)) {
      if (!act.length) continue;
      try {
        this.alterAction(table, act);
      } catch (e) {
        this.g.notes.push(`${this.origin(act[0].pos)}: acción de ALTER TABLE no entendida (${(e as Error).message}).`);
      }
    }
  }

  private alterAction(table: TableInfo, act: Tok[]) {
    const a0 = act[0].v;
    if (a0 === "add") {
      let k = 1;
      const w = act[k] ? act[k].v : "";
      if (["constraint", "primary", "foreign", "unique", "check", "exclude"].includes(w)) {
        this.tableConstraint(table, act, k);
        return;
      }
      if (w === "column") k++;
      let ine = false;
      if (act[k] && act[k].v === "if" && act[k + 1] && act[k + 1].v === "not") {
        ine = true;
        k += 3;
      }
      this.columnDef(table, act, k, ine);
      return;
    }
    if (a0 === "drop") {
      let k = 1;
      if (act[k] && act[k].v === "constraint") {
        k++;
        if (act[k] && act[k].v === "if" && act[k + 1] && act[k + 1].v === "exists") k += 2;
        const name = act[k] ? act[k].v : "";
        const cascade = act.some((t) => t.v === "cascade");
        this.dropConstraint(table, name, cascade);
        return;
      }
      if (act[k] && act[k].v === "column") k++;
      if (act[k] && act[k].v === "if" && act[k + 1] && act[k + 1].v === "exists") k += 2;
      const col = act[k] ? act[k].v : "";
      if (!col) return;
      const cascade = act.some((t) => t.v === "cascade");
      this.dropColumn(table, col, cascade);
      return;
    }
    if (a0 === "rename") {
      if (act[1] && act[1].v === "to" && act[2]) {
        this.renameTable(table.name, act[2].v);
        return;
      }
      if (act[1] && act[1].v === "constraint" && act[3] && act[3].v === "to" && act[4]) {
        const oldN = act[2].v;
        const newN = act[4].v;
        const fk = this.g.fks.get(`${table.name}.${oldN}`);
        if (fk) {
          this.dropFk(`${table.name}.${oldN}`);
          fk.name = newN;
          this.g.fks.set(`${table.name}.${newN}`, fk);
          this.usedNames.add(newN);
        }
        if (table.pk && table.pk.name === oldN) table.pk.name = newN;
        return;
      }
      let k = 1;
      if (act[k] && act[k].v === "column") k++;
      if (act[k] && act[k + 1] && act[k + 1].v === "to" && act[k + 2]) {
        const oldC = act[k].v;
        const newC = act[k + 2].v;
        if (table.columns.delete(oldC)) table.columns.add(newC);
        for (const fk of this.g.fks.values()) {
          if (fk.table === table.name) fk.columns = fk.columns.map((c) => (c === oldC ? newC : c));
          if (fk.refTable === table.name) fk.refColumns = fk.refColumns.map((c) => (c === oldC ? newC : c));
        }
        if (table.pk) table.pk.columns = table.pk.columns.map((c) => (c === oldC ? newC : c));
      }
    }
  }

  private dropConstraint(table: TableInfo, name: string, cascade: boolean) {
    const key = `${table.name}.${name}`;
    if (this.g.fks.has(key)) {
      this.dropFk(key);
      return;
    }
    if (table.pk && table.pk.name === name) {
      const pkCols = table.pk.columns.join(",");
      this.usedNames.delete(name);
      table.pk = null;
      if (cascade) {
        for (const [fkKey, fk] of [...this.g.fks.entries()]) {
          if (fk.refTable === table.name && fk.refColumns.join(",") === pkCols) this.dropFk(fkKey);
        }
      }
      return;
    }
    this.usedNames.delete(name);
  }

  private dropColumn(table: TableInfo, col: string, cascade: boolean) {
    table.columns.delete(col);
    for (const [key, fk] of [...this.g.fks.entries()]) {
      if (fk.table === table.name && fk.columns.includes(col)) this.dropFk(key);
      else if (cascade && fk.refTable === table.name && fk.refColumns.includes(col)) this.dropFk(key);
    }
    if (table.pk && table.pk.columns.includes(col)) table.pk = null;
  }

  private renameTable(oldName: string, newName: string) {
    const t = this.g.tables.get(oldName);
    if (!t) return;
    this.g.tables.delete(oldName);
    t.name = newName;
    this.g.tables.set(newName, t);
    const moved: [string, ForeignKey][] = [];
    for (const [key, fk] of [...this.g.fks.entries()]) {
      let changed = false;
      if (fk.table === oldName) {
        fk.table = newName;
        changed = true;
      }
      if (fk.refTable === oldName) fk.refTable = newName;
      if (changed) {
        this.g.fks.delete(key);
        moved.push([`${newName}.${fk.name}`, fk]);
      }
    }
    for (const [key, fk] of moved) this.g.fks.set(key, fk);
    for (const [fn, ret] of this.g.functions) if (ret === oldName) this.g.functions.set(fn, newName);
  }

  /** DROP TABLE / CREATE TABLE sobre una tabla existente. */
  private forgetTable(name: string, cascade: boolean) {
    const t = this.g.tables.get(name);
    if (t && t.pk) this.usedNames.delete(t.pk.name);
    this.g.tables.delete(name);
    for (const [key, fk] of [...this.g.fks.entries()]) {
      // Sin CASCADE el DROP fallaría si alguien la referencia; con CASCADE
      // Postgres borra esas FKs. En ambos casos, después no existen.
      if (fk.table === name || fk.refTable === name) this.dropFk(key);
    }
    void cascade;
  }

  private dropTables(toks: Tok[], k: number) {
    if (toks[k] && toks[k].v === "if" && toks[k + 1] && toks[k + 1].v === "exists") k += 2;
    const cascade = toks.some((t) => t.v === "cascade");
    for (const part of splitTopLevel(toks, k, toks.length)) {
      const q = readQName(part, 0);
      if (q && isPublic(q.schema)) this.forgetTable(q.name, cascade);
    }
  }
}

export function buildSchemaGraphFromSources(sources: SqlSource[]): SchemaGraph {
  return new GraphBuilder().run(sources);
}

/** Lee `dir/*.sql` (no recursivo: `rollbacks/` queda fuera) en orden de nombre. */
export function buildSchemaGraph(migrationsDir: string): SchemaGraph {
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".sql"))
    .map((d) => d.name)
    // Orden por PREFIJO NUMÉRICO (273_ < 1000_ < 20261001120000_), no por
    // texto: como texto, un archivo con timestamp de la CLI quedaría antes de
    // la 273 y su DROP CONSTRAINT borraría del grafo una FK re-agregada.
    .sort((a, b) => {
      const na = /^\d+/.exec(a)?.[0];
      const nb = /^\d+/.exec(b)?.[0];
      if (na && nb && na !== nb) return BigInt(na) < BigInt(nb) ? -1 : 1;
      if (na && !nb) return -1;
      if (!na && nb) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  const sources = files.map((name) => ({ name, sql: fs.readFileSync(path.join(migrationsDir, name), "utf8") }));
  return buildSchemaGraphFromSources(sources);
}
