# Spec Técnico: Módulo de Seguimientos Automatizados — Addon `fertility`

**Versión:** 1.0 — Listo para implementación
**Última actualización:** 2 de mayo, 2026
**Tier:** Pack Vertical Fertilidad (Tier 2 / Capa 2 de monetización)
**Pilot anchor:** Vitra (San Isidro, Lima)
**Documento padre:** `docs/plan-vertical-fertility-gynecology.md`
**Owner:** Oscar — Founder, Yenda

---

## 0. Contexto y objetivo

### 0.1 El dolor que se resuelve

En clínicas de fertilidad, **el dolor #1 reportado en discovery es la pérdida silenciosa de pacientes entre la primera consulta y la segunda**. La paciente sale del consultorio, queda con la intención de continuar, pero pasan los días y nunca regresa. Sin un sistema que mantenga visibilidad sobre estos casos, el embudo de tratamiento se rompe en su punto más crítico.

Hoy esta gestión se hace con tags manuales sin reglas, planillas en Excel, o memoria del equipo. No escala y depende del comportamiento humano.

### 0.2 La promesa comercial del módulo

> **"Gracias a Yenda, tu consulta médica aumenta la retención de pacientes y los lleva con mayor probabilidad a reservar tratamientos costosos. Tus pacientes no se quedan en una primera consulta."**

Esta es la frase que vende el addon. Toda decisión técnica de este documento debe alinearse con que esa frase sea **demostrable, defendible y honesta** ante el cliente.

### 0.3 El principio de atribución honesta

El sistema solo se atribuye recuperaciones donde **efectivamente actuó**. Si la paciente regresó por iniciativa propia antes de que el sistema la contactara, no se cuenta como recuperación atribuible. Esto protege la credibilidad del producto y permite vender resultados defendibles.

---

## 1. Arquitectura conceptual

### 1.1 Dos eventos centrales

El sistema distingue **dos eventos independientes**:

**Evento A — "Contacto efectuado"**
Se dispara cuando ocurre cualquiera de estos cuatro hechos:

1. El sistema envió automáticamente el correo recordatorio
2. El sistema envió automáticamente el WhatsApp recordatorio
3. La recepcionista presionó manualmente el botón **"Contactado"** existente en la tarjeta
4. La recepcionista presionó manualmente el botón **"Enviar WhatsApp"** desde la tarjeta (que copia plantilla al portapapeles o abre WhatsApp Web)

Los casos 1 y 2 ocurren sin intervención humana. Los casos 3 y 4 requieren acción de recepción. Los cuatro registran el mismo tipo de evento `contact_events[]` con su tipo correspondiente.

**Evento B — "Cita creada con seguimiento activo"**
Se dispara cuando se inserta una nueva cita en `appointments` y existe un seguimiento activo coincidente (mismo paciente + categoría canónica del servicio = categoría destino del seguimiento).

### 1.2 Las 3 categorías de atribución

Cuando se inserta una cita nueva, el sistema la clasifica automáticamente en una de tres categorías:

| Categoría | Condición | Atribución al módulo |
|---|---|---|
| **A — Recuperada con contacto** | Existía seguimiento activo + hubo al menos un evento de contacto (auto o manual) **antes** de la creación de la cita | Sí, atribuible |
| **B — Agendado sin contacto** | Existía seguimiento activo + **no** hubo evento de contacto antes de la creación de la cita | No, paciente proactiva |
| **C — Orgánica** | No existía ningún seguimiento activo coincidente | No, fuera del embudo |

Esta clasificación se hace **sin intervención humana**, en el momento del INSERT de la cita, vía trigger de base de datos. La recepcionista no necesita marcar nada para que la métrica funcione.

---

## 2. Modelo de datos

### 2.1 Tabla `clinical_followups` (extender la existente)

Campos nuevos a agregar:

