# Brief — Landing Yenda (pre tráfico LinkedIn)

> Sesión estratégica 2026-09-04. Orden = prioridad. Archivos en `components/landing/` y `app/layout.tsx`.
>
> **Seguimiento (5-sep):** este archivo es la lista de pendientes de la landing. Se marca aquí lo entregado.
>
> | Ítem | Estado |
> |---|---|
> | 1. Hero (H1 nuevo, subtítulo, 2 CTAs, segmentador de 3 perfiles) | 🔧 en curso 5-sep |
> | 2. Prueba social con cita real | ⏸ después (permiso de la Dra. Patricia) |
> | 3. Bloque diferenciador "recuperadas" | ⏳ tras verificar que Reportes muestra el número |
> | 4. Trust badges con credenciales reales + logos Google/Meta | 🔧 en curso 5-sep |
> | 5. Páginas de vertical | ⏳ `/fertilidad` primero |
> | 6. Metadatos (Twitter = OG, imagen OG) | 🔧 en curso 5-sep |
> | 7. Medición (UTM + eventos) | 🔧 en curso 5-sep |
>
> Ajustes acordados sobre el brief: el subtítulo dice "te avisa para contactarla por WhatsApp en un clic" (el
> contacto automático está pausado con humano en el loop y el App Review de Meta sigue pendiente); los logos
> van con el estado real: "Integración verificada por Google" y "Proveedor tecnológico verificado por Meta",
> nunca "Meta Business Partner"; el badge de datos dice "Protección de datos · Ley 29733" (RNPDP pendiente).

## 1. Hero (`hero.tsx`)

**H1 fijo (no rota):**
> Los demás sistemas guardan citas. Yenda trae de vuelta a las pacientes que dejaron de venir.

**Subtítulo (prueba primero, funciones al final):**
> Yenda detecta a la paciente que no agendó su siguiente control, la contacta por WhatsApp y te muestra cuántas volvieron y cuánto facturaron. Agenda, historia clínica, caja y boletas SUNAT incluidos.

**Dos CTAs al mismo nivel:**
- Primario: `Agenda una demo de 20 minutos` → calendario (Cal.com / Calendly / `/contacto?tipo=demo`).
- Secundario: `Empezar mis 14 días gratis` → `/register`.
- Línea bajo los botones se mantiene: "Sin tarjeta. Sin contrato…".

**Segmentador bajo el H1** (3 botones, patrón de `pain-quiz.tsx`):
`Soy doctor independiente` · `Tengo un centro médico` · `Dirijo una clínica`
- Cambia en cliente: subtítulo, pantalla del mockup, plan destacado en Pricing, texto del CTA primario.
- Default sin clic: clínica. SSR renderiza el default; el cambio es client-side.
- Persistencia en `sessionStorage` + preselección por URL `?perfil=doctor|centro|clinica`.
- `<link rel="canonical" href="/">` para que `?perfil=` no sea duplicado.
- Evento de analítica por clic de perfil.

El titular actual ("Tu clínica no se cae por falta de pacientes…") pasa a la página `/doctor-independiente`.

## 2. Prueba social (`social-proof.tsx`) — subir a justo después del Hero
- Reemplazar el párrafo "todavía no tenemos 500 clínicas" por la cita real de la Dra. Patricia (con su permiso): nombre, clínica, especialidad, foto o inicial.
- Estructura lista para 3 tarjetas (Patricia · Vitra · Dermosalud) a medida que autoricen.

## 3. Bloque nuevo: el diferenciador (entre Hero/Prueba social y Features)
Título: **Las pacientes que no volvieron, recuperadas.**
Tres pasos: detecta (control pendiente sin cita) → contacta (WhatsApp/email, 3 intentos) → mide (cuántas agendaron, cuántas asistieron, cuánto facturaron; solo cuenta las que volvieron tras el contacto).
Placeholder para el número real cuando exista: "N pacientes recuperadas en su primer mes · [Clínica]".

## 4. Trust badges (`trust-badges.tsx`) — credenciales reales
Reemplazar los 4 genéricos por: `Integración oficial Google Calendar (verificada)` · `WhatsApp Business API (Meta)` · `Boletas y facturas SUNAT` · `Ley 29733 de protección de datos`.

## 5. Páginas de vertical (URLs propias, mismos bloques)
`/fertilidad` (primero) · `/dermatologia` · `/doctor-independiente`.
Esqueleto: dolor del vertical → cómo lo resuelve Yenda (seguimiento 1ª→2ª consulta, presupuestos de tratamiento, asesoras en fertilidad; fotos antes/después y consentimiento en derma) → cita real → CTA demo. Destino de cada post de LinkedIn.

## 6. Metadatos (`app/layout.tsx`)
- Twitter description alineada con OG: "Deja de manejar tu clínica entre el Excel y el WhatsApp…" o el H1 nuevo.
- Verificar imagen OG (existe, 1200×630, legible en móvil): LinkedIn arma la tarjeta con eso.

## 7. Medición (antes del primer post)
- UTM por post (`utm_source=linkedin&utm_campaign=<tema>`).
- Eventos: `cta_demo_click`, `cta_trial_click`, `perfil_select`.

## No hacer
- Titulares rotando en el H1.
- Esconder la página detrás de la pregunta de perfil.
- Números de resultados que no salgan de la base de datos.
