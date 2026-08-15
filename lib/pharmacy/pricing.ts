/**
 * Aritmética de precios del POS de Farmacia.
 *
 * NO HAY MATEMÁTICA NUEVA AQUÍ. Este archivo es una re-exportación
 * deliberada de `lib/einvoice/mapper.ts`, que tras el refactor de F2
 * contiene la aritmética fiscal AGNÓSTICA de proveedor (nada de NubeFact
 * vive ahí: eso está en `nubefact-provider.ts`).
 *
 * Existe por una sola razón: que el módulo de farmacia no tenga que
 * importar desde `lib/einvoice/` —cuyo nombre sugiere emisión
 * electrónica, y la F4 NO EMITE NADA— sin que eso tiente a nadie a
 * escribir una segunda versión de la misma fórmula. Dos implementaciones
 * del IGV es exactamente la forma de que una venta y su comprobante
 * dejen de cuadrar por céntimos.
 *
 * La MISMA fórmula está portada a plpgsql en las columnas GENERATED de
 * `pharmacy_sale_items` (mig 216), que son la fuente de verdad: lo de
 * aquí es la vista previa en vivo del carrito. Si alguna vez hay que
 * cambiarla, se cambia en los dos sitios a la vez — y las pruebas de
 * `supabase/tests/pharmacy/` comparan el resultado de la base contra
 * estos mismos casos.
 */

export {
  computeLineTax,
  isTaxedAffectation,
  round2,
  round4,
  type LineTaxAmounts,
  type LineTaxInput,
} from "@/lib/einvoice/mapper";

/** IGV vigente en Perú. La mig 216 lo fija con un CHECK en la cabecera. */
export const IGV_PERCENT = 18;
