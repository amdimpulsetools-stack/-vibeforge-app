# VibeForge — Guía de Personalización y Escalabilidad

> **Fecha:** 2026-04-09
> **Versión:** 1.0

---

## 1. Funcionalidad Personalizada por Organización

### Los 3 niveles de personalización

| Nivel | Ejemplo | Cómo se resuelve | Costo para ti |
|---|---|---|---|
| **Configuración** | "Quiero que el campo DNI sea obligatorio" | Feature flag en `global_variables` o `organization_settings` | Bajo — ya soportado |
| **Módulo vertical** | "Necesito tracking de ciclos de fertilidad" | Módulo de especialidad (sistema de especialidades) | Medio — reutilizable para otros clientes |
| **Custom único** | "Quiero un reporte que cruce datos con mi sistema de laboratorio" | Desarrollo custom con cobro adicional | Alto — solo para ese cliente |

---

### Caso A: Es una configuración (no requiere código nuevo)

```
1. Cliente pide → "Quiero desactivar el campo de origen en pacientes"
2. Evalúas → Es un toggle, no requiere código nuevo
3. Agregas un flag → global_variables: "show_origin_field" = true/false
4. El componente lee el flag y oculta/muestra
5. Tiempo: 1-2 horas. Sin cobro extra.
```

### Caso B: Es un módulo que beneficia a más clientes

```
1. Cliente pide → "Necesito odontograma en la ficha clínica"
2. Evalúas → Esto sirve para TODOS los odontólogos
3. Lo desarrollas como módulo de especialidad
4. Se activa para todas las orgs con especialidad "Odontología"
5. Tiempo: días/semanas. Incluido en el plan o como add-on premium.
```

### Caso C: Es algo 100% custom para esa org

```
1. Cliente pide → "Quiero integrar con mi sistema de laboratorio XYZ"
2. Evalúas → Solo aplica a esta clínica
3. Proceso:
   a. Cotización formal (horas × tarifa)
   b. Contrato de desarrollo custom
   c. Se implementa usando feature flags por org_id
   d. Se cobra setup + mantenimiento mensual
4. Tiempo: según complejidad. Cobro adicional SIEMPRE.
```

---

### Implementación técnica: Feature flags por organización

**Tabla propuesta:**

```sql
organization_features
├── organization_id   UUID (FK → organizations)
├── feature_key       TEXT ("custom_lab_integration")
├── is_enabled        BOOLEAN (true)
├── config            JSONB ({"lab_api_url": "https://...", "api_key": "..."})
├── expires_at        TIMESTAMPTZ (null = permanente, o fecha de vencimiento)
├── created_at        TIMESTAMPTZ
```

**Uso en el frontend:**

```tsx
// Hook
const { hasFeature } = useOrgFeatures();

// En cualquier componente
{hasFeature("custom_lab_integration") && (
  <LabIntegrationPanel config={getFeatureConfig("custom_lab_integration")} />
)}
```

### Regla de oro

> **Si 2+ clientes piden lo mismo → es un módulo (se incluye o se cobra como add-on).**
> **Si solo 1 cliente lo pide → es custom y se cobra SIEMPRE.**

---

## 2. Cliente quiere su propia base de datos / migrar a privada

### Por qué lo piden

- Regulación (datos médicos sensibles, ley de protección de datos)
- Control total ("quiero mis datos en mi servidor")
- Miedo al vendor lock-in
- Requisito de su área de TI

---

### Los 3 modelos de base de datos

| Modelo | Descripción | Complejidad | Para quién |
|---|---|---|---|
| **A. Multi-tenant compartido** (actual) | Todos en la misma DB, aislados por RLS | Baja | 95% de clientes |
| **B. Schema dedicado** | Mismo servidor, schema PostgreSQL separado por cliente | Media | Clientes medianos que quieren aislamiento |
| **C. Instancia dedicada** | Supabase/DB propia para el cliente | Alta | Hospitales, clínicas grandes, gobierno |

---

### Proceso para Modelo C (base de datos propia)

#### Paso 1: Evaluación comercial

```
├── Precio: Plan Enterprise + fee de infraestructura dedicada
├── Mínimo sugerido: $500-1000/mes (cubre Supabase dedicado + mantenimiento)
├── Contrato: 12 meses mínimo
└── SLA definido (uptime, soporte, backups)
```

#### Paso 2: Provisioning (crear la infraestructura)

