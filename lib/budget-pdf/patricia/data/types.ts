/**
 * Formas de desglose de los presupuestos de la Dra. Patricia Quispe.
 *
 * Los 12 presupuestos activos se reducen a un puñado de bloques
 * reutilizables. Cada data file compone los que necesita y expone un
 * `total_formatted` que SIEMPRE es la suma real de sus ítems (ver las
 * erratas documentadas en `fiv-mixto.ts`, `ovodon-semen-donado.ts` y
 * `ropa.ts`).
 *
 * Convención de nombres = la del .docx original, para que un revisor
 * pueda poner el documento al lado y cotejar línea por línea.
 */

/** Ciclo FIV completo con óvulos propios (estimulación → vitrificación). */
export interface CicloFivPropio {
  subtotal: string;
  /** "Consulta médica y controles ovulatorios" */
  consulta: string;
  /** "Medicación hormonal para estimulación ovárica (aproximado)" */
  medicacion: string;
  /** "Honorarios médicos (pago en efectivo o transferencia bancaria)" */
  honorarios: string;
  /** "Aspiración folicular + procedimiento de FIV-ICSI" */
  aspiracion_fiv: string;
  /** "Vitrificación de embriones" */
  vitrificacion: string;
}

/** Ciclo FIV con óvulos de donante (el paquete de la donante ya incluye todo). */
export interface CicloFivDonante {
  subtotal: string;
  /** "Óvulos de la donante (incluye medicación, exámenes, evaluaciones y aspiración folicular)" */
  ovulos_donante: string;
  /** "Procedimiento de FIV-ICSI + vitrificación de embriones" */
  procedimiento: string;
  honorarios: string;
}

/** Transferencia embrionaria — dos líneas en todos los presupuestos. */
export interface Transferencia {
  subtotal: string;
  honorarios: string;
  /** "Control endometrial, desvitrificación de embriones y transferencia embrionaria" */
  control_endometrial: string;
}

/** Criopreservación de ovocitos — fase única. */
export interface CicloCrio {
  subtotal: string;
  /** "Consulta médica y controles ovulatorios + aspiración folicular + vitrificación de ovocitos" */
  procedimiento: string;
  /** "Medicinas para estimulación ovárica (aproximado)" */
  medicacion: string;
  honorarios: string;
}

/**
 * Presupuesto con un único monto cerrado y los ítems SIN precio por
 * línea (así están redactados los dos de inseminación intrauterina en
 * el .docx: la lista de lo que incluye, y abajo un TOTAL).
 */
export interface PaqueteCerrado {
  total_formatted: string;
}