```sql
ALTER TABLE clinical_followups
  ADD COLUMN source TEXT DEFAULT 'manual',
    -- 'manual' | 'rule' | 'system'
  ADD COLUMN rule_key TEXT,
    -- ej: 'fertility.first_consultation_lapse'
    -- NULL si source='manual'
  ADD COLUMN target_category_canonical TEXT,
    -- ej: 'fertility.second_consultation'
    -- categoría del servicio que cerraría este seguimiento
  ADD COLUMN expected_by TIMESTAMPTZ,
    -- fecha en que el contacto automático debe dispararse
  ADD COLUMN first_contact_at TIMESTAMPTZ,
    -- timestamp del PRIMER contacto efectuado (auto o manual)
    -- NULL si nunca hubo contacto
  ADD COLUMN contact_events JSONB DEFAULT '[]'::jsonb,
    -- array de eventos de contacto para auditoría:
    -- [{ type: 'auto_email' | 'auto_whatsapp' | 'manual_contacted' | 'manual_whatsapp',
    --    at: '2026-05-23T10:00:00Z',
    --    by_user_id: uuid|null,
    --    delivery_status: 'sent' | 'failed' | 'unknown' }]
  ADD COLUMN snooze_until TIMESTAMPTZ,
    -- si está en estado 'pospuesto', cuándo reaparece
  ADD COLUMN attempt_count INTEGER DEFAULT 0,
    -- cuántos intentos de contacto totales (auto + manual)
  ADD COLUMN max_attempts INTEGER DEFAULT 3,
    -- cap configurable por organización
  ADD COLUMN closure_reason TEXT;
    -- 'agendado_via_contacto' | 'agendado_organico_dentro_ventana' |
    -- 'desistido_silencioso' | 'vencido' | 'manual_close'
```

### 2.2 Estados del seguimiento (`status`)

| Estado | Descripción |
|---|---|
| `pendiente` | Recién creado por la regla, sin acción aún |
| `contactado` | Hubo al menos un evento de contacto (auto o manual). Esperando respuesta o agendamiento |
| `agendado_via_contacto` | Cerrado: cita creada **después** de evento de contacto (Categoría A) |
| `agendado_organico_dentro_ventana` | Cerrado: cita creada **antes** de cualquier contacto (Categoría B) |
| `pospuesto` | Recepción usó botón "Posponer X días". Reaparece en `snooze_until` |
| `desistido_silencioso` | Cap de intentos cumplido sin respuesta. Pasa al tab "Sin respuesta" |
| `vencido` | Pasó el plazo configurado sin acción ni cita derivada |
| `cerrado_manual` | Recepción o médico cerró manualmente con motivo |

### 2.3 Tabla `appointments` (extender la existente)

Campos nuevos a agregar:

```sql
ALTER TABLE appointments
  ADD COLUMN attribution_source TEXT DEFAULT 'organica',
    -- 'recovered_with_contact' | 'agendado_sin_contacto' | 'organica'
  ADD COLUMN linked_followup_id UUID REFERENCES clinical_followups(id),
    -- referencia al seguimiento que estaba activo al momento de crear la cita
    -- NULL si no había ninguno (Categoría C)
  ADD COLUMN attribution_set_at TIMESTAMPTZ DEFAULT NOW();
    -- cuándo se calculó la atribución (siempre = created_at de la cita)
```

### 2.4 Tabla nueva `addon_canonical_categories`

Catálogo maestro de categorías canónicas que un addon define. Se popula al activar el addon.

```sql
CREATE TABLE addon_canonical_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_key TEXT NOT NULL,
    -- 'fertility' | 'gynecology'
  category_key TEXT NOT NULL,
    -- 'fertility.first_consultation', 'fertility.second_consultation', etc
  display_name TEXT NOT NULL,
    -- "Primera consulta de fertilidad"
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(addon_key, category_key)
);
```

### 2.5 Tabla nueva `organization_service_canonical_mapping`

Mapeo por organización entre categoría canónica y servicio del catálogo de la clínica.

```sql
CREATE TABLE organization_service_canonical_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
    -- 'fertility.first_consultation'
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, category_key, service_id)
);
-- Una categoría puede mapear a múltiples servicios.
-- Ej: 'fertility.first_consultation' → ['1ERA Consulta 200', '1ERA Consulta C/I 200', '1ERA Consulta Virtual']
```

**RLS obligatoria:** filtrar por `organization_id` en todas las queries.

### 2.6 Tabla nueva `followup_rules`

Reglas pre-configuradas del addon (Tier 2) y reglas custom (Tier 3). Una organización las puede ajustar (días, plantillas, on/off) pero no eliminar las del Tier 2.

```sql
CREATE TABLE followup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    -- NULL = regla global del addon (template)
  addon_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
    -- 'fertility.first_consultation_lapse'
  trigger_event TEXT NOT NULL,
    -- 'appointment_completed' | 'treatment_plan_created' | 'plan_status_changed'
  trigger_category_key TEXT NOT NULL,
    -- categoría canónica que dispara la regla
    -- ej: 'fertility.first_consultation'
  target_category_key TEXT NOT NULL,
    -- categoría canónica que cerraría el seguimiento
    -- ej: 'fertility.second_consultation'
  delay_days INTEGER NOT NULL,
    -- cuándo se ejecuta el contacto automático (días después del trigger)
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
    -- true = regla del Tier 2 (no eliminable, solo ajustable)
  message_template_id UUID,
    -- referencia a plantilla de mensaje
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, rule_key)
);
```

