# Outreach a Nubefact — Programa Revendedor (Post-integración)

> Segunda ronda de outreach. La primera (`outreach-facturacion-electronica.md`)
> era para conseguir info de API y condiciones de partnership cuando Yenda
> aún no había integrado.
>
> **Momento actual (2026-04-25):** Yenda ya integró Nubefact vía API REST
> (cuentas individuales por clínica, pricing público S/70/mes). Tenemos
> Vitra como cliente piloto facturando en producción con BBB1 / FFF1.
> Objetivo de esta ronda: pasar al programa REVENDEDOR con sub-cuentas,
> subdominio propio y pricing volumétrico.

**Página de referencia:** [nubefact.com/revendedor](https://www.nubefact.com/revendedor)
**Cotización formal:** [nubefact.com/cotizar?tipo=PSE-RESELLER](https://www.nubefact.com/cotizar?tipo=PSE-RESELLER)
**Contactos directos:** `ventas@nubefact.com` · `soporte@nubefact.com`

---

## ⚠️ Antes de mandar — decisiones a tomar

### 1. Entidad jurídica que firma

Nubefact te va a pedir **razón social + RUC** para emitir el contrato y
las facturas mensuales. Definí cuál de estas opciones aplica:

- **Opción A — Yenda S.A.C. (o como se llame)** ya constituida con RUC.
  - El contrato sale a nombre de Yenda.
  - El email sale firmado por Oscar Duran como fundador de Yenda.
  - Marca y entidad jurídica coinciden — la opción más limpia comercialmente.

- **Opción B — Corpcomdigital S.A.C.** (entidad jurídica del socio).
  - El contrato sale a nombre de Corpcomdigital, Yenda es la marca de
    producto que opera bajo ese paraguas legal.
  - El email sale firmado por Oscar Duran como fundador de Yenda
    (marca), aclarando que la entidad firmante es Corpcomdigital.
  - Es lo común cuando una marca de producto vive bajo una empresa de
    servicios más grande. Nubefact no objeta esto si los datos legales
    cierran.

**Importante:** la firma del email comercial puede decir *"fundador de
Yenda"* en ambos casos — eso es marketing. Lo que importa para Nubefact
en el legal es la razón social + RUC que pongas en el formulario y en
el contrato eventual.

### 2. Mención del cliente piloto (Vitra)

El email muestra tracción mencionando que Vitra ya emite en producción.
Eso es prueba social fuerte para Nubefact, pero **mencionar a un cliente
por nombre sin su permiso** es delicado:

- **Pedile permiso explícito a Vitra antes de enviar** — un mensaje
  corto: *"¿Te parece si los menciono a Nubefact como caso piloto
  cuando arme el deal de reseller? Sin compartir números, solo el
  hecho de que están emitiendo con BBB1/FFF1."*
- **Alternativa sin permiso:** referirte a *"primera clínica piloto
  (fertilidad, en Lima)"* — sin nombre. Pierde algo de fuerza pero es
  legalmente seguro.

### 3. Datos numéricos a incluir

Solo poné números reales o rangos. **No inventes**. Si todavía no tenés
2 semanas de uso, decílo así:

> *"Vitra arrancó la semana del 28 de abril; tendré primeros datos de
> volumen en 2 semanas. Quería arrancar la conversación ahora porque
> migrar al modelo Reseller destrabaría que las próximas 3 clínicas en
> pipeline arranquen ya bajo ese esquema."*

---

## Email principal — Versión A (Yenda S.A.C. ya constituida)

**Asunto:** Yenda — Activar programa Revendedor (ya integrados, escalando con clínicas)

```
Hola equipo de Nubefact,

Soy Oscar Duran, fundador de Yenda (yenda.app), un SaaS de gestión clínica
para Perú: agenda, historia clínica, pacientes, cobros y facturación
electrónica integrados. La razón social que firmaría el contrato con
ustedes sería [YENDA S.A.C.] — RUC [20XXXXXXXXX].

Les escribo porque ya integramos Nubefact vía su API REST y estamos
emitiendo en producción con nuestra primera clínica piloto (clínica de
fertilidad en Lima). El flujo funciona: emisión desde la cita, boletas
con BBB1, facturas con FFF1, pagos parciales, notas de crédito, todo
conectado nativamente. Plan: sumar 5-10 clínicas más en los próximos
60 días.

Queremos pasar al programa Revendedor que veo publicado en su sitio.
La idea es ofrecer la facturación electrónica como parte integral de
Yenda ("YendaFact"), con cada clínica funcionando bajo nuestra cuenta
master en lugar de tener su propia cuenta Nubefact directa.

Tres preguntas concretas para arrancar la conversación:

  1. Pricing volumétrico del programa Revendedor — ¿qué condiciones manejan
     para 10, 50, 100 sub-cuentas activas? ¿Hay setup fee?

  2. Subdominio propio — ¿podemos usar facturacion.yenda.app como dominio
     del panel para nuestras clínicas, en lugar de un subdominio .pse.pe?

  3. Soporte de primera línea — ¿el cliente final (clínica) nos contacta
     a nosotros y nosotros escalamos a ustedes para issues técnicos? ¿O
     ustedes atienden directo?

Si tiene sentido, podemos coordinar una llamada de 20 min esta semana o
la próxima. Mi calendar: [tu-link-de-calendario].

Saludos,
Oscar Duran
Fundador, Yenda
oscar@yenda.app · +51 9XXXXXXXX
```

---

## Email principal — Versión B (Corpcomdigital firma, Yenda es marca)

**Asunto:** Yenda — Activar programa Revendedor (ya integrados, escalando con clínicas)

```
Hola equipo de Nubefact,

Soy Oscar Duran, fundador de Yenda (yenda.app), un SaaS de gestión clínica
para Perú: agenda, historia clínica, pacientes, cobros y facturación
electrónica integrados. Yenda opera bajo nuestra empresa
[CORPCOMDIGITAL S.A.C.] — RUC [20XXXXXXXXX] —, que es la entidad que
firmaría el contrato del programa Revendedor.

Les escribo porque ya integramos Nubefact vía su API REST y estamos
emitiendo en producción con nuestra primera clínica piloto (clínica de
fertilidad en Lima). El flujo funciona: emisión desde la cita, boletas
con BBB1, facturas con FFF1, pagos parciales, notas de crédito, todo
conectado nativamente. Plan: sumar 5-10 clínicas más en los próximos
60 días.

Queremos pasar al programa Revendedor que veo publicado en su sitio.
La idea es ofrecer la facturación electrónica como parte integral de
Yenda ("YendaFact"), con cada clínica funcionando bajo nuestra cuenta
master en lugar de tener su propia cuenta Nubefact directa.

Tres preguntas concretas para arrancar la conversación:

  1. Pricing volumétrico del programa Revendedor — ¿qué condiciones manejan
     para 10, 50, 100 sub-cuentas activas? ¿Hay setup fee?

  2. Subdominio propio — ¿podemos usar facturacion.yenda.app como dominio
     del panel para nuestras clínicas, en lugar de un subdominio .pse.pe?

  3. Soporte de primera línea — ¿el cliente final (clínica) nos contacta
     a nosotros y nosotros escalamos a ustedes para issues técnicos? ¿O
     ustedes atienden directo?

Si tiene sentido, podemos coordinar una llamada de 20 min esta semana o
la próxima. Mi calendar: [tu-link-de-calendario].

Saludos,
Oscar Duran
Fundador, Yenda · Corpcomdigital S.A.C.
oscar@yenda.app · +51 9XXXXXXXX
```

### Notas para personalizar antes de enviar (cualquier versión)

- Reemplazá `[YENDA S.A.C.]` o `[CORPCOMDIGITAL S.A.C.]` con la razón
  social exacta de la entidad firmante.
- Reemplazá `[20XXXXXXXXX]` con el RUC real de la entidad firmante.
- Reemplazá `[tu-link-de-calendario]` con tu Cal.com / Calendly /
  Google Calendar booking.
- Reemplazá teléfono con el real.
- Si Vitra te dio permiso para mencionarlos por nombre, cambiá *"clínica
  de fertilidad en Lima"* a *"Vitra, clínica de fertilidad en Lima
  (RUC 20XXXXXXXXX)"* — el RUC de Vitra solo si Vitra lo autoriza
  explícitamente, no es info pública sin contexto.
- Si tenés más data dura (MRR, tickets emitidos al mes, % retención),
  agregalos en un párrafo extra — pero **no inventes números**.

---

## Por qué este email funciona

1. **Identidad clara en 2 líneas** — quién sos, qué construís, dónde encajan.
2. **Tracción real** — ya integramos, ya emitimos, ya hay un cliente. No es
   "estamos pensando en", es "estamos haciendo".
3. **Plan concreto** — 5-10 clínicas en 60 días. Nubefact es una empresa,
   les interesan números, no visión.
4. **Preguntas específicas** — pricing, branding, soporte. Las 3 cosas que
   diferencian "cliente normal" de "partner real".
5. **CTA suave** — call de 20 min, no compromiso. Calendar link reduce
   fricción.
6. **Cierre profesional** — sin adjetivos vacíos ni "espero su pronta
   respuesta". Confianza tranquila.

---

## Si no responden en 5 días hábiles

```
Asunto: Re: Yenda — Activar programa Revendedor

Hola equipo,

Hago seguimiento al correo anterior. Sé que el formulario en
nubefact.com/revendedor existe — ¿prefieren que lo llene como camino formal,
o seguimos el hilo por correo?

Si en estos días sumamos 2-3 clínicas más a la integración actual (cuentas
directas), no es problema, pero queremos consolidar bajo el modelo
Revendedor lo antes posible para no migrarlas dos veces.

Saludos,
Oscar
```

---

## Si responden con "llename el formulario"

Lo llenás con la misma data del email principal. El formulario
[nubefact.com/cotizar?tipo=PSE-RESELLER](https://www.nubefact.com/cotizar?tipo=PSE-RESELLER)
pide:

- Razón social: (la de Yenda)
- RUC: (el de Yenda)
- Cantidad de sub-cuentas estimadas a 6 meses: 30-50 (rango realista
  asumiendo expansión moderada — no exageres, comprometés expectativas)
- Cantidad de docs/mes promedio por sub-cuenta: 50-150 docs (clínica chica)
- Volumen total estimado: 1,500-7,500 docs/mes
- Mensaje libre: pegar el email principal arriba

---

## Talking points para la call (cuando se concrete)

**Lo que pedimos:**

1. **Pricing volumétrico** — descuento progresivo por sub-cuentas activas:
   - 1-10: pricing standard (S/70/mes)
   - 11-30: -20% → S/56/mes
   - 31-100: -40% → S/42/mes
   - 100+: negociar
2. **Setup fee** — preferentemente cero, o amortizable contra primer mes.
3. **Pricing por docs adicionales** — confirmar el tier sobre los 500 incluidos
   (su web dice "cotizar"; queremos rango público para nuestro pricing
   interno).
4. **Subdominio propio** — `facturacion.yenda.app` apuntando a su panel,
   o full white-label con headers personalizables.
5. **API rate limits para reseller** — necesitamos garantía de 10+
   req/segundo durante picos (cierres de mes).
6. **SLA de uptime** — qué porcentaje garantizan, qué pasa si caen
   durante un cierre.
7. **Soporte tier 1 / tier 2** — clínicas nos contactan a nosotros,
   nosotros escalamos solo issues técnicos del API a Nubefact. Que ustedes
   no tengan trato directo con la clínica final.
8. **Proceso de onboarding por sub-cuenta** — cuán rápido pueden activar
   una nueva cuenta cuando agregamos un cliente. Ideal: API-driven, sin
   email manual.
9. **Migración de clientes existentes** — Vitra hoy tiene cuenta directa
   con Nubefact. ¿Cómo se migra a sub-cuenta del reseller sin perder
   correlativos ni serie BBB1?

**Lo que ofrecemos:**

- Volumen recurrente predecible (clínicas no churneanan rápido).
- Caso de éxito vertical (clínicas, sector específico que Nubefact no
  domina hoy).
- UX integrada que reduce sus tickets de soporte (los clientes nuestros
  ya saben usarlo desde Yenda, no llaman a Nubefact por dudas).
- Marketing co-branded si interesa ("YendaFact powered by Nubefact" en
  ciertos materiales).

**Lo que NO concedemos en la primera call:**

- Exclusividad. Yenda mantiene `lib/einvoice/` provider-agnostic; podemos
  sumar Efact/Bizfor más adelante. Si Nubefact pide exclusividad como
  condición, contraofertar: exclusividad por 12 meses si descuento ≥40%
  vs su pricing público.
- Compromisos de volumen mínimo agresivo. Nuestro plan es realista pero
  conservador.
- Migrar a su contrato legal sin revisar (asegurar cláusula de salida con
  60 días para no quedar atados si cambian condiciones).

---

## Métricas a tener listas para la call

- # de clínicas Yenda activas hoy
- # de clínicas con facturación activada (Vitra + las que se sumen)
- Comprobantes emitidos en producción (BBB1-2, BBB1-3, etc.)
- MRR de Yenda actual (rango general, no número exacto)
- Roadmap de clínicas en pipeline 60-90 días (con razón clara, no humo)

Si todavía estás en pre-Vitra-pilot real, dilo así: *"Vitra arranca el
Lunes. Tendré primeros datos de uso en 2 semanas. Igual quería arrancar
la conversación ahora porque la migración Reseller es lo que destraba
que sumemos las próximas 3 clínicas en el modelo correcto."*

---

## Resultado esperado de la call

- Pricing volumétrico concreto (S/X/mes/sub-cuenta para los primeros 30).
- Setup fee confirmado (idealmente cero).
- Confirmación de subdominio propio o no.
- Proceso de migración para Vitra.
- Próximos pasos: contrato + sandbox de prueba del modelo Reseller.

Si Nubefact da una propuesta razonable: arrancamos integración Reseller
en 2-3 semanas (ver `docs/yendafact-strategy.md` Camino D).

Si la propuesta no convence (caro, condiciones rígidas, sin subdominio):
abrimos paralelo con Efact (próximo en el ranking según
`outreach-facturacion-electronica.md`) y mantenemos cuentas directas con
Nubefact para los clientes existentes.
