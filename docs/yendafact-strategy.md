# YendaFact — Strategy & Roadmap

> Análisis estratégico del camino para construir un proveedor de facturación
> electrónica propio, sea como white-label, motor propio integrado a SUNAT,
> o adquisición de PSE existente. Documento vivo — actualizar al cambiar
> hipótesis o datos de mercado.

**Última actualización:** 2026-04-25
**Owner:** Producto
**Status:** No iniciado — Yenda usa Nubefact como provider único hoy.

---

## Contexto

Yenda integra Nubefact como proveedor de comprobantes electrónicos SUNAT
(boletas, facturas, NC). Funciona, está en producción con Vitra, y la
arquitectura interna en `lib/einvoice/` ya es provider-agnostic.

La pregunta estratégica: **¿deberíamos construir nuestro propio motor
SUNAT en lugar de depender de un PSE de terceros?** El nombre tentativo
del producto: **YendaFact**.

## Pricing del incumbente (Nubefact)

Datos públicos de [nubefact.com/precios](https://www.nubefact.com/precios)
al **2026-04-25**:

| Plan | Precio mes | Precio anual | Docs incluidos | Notas |
|---|---|---|---|---|
| Nubefact Online | S/70 | S/700 | 500 docs/mes | UI propia, no integrable |
| Integración TXT-JSON | S/70 | S/700 | 500 docs/mes | API REST — **el que usamos hoy** |
| Validación OSE | (otro tab) | — | — | No aplica para nuestro caso |

**Costo unitario para Yenda:** ~S/70/mes/clínica. Si negociamos volumen
(10+ clínicas) deberíamos bajar a S/40-50/mes. Pricing comparable de
competidores: Defontana ~S/90, Bizfor ~S/65, Mileniumsoft ~S/120 con
otros features incluidos. Nubefact es competitivo.

**Margen actual de Yenda:** si cobramos S/100/mes a la clínica por el
addon de facturación, el margen es S/30-60/mes/cliente — positivo pero
modesto.

## La pregunta real

**¿Cuándo construir propio empieza a ser más rentable que revender?**

Análisis económico (asumiendo equipo dedicado de 2-3 devs senior + USD
150K año 1 entre dev, infra, legal, homologación):

- Margen revendiendo Nubefact: ~USD 10-15/mes/cliente (después de costos).
- Margen propio (post-amortización año 1): USD 25-30/mes/cliente.
- **Punto de equilibrio: ~300-500 clientes activos facturando.**

Antes de eso, revender es estrictamente más rentable.

---

## Camino A — Spike técnico de 1 día (R&D, no producción)

**Objetivo:** evaluar la complejidad real construyendo el motor en sandbox
sin pretensión de operarlo en producción.

**Alcance:**
- Generador UBL 2.1 para boletas, facturas, NCs.
- Firmador XAdES-BES con xml-crypto + xadesjs.
- Cliente SOAP contra `e-beta.sunat.gob.pe` (endpoint público de pruebas
  SUNAT, NO requiere homologación).
- Catálogos SUNAT 7/9/17/51/59 + 45 más como JSON estático.
- Reglas de validación con Zod superRefine.
- Generador PDF con QR.

**Costo:** 1 día de Claude (~8-16h asistido). Cero costo regulatorio.

**Output:** código vivo en `lib/einvoice/sunat-direct/` apagado por
default. No conectado a clientes. Solo sirve para:

1. Conocer la complejidad real de cada componente.
2. Negociar mejor con Nubefact ("sabemos lo que nos costaría salir").
3. Tener base lista para Camino B cuando convenga.

**Riesgo:** ~0 (no toca clientes).

---

## Camino B — Shadow mode + homologación SUNAT en paralelo

**Objetivo:** ir hacia motor propio sin romper a clientes existentes.

**Cómo funciona:**

1. Construimos el motor (Camino A).
2. Cada vez que un cliente emite con Nubefact, **en paralelo** nuestro
   motor genera el XML que hubiera enviado, lo firma, y lo guarda en
   BD para auditoría.
3. Comparamos XML nuestro vs XML Nubefact → corregimos divergencias.
4. **Iniciamos homologación SUNAT** (proceso oficial: ~6 emisiones de
   prueba que SUNAT valida a mano, 3-6 meses calendario).
5. Día X: con homologación aprobada + 6 meses de shadow consistente,
   flippeamos el switch. La transición es invisible para el cliente
   (mismo botón "Emitir", mismo PDF, distinto motor por debajo).

**Costo:**

| Item | Estimación |
|---|---|
| Motor propio (Claude + revisión humana) | 1-2 semanas |
| Shadow mode wiring + tabla de auditoría | 2-3 días |
| Asesoría legal SUNAT/INDECOPI para homologación | USD 5-15K |
| Tiempo del founder coordinando con SUNAT | ~5h/semana × 6 meses |
| Custodia certificados digitales (HSM cloud) | USD 200-500/mes |

**Total año 1:** USD 15-30K + tiempo + 6 meses calendario para SUNAT.

**Riesgo:** medio. SUNAT puede atrasar la homologación. Si no aprueban,
seguimos con Nubefact sin pérdida real.

---

## Camino C — Adquirir un PSE existente

**Objetivo:** atajo regulatorio. Saltar los 6 meses de homologación
adquiriendo una empresa que ya esté autorizada.

**Cómo funciona:**

1. Identificar PSE chico peruano (50-200 clientes activos) en venta o
   con interés de cash-out.
2. Due diligence: estado de la autorización SUNAT, cartera, infra, deuda.
3. Adquisición: típicamente USD 50-150K dependiendo de cartera + tech.
4. Migrar clientes a nuestra infra (~3-6 meses).
5. Marca: rebrand a "YendaFact" gradual.

**Pro:**
- Autorización SUNAT heredada (cero homologación).
- Cartera inicial de clientes ya facturando con ese PSE.
- Conocimiento operativo (su equipo trae experiencia con tickets SUNAT).

**Con:**
- Capital intensivo upfront.
- Riesgo de adquirir tech stack legacy difícil de mantener.
- Hay que retener al menos 1 persona del equipo original 6-12 meses
  para no perder el know-how.

**Cuándo:** cuando Yenda tenga 200+ clientes activos y la facturación
sea revenue driver claro (≥ 20% de MRR).

---

## Camino D — White-label de Nubefact (corto plazo, recomendado)

**Objetivo:** "YendaFact" como producto de marca con Nubefact como motor
oculto. Es lo que Defontana, Mileniumsoft y otros hacen con sus motores.

**Cómo funciona:**

1. Negociar con comercial de Nubefact: pricing volumétrico + permiso
   de white-label (la mayoría de PSE peruanos lo permiten para partners
   con volumen).
2. Cambios técnicos en Yenda:
   - Headers de API con marca Yenda en lugar de "Nubefact".
   - Email del PDF saliendo desde dominio Yenda (`facturacion@yenda.app`).
   - Subdominio Nubefact con branding propio (si lo soportan).
   - Soporte cliente: el cliente nos contacta a nosotros, nosotros
     escalamos a Nubefact si es problema de motor.
3. UX para el cliente: ve "YendaFact" en todas las pantallas, comprobante,
   email. No sabe (ni le importa) que detrás corre Nubefact.

**Costo:** 1-2 semanas de dev + negociación. Riesgo ~0.

**Pro:**
- Sales narrative mucho más fuerte ("YendaFact: facturación electrónica
  nativa de Yenda").
- Cero overhead técnico nuevo.
- Cero riesgo regulatorio.
- Si más adelante migramos a motor propio (Camino B), la transición
  es invisible (los clientes ya conocen "YendaFact").

**Con:**
- Dependencia comercial de Nubefact se mantiene.
- Margen incremental modesto (depende del descuento volumétrico).
- Si Nubefact sube precios o cambia condiciones, nos arrastra.

**Cuándo:** **ahora**, en cuanto tengamos 5-10 clínicas facturando.

---

## Camino E — Multi-provider abstraction (paralelo, sin reemplazar)

**Objetivo:** sumar otros PSE como alternativas sin abandonar Nubefact.

**Cómo funciona:**

1. `lib/einvoice/` ya es provider-agnostic. Sumar Efact, Bizfor o
   Defontana como providers alternativos.
2. En el wizard, el user elige qué PSE quiere usar.
3. Yenda gana resiliencia (si uno cae, los clientes pueden migrar) y
   negociación (pricing competitivo entre providers).

**Costo:** ~1 semana por provider adicional.

**Pro:**
- Resiliencia operativa.
- Cobertura de sectores (algunos prefieren Defontana por features de
  contabilidad full).
- Anti-lock-in para Yenda y para el cliente.

**Con:**
- Soporte triplicado (problemas distintos por provider).
- Documentación y wizard más complejos.
- No reduce dependencia de PSE, solo la diversifica.

**Cuándo:** complementario a Camino D. Útil para clínicas grandes que
piden provider específico.

---

## Recomendación priorizada

### Próximos 3 meses (post-pilot Vitra, hasta ~10 clientes activos)
1. **Camino D** (white-label Nubefact). Negociación + cambio de branding.
2. Mantener Nubefact como provider único.
3. **Opcional: Camino A** (spike técnico de 1 día) como ejercicio de
   conocimiento + arsenal de negociación.

### 3-12 meses (10-100 clientes activos)
1. **Camino E** (sumar Efact como segundo provider) para resiliencia.
2. Re-negociar Nubefact con datos de uso reales.
3. Si la facturación es ≥ 15% del MRR de Yenda, evaluar Camino B.

### 12-24 meses (100-300 clientes activos)
1. **Camino B** (motor propio + homologación SUNAT en paralelo).
2. Shadow mode 6 meses para confianza.
3. Switch gradual cliente por cliente.

### 24+ meses (300+ clientes activos)
1. **Camino C** (adquisición de PSE) si aparece oportunidad y tenemos
   cash flow para amortizar.
2. O: motor propio ya en producción heredando del Camino B.

---

## Notas operativas para construcción técnica (cuando llegue el momento)

### Lo que SÍ se puede construir y operar como SaaS

- **Generador UBL 2.1**: spec pública, XSD oficiales, ~1,200 líneas de TS.
- **Firma XAdES-BES**: librerías open source maduras (xml-crypto, xadesjs).
- **Cliente SOAP**: SUNAT publica WSDL, generación automática de stubs.
- **Custodia de certificados**: AWS KMS o GCP Cloud HSM para .pfx.
- **Catálogos SUNAT**: hardcoded como JSON, refresh manual semestral.
- **Reglas de validación**: Zod + 200+ rules específicas, mantenibles.

### Lo que NO depende del código

- **Homologación SUNAT** (3-6 meses, no acelera con AI).
- **Certificados digitales de cada cliente** (compra externa, USD
  50-150/año).
- **Mantenimiento de catálogos** (SUNAT cambia 3-4 veces al año, alguien
  monitorea boletines).
- **Soporte cuando algo falla** (códigos de error SUNAT crípticos,
  necesita humanos para traducirlos).
- **Responsabilidad fiscal solidaria** (seguro de RC + estructura legal).
- **SLA SUNAT-compliant** (99.5% uptime, redundancia geográfica).

### Riesgos a vigilar

1. **Cambio regulatorio SUNAT**: si SUNAT decide centralizar más
   (ej: emisión directa sin PSE), el modelo entero cambia.
2. **Concentración**: Nubefact + Defontana cubren ~60% del mercado.
   Si uno hace dumping, presiona márgenes.
3. **Saturación**: facturación electrónica es commodity. El moat real
   está en la UX integrada (scheduler ↔ historia clínica ↔ facturación
   ↔ WhatsApp), no en el motor.

---

## Preguntas abiertas

- ¿Vitra tiene preferencia entre PSE? ¿Tiene contador con experiencia
  en alguno específico?
- ¿Qué tan crítico es el sticker price del addon facturación para el
  posicionamiento de Yenda? ¿Subimos margen pasando a propio o lo
  usamos como loss-leader?
- ¿Es defendible el branding "YendaFact" si el motor sigue siendo
  ajeno? (legal pregunta abogado).
- ¿Hay financiamiento disponible para Camino C si aparece la
  oportunidad de adquisición?