### 2.7 Tabla nueva `message_templates`

Plantillas de WhatsApp y correo. Vienen pre-cargadas con el addon (Tier 2). En Tier 3 son editables por la organización.

```sql
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    -- NULL = template global del addon
  addon_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
    -- 'fertility.second_consultation_reminder.whatsapp_amable'
  channel TEXT NOT NULL,
    -- 'whatsapp' | 'email'
  tone TEXT NOT NULL,
    -- 'amable' | 'directo' | 'ultimo_recordatorio'
  subject TEXT,
    -- solo para email
  body TEXT NOT NULL,
    -- con placeholders: {{paciente_nombre}}, {{doctor_nombre}}, {{clinica_nombre}}
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, template_key, channel, tone)
);
```

---

## 3. Reglas pre-configuradas del addon `fertility` (Tier 2)

Estas reglas se insertan automáticamente al activar el addon `fertility` en una organización (con `organization_id = NULL` se cargan como templates globales; al activar el addon se clonan a la organización con sus defaults). La organización puede ajustar `delay_days` y `is_active`, pero no eliminarlas.

### Regla 1 — `fertility.first_consultation_lapse`

| Atributo | Valor |
|---|---|
| Trigger | `appointment_completed` con servicio mapeado a `fertility.first_consultation` |
| Target | `fertility.second_consultation` |
| Delay default | 21 días |
| Plantillas | `whatsapp_amable`, `whatsapp_directo`, `email_amable`, `email_directo` |

### Regla 2 — `fertility.second_consultation_lapse`

| Atributo | Valor |
|---|---|
| Trigger | `appointment_completed` con servicio mapeado a `fertility.second_consultation` |
| Target | `fertility.treatment_decision` |
| Delay default | 14 días |
| Plantillas | `whatsapp_amable`, `whatsapp_directo`, `email_amable`, `email_directo` |

### Regla 3 — `fertility.budget_pending_acceptance`

| Atributo | Valor |
|---|---|
| Trigger | `treatment_plan` creado con `status = 'pending_acceptance'` |
| Target | `fertility.treatment_initiated` |
| Delay default | 7 días |
| Plantillas | `whatsapp_amable`, `whatsapp_ultimo_recordatorio` |

### Categorías canónicas del addon `fertility`

```
fertility.first_consultation          -- Primera consulta (presencial o virtual)
fertility.second_consultation         -- Segunda consulta de fertilidad
fertility.continuing_consultation     -- Consulta continuadora
fertility.treatment_decision          -- Cita donde se decide tratamiento
fertility.treatment_initiated         -- Inicio de tratamiento (FIV/IIU/Inducción)
fertility.follicular_aspiration       -- Aspiración folicular
fertility.embryo_transfer             -- Transferencia embrionaria
fertility.beta_hcg_check              -- Control beta-HCG
fertility.cryo_first_control          -- Primer control crioterapia
fertility.cryo_second_control         -- Segundo control crioterapia
fertility.cryo_third_control          -- Tercer control crioterapia
fertility.endometrial_control         -- Control endometrial
fertility.post_transfer_control       -- Control post-transferencia
fertility.results_reading             -- Lectura de resultados (FIV/NGS/etc)
```

---

## 4. Lógica del INSERT trigger en `appointments`

### 4.1 Pseudocódigo

