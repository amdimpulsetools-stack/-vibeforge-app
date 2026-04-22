# Treatment Plans + Presupuestos — Diseño Visual

> **Feature**: Presupuestos de tratamiento ligados a servicios, vinculación cita↔sesión desde el scheduler, y contabilidad unificada por saldo del plan.
>
> **Estado**: Propuesta visual pendiente de green-light. Ningún cambio de código aún.
>
> **Para ver los diagramas**: GitHub renderiza Mermaid automáticamente. También puedes pegar cada bloque en <https://mermaid.live> o importar a Excalidraw con **Excalidraw → Menu → Generate Diagram → Mermaid**.

---

## 1. Modelo de datos — qué añadimos y cómo se conecta

Columnas nuevas en **verde**. Tablas existentes en gris.

```mermaid
erDiagram
    services {
        uuid id PK
        text name
        numeric base_price
        int duration_minutes
    }

    treatment_plans {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        uuid service_id FK "🟢 NEW"
        int total_sessions
        numeric price_per_session "🟢 NEW (snapshot de services.base_price)"
        numeric total_budget "🟢 NEW (generated: price × sesiones)"
        text currency "🟢 NEW (default PEN)"
        text status "active · completed · paused · cancelled"
    }

    treatment_sessions {
        uuid id PK
        uuid treatment_plan_id FK
        uuid appointment_id FK "nullable — solo cuando se agenda"
        int session_number
        numeric session_price "🟢 NEW (snapshot al crear)"
        text status "pending · scheduled · completed · missed · cancelled"
    }

    appointments {
        uuid id PK
        uuid patient_id FK
        uuid service_id FK
        uuid treatment_session_id FK "🟢 NEW — 1:1 con la sesión vinculada"
        numeric price_snapshot
        text status
    }

    patient_payments {
        uuid id PK
        uuid patient_id FK
        uuid appointment_id FK "nullable"
        uuid treatment_plan_id FK "🟢 NEW — nullable, permite anticipos sin cita"
        numeric amount
        text payment_method
    }

    services ||--o{ treatment_plans : "usa como plantilla"
    treatment_plans ||--|{ treatment_sessions : "tiene N sesiones"
    treatment_sessions |o--o| appointments : "1:1 cuando se agenda"
    appointments ||--o{ patient_payments : "cobros por cita"
    treatment_plans ||--o{ patient_payments : "cobros al plan (anticipos)"
```

---

## 2. Doctor crea un plan de tratamiento

```mermaid
sequenceDiagram
    autonumber
    actor D as Doctor
    participant UI as TreatmentPlansPanel
    participant DB as Supabase

    D->>UI: Click "Nuevo plan" en ficha del paciente
    UI-->>D: Form con dropdown de servicios
    D->>UI: Selecciona servicio "1era Consulta Fertilidad"
    UI->>DB: SELECT services WHERE id=X
    DB-->>UI: { base_price: 80, duration: 30 }
    UI-->>D: Autofill precio=80, duración=30min
    D->>UI: Indica # sesiones = 10
    UI-->>D: Preview "10 × S/80 = S/ 800"
    D->>UI: (Opcional) Override precio = 70 por descuento especial
    UI-->>D: Preview "10 × S/70 = S/ 700"
    D->>UI: Click "Guardar plan"
    UI->>DB: INSERT treatment_plans (service_id, price_per_session=70, total=10)
    UI->>DB: INSERT 10 × treatment_sessions (session_price=70, status=pending)
    DB-->>UI: OK
    UI-->>D: ✅ Plan creado · S/ 700 total · 10 sesiones pendientes
```

