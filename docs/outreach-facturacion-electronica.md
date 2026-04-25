# Outreach a proveedores de facturación electrónica (SUNAT)

> Destinatarios priorizados: **Nubefact** (🥇 reseller program formal) y **Factpro** (🥈 partner LATAM).
> Remitente: Oscar Duran, fundador de Yenda.
> Objetivo: obtener información de API + condiciones de partnership/reseller para integrar emisión de boletas y facturas dentro de Yenda.

---

## TL;DR — A quién contactar y por dónde

### 🥇 Nubefact — contacto principal

- **Formulario reseller (recomendado)**: [nubefact.com/cotizar?tipo=PSE-RESELLER](https://www.nubefact.com/cotizar?tipo=PSE-RESELLER)
- **Emails**: `ventas@nubefact.com` · `soporte@nubefact.com`
- **Docs de API**: [nubefact.com/integracion](https://www.nubefact.com/integracion)
- **Página del programa reseller**: [nubefact.com/revendedor](https://www.nubefact.com/revendedor)
- **Usa**: Versión A del email abajo + mencionar explícitamente "programa de revendedor con sub-cuentas y subdominio propio" (su terminología).
- **Nota de precio referencial** (pública, verificar vigencia): S/ 1,000 setup + S/ 45/mes por empresa + S/ 0.025 por doc sobre los 500/mes. Si el setup es deal-breaker para tu modelo, negócialo en la segunda ronda.

### 🥈 Factpro — contacto secundario (en paralelo)

- **Página partner**: [factpro.la/partner](https://factpro.la/partner/)
- **Docs de API**: [docs.factpro.la](https://docs.factpro.la)
- **Sitio principal**: [factpro.la](https://factpro.la)
- **Usa**: Versión A ajustada — enfatiza que Yenda planea expandir a otros países LATAM (es su diferenciador).

### ❌ NO contactes Susii

Aunque `susii.com` existe, **es un competidor** — SaaS de facturación para PYMES, no infraestructura API embebible. Si les escribes mencionando Yenda, probablemente nos catalogan como competencia y no responden (o peor, leakean info). Descarta.

### Alternativas backup (solo si Nubefact + Factpro no cuajan)

| Proveedor | Partner program | Fortaleza | Contacto |
|---|---|---|---|
| APIsPerú | No formalizado, negociable | Mejor costo + DNI/RUC/WhatsApp API en el mismo proveedor | [apisperu.pe](https://apisperu.pe) |
| APISUNAT (Lucode) | No publicado | Pay-per-use, sin certificado digital propio requerido | [apisunat.com](https://apisunat.com) |
| Mifact | No publicado | Planes por volumen, PSE autorizado | [mifact.net/integracion](https://mifact.net/integracion/) |
| Efact | No publicado | PSE + OSE, alianza Interbank (marca fuerte) | [efact.pe](https://www.efact.pe) |

---

## Versión A — Email directo (para ventas@ / partnerships@ / contacto@)

**Asunto:** Consulta de integración API + partnership — SaaS médico Yenda

---

Estimados,

Me llamo **Oscar Duran**, fundador de **Yenda** ([yenda.app](https://yenda.app)), un SaaS de gestión clínica multi-tenant enfocado en el mercado peruano. Hoy damos soporte a centros de fertilidad, consultorios independientes y clínicas medianas con agenda inteligente, historia clínica electrónica, cobros, portal del paciente y reportes.

Estamos **arrancando con nuestro primer cliente piloto este mes** (un centro de fertilidad en Lima) y en los próximos 6 meses proyectamos llevar la plataforma a **10–20 clínicas activas** en el país. La facturación electrónica SUNAT es uno de los primeros módulos que necesitan nuestros clientes — hoy emiten sus comprobantes en sistemas separados y quieren hacerlo desde Yenda, sin cambiar de ventana.

Escribo para explorar una **integración técnica y comercial** con ustedes. Específicamente tengo 3 preguntas:

1. **API**: ¿cuentan con API pública documentada para emitir boletas de venta y facturas desde software de terceros? Idealmente con endpoints para emitir, anular, consultar estado y descargar PDF/XML. ¿Tienen SDK o documentación abierta a la que pueda acceder?

2. **Programa de partner / reseller**: ¿tienen modalidad para SaaS verticales como el mío? Me interesan esquemas tipo:
   - Cuenta maestra con sub-cuentas por cliente (cada clínica con su propio RUC)
   - Facturación al SaaS (Yenda) en lugar de al cliente final
   - Precios preferenciales por volumen comprometido
   - White-label o co-branding si aplica

3. **Onboarding de clientes**: ¿cómo es el flujo de alta para una nueva clínica (validación de RUC, certificado digital, series autorizadas)? Me interesa entender cuánto podemos automatizar desde nuestro lado.

Si hubiera interés de su parte, puedo compartir más detalles del roadmap de Yenda y el perfil de clínicas que atendemos. Mi idea es cerrar la decisión de proveedor en las próximas 3–4 semanas para empezar integración antes del Q3.

Quedo atento a su respuesta. Si les es más cómodo, puedo agendar una llamada breve (20–30 min).

Saludos cordiales,

**Oscar Duran**
Fundador — Yenda
[yenda.app](https://yenda.app) · [oscar@yenda.app o el email que uses]
[+51 tu-teléfono si quieres darlo]

---

## Versión B — Formulario de contacto (más corta, campos limitados)

> Úsala cuando el portal tiene un form con 500–1000 caracteres máximo.

**Nombre:** Oscar Duran
**Empresa:** Yenda (yenda.app)
**Cargo:** Fundador / CEO
**Asunto / Tema:** Integración API + partnership para SaaS médico

**Mensaje:**

Soy fundador de Yenda, un SaaS de gestión clínica para el mercado peruano (yenda.app). Arrancamos piloto este mes con un centro de fertilidad en Lima y proyectamos 10–20 clínicas activas en 6 meses.

Me interesa integrar la emisión de boletas y facturas electrónicas directamente desde Yenda, para que nuestras clínicas no tengan que salir a un sistema separado. Tengo 3 consultas:

1. ¿Tienen API pública para emitir, anular y consultar comprobantes desde software externo? Documentación disponible.
2. ¿Cuentan con programa de partner o reseller para SaaS verticales (cuenta maestra con sub-cuentas por cliente, facturación al SaaS, precios por volumen)?
3. ¿Cómo es el onboarding automatizable de una nueva clínica (RUC, certificado digital, series)?

Si hay interés, puedo agendar una llamada breve. Gracias.

— Oscar Duran, Yenda

---

## Checklist antes de enviar

Antes de disparar a cualquier proveedor, ten a mano:

- [ ] **Email corporativo** (oscar@yenda.app u oscar@algún-dominio-tuyo). **No uses Gmail personal** — baja mucho la tasa de respuesta B2B.
- [ ] **URL funcional**: [yenda.app](https://yenda.app) debe cargar y verse seria. (Ya está ✅)
- [ ] **LinkedIn de Oscar Duran** actualizado con "Fundador en Yenda" — muchos sales managers googlean al remitente antes de responder.
- [ ] **Número de contacto** opcional. Si lo pones y te llaman, alguien tiene que contestar.
- [ ] **Expectativa de respuesta**: 3–7 días hábiles. Si no responden en 10 días, segundo follow-up corto ("hago el follow-up por si el email se perdió").

---

## Qué NO poner en la carta

- ❌ **No digas que somos "startup en pre-seed"** o similares que pongan en duda la viabilidad. Lo somos, pero no lo adelantes — te ponen en cola baja.
- ❌ **No prometas volúmenes inflados** ("1000 clínicas en 6 meses"). Si después no lo cumples, quedas mal. La cifra real (10–20) ya es volumen razonable para un partner local.
- ❌ **No pidas descuento antes de que ellos te hayan enviado su pricing**. Se negocia en la segunda ronda.
- ❌ **No entres en detalles técnicos profundos** (stacks, schemas). Ellos aún no saben si vale la pena. Los detalles van en la llamada.

---

## Variante específica para Factpro (multi-LATAM)

Factpro se diferencia porque su visión es multi-país. Vale la pena ajustar un párrafo de la Versión A cuando les escribas a ellos para resonar con su propuesta:

**Reemplazar el primer párrafo por:**

> Me llamo **Oscar Duran**, fundador de **Yenda** ([yenda.app](https://yenda.app)), un SaaS de gestión clínica enfocado en el mercado peruano con visión de expandir a Colombia y México en los próximos 12–18 meses. Hoy damos soporte a centros de fertilidad, consultorios independientes y clínicas medianas con agenda inteligente, historia clínica electrónica, cobros, portal del paciente y reportes.

**Reemplazar el segundo párrafo por:**

> Estamos arrancando con nuestro primer cliente piloto este mes (un centro de fertilidad en Lima) y proyectamos 10–20 clínicas activas en Perú en los próximos 6 meses. La facturación electrónica es uno de los primeros módulos que necesitan nuestros clientes — y su visión multi-país LATAM nos resulta atractiva pensando en nuestra propia expansión.

El resto de la carta queda igual.

---

## Tabla de seguimiento

Llena esta tabla conforme vayas avanzando con cada contacto. Guárdala aquí mismo o pásala a Notion/Trello si prefieres.

| Proveedor | Canal usado | Fecha envío | Fecha respuesta | Responsable asignado | Pricing recibido | Llamada agendada | Estado |
|---|---|---|---|---|---|---|---|
| Nubefact | [Formulario reseller](https://www.nubefact.com/cotizar?tipo=PSE-RESELLER) | — | — | — | — | — | 📥 Pendiente enviar |
| Factpro | [factpro.la/partner](https://factpro.la/partner/) | — | — | — | — | — | 📥 Pendiente enviar |

**Estados posibles:**
- 📥 Pendiente enviar
- 📤 Enviado (esperando respuesta)
- 🔄 Follow-up 1 (después de 7 días sin respuesta)
- 💬 En conversación
- 📋 Pricing recibido
- 📞 Llamada agendada
- ✅ Condiciones aceptadas — listos para integrar
- ❌ Descartado + razón

---

## Follow-up si no responden en 7 días

Si pasa una semana sin respuesta, envía un follow-up corto (NO reenvíes el email completo):

```
Asunto: Re: Consulta de integración API + partnership — SaaS médico Yenda

Hola,

Hago el follow-up del correo de la semana pasada por si se les perdió
en la bandeja. Sigo interesado en conocer si tienen programa de
[reseller / partner] para SaaS verticales y cómo funcionan los
precios por volumen.

Si hay un mejor canal para esta consulta (otra persona, teléfono,
formulario), avísame y ajusto.

Gracias,
Oscar Duran — Yenda
```

Si después de **2 follow-ups** (día 7 y día 14) no hay respuesta, baja la prioridad de ese proveedor y pasa al siguiente del ranking.

---

## Qué pedirles cuando respondan

Cuando te contesten y programen la llamada / envíen docs, ten claras estas 8 cosas a preguntar:

1. **Modelo comercial exacto**: ¿setup único + mensualidad? ¿commit mínimo anual? ¿penalidad por salida?
2. **Sub-cuentas**: ¿una por RUC (clínica) bajo una cuenta maestra (Yenda)? ¿quién paga — la clínica o Yenda?
3. **Onboarding**: ¿cuánto toma activar una nueva clínica (RUC + certificado digital + series)? ¿cuánto puedo automatizar desde mi lado vía API?
4. **Certificado digital**: ¿lo provees tú o la clínica tiene que traer el suyo? Si es el suyo, ¿qué proveedores aceptan?
5. **Series autorizadas**: ¿puedo crear series/numeración programáticamente o hay que solicitar a SUNAT manualmente?
6. **Anulaciones y notas de crédito**: ¿API soporta todo el flujo o hay operaciones que requieren sitio web?
7. **SLA**: uptime, tiempo de respuesta a caídas, compromiso si SUNAT está down.
8. **White-label**: ¿la clínica puede ver tu marca en algún momento (emails de SUNAT, PDF del comprobante)? Idealmente la clínica nunca ve el logo del proveedor.

Copia estas 8 preguntas al final de tu email si quieres respuesta estructurada desde el inicio (truco B2B que acelera 1-2 rondas).

---

## Checklist antes del envío real

Antes de disparar a cualquier proveedor, ten a mano:

- [ ] **Email corporativo** funcional (oscar@yenda.app). **No uses Gmail personal** — baja mucho la tasa de respuesta B2B.
- [ ] **yenda.app** carga y se ve serio (✅ ya está).
- [ ] **LinkedIn de Oscar Duran** actualizado con "Fundador en Yenda". Muchos sales managers googlean al remitente antes de responder.
- [ ] **Número de WhatsApp Business** opcional pero suma.
- [ ] **Expectativa de respuesta**: 3–7 días hábiles. Después follow-up.

Si quieres algún ajuste a la carta (teléfono, firma, link a deck/one-pager si tienes), dime y lo edito.
