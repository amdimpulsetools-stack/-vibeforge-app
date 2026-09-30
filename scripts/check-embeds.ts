/**
 * check:embeds — chequeo ESTÁTICO de embeds de PostgREST ambiguos.
 *
 *   npm run check:embeds            (texto en español)
 *   npm run check:embeds -- --json  (salida JSON para máquinas)
 *
 * Por qué existe (incidente 30-sep-2026): la mig 273 agregó una segunda FK
 * patient_payments → appointments. Con dos FKs entre las mismas tablas,
 * PostgREST ya no sabe cuál usar para el embed `patient_payments(amount)` de
 * la agenda y responde PGRST201 ("more than one relationship was found"): la
 * consulta entera falla y la agenda se vio en blanco. Las pruebas de
 * migraciones no lo ven porque no pasan por PostgREST.
 *
 * Qué hace, sin base de datos:
 *   1. Reconstruye el grafo de FKs del esquema `public` leyendo
 *      supabase/migrations/*.sql en orden (rollbacks/ fuera).
 *   2. Busca los `.select("...")` de supabase-js en app/, lib/, components/ y
 *      hooks/ y extrae sus embeds `[alias:]tabla[!hint](...)`, con la tabla
 *      padre (`.from("x")`, `.rpc("f")` o el embed que lo contiene).
 *   3. RIESGO ALTO (sale con código 1):
 *      - embed sin hint entre dos tablas con 2+ relaciones (FKs en cualquier
 *        dirección, o many-to-many vía tabla puente) → PGRST201;
 *      - embed sin hint de una tabla sobre sí misma (FK autorreferente);
 *      - hint que no coincide con ninguna FK (→ PGRST200) o con varias;
 *      - embed entre tablas sin ninguna FK (→ PGRST200).
 *      AVISO (no bloquea): lo que no se puede verificar estáticamente
 *      (select dinámico, tabla fuera de las migraciones, vistas, etc.).
 *
 * Excepciones: scripts/check-embeds.allowlist.json — un array JSON de
 *   { "file": "app/ruta/archivo.tsx", "embed": "tabla" | "alias:tabla!hint",
 *     "reason": "por qué es seguro (obligatorio)" }
 * `file` es donde está ESCRITO el embed (la línea que reporta el chequeo) y
 * `embed` la cabecera del embed tal como la muestra el reporte (o solo el
 * nombre de la tabla). Una excepción que ya no coincide con nada se avisa
 * para borrarla. Se prefiere SIEMPRE arreglar el embed con un hint a sumar
 * una excepción.
 *
 * Códigos de salida: 0 OK · 1 hay riesgos altos sin excepción · 2 error del
 * propio chequeo (auto-test fallido, allowlist inválida, sin migraciones).
 *
 * Opciones: --json · --verbose (lista todos los avisos y notas del parser)
 *           --root <dir> · --migrations <dir> · --allowlist <archivo>
 */
import * as fs from "fs";
import * as path from "path";
import { analyze, Finding } from "./check-embeds/analyze";
import { runSelfTest } from "./check-embeds/self-test";
import { buildSchemaGraph } from "./check-embeds/sql-graph";
import { listSourceFiles, SelectSite, TsScanner } from "./check-embeds/ts-scan";

const SCAN_DIRS = ["app", "lib", "components", "hooks"];

interface AllowEntry {
  file: string;
  embed: string;
  reason: string;
}

interface Options {
  json: boolean;
  verbose: boolean;
  root: string;
  migrations: string;
  allowlist: string;
}

function parseArgs(argv: string[]): Options | "help" {
  const root = path.resolve(valueOf(argv, "--root") || process.cwd());
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  return {
    json: argv.includes("--json"),
    verbose: argv.includes("--verbose"),
    root,
    migrations: path.resolve(root, valueOf(argv, "--migrations") || "supabase/migrations"),
    allowlist: path.resolve(root, valueOf(argv, "--allowlist") || "scripts/check-embeds.allowlist.json"),
  };
}