```
ON INSERT INTO appointments (NEW row):

  -- Paso 1: encontrar categoría canónica del servicio agendado
  category_key := SELECT category_key
                  FROM organization_service_canonical_mapping
                  WHERE organization_id = NEW.organization_id
                    AND service_id = NEW.service_id
                  LIMIT 1;

  IF category_key IS NULL THEN
    -- Servicio no está mapeado a ninguna categoría canónica
    NEW.attribution_source := 'organica';
    NEW.linked_followup_id := NULL;
    RETURN NEW;
  END IF;

  -- Paso 2: buscar seguimiento activo coincidente
  matching_followup := SELECT *
                       FROM clinical_followups
                       WHERE patient_id = NEW.patient_id
                         AND organization_id = NEW.organization_id
                         AND target_category_canonical = category_key
                         AND status IN ('pendiente', 'contactado')
                       ORDER BY created_at ASC
                       LIMIT 1;

  IF matching_followup IS NULL THEN
    NEW.attribution_source := 'organica';
    NEW.linked_followup_id := NULL;
    RETURN NEW;
  END IF;

  -- Paso 3: hay seguimiento, vincular cita
  NEW.linked_followup_id := matching_followup.id;

  -- Paso 4: determinar atribución según first_contact_at
  IF matching_followup.first_contact_at IS NOT NULL
     AND matching_followup.first_contact_at <= NOW() THEN
    -- Hubo contacto antes de la cita → Categoría A
    NEW.attribution_source := 'recovered_with_contact';

    UPDATE clinical_followups
    SET status = 'agendado_via_contacto',
        closure_reason = 'agendado_via_contacto',
        closed_at = NOW()
    WHERE id = matching_followup.id;

  ELSE
    -- No hubo contacto, o el contacto estaba programado para después → Categoría B
    NEW.attribution_source := 'agendado_sin_contacto';

    UPDATE clinical_followups
    SET status = 'agendado_organico_dentro_ventana',
        closure_reason = 'agendado_organico_dentro_ventana',
        closed_at = NOW()
    WHERE id = matching_followup.id;
  END IF;

  RETURN NEW;
END;
```

### 4.2 Nota crítica de implementación

**Esta lógica DEBE ejecutarse en el momento del INSERT (trigger de DB o handler de creación), NO en cron diario.** Razones:

1. **Real-time:** la recepcionista ve el resultado al instante, no 24 horas después.
2. **Performance:** un cron que escanea todas las citas y todos los seguimientos es O(N×M); el trigger es O(1).
3. **Consistencia:** si un seguimiento se cierra por trigger, no aparece en el panel principal de seguimientos en el mismo momento. Cron crearía ventanas de inconsistencia.

### 4.3 RLS

La query del trigger debe respetar `organization_id` siempre. No usar `bypassrls`. Los seguimientos de organizaciones distintas nunca se cruzan.

---

## 5. Lógica del envío automático de contactos

### 5.1 Cron job diario (sí cron, esto sí es batch)

Ejecutar a las **8:00 AM hora local de cada organización** (configurable con default 8:00 AM):

```
FOR EACH followup IN clinical_followups WHERE status = 'pendiente'
                                          AND expected_by <= NOW()
                                          AND first_contact_at IS NULL:

  -- Verificar que la regla siga activa
  rule := SELECT * FROM followup_rules WHERE rule_key = followup.rule_key;
  IF NOT rule.is_active THEN CONTINUE; END IF;

  -- Verificar cap de intentos
  IF followup.attempt_count >= followup.max_attempts THEN
    UPDATE clinical_followups
    SET status = 'desistido_silencioso',
        closure_reason = 'desistido_silencioso',
        closed_at = NOW()
    WHERE id = followup.id;
    CONTINUE;
  END IF;

  -- Disparar contacto simultáneo (Opción 1 ratificada)
  patient := SELECT * FROM patients WHERE id = followup.patient_id;

  IF patient.email IS NOT NULL THEN
    send_email_async(patient.email, rule.email_template, followup.id);
    -- Al confirmar entrega, agregar a contact_events[]:
    --   { type: 'auto_email', at: NOW(), delivery_status: 'sent' }
  END IF;

  IF patient.phone IS NOT NULL THEN
    send_whatsapp_async(patient.phone, rule.whatsapp_template, followup.id);
    -- Al confirmar entrega, agregar a contact_events[]:
    --   { type: 'auto_whatsapp', at: NOW(), delivery_status: 'sent' }
  END IF;

  -- Actualizar el followup
  UPDATE clinical_followups
  SET status = 'contactado',
      first_contact_at = COALESCE(first_contact_at, NOW()),
      attempt_count = attempt_count + 1
  WHERE id = followup.id;
END FOR;
```

**Justificación de cron y no trigger aquí:** porque el envío es proactivo (basado en fecha de vencimiento), no reactivo (basado en evento). Es exactamente el caso de uso correcto para cron.

### 5.2 Manejo de fallos de entrega

Si el WhatsApp o el email fallan en entrega (delivery_status = 'failed'), se registra el evento pero **no se incrementa `first_contact_at`** si era el primer intento. Razón: si el contacto nunca llegó al paciente, no podemos atribuir recuperación.

Esto es importante para la honestidad de la métrica. Un fallo silencioso de entrega no debería contar como "contacto efectuado".

---

## 6. Mapeo de servicios — Pantalla de configuración

