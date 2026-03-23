-- In-app notifications for real-time alerts
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,  -- null = all org admins
  type            text not null default 'info',  -- appointment_created, appointment_cancelled, payment_received, info
  title           text not null,
  body            text not null default '',
  action_url      text,          -- relative URL to navigate on click
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Indexes
create index notifications_org_user_idx on notifications(organization_id, user_id, is_read, created_at desc);
create index notifications_created_idx on notifications(created_at);

-- RLS
alter table notifications enable row level security;

-- Members can see their org notifications (either targeted to them or broadcast)
create policy "Users can view own org notifications"
  on notifications for select to authenticated
  using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
    and (user_id is null or user_id = auth.uid())
  );

-- Users can update (mark as read) their own notifications
create policy "Users can update own notifications"
  on notifications for update to authenticated
  using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
    and (user_id is null or user_id = auth.uid())
  )
  with check (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
    and (user_id is null or user_id = auth.uid())
  );

-- Service role can insert (from API routes)
create policy "Service role can insert notifications"
  on notifications for insert to authenticated
  with check (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

-- Users can delete their own read notifications
create policy "Users can delete own read notifications"
  on notifications for delete to authenticated
  using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
    and (user_id is null or user_id = auth.uid())
    and is_read = true
  );

-- Enable Realtime on this table
alter publication supabase_realtime add table notifications;

-- Auto-cleanup: delete read notifications older than 30 days
-- (Run via Supabase cron or pg_cron)
create or replace function cleanup_old_notifications()
returns void language sql as $$
  delete from notifications
  where is_read = true and created_at < now() - interval '30 days';
$$;
