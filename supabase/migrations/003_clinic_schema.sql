-- Migración: Esquema de clínica
-- Tablas: doctors, services, doctor_services, doctor_schedules, break_times, appointments, global_variables

-- Doctores
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  email text,
  phone text,
  avatar_url text,
  color text not null default '#10b981',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.doctors enable row level security;
create policy "Todos pueden ver doctores activos" on public.doctors
  for select using (is_active = true);
create policy "Solo admins gestionan doctores" on public.doctors
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Servicios
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes integer not null default 30,
  price numeric(10,2),
  color text not null default '#10b981',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.services enable row level security;
create policy "Todos pueden ver servicios activos" on public.services
  for select using (is_active = true);
create policy "Solo admins gestionan servicios" on public.services
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Relación Doctor-Servicios
create table if not exists public.doctor_services (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (doctor_id, service_id)
);
alter table public.doctor_services enable row level security;
create policy "Todos pueden ver relaciones doctor-servicio" on public.doctor_services
  for select using (true);
create policy "Solo admins gestionan relaciones" on public.doctor_services
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Horarios de doctores (días y horas disponibles)
create table if not exists public.doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Domingo, 1=Lunes...
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, day_of_week)
);
alter table public.doctor_schedules enable row level security;
create policy "Todos pueden ver horarios" on public.doctor_schedules
  for select using (true);
create policy "Solo admins gestionan horarios" on public.doctor_schedules
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Tiempos de descanso (break times)
create table if not exists public.break_times (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade, -- null = global
  name text not null,
  start_time time not null,
  end_time time not null,
  day_of_week smallint check (day_of_week between 0 and 6), -- null = todos los días
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.break_times enable row level security;
create policy "Todos pueden ver breaks activos" on public.break_times
  for select using (is_active = true);
create policy "Solo admins gestionan breaks" on public.break_times
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Citas
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id),
  service_id uuid not null references public.services(id),
  patient_name text not null,
  patient_phone text,
  patient_email text,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appointments enable row level security;
create policy "Usuarios autenticados pueden ver citas" on public.appointments
  for select using (auth.uid() is not null);
create policy "Usuarios autenticados pueden crear citas" on public.appointments
  for insert with check (auth.uid() is not null);
create policy "Solo admins gestionan citas" on public.appointments
  for update using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Variables globales
create table if not exists public.global_variables (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null default '',
  type text not null default 'text' check (type in ('text','number','boolean','color')),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.global_variables enable row level security;
create policy "Todos pueden ver variables globales" on public.global_variables
  for select using (true);
create policy "Solo admins gestionan variables globales" on public.global_variables
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Trigger para updated_at automático
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_doctors_updated before update on public.doctors
  for each row execute procedure public.handle_updated_at();
create trigger on_services_updated before update on public.services
  for each row execute procedure public.handle_updated_at();
create trigger on_schedules_updated before update on public.doctor_schedules
  for each row execute procedure public.handle_updated_at();
create trigger on_breaks_updated before update on public.break_times
  for each row execute procedure public.handle_updated_at();
create trigger on_appointments_updated before update on public.appointments
  for each row execute procedure public.handle_updated_at();
create trigger on_global_vars_updated before update on public.global_variables
  for each row execute procedure public.handle_updated_at();