### 6.1 Cuándo se muestra

Al activar el addon `fertility` en una organización, el sistema redirige al admin a una pantalla de configuración inicial (similar a un wizard de onboarding) que NO se puede saltear. Hasta que esté completa al menos para las 3 categorías esenciales (`first_consultation`, `second_consultation`, `treatment_decision`), las reglas no se ejecutan.

### 6.2 Estructura de la pantalla

```
[ Configuración inicial — Pack Fertilidad ]

Para que el sistema de seguimientos funcione, necesitamos saber qué servicios
de tu catálogo corresponden a cada etapa del journey de fertilidad.

Una categoría puede tener varios servicios asociados. Ej: si tienes
"Primera consulta presencial" y "Primera consulta virtual", ambos se
asocian a "Primera consulta de fertilidad".

┌──────────────────────────────────────────────────────────────────┐
│  Categoría                        │  Tu servicio                  │
├──────────────────────────────────────────────────────────────────┤
│  ⭐ Primera consulta de fertilidad  │  [Dropdown multi-select ▾]  │
│  ⭐ Segunda consulta de fertilidad  │  [Dropdown multi-select ▾]  │
│     Consulta continuadora          │  [Dropdown multi-select ▾]  │
│  ⭐ Inicio de tratamiento          │  [Dropdown multi-select ▾]  │
│     Aspiración folicular           │  [Dropdown multi-select ▾]  │
│     Transferencia embrionaria      │  [Dropdown multi-select ▾]  │
│     Control beta-HCG               │  [Dropdown multi-select ▾]  │
│     ...                            │                              │
└──────────────────────────────────────────────────────────────────┘

⭐ = obligatorio para que las reglas Tier 2 funcionen.

Las categorías sin servicios mapeados simplemente no disparan reglas
para tu organización. Puedes mapearlas más adelante.

[ Continuar ]   [ Guardar y configurar después ]
```

### 6.3 Validación

- Al guardar, se valida que las 3 categorías estrella tengan al menos un servicio mapeado.
- Si faltan, se muestra un warning pero no se bloquea el flujo (la organización puede tener motivos para no tener segunda consulta como servicio separado).
- Las reglas se ejecutan solo para categorías que tengan al menos un mapeo.

### 6.4 Mantenimiento posterior

La pantalla está accesible en `/admin/addon-config/fertility/canonical-mapping` para ediciones futuras. Si la organización agrega un nuevo servicio "Consulta inicial CF", debe volver acá y mapearlo.

---

## 7. UI del panel `/scheduler/follow-ups`

### 7.1 Estructura de tabs

El view existente se reorganiza en 3 tabs:

```
┌────────────────────────────────────────────────────────────────┐
│  Seguimientos                                          [Filtros]│
│  Pacientes pendientes de contactar para agendar próxima cita    │
│                                                                  │
│  [ Pendientes (12) ]  [ Recuperados (8) ]  [ Sin respuesta (3) ]│
└────────────────────────────────────────────────────────────────┘
```

| Tab | Contenido | Default |
|---|---|---|
| **Pendientes** | `pendiente`, `contactado` esperando respuesta, `pospuesto` ya vuelto | Sí (default) |
| **Recuperados** | `agendado_via_contacto` y `agendado_organico_dentro_ventana` últimos 30 días | — |
| **Sin respuesta** | `desistido_silencioso`, `vencido` últimos 60 días | — |

### 7.2 Cambios visuales en la tarjeta del seguimiento

#### 7.2.1 Tab "Pendientes" — tarjeta default (Image 1 actual + 2 cambios sutiles)

La tarjeta mantiene su look actual (lista limpia, escaneable). Se agregan **dos cambios menores**:

**Cambio 1 — Badge "Automatizado" cuando aplica**

Junto al badge existente "Rutina", se agrega un segundo badge para seguimientos generados por regla del addon:

```
[👤 Oscar Duran] [🚩 Rutina] [⚡ Automatizado]
```

Color del badge: violeta `#8B5CF6` (consistente con la identidad de marca para "AI/automatización"). Solo aparece cuando `clinical_followups.source = 'rule'`.

**Cambio 2 — Mini-stepper compacto (3 puntos)**

Junto al título del seguimiento, un mini-stepper de 3 puntos que comunica progreso del journey sin saturar:

```
Recordar 2da consulta de fertilidad   ● ● ○
                                       │ │ │
                                       │ │ └─ Próxima etapa pendiente (gris)
                                       │ └─── Etapa actual (verde fuerte)
                                       └───── Etapa completada (verde claro)
```

