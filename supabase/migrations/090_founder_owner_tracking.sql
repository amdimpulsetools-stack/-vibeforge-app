-- ============================================================================
-- 090 — Founder owner tracking: notes + lifecycle events
-- ============================================================================

-- Founder notes on organizations (internal CRM)
create table if not exists founder_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_founder_notes_org on founder_notes(organization_id);

alter table founder_notes enable row level security;

create policy "founder_notes_founder_only" on founder_notes
  for all using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_founder = true
    )
  );

-- Owner lifecycle events
create table if not exists owner_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null check (event_type in (
    'signup',
    'first_appointment',
    'first_payment',
    'first_team_member',
    'plan_upgraded',
    'plan_downgraded',
    'trial_expired',
    'churned',
    'reactivated',
    'ticket_opened',
    'milestone_100_appointments',
    'milestone_500_patients'
  )),
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_lifecycle_events_org on owner_lifecycle_events(organization_id);
create index idx_lifecycle_events_type on owner_lifecycle_events(event_type);

alter table owner_lifecycle_events enable row level security;

create policy "lifecycle_events_founder_only" on owner_lifecycle_events
  for all using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_founder = true
    )
  );

-- Backfill signup events from existing organizations
insert into owner_lifecycle_events (organization_id, event_type, created_at)
select id, 'signup', created_at
from organizations
on conflict do nothing;