```
├── Crear nuevo proyecto en Supabase (o PostgreSQL self-hosted)
├── Aplicar TODAS las migraciones (001 a 077+)
├── Configurar Auth, Storage, RLS
├── Generar env vars dedicadas
└── Deploy de una instancia de tu app apuntando a esa DB
```

#### Paso 3: Migración de datos (si ya era cliente)

```
├── Export de datos de la org en la DB compartida
│   ├── organizations (WHERE id = 'org_xxx')
│   ├── patients, appointments, doctors, etc.
│   ├── specialty_clinical_data
│   └── storage files (attachments, photos)
├── Import en la nueva DB dedicada
├── Verificación de integridad
└── Período de coexistencia (2 semanas: ambas activas)
```

#### Paso 4: Cutover (cambio definitivo)

```
├── Desactivar org en DB compartida
├── Redirigir dominio custom (clinica.tuapp.com → instancia dedicada)
├── Confirmar con el cliente
└── Eliminar datos de DB compartida después de 30 días
```

---

### Script de migración (referencia)

```sql
-- Export: extraer todos los datos de una org específica
SELECT * FROM organizations WHERE id = :org_id;
SELECT * FROM organization_members WHERE organization_id = :org_id;
SELECT * FROM patients WHERE organization_id = :org_id;
SELECT * FROM appointments WHERE organization_id = :org_id;
SELECT * FROM doctors WHERE organization_id = :org_id;
SELECT * FROM doctor_schedules WHERE organization_id = :org_id;
SELECT * FROM services WHERE organization_id = :org_id;
SELECT * FROM offices WHERE organization_id = :org_id;
SELECT * FROM specialty_clinical_data WHERE organization_id = :org_id;
SELECT * FROM patient_payments WHERE organization_id = :org_id;
SELECT * FROM global_variables WHERE organization_id = :org_id;
SELECT * FROM lookup_categories WHERE organization_id = :org_id;
SELECT * FROM lookup_values WHERE organization_id = :org_id;
SELECT * FROM email_settings WHERE organization_id = :org_id;
SELECT * FROM email_templates WHERE organization_id = :org_id;
SELECT * FROM schedule_blocks WHERE organization_id = :org_id;
SELECT * FROM organization_subscriptions WHERE organization_id = :org_id;
SELECT * FROM organization_specialties WHERE organization_id = :org_id;
-- ... todas las tablas con organization_id
```

---

### Opciones de deploy para instancia dedicada

**Opción A: Vercel + Supabase dedicado**

```
├── Mismo código, diferentes env vars
├── NEXT_PUBLIC_SUPABASE_URL → nueva instancia
├── Dominio custom en Vercel
└── Costo: ~$25/mes Supabase Pro + Vercel
```

**Opción B: Self-hosted por el cliente**

```
├── Les das el código (licencia enterprise)
├── Ellos hostean en su infra (AWS, GCP, on-premise)
├── Tú cobras licencia + soporte
└── Costo para ellos: variable
```

---

### Pricing sugerido por modelo

| Modelo | Precio mensual | Incluye |
|---|---|---|
| Multi-tenant (actual) | S/49 - S/149 | DB compartida, RLS, backups automáticos |
| Schema dedicado | S/400 - S/600 | Aislamiento lógico, backups independientes |
| Instancia dedicada | S/1,500+ | DB propia, dominio custom, SLA, soporte prioritario |
| Self-hosted (licencia) | S/2,000+ setup + S/800/mes | Código fuente, soporte, actualizaciones |

---

## 3. Resumen ejecutivo — ¿Qué hacer cuándo?

| Decisión | Recomendación | Cuándo implementar |
|---|---|---|
| Features custom por org | Feature flags (`organization_features`) | Cuando llegue el primer pedido custom |
| Módulos por especialidad | Ya está la infraestructura (Fase 1 hecha) | Cuando llegue el primer cliente vertical |
| DB dedicada | No invertir ahora. Documentar el proceso. | Cuando un cliente grande lo exija |
| Script de migración | No construir aún. Tener claro el proceso. | Cuando tengas +50 clientes |

---

**Lo que necesitas HOY:** Nada de esto. Tu arquitectura multi-tenant con RLS ya es suficiente para los primeros 100+ clientes. Estas opciones las activas cuando la demanda lo justifique.

---

> Documento generado para VibeForge — 2026-04-09