**Puntos clave:**
- Precio snapshot al crear (si el admin cambia después el precio del servicio, este plan queda con el suyo).
- Las 10 sesiones se crean inmediatamente en estado `pending`, sin cita.
- Doctor puede override libre (confirmaste decisión #1).

---

## 3. Recepción crea cita → sistema detecta plan → vincula

```mermaid
sequenceDiagram
    autonumber
    actor R as Recepción
    participant UI as AppointmentFormModal
    participant DB as Supabase

    R->>UI: Abre "Nueva cita" · escribe DNI 12345678
    UI->>DB: SELECT patients WHERE dni=12345678
    DB-->>UI: Paciente encontrado (Ana López)
    UI->>DB: SELECT treatment_plans activos + pending_sessions
    DB-->>UI: 1 plan activo · 7 sesiones pending

    UI-->>R: 🔗 Banner: "Ana tiene plan Control Fertilidad · 7 pendientes"
    UI-->>R: Botón: [ Agendar como sesión del plan ]

    alt Recepción vincula
        R->>UI: Click botón
        UI-->>R: Autofill: servicio=Consulta Fertilidad, precio=70, doctor=Dr. García
        R->>UI: Ajusta fecha/hora y guarda
        UI->>DB: INSERT appointments (treatment_session_id = siguiente_pendiente.id)
        UI->>DB: UPDATE treatment_sessions SET appointment_id=X, status='scheduled'
        DB-->>UI: OK
        UI-->>R: ✅ Cita creada · Sesión 4/10 del plan
    else Recepción NO vincula (cita fuera del plan)
        R->>UI: Ignora banner, llena form normal
        UI->>DB: INSERT appointments (treatment_session_id=NULL)
        UI-->>R: ✅ Cita normal creada
    end
```

**Puntos clave:**
- Si el paciente no tiene plan activo → banner no aparece, flujo normal.
- Si tiene varios planes → dropdown para elegir cuál vincular.
- Si ignora el banner → cita normal, no rompe nada.

---

## 4. Los 3 escenarios de pago — todos convergen en "saldo del plan"

La fórmula es **la misma** en los tres casos:

```
saldo = SUM(payments del plan) − SUM(session_price de sesiones completadas)
```

```mermaid
flowchart TB
    Start([Plan de S/ 800 · 10 sesiones de S/ 80]) --> Choice{¿Cómo paga la<br/>paciente?}

    Choice -->|Escenario A| SessA[Paga S/ 80 al completar<br/>cada sesión]
    Choice -->|Escenario B| AntB[Adelanta S/ 300<br/>al inicio]
    Choice -->|Escenario C| AntC[Paga S/ 800 al inicio<br/>pago total]

    SessA --> CA1[Sesión 1 · payment 80<br/>saldo = 80 − 80 = 0]
    CA1 --> CA2[Sesión 2 · payment 80<br/>saldo = 160 − 160 = 0]
    CA2 --> CA3[...continúa...]

    AntB --> CB0[payment 300<br/>saldo = 300 − 0 = 300]
    CB0 --> CB1[Sesión 1 · consume crédito<br/>saldo = 300 − 80 = 220]
    CB1 --> CB2[Sesión 2 · consume crédito<br/>saldo = 300 − 160 = 140]
    CB2 --> CB3[Sesión 3 · consume crédito<br/>saldo = 300 − 240 = 60]
    CB3 --> CB4[Sesión 4 · saldo 60 &lt; 80<br/>payment 20 + consume 60<br/>saldo = 320 − 320 = 0]

    AntC --> CC0[payment 800<br/>saldo = 800 − 0 = 800]
    CC0 --> CC1[Sesión 1 · consume<br/>saldo = 720]
    CC1 --> CCn[... todas usan crédito<br/>saldo llega a 0 en sesión 10]

    CA3 --> Final([En todos los escenarios:<br/>saldo final = 0<br/>plan consumido al 100%])
    CB4 --> Final
    CCn --> Final

    classDef escA fill:#10b981,color:#fff
    classDef escB fill:#f59e0b,color:#fff
    classDef escC fill:#8b5cf6,color:#fff
    class SessA,CA1,CA2,CA3 escA
    class AntB,CB0,CB1,CB2,CB3,CB4 escB
    class AntC,CC0,CC1,CCn escC
```

**Puntos clave:**
- **Un solo modelo contable**: no hay "estado de anticipo" separado — el saldo lo dice todo.
- Los payments se registran en la misma tabla `patient_payments`. Si es anticipo → `appointment_id = NULL`. Si es por cita → ambos llenos.
- "Consumir crédito" = marcar sesión `completed` sin crear payment nuevo. El saldo baja solo.

---

## 5. Qué ve recepción en el sidebar según el caso

```mermaid
flowchart LR
    Cita([Cita abierta en sidebar]) --> Q1{¿treatment_session_id<br/>&ne; NULL?}

    Q1 -->|NO - cita normal| Normal[Sidebar igual que hoy<br/>· Precio S/80<br/>· Botón Registrar pago]

    Q1 -->|SI - sesión del plan| Q2{¿Saldo del plan<br/>&ge; precio sesión?}

    Q2 -->|NO saldo &lt; 80| Cobrar[Banner: Sesión 4/10<br/>Saldo plan: S/ 20<br/>· Botón Registrar pago<br/>· Falta: S/ 60]

    Q2 -->|SI saldo &ge; 80| Credito[Banner: Sesión 4/10<br/>Saldo plan: S/ 140<br/>· Botón Usar crédito del plan 🟢<br/>· Botón Registrar pago aparte]

    Credito --> Consumo[Click Usar crédito:<br/>session.status = completed<br/>NO crea payment<br/>saldo baja automático]

    Cobrar --> Mixto[Puede pagar parcial:<br/>S/ 60 cash + S/ 20 crédito<br/>saldo final = 0]

    classDef normal fill:#e5e7eb,color:#111
    classDef plan fill:#10b981,color:#fff
    classDef cred fill:#3b82f6,color:#fff
    class Normal normal
    class Cobrar,Mixto plan
    class Credito,Consumo cred
```

---

## 6. Panel "Presupuestos" en el drawer del paciente

Nueva tab que agrega a la ficha. Estructura visual:

```
┌─────────────────────────────────────────────────────────┐
│  📋 Control de Fertilidad          [activo]             │
│  Dr. García · Consulta Fertilidad                       │
│  ─────────────────────────────────────────────────      │
│                                                          │
│  Total:      S/ 800      Pagado:     S/ 300             │
│  Consumido:  S/ 240      Saldo:      S/ 60 ✅           │
│                                                          │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░  3/10 sesiones     │
│                                                          │
│  [ Registrar pago ]   [ Ver sesiones ]                  │
│                                                          │
│  Sesiones:                                              │
│  ✓ Sesión 1  · 15 abr · completada · S/ 80             │
│  ✓ Sesión 2  · 22 abr · completada · S/ 80             │
│  ✓ Sesión 3  · 29 abr · completada · S/ 80             │
│  📅 Sesión 4  · 06 may · programada                     │
│  ⏸  Sesión 5-10         · pendiente de agendar          │
└─────────────────────────────────────────────────────────┘
```

Al hacer click en **[ Registrar pago ]**:

```
┌─────────────────────────────────────────┐
│  Registrar pago al plan          [×]   │
│                                         │
│  Monto a registrar:                    │
│  ┌───────────┐                         │
│  │ S/ 500    │  Pendiente: S/ 500      │
│  └───────────┘                         │
│                                         │
│  Presets:  [25%]  [50%]  [100% 500]    │
│                                         │
│  Método:  ○ Efectivo  ○ Yape           │
│           ○ Transferencia  ○ Tarjeta   │
│                                         │
│  Nota (opcional):                      │
│  ┌─────────────────────────────────┐   │
│  │ Anticipo total del paquete      │   │
│  └─────────────────────────────────┘   │
│                                         │
│            [ Cancelar ]  [ Guardar ]   │
└─────────────────────────────────────────┘
```

Al guardar → `INSERT patient_payments (treatment_plan_id=X, appointment_id=NULL, amount=500)` → saldo se recalcula automáticamente.

---

## 7. Qué ve el paciente en el portal

En `/portal/{slug}/mis-citas`, nueva tarjeta en el sidebar (desktop) o arriba del tab Próximas (mobile):

```
┌──────────────────────────────────────┐
│  💊 MI PLAN                           │
│  Control de Fertilidad                │
│  ──────────────────────────────────  │
│  3 de 10 sesiones completadas         │
│  ████████░░░░░░░░░░░░░░░░░░  30%      │
│                                       │
│  S/ 300 pagado · S/ 800 total         │
│  S/ 500 pendiente                     │
│                                       │
│  Próxima sesión: 06 may, 10:00 am    │
└──────────────────────────────────────┘
```

Solo muestra pagado/total (no "crédito del plan" — decisión #2 confirmada). Reduce fricción sin abrir debates de precio.

---

## 8. Ciclo de vida del plan (máquina de estados)

```mermaid
stateDiagram-v2
    [*] --> active: Doctor crea plan
    active --> paused: Doctor pausa<br/>(paciente ausente temporal)
    paused --> active: Doctor reactiva
    active --> completed: Todas las sesiones<br/>marcadas completed
    active --> cancelled: Doctor/admin cancela
    paused --> cancelled: Doctor/admin cancela
    completed --> [*]
    cancelled --> [*]

    note right of cancelled
        Si saldo del plan &ne; 0 al cancelar:
        Alert "Plan tiene S/ X pendiente/crédito"
        Admin decide manualmente
        (reembolso, nota, crédito general)
    end note
```

---

## 9. Edge cases cubiertos

```mermaid
flowchart TD
    Start([Caso borde]) --> C1
    Start --> C2
    Start --> C3
    Start --> C4
    Start --> C5

    C1[Cita ya existe<br/>sin vincular] --> A1[Botón en sidebar<br/>Vincular a un plan]
    A1 --> A1R[Dropdown de planes activos<br/>del paciente → confirma<br/>→ session.appointment_id = cita.id]

    C2[Cancelar cita<br/>vinculada a sesión] --> A2[appointments.deleted<br/>→ trigger set session.appointment_id = NULL<br/>→ session vuelve a pending]

    C3[Doctor cambia precio<br/>del plan después] --> A3[Nuevas sesiones usan nuevo precio<br/>Sesiones ya completadas mantienen<br/>su session_price snapshot<br/>Contabilidad no se recalcula]

    C4[Sobrepago<br/>paga S/ 900 plan de S/ 800] --> A4[Sistema permite<br/>saldo = S/ 100 positivo<br/>UI muestra saldo a favor<br/>Admin decide reembolso o nota]

    C5[Cancelar plan<br/>con saldo positivo] --> A5[Alert amarillo al cancelar:<br/>Este plan tiene S/ 140 sin usar<br/>Admin confirma y registra<br/>nota manual]

    classDef case fill:#fef3c7,color:#111
    classDef sol fill:#d1fae5,color:#111
    class C1,C2,C3,C4,C5 case
    class A1,A1R,A2,A3,A4,A5 sol
```

---

## 10. Lo que NO cambia (compatibilidad hacia atrás)

```mermaid
flowchart LR
    A[Cita sin plan<br/>treatment_session_id=NULL] --> B[Sidebar idéntico a hoy]
    C[Pagos sin plan<br/>treatment_plan_id=NULL] --> D[Panel de cobros idéntico]
    E[Pacientes sin plan] --> F[Drawer sin tab Presupuestos]
    G[Scheduler sin vinculación] --> H[Form de cita idéntico]

    classDef ok fill:#d1fae5,color:#111
    class A,B,C,D,E,F,G,H ok
```

**Ninguna migración es destructiva. Todo es aditivo con defaults `NULL`.**

---

## 11. Resumen ejecutivo de cambios

| Tipo | Cambio | Impacto |
|---|---|---|
| **Migración 099** | 5 columnas nuevas en 4 tablas | ninguna destructiva |
| **UI Doctor** | `TreatmentPlansPanel` gana form con servicio + precio editable | no rompe vistas |
| **UI Recepción** | Scheduler: banner "paciente tiene plan" al entrar DNI | opt-in |
| **UI Recepción** | Sidebar de cita: banner + botón "Usar crédito" cuando la cita es sesión del plan | aditivo |
| **UI Recepción** | Nuevo tab "Presupuestos" en drawer del paciente | nueva pestaña |
| **UI Paciente** | Card "Mi plan" en `/portal/[slug]/mis-citas` | nueva tarjeta |
| **Endpoints** | `GET /api/treatment-plans/[id]/balance` (cómputo de saldo) | nuevo |
| **Endpoints** | `POST /api/treatment-plans/[id]/payments` (anticipos) | nuevo |

Cero breaking changes. Estimación total: **2-2.5 días**.

---

## Cómo importar esto a Excalidraw si quieres editar

1. Abre <https://excalidraw.com>
2. Menu ☰ → **Generate Diagram → Mermaid**
3. Pega el bloque `mermaid` que quieras editar
4. Exporta como PNG/SVG/excalidraw
