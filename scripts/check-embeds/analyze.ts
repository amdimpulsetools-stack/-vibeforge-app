/**
 * Cruce del grafo de FKs (migraciones) con los embeds del código, replicando
 * cómo PostgREST elige la relación de un embed:
 *
 *   - Candidatas entre padre P y destino T:
 *       M2O: FK P → T          O2M: FK T → P
 *       M2M: tabla puente J con FK J → P y FK J → T distintas, cuyas
 *            columnas son parte de la PK de J (regla de PostgREST ≥ v10).
 *     Una FK autorreferente (P == T) cuenta dos veces (M2O y O2M): por eso
 *     un embed de una tabla sobre sí misma SIEMPRE necesita hint.
 *   - Sin hint: 1 candidata → OK; 0 → PGRST200; ≥ 2 → PGRST201 (el
 *     incidente de la agenda).
 *   - Con hint (`tabla!hint`): el hint filtra por nombre de constraint, por
 *     columna FK (de cualquiera de los dos lados, si la FK es de una sola
 *     columna) o por tabla puente. 0 → PGRST200; ≥ 2 → PGRST201.
 *   - El destino también puede ser una columna FK o un nombre de constraint
 *     del padre (`select=*,client_id(*)`), como en PostgREST.
 */
import type { ForeignKey, SchemaGraph } from "./sql-graph";
import { EmbedNode, Loc, OPAQUE, parseSelect } from "./select-parser";
import type { ParentRef, SelectSite } from "./ts-scan";

export interface Relationship {
  kind: "M2O" | "O2M" | "M2M";
  target: string;
  fk: ForeignKey;
  fk2?: ForeignKey;
  junction?: string;
}

export type Severity = "alto" | "aviso";

export interface Finding {
  severity: Severity;
  code: "ambiguo" | "autorreferencia" | "hint-inexistente" | "hint-ambiguo" | "sin-relacion" | "destino-desconocido" | "padre-desconocido" | "dinamico" | "vista" | "select-no-resuelto" | "esquema";
  /** Archivo y línea donde está escrito el embed (donde se arregla). */
  file: string;
  line: number;
  /** Dónde se ejecuta el `.select(...)` (si es otro lugar, p. ej. una constante importada). */
  usedAt: string[];
  parent: string;
  /** Cabecera del embed tal como está escrita: `[alias:]tabla[!hint]`. */
  embed: string;
  display: string;
  message: string;
  relationships: string[];
  suggestion: string | null;
  allowReason?: string;
}

export function relLabel(r: Relationship): string {
  const fk = r.fk;
  const cols = `${fk.table}(${fk.columns.join(", ")}) → ${fk.refTable}(${fk.refColumns.join(", ")})`;
  if (r.kind === "M2M" && r.fk2) {
    const fk2 = r.fk2;
    return `M2M vía ${r.junction}: ${fk.name} [${fk.origin}] + ${fk2.name} [${fk2.origin}]`;
  }
  return `${fk.name}: ${cols} [${r.kind}, ${fk.origin}]`;
}

export function relationshipsBetween(g: SchemaGraph, parent: string, target: string): Relationship[] {
  const out: Relationship[] = [];
  const fks = [...g.fks.values()];
  for (const fk of fks) {
    if (fk.table === parent && fk.refTable === target) out.push({ kind: "M2O", target, fk });
    if (fk.refTable === parent && fk.table === target) out.push({ kind: "O2M", target, fk });
  }
  // Many-to-many vía tabla puente.
  const byTable = new Map<string, ForeignKey[]>();
  for (const fk of fks) {
    const list = byTable.get(fk.table) || [];
    list.push(fk);
    byTable.set(fk.table, list);
  }
  for (const [jt, list] of byTable) {
    const t = g.tables.get(jt);
    if (!t || !t.pk) continue;
    const pk = new Set(t.pk.columns);
    for (const a of list) {
      if (a.refTable !== parent) continue;
      for (const b of list) {
        if (b === a || b.refTable !== target) continue;
        if ([...a.columns, ...b.columns].every((c) => pk.has(c))) {
          out.push({ kind: "M2M", target, fk: a, fk2: b, junction: jt });
        }
      }
    }
  }
  return out;
}

function matchesHint(r: Relationship, hint: string): boolean {
  // En PostgREST una relación M2M solo se elige por el nombre de la tabla puente.
  if (r.kind === "M2M") return hint === r.junction;
  const fk = r.fk;
  if (fk.name === hint) return true;
  if (fk.columns.length === 1 && (fk.columns[0] === hint || fk.refColumns[0] === hint)) return true;
  return false;
}

/** La FK "de siempre": la creada primero. Es la que el embed resolvía antes de que apareciera la ambigüedad. */
function oldest(rels: Relationship[]): Relationship {
  return rels.slice().sort((a, b) => a.fk.seq - b.fk.seq)[0];
}