Solo aparece para seguimientos con `source = 'rule'`. Para `source = 'manual'` la tarjeta se ve sin stepper.

**Click en la tarjeta = expansión opcional** (opcional para MVP)

Al hacer click en cualquier área de la tarjeta (excepto los botones de acción), se expande para mostrar el timeline horizontal completo (look de Image 2 que el cliente compartió). Esto es opt-in del usuario, no forzado. Si se considera fuera de scope para MVP, se omite — el badge + stepper son suficientes.

#### 7.2.2 Acciones en la tarjeta

Las 4 acciones existentes se mantienen + 1 nueva:

```
[📞] [💬] [✓ Contactado] [📅 Agendar]   [⋯]
```

El botón `[⋯]` menú contextual abre opciones secundarias:
- **Posponer 7 días**
- **Posponer 15 días**
- **Posponer 30 días**
- **Marcar como sin respuesta** (mueve manualmente al tab "Sin respuesta")
- **Cerrar sin agendar** (con motivo libre)

#### 7.2.3 Tab "Recuperados"

Misma tarjeta pero en estado **read-only celebrativo**:

```
✅ Oscar Duran                                    Recuperada
Recordar 2da consulta de fertilidad                Hace 3 días
👤 Dra. Angela Quispe   📅 2026-05-13   ⚡ Vía contacto automático
```

Indicadores nuevos:
- Check verde grande a la izquierda
- Etiqueta a la derecha: "Recuperada" (verde) o "Volvió por iniciativa propia" (gris)
- Línea inferior con el tipo de atribución para auditoría rápida

#### 7.2.4 Tab "Sin respuesta"

Tarjeta con tono de alerta suave:

```
⚠ Oscar Duran                                    Sin respuesta
Recordar 2da consulta de fertilidad
👤 Dra. Angela Quispe   📅 2026-05-13   3 intentos sin éxito
[Reactivar] [Cerrar caso]
```

Acciones disponibles:
- **Reactivar:** vuelve al tab "Pendientes" reseteando `attempt_count = 0`
- **Cerrar caso:** marca como `cerrado_manual` con motivo

### 7.3 Jerarquía visual y performance

- Cada tab pagina a **20 tarjetas por página**, con scroll infinito
- El tab default ("Pendientes") es el único que se carga al entrar a la vista. Los otros tabs cargan su data on-click (lazy load)
- Los contadores en los badges de cada tab son queries `COUNT(*)` con índice en `(organization_id, status, updated_at)`. Cachear 60 segundos
- El mini-stepper de 3 puntos se renderiza con SVG inline, no imagen — performance + crisp en cualquier resolución

### 7.4 Filtros globales

El panel "Filtros" superior derecho mantiene los filtros existentes y agrega:

- **Origen:** Manual / Regla / Sistema
- **Regla específica:** dropdown poblado con `followup_rules` activas de la organización
- **Doctor:** filtro existente
- **Fecha:** rango configurable

---

## 8. Plantillas pre-cargadas (insertar al activar addon)

### 8.1 Plantillas de WhatsApp

#### `fertility.first_consultation_lapse.whatsapp_amable`

```
Hola {{paciente_nombre}}, te saluda {{clinica_nombre}}.

Hace unas semanas tuviste tu primera consulta con {{doctor_nombre}} y queríamos
saber cómo te has sentido y si tienes alguna duda sobre los siguientes pasos.

¿Te gustaría agendar tu segunda consulta para revisar resultados y conversar
sobre opciones de tratamiento? Estamos para ayudarte.

Puedes responder a este mensaje o llamarnos al {{clinica_telefono}}.
```

#### `fertility.first_consultation_lapse.whatsapp_directo`

```
Hola {{paciente_nombre}}, te escribe {{clinica_nombre}}.

Notamos que aún no has agendado tu segunda consulta con {{doctor_nombre}}.
Para no perder el avance de tu evaluación, te recomendamos coordinar tu
próxima cita esta semana.

Responde este mensaje para agendar o llámanos al {{clinica_telefono}}.
```

#### `fertility.budget_pending_acceptance.whatsapp_amable`

```
Hola {{paciente_nombre}},

Te enviamos hace unos días el presupuesto de tu plan de tratamiento.
¿Has tenido oportunidad de revisarlo? Si tienes preguntas sobre alguna
parte, con gusto las conversamos.

Estamos disponibles para resolver cualquier duda al {{clinica_telefono}}.
```

### 8.2 Plantillas de email

