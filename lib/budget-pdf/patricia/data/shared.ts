/**
 * Constantes compartidas por los 12 presupuestos de la Dra. Patricia
 * Quispe (REPROFERTILIDAD EIRL).
 *
 * Fuente: docs/Budgets/NUEVOS PRESUPUESTOS PARA IMPRIMIR/*.docx
 * (13 presupuestos; Banking de Ovocitos queda parqueado — ver
 * `../routing.ts`). El xlsx PRESUPUESTOS.xlsx de la misma carpeta
 * (precios de octubre 2025) se IGNORA por decisión del founder: manda
 * el .docx.
 *
 * Todos los montos son strings pre-formateados "1,234.00" — la
 * plantilla añade el prefijo "S/" o "US$" (misma filosofía que
 * `../../data/fiv-tiers.ts`).
 *
 * ── Precios fijos ────────────────────────────────────────────────
 * La org de Patricia corre con `pricing_mode = 'single'` (mig 181):
 * un precio cerrado por tratamiento, sin paquetes A/B/C y SIN ajuste
 * manual de honorarios. Por eso estos data files son constantes
 * planas y no `Record<"A"|"B"|"C", …>` como los de Vitra, y el render
 * ignora `props.honorariosAdjustment` (ver `../render.ts`).
 */

// El tarifario NGS / PGT-A de los .docx de Patricia es idéntico al de
// Vitra (mismo laboratorio externo). Se reusa la constante en lugar de
// duplicarla; es un import de solo lectura, cero diffs en Vitra.
export { FIV_NGS_PRICES } from "../../data/fiv-tiers";

/**
 * Bloque "SEMEN DONADO" — aparece verbatim en 4 presupuestos
 * (FIV con semen donado, FIV óvulos donados + semen donado, IIU con
 * semen donado, Método ROPA). El rango es referencial y en dólares.
 *
 * PII de terceros: los .docx nombran a dos personas de contacto con su
 * celular/correo personal. Se conservan solo las INSTITUCIONES y el
 * buzón corporativo publicado por Fairfax; los nombres y el móvil
 * particular quedan fuera del repo. Si la clínica los quiere impresos,
 * el bloque se puede sustituir por completo desde
 * `org_plugins.config` sin deploy.
 */
export const SEMEN_DONADO = {
  rango_usd: "500 – 2,500",
  bancos: [
    {
      nombre:
        "Banco de semen del Instituto de Medicina Reproductiva · Clínica Ricardo Palma",
      detalle: "Lima, Perú (banco nacional)",
    },
    {
      nombre: "Fairfax Cryobank",
      detalle: "fairfaxcryobank.com · informacion@fairfaxcryobank.com",
    },
  ],
};

/** Costo del control ecográfico si no se llega a iniciar tratamiento. */
export const CONTROL_ECOGRAFICO_SUELTO = "200.00";

/** Mantenimiento mensual de embriones / ovocitos criopreservados. */
export const MANTENIMIENTO_MENSUAL = "80.00";

/** Medicación de estimulación ovárica si la paciente de IIU la requiere. */
export const IIU_MEDICACION_OPCIONAL = "1,500.00";
