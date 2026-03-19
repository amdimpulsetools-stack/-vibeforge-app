-- Global variables table: key-value configuration store with drag-and-drop ordering
create table if not exists global_variables (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  key         text not null unique,
  value       text not null default '',
  description text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists global_variables_sort_idx on global_variables(sort_order);

-- RLS
alter table global_variables enable row level security;

create policy "Authenticated users can manage global variables"
  on global_variables
  for all
  to authenticated
  using (true)
  with check (true);

-- Seed some example variables
insert into global_variables (name, key, value, description, sort_order) values
  ('Nombre de la Clínica',    'clinic_name',         'Mi Clínica',       'Nombre visible en reportes y documentos',   1),
  ('Teléfono de contacto',    'clinic_phone',        '+51 999 000 000',  'Teléfono principal de la clínica',          2),
  ('Correo de contacto',      'clinic_email',        'info@clinica.com', 'Email para notificaciones',                 3),
  ('Máx. citas por slot',     'max_appts_per_slot',  '1',                'Cantidad máxima de citas en el mismo slot', 4),
  ('Moneda',                  'currency_symbol',     'S/.',              'Símbolo monetario usado en reportes',       5)
on conflict (key) do nothing;