(Estructura espejo, con asunto y cuerpo más extendido. Se omite por brevedad — usar el patrón de WhatsApp como base.)

### 8.3 Variables disponibles

Variables que se reemplazan en runtime al enviar:

- `{{paciente_nombre}}` — primer nombre
- `{{paciente_nombre_completo}}` — nombre y apellido
- `{{doctor_nombre}}` — Dr. / Dra. + nombre
- `{{clinica_nombre}}` — display name de la organización
- `{{clinica_telefono}}` — teléfono primario
- `{{primera_cita_fecha}}` — fecha de la cita disparadora
- `{{dias_transcurridos}}` — cuántos días pasaron desde el trigger

---

## 9. Dashboard de métricas (sub-vista del tab "Recuperados")

### 9.1 Header del tab "Recuperados"

Mostrar 4 KPIs antes de la lista:

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Recuperaciones   │ Iniciativa       │ Tasa de          │ Revenue estimado │
│ atribuibles      │ propia           │ recuperación     │ atribuido        │
│                  │                  │                  │                  │
│      18          │      11          │     38%          │   S/ 78,540      │
│  últimos 30 días │  últimos 30 días │  18 / 47 vencidos│  basado en LTV   │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

| KPI | Cálculo |
|---|---|
| Recuperaciones atribuibles | `COUNT(appointments WHERE attribution_source = 'recovered_with_contact' AND created_at >= NOW() - INTERVAL '30 days')` |
| Iniciativa propia | `COUNT(appointments WHERE attribution_source = 'agendado_sin_contacto' AND created_at >= NOW() - INTERVAL '30 days')` |
| Tasa de recuperación | `recuperaciones / total_seguimientos_que_vencieron_en_periodo` |
| Revenue atribuido | `recuperaciones * LTV_promedio_paciente_fertility` (config por organización) |

### 9.2 Vista detallada (link "Ver reporte completo")

Desde el header, link a `/reports/fertility-followup-performance` con:

- Curva temporal de recuperaciones por mes
- Breakdown por canal de contacto (WhatsApp vs email vs manual)
- Breakdown por regla (`first_consultation_lapse` vs `second_consultation_lapse` vs `budget_pending`)
- Breakdown por doctor (qué doctor genera más oportunidades de recuperación)
- Tabla de pacientes individuales con drilldown

---

## 10. Configuración por organización

Pantalla `/admin/addon-config/fertility/settings` con los siguientes ajustes:

| Setting | Default | Tipo |
|---|---|---|
| `delay_days_first_consultation` | 21 | Integer (5–60) |
| `delay_days_second_consultation` | 14 | Integer (5–60) |
| `delay_days_budget_acceptance` | 7 | Integer (3–30) |
| `max_attempts` | 3 | Integer (1–10) |
| `auto_contact_time` | 08:00 | Time (HH:MM) |
| `auto_send_email` | true | Boolean |
| `auto_send_whatsapp` | true | Boolean |
| `default_message_tone` | `amable` | Enum (`amable`, `directo`) |
| `ltv_promedio_paciente` | 5000 | Decimal (para cálculo de revenue atribuido) |

---

## 11. Migraciones SQL — orden recomendado

```
001_create_addon_canonical_categories.sql
002_create_organization_service_canonical_mapping.sql
003_create_followup_rules.sql
004_create_message_templates.sql
005_extend_clinical_followups.sql
006_extend_appointments.sql
007_create_appointment_attribution_trigger.sql
008_seed_addon_fertility_canonical_categories.sql
009_seed_addon_fertility_rules_template.sql
010_seed_addon_fertility_message_templates.sql
011_create_followup_cron_function.sql
012_schedule_followup_cron.sql
```

