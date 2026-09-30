/**
 * Parser del string de `.select(...)` de supabase-js / PostgREST, lo justo
 * para extraer los embeds anidados:
 *
 *   [...][alias:]nombre[!hint][!inner|!left](sub-select)
 *
 * y descartar lo que NO es embed aunque lleve paréntesis: agregados
 * (`count()`, `monto.sum()`, `alias:id.count()`), casts (`col::text`),
 * rutas JSON (`data->>x`).
 *
 * El texto llega como `SourceText`: cada carácter con su ubicación en el
 * código fuente, para reportar `archivo:línea` exactos aunque el select se
 * arme con constantes, concatenaciones o template literals.
 */

export interface Loc {
  file: string;
  pos: number;
}

export interface SourceText {
  text: string;
  locs: Loc[];
}

/** Marca de una interpolación `${...}` que no se pudo resolver (texto opaco). */
export const OPAQUE = "\u0001";

export const JOIN_MODIFIERS = new Set(["inner", "left"]);

export interface EmbedNode {
  /** Nombre del destino tal como está escrito (tabla, columna FK o constraint). */
  name: string;
  alias: string | null;
  /** Hints (sin los modificadores inner/left). */
  hints: string[];
  modifiers: string[];
  spread: boolean;
  /** Cabecera tal como se escribió, sin espacios: `alias:tabla!hint!inner`. */
  header: string;
  /** Texto compacto del embed completo (para mostrar), recortado. */
  display: string;
  loc: Loc;
  children: EmbedNode[];
  /** Tiene partes dinámicas no resueltas en la cabecera. */
  dynamic: boolean;
}

export function sourceTextFrom(text: string, file: string, pos: number): SourceText {
  const locs: Loc[] = new Array(text.length);
  for (let i = 0; i < text.length; i++) locs[i] = { file, pos: pos + i };
  return { text, locs };
}

export function concatSourceText(parts: SourceText[]): SourceText {
  let text = "";
  const locs: Loc[] = [];
  for (const p of parts) {
    text += p.text;
    for (const l of p.locs) locs.push(l);
  }
  return { text, locs };
}

/** supabase-js quita todo espacio en blanco fuera de comillas dobles antes de mandar el select. */
function stripWhitespace(st: SourceText): SourceText {
  let text = "";
  const locs: Loc[] = [];
  let quoted = false;
  for (let i = 0; i < st.text.length; i++) {
    const c = st.text[i];
    if (c === '"') quoted = !quoted;
    if (!quoted && /\s/.test(c)) continue;
    text += c;
    locs.push(st.locs[i]);
  }
  return { text, locs };
}

const AGGREGATES = new Set(["count", "sum", "avg", "min", "max"]);

/**
 * Devuelve los embeds de primer nivel (con sus hijos) del select. Tolerante:
 * si algo no cuadra (paréntesis desbalanceados, etc.) devuelve lo que pudo.
 */
export function parseSelect(input: SourceText): EmbedNode[] {
  const st = stripWhitespace(input);
  const s = st.text;
  const fallbackLoc: Loc = st.locs[0] || input.locs[0] || { file: "?", pos: 0 };
  const locAt = (i: number): Loc => st.locs[Math.min(i, st.locs.length - 1)] || fallbackLoc;

  function parseList(from: number, to: number): EmbedNode[] {
    const out: EmbedNode[] = [];
    let depth = 0;
    let quoted = false;
    let itemStart = from;
    for (let i = from; i <= to; i++) {
      const c = i < to ? s[i] : ",";
      if (c === '"') quoted = !quoted;
      if (quoted) continue;
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth <= 0) {
        const node = parseItem(itemStart, i);
        if (node) out.push(node);
        itemStart = i + 1;
        depth = 0;
      }
    }
    return out;
  }

  function parseItem(from: number, to: number): EmbedNode | null {
    // Primer `(` fuera de comillas.
    let open = -1;
    let quoted = false;
    for (let i = from; i < to; i++) {
      if (s[i] === '"') quoted = !quoted;
      if (!quoted && s[i] === "(") {
        open = i;
        break;
      }
    }
    if (open === -1) return null; // columna simple
    let headStart = from;
    let head = s.slice(from, open);
    let spread = false;
    if (head.startsWith("...")) {
      spread = true;
      head = head.slice(3);
      headStart += 3;
    }
    // Cierre del paréntesis.
    let depth = 0;
    let close = to;
    quoted = false;
    for (let i = open; i < to; i++) {
      if (s[i] === '"') quoted = !quoted;
      if (quoted) continue;
      if (s[i] === "(") depth++;
      else if (s[i] === ")") {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    // alias:nombre — `::` es cast, no alias.
    let alias: string | null = null;
    let nameStart = headStart;
    let target = head;
    const colon = findAliasColon(head);
    if (colon >= 0) {
      alias = head.slice(0, colon);
      target = head.slice(colon + 1);
      nameStart = headStart + colon + 1;
    }
    const inner = s.slice(open + 1, close);
    // Agregados: `count()`, `col.sum()`, `alias:col.avg()`.
    if (target.includes(".")) {
      const fn = target.slice(target.lastIndexOf(".") + 1).toLowerCase();
      if (AGGREGATES.has(fn)) return null;
      // `tabla.algo(...)` no es sintaxis de embed: se ignora.
      return null;
    }
    if (AGGREGATES.has(target.toLowerCase()) && inner === "") return null;
    if (target.includes("->") || target.includes("::")) return null;
    const pieces = target.split("!");
    const name = stripQuotes(pieces[0]);
    if (!name) return null;
    const hints: string[] = [];
    const modifiers: string[] = [];
    for (const p of pieces.slice(1)) {
      const v = stripQuotes(p);
      if (!v) continue;
      if (JOIN_MODIFIERS.has(v.toLowerCase())) modifiers.push(v.toLowerCase());
      else hints.push(v);
    }
    const children = parseList(open + 1, close);
    const full = s.slice(from, Math.min(close + 1, to));
    return {
      name,
      alias,
      hints,
      modifiers,
      spread,
      header: s.slice(from, open),
      display: full.length > 120 ? full.slice(0, 117) + "..." : full,
      loc: locAt(nameStart),
      children,
      dynamic: s.slice(from, open).includes(OPAQUE),
    };
  }

  return parseList(0, s.length);
}

function findAliasColon(head: string): number {
  for (let i = 0; i < head.length; i++) {
    if (head[i] === ":") {
      if (head[i + 1] === ":") return -1;
      return i;
    }
  }
  return -1;
}

function stripQuotes(v: string): string {
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') return v.slice(1, -1);
  return v;
}

/** true si el select (ya resuelto) tiene algún paréntesis: candidato a tener embeds. */
export function mayHaveEmbeds(text: string): boolean {
  return text.includes("(");
}
