-- Stub mínimo del esquema que toca la mig 273 (solo columnas usadas).
CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid);
CREATE TABLE doctors (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES doctors(id),
  service_id uuid REFERENCES services(id),
  appointment_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show'))
);
CREATE TABLE clinical_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid REFERENCES doctors(id),
  appointment_id uuid,
  priority text NOT NULL DEFAULT 'green' CHECK (priority IN ('red','yellow','green')),
  reason text NOT NULL,
  follow_up_date date,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','rule','system')),
  rule_key text,
  target_category_canonical text,
  expected_by timestamptz,
  closure_reason text,
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','contactado',
    'agendado_via_contacto','agendado_organico_dentro_ventana','pospuesto',
    'desistido_silencioso','vencido','cerrado_manual')),
  source_type text CHECK (source_type IS NULL OR source_type IN ('appointment','clinical_note',
    'treatment_plan','treatment_session','budget_record','manual','treatment')),
  source_id uuid
);