function withHint(node: EmbedNode, hint: string): string {
  const alias = node.alias ? `${node.alias}:` : "";
  const mods = node.modifiers.map((m) => `!${m}`).join("");
  return `${node.spread ? "..." : ""}${alias}${node.name}!${hint}${mods}(…)`;
}

interface Ctx {
  g: SchemaGraph;
  lineOf: (loc: Loc) => number;
  site: SelectSite;
  emit: (f: Omit<Finding, "usedAt">) => void;
}

function checkEmbed(ctx: Ctx, parent: string, node: EmbedNode) {
  const { g } = ctx;
  const base = {
    file: node.loc.file,
    line: ctx.lineOf(node.loc),
    parent,
    embed: node.header,
    display: node.display,
  };
  const recurse = (target: string | null) => {
    for (const ch of node.children) {
      if (target) checkEmbed(ctx, target, ch);
    }
  };

  if (node.dynamic || node.name.includes(OPAQUE)) {
    ctx.emit({ ...base, severity: "aviso", code: "dinamico", message: "Embed con partes dinámicas no resueltas: no se puede verificar.", relationships: [], suggestion: null });
    return;
  }
  if (g.views.has(parent) || g.views.has(node.name)) {
    ctx.emit({ ...base, severity: "aviso", code: "vista", message: "Embed sobre una vista: sus relaciones no se modelan, revisar a mano.", relationships: [], suggestion: null });
    return;
  }
  const hint = node.hints[0] || null;
  const extraHints = node.hints.length > 1;

  if (g.tables.has(node.name)) {
    const target = node.name;
    const rels = relationshipsBetween(g, parent, target);
    const labels = rels.map(relLabel);
    if (!hint) {
      if (rels.length === 1) {
        recurse(target);
        return;
      }
      if (rels.length === 0) {
        ctx.emit({
          ...base,
          severity: "alto",
          code: "sin-relacion",
          message: `No hay ninguna FK entre ${parent} y ${target} en las migraciones: PostgREST respondería PGRST200.`,
          relationships: [],
          suggestion: null,
        });
        recurse(target);
        return;
      }
      const old = oldest(rels);
      const hintName = old.kind === "M2M" ? (old.junction as string) : old.fk.name;
      ctx.emit({
        ...base,
        severity: "alto",
        code: parent === target ? "autorreferencia" : "ambiguo",
        message:
          parent === target
            ? `Embed de ${target} sobre sí misma: la FK autorreferente da ${rels.length} relaciones posibles → PGRST201. Necesita hint.`
            : `${rels.length} relaciones posibles entre ${parent} y ${target} → PostgREST responde PGRST201 ("more than one relationship was found") y la consulta entera falla.`,
        relationships: labels,
        suggestion: `${withHint(node, hintName)}   (la FK más antigua; confirmar que es la que corresponde)`,
      });
      recurse(target);
      return;
    }
    const matching = rels.filter((r) => matchesHint(r, hint));
    if (matching.length === 1) {
      if (extraHints) {
        ctx.emit({ ...base, severity: "aviso", code: "hint-ambiguo", message: `Más de un hint (${node.hints.join(", ")}): PostgREST solo admite uno.`, relationships: labels, suggestion: null });
      }
      recurse(target);
      return;
    }
    if (matching.length === 0) {
      ctx.emit({
        ...base,
        severity: "alto",
        code: "hint-inexistente",
        message: `El hint "${hint}" no coincide con ninguna FK entre ${parent} y ${target} en las migraciones → PostgREST respondería PGRST200.`,
        relationships: labels,
        suggestion: rels.length ? rels.map((r) => withHint(node, r.kind === "M2M" ? (r.junction as string) : r.fk.name)).join("  |  ") : null,
      });
      recurse(target);
      return;
    }
    ctx.emit({
      ...base,
      severity: "alto",
      code: "hint-ambiguo",
      message: `El hint "${hint}" coincide con ${matching.length} relaciones entre ${parent} y ${target} → PGRST201. Usar el nombre de la constraint.`,
      relationships: matching.map(relLabel),
      suggestion: matching.map((r) => withHint(node, r.kind === "M2M" ? (r.junction as string) : r.fk.name)).join("  |  "),
    });
    recurse(target);
    return;
  }

  // El destino no es una tabla: ¿columna FK o nombre de constraint del padre?
  if (g.tables.has(parent)) {
    const cands: { target: string; fk: ForeignKey }[] = [];
    for (const fk of g.fks.values()) {
      if (fk.table === parent && (fk.name === node.name || (fk.columns.length === 1 && fk.columns[0] === node.name))) {
        cands.push({ target: fk.refTable, fk });
      } else if (fk.refTable === parent && fk.name === node.name) {
        cands.push({ target: fk.table, fk });
      }
    }
    if (cands.length === 1) {
      recurse(cands[0].target);
      return;
    }
    if (cands.length > 1) {
      ctx.emit({
        ...base,
        severity: "alto",
        code: "ambiguo",
        message: `"${node.name}" coincide con ${cands.length} relaciones de ${parent} → PGRST201.`,
        relationships: cands.map((c) => `${c.fk.name} [${c.fk.origin}]`),
        suggestion: null,
      });
      return;
    }
  }
  ctx.emit({
    ...base,
    severity: "aviso",
    code: "destino-desconocido",
    message: `"${node.name}" no es una tabla conocida en las migraciones ni una FK de ${parent} (¿tabla creada fuera de migraciones?). No se verifica.`,
    relationships: [],
    suggestion: null,
  });
}