function valueOf(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

function fail(msg: string): never {
  process.stderr.write(`check:embeds — ERROR del chequeo: ${msg}\n`);
  process.exit(2);
}

function loadAllowlist(file: string): AllowEntry[] {
  if (!fs.existsSync(file)) return [];
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${file} no es JSON válido (${(e as Error).message}).`);
  }
  if (!Array.isArray(data)) fail(`${file} debe ser un array JSON ([] si no hay excepciones).`);
  return data.map((raw, i) => {
    const e = raw as Partial<AllowEntry>;
    if (!e || typeof e.file !== "string" || typeof e.embed !== "string" || typeof e.reason !== "string" || !e.reason.trim()) {
      fail(`${file}[${i}]: cada excepción necesita {"file": string, "embed": string, "reason": string no vacío}.`);
    }
    return { file: e.file.trim().replace(/^\.\//, ""), embed: e.embed.replace(/\s+/g, ""), reason: e.reason.trim() };
  });
}

/** `alias:tabla!hint!inner` → ["alias:tabla!hint!inner", "tabla!hint!inner", "tabla!hint", "tabla"]. */
function embedKeys(header: string): string[] {
  const h = header.replace(/\s+/g, "").replace(/^\.\.\./, "");
  const colon = h.indexOf(":");
  const noAlias = colon >= 0 && h[colon + 1] !== ":" ? h.slice(colon + 1) : h;
  const parts = noAlias.split("!");
  const noMods = parts.filter((p, i) => i === 0 || !["inner", "left"].includes(p.toLowerCase())).join("!");
  return [h, noAlias, noMods, parts[0]];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts === "help") {
    const src = fs.readFileSync(__filename, "utf8");
    const m = /\/\*\*([\s\S]*?)\*\//.exec(src);
    process.stdout.write((m ? m[1].replace(/^ \* ?/gm, "") : "check:embeds") + "\n");
    return;
  }

  // 0. Auto-test: el chequeo debe seguir detectando el incidente.
  const selfErrors = runSelfTest();
  if (selfErrors.length) fail(`el auto-test falló (el parser dejó de detectar el incidente):\n  - ${selfErrors.join("\n  - ")}`);

  if (!fs.existsSync(opts.migrations)) fail(`no existe ${opts.migrations}`);
  const g = buildSchemaGraph(opts.migrations);
  if (!g.migrationFiles.length) fail(`no hay migraciones .sql en ${opts.migrations}`);
  const allow = loadAllowlist(opts.allowlist);

  const scanner = new TsScanner(opts.root);
  const files = listSourceFiles(opts.root, SCAN_DIRS);
  const sites: SelectSite[] = [];
  for (const f of files) {
    try {
      sites.push(...scanner.scanFile(f));
    } catch (e) {
      g.notes.push(`${scanner.rel(f)}: no se pudo escanear (${(e as Error).message}).`);
    }
  }
  const { findings, stats } = analyze(g, sites, (loc) => {
    const sf = scanner.getSourceFile(path.join(opts.root, loc.file));
    return sf ? sf.getLineAndCharacterOfPosition(loc.pos).line + 1 : 0;
  });

  // Excepciones.
  const used = new Set<number>();
  const high: Finding[] = [];
  const allowed: Finding[] = [];
  const warnings: Finding[] = [];
  for (const f of findings) {
    if (f.severity !== "alto") {
      warnings.push(f);
      continue;
    }
    const keys = embedKeys(f.embed);
    // Una excepción solo cubre ambigüedades documentadas: un hint que no
    // existe (PGRST200) nunca se puede exceptuar, rompe la consulta seguro.
    const exceptable = !/hint-(inexistente|invalido|inválido)|cabecera/.test(f.code);
    const idx = exceptable
      ? allow.findIndex((a) => a.file === f.file && keys.includes(a.embed))
      : -1;
    if (idx >= 0) {
      used.add(idx);
      allowed.push({ ...f, allowReason: allow[idx].reason });
    } else high.push(f);
  }
  // FK creada con SQL dinámico: el grafo no la ve → el chequeo no puede
  // garantizar nada. Se bloquea salvo excepción {file: "<migración>", embed: "*"}.
  const dynamicUnallowed = g.dynamicFkFiles.filter(
    (m) => !allow.some((a, i) => {
      const hit = a.file === m && a.embed === "*";
      if (hit) used.add(i);
      return hit;
    }),
  );
  const stale = allow.filter((_, i) => !used.has(i));
  const failed = high.length > 0 || dynamicUnallowed.length > 0;

  const summary = {
    migraciones: g.migrationFiles.length,
    tablas: g.tables.size,
    fks: g.fks.size,
    vistas: g.views.size,
    archivos: files.length,
    selectsConEmbeds: stats.sites - stats.unresolvedSites,
    selectsNoResueltos: stats.unresolvedSites,
    embeds: stats.embeds,
  };

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { ok: !failed, resumen: summary, riesgosAltos: high, fkDinamicas: dynamicUnallowed, excepciones: allowed, excepcionesSinUso: stale, avisos: warnings, notasParser: g.notes },
        null,
        2,
      ) + "\n",
    );
    process.exit(failed ? 1 : 0);
  }

  const out: string[] = [];
  out.push("check:embeds — embeds de PostgREST contra las FKs de las migraciones (estático, sin base de datos)");
  out.push(
    `  Migraciones: ${summary.migraciones} archivos · ${summary.tablas} tablas · ${summary.fks} FKs en public${summary.vistas ? ` · ${summary.vistas} vistas` : ""}`,
  );
  out.push(`  Código: ${summary.archivos} archivos · ${summary.selectsConEmbeds} selects con embeds · ${summary.embeds} embeds verificados`);
  out.push("");

  const block = (f: Finding) => {
    out.push(`  ${f.file}:${f.line}`);
    out.push(`    padre:      ${f.parent}`);
    out.push(`    embed:      ${f.display}`);
    out.push(`    problema:   ${f.message}`);
    if (f.relationships.length) {
      out.push("    relaciones:");
      for (const r of f.relationships) out.push(`      - ${r}`);
    }
    if (f.suggestion) out.push(`    sugerencia: ${f.suggestion}`);
    const elsewhere = f.usedAt.filter((u) => !u.startsWith(`${f.file}:`) || f.usedAt.length > 1);
    if (elsewhere.length) out.push(`    usado en:   ${f.usedAt.join(", ")}`);
    if (f.allowReason) out.push(`    excepción:  ${f.allowReason}`);
    out.push("");
  };

  if (high.length) {
    out.push(`✖ RIESGO ALTO (${high.length}) — la consulta falla en PostgREST (PGRST201/PGRST200) y la pantalla queda vacía:`);
    out.push("");
    high.forEach(block);
  }
  if (allowed.length) {
    out.push(`• Riesgos con excepción en ${path.relative(opts.root, opts.allowlist)} (${allowed.length}):`);
    out.push("");
    allowed.forEach(block);
  }
  if (stale.length) {
    out.push(`⚠ Excepciones que ya no coinciden con nada (borrarlas de ${path.relative(opts.root, opts.allowlist)}):`);
    for (const s of stale) out.push(`  - ${s.file} · ${s.embed} — ${s.reason}`);
    out.push("");
  }
  if (warnings.length) {
    const byCode = new Map<string, number>();
    for (const w of warnings) byCode.set(w.code, (byCode.get(w.code) || 0) + 1);
    out.push(`⚠ AVISOS (${warnings.length}, no bloquean): ${[...byCode.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    for (const w of warnings) {
      const what = w.embed ? `${w.parent} → ${w.embed}` : w.parent;
      out.push(`  ${w.file}:${w.line} [${w.code}] ${what}: ${w.message}`);
    }
    out.push("");
  }
  if (dynamicUnallowed.length) {
    out.push(`✖ FK CREADA CON SQL DINÁMICO (${dynamicUnallowed.length}) — no verificable estáticamente:`);
    for (const m of dynamicUnallowed) out.push(`  supabase/migrations/${m}`);
    out.push("  Escribe la FK con DDL normal o, si es imprescindible, revisa a mano los embeds y documenta la excepción {\"file\": \"<migración>\", \"embed\": \"*\", \"reason\": \"…\"}.");
    out.push("");
  }
  if (g.notes.length) {
    out.push(`Notas del parser SQL (${g.notes.length})${opts.verbose ? ":" : " — ver con --verbose"}`);
    if (opts.verbose) for (const n of g.notes) out.push(`  - ${n}`);
    out.push("");
  }
  if (failed) {
    out.push(`Resultado: FALLA — ${high.length} riesgo(s) alto(s) sin excepción${dynamicUnallowed.length ? ` y ${dynamicUnallowed.length} FK(s) con SQL dinámico` : ""}.`);
    out.push("Arreglo: agregar el hint con el nombre de la constraint, p. ej. `patient_payments!patient_payments_appointment_id_fkey(amount)`.");
    out.push("Si la FK nueva no hace falta para PostgREST, evaluar crearla sin FK (ver mig 273). Solo si es seguro, documentar la excepción.");
  } else {
    out.push(`Resultado: OK — ningún embed ambiguo${allowed.length ? ` (${allowed.length} con excepción documentada)` : ""}.`);
  }
  process.stdout.write(out.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main();