Cada migración debe ser idempotente (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

---

## 12. Tests críticos a escribir

### 12.1 Tests del trigger de atribución

Casos a cubrir:

1. **Categoría A clara** — paciente con seguimiento `contactado` (first_contact_at < NOW), agenda 2da consulta → `recovered_with_contact`
2. **Categoría B antes del contacto** — paciente con seguimiento `pendiente` (first_contact_at NULL), agenda 2da consulta → `agendado_sin_contacto`
3. **Categoría B con contacto futuro** — paciente con seguimiento `pendiente` y `expected_by` en el futuro, agenda hoy → `agendado_sin_contacto`
4. **Categoría C sin seguimiento** — paciente sin seguimiento activo, agenda 2da consulta → `organica`
5. **Servicio no mapeado** — paciente con seguimiento, agenda servicio que no está en `organization_service_canonical_mapping` → `organica`, sin afectar seguimiento
6. **Múltiples seguimientos activos** — paciente con 2 seguimientos coincidentes (raro pero posible) → cierra el más antiguo, deja el segundo abierto
7. **Cita reagendada** — si una cita se cancela y se crea nueva, no recalcular atribución de citas previas
8. **Multi-tenant** — paciente con seguimiento en organización A, cita en organización B (no debería pasar pero validar) → no cruzar

### 12.2 Tests del cron de envío

1. Seguimiento `pendiente` con `expected_by` vencido y `first_contact_at NULL` → ejecuta envío y pasa a `contactado`
2. Seguimiento que ya tuvo intentos == max_attempts → pasa a `desistido_silencioso`
3. Paciente sin email → solo se envía WhatsApp
4. Paciente sin teléfono → solo se envía email
5. Falla de envío (delivery_status = 'failed') → no actualiza `first_contact_at` si era el primer intento
6. Regla desactivada por la organización → no ejecuta envío

### 12.3 Tests de UI

1. Tarjeta `source = 'rule'` muestra badge violeta + stepper
2. Tarjeta `source = 'manual'` no muestra badge ni stepper
3. Tab "Recuperados" diferencia visualmente A vs B
4. Botón "Posponer X días" actualiza `snooze_until` y oculta del tab actual
5. Cap de intentos cumplido → tarjeta migra automáticamente al tab "Sin respuesta"

---

## 13. Métricas de éxito del módulo (post-launch)

Para evaluar al final del pilot Vitra (semana 8) si el feature debe continuar como está, ajustarse, o repensarse:

| Métrica | Target esperado |
|---|---|
| % seguimientos con `first_contact_at` poblado dentro de 24h del vencimiento | > 95% |
| Tiempo promedio entre `expected_by` y `first_contact_at` | < 12 horas |
| Tasa de recuperación (Categoría A / total seguimientos vencidos) | > 25% |
| % de pacientes que regresan dentro de Categoría B (proactivas) | informativo, sin target |
| Quejas de pacientes por mensajes inadecuados | 0 |
| Revenue atribuido en mes 2 del pilot | > 5x el costo del addon |

---

## 14. Lo que NO se construye en MVP (postergado a iteraciones futuras)

Lo siguiente queda explícitamente fuera del MVP para no diluir scope:

- **Constructor de reglas custom para servicios arbitrarios** → Tier 3 (módulo premium separado)
- **Plantillas de mensaje editables por la organización** → Tier 3
- **Cascada de canales (WhatsApp primero, email si no responde)** → iteración v2
- **Envío automático sin botón humano** → no se construye nunca; siempre humano en el loop para canales manuales
- **IA que sugiera el mejor momento de contacto** → no roadmap
- **Multi-canal SMS / llamada con grabación** → no roadmap
- **Reportes de conversión por médico individual** → fase 2 del módulo
- **Bulk actions sobre múltiples seguimientos** → fase 2

---

## 15. Notas de seguridad y privacidad

- **RLS obligatoria** en todas las tablas nuevas con `organization_id`.
- **Logs de auditoría** en `contact_events[]`: quién envió qué a quién y cuándo.
- **No incluir información clínica sensible** en plantillas de mensaje (no mencionar diagnósticos, tratamientos específicos, ni resultados de exámenes en el body del WhatsApp/email).
- **Opt-out:** las pacientes deben poder responder STOP / NO MÁS al WhatsApp y quedar marcadas como `do_not_contact = true`. Las reglas no disparan envíos para pacientes con este flag.
- **Cumplimiento Ley 29733 (Perú):** consentimiento explícito al registrarse como paciente para recibir comunicaciones recordatorias de la clínica. Esto debe quedar registrado en el flujo de creación de paciente.

---

## 16. Pregunta al implementador (Claude Code)

Antes de empezar la implementación, validar con el owner:

1. **¿Confirmar que el INSERT trigger se implementa en el handler de creación de citas (TypeScript) o en un PL/pgSQL trigger en Supabase?** Recomendación: PL/pgSQL en Supabase para garantizar atomicidad y RLS.
2. **¿Confirmar que los message templates iniciales en español usan tono peruano (no neutro LATAM)?** Vitra es peruano y el tono debe sentirse local.
3. **¿Confirmar que el envío de WhatsApp usa la integración existente de WhatsApp Business API o requiere nueva infraestructura?**

---

*Documento listo para implementación. Cualquier desviación del scope acá descrito requiere aprobación explícita del owner antes de mergear a main.*