export interface AnalyzeResult {
  findings: Finding[];
  stats: { sites: number; embeds: number; unresolvedSites: number };
}

export function analyze(g: SchemaGraph, sites: SelectSite[], lineOf: (loc: Loc) => number): AnalyzeResult {
  const byKey = new Map<string, Finding>();
  let embeds = 0;
  let unresolvedSites = 0;
  for (const site of sites) {
    const usedAt = `${site.file}:${site.line}`;
    const emit = (f: Omit<Finding, "usedAt">) => {
      const key = `${f.file}|${f.line}|${f.embed}|${f.parent}|${f.code}`;
      const prev = byKey.get(key);
      if (prev) {
        if (!prev.usedAt.includes(usedAt)) prev.usedAt.push(usedAt);
        return;
      }
      byKey.set(key, { ...f, usedAt: [usedAt] });
    };
    if (site.unresolved) {
      unresolvedSites++;
      emit({
        severity: "aviso",
        code: "select-no-resuelto",
        file: site.file,
        line: site.line,
        parent: site.parents.map(parentName).join(" | "),
        embed: "",
        display: "",
        message: "El argumento de .select() no se pudo resolver estáticamente: sus embeds (si los hay) no se verifican.",
        relationships: [],
        suggestion: null,
      });
      continue;
    }
    const lineCtx = { g, lineOf, site, emit };
    const seenEmbeds = new Set<string>();
    for (const variant of site.variants) {
      const nodes = parseSelect(variant);
      for (const pr of dedupeParents(site.parents)) {
        for (const node of nodes) {
          const k = `${pr.kind}:${pr.name}|${node.loc.file}:${node.loc.pos}|${node.header}`;
          if (!seenEmbeds.has(k)) {
            seenEmbeds.add(k);
            embeds += countEmbeds(node);
          }
          const parent = resolveParent(g, pr);
          if (parent.table) checkEmbed(lineCtx, parent.table, node);
          else {
            emit({
              severity: "aviso",
              code: parent.code,
              file: node.loc.file,
              line: lineOf(node.loc),
              parent: parentName(pr),
              embed: node.header,
              display: node.display,
              message: parent.message,
              relationships: [],
              suggestion: null,
            });
          }
        }
      }
    }
  }
  const findings = [...byKey.values()].sort(
    (a, b) => (a.severity === b.severity ? 0 : a.severity === "alto" ? -1 : 1) || a.file.localeCompare(b.file) || a.line - b.line,
  );
  return { findings, stats: { sites: sites.length, embeds, unresolvedSites } };
}

function countEmbeds(n: EmbedNode): number {
  return 1 + n.children.reduce((s, c) => s + countEmbeds(c), 0);
}

function parentName(p: ParentRef): string {
  if (p.kind === "rpc") return `rpc ${p.name}()`;
  if (p.kind === "schema") return `esquema ${p.name}`;
  if (p.kind === "unknown") return `? (${p.name})`;
  return p.name;
}

function dedupeParents(ps: ParentRef[]): ParentRef[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = `${p.kind}:${p.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function resolveParent(g: SchemaGraph, p: ParentRef): { table: string | null; code: Finding["code"]; message: string } {
  if (p.kind === "table") {
    if (g.tables.has(p.name) || g.views.has(p.name)) return { table: p.name, code: "padre-desconocido", message: "" };
    return { table: null, code: "padre-desconocido", message: `La tabla padre "${p.name}" no aparece en las migraciones: no se verifica.` };
  }
  if (p.kind === "rpc") {
    const t = g.functions.get(p.name);
    if (t && g.tables.has(t)) return { table: t, code: "padre-desconocido", message: "" };
    return { table: null, code: "padre-desconocido", message: `No se sabe qué tabla devuelve la RPC ${p.name}(): no se verifica.` };
  }
  if (p.kind === "schema") return { table: null, code: "esquema", message: `Consulta sobre el esquema "${p.name}": fuera del alcance del chequeo.` };
  return { table: null, code: "padre-desconocido", message: `No se pudo determinar la tabla padre (${p.name}): no se verifica.` };
}
