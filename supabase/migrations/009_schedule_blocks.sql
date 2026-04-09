-- Schedule blocks: block time slots or full days in the scheduler
create table if not exists schedule_blocks (
  id          uuid primary key default gen_random_uuid(),
  block_date  date not null,
  start_time  time,
  end_time    time,
  office_id   uuid references offices(id) on delete cascade,
  all_day     boolean not null default false,
  reason      text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists schedule_blocks_date_idx on schedule_blocks (block_date);
create index if not exists schedule_blocks_office_idx on schedule_blocks (office_id);

alter table schedule_blocks enable row level security;

create policy "Authenticated users can manage schedule blocks"
  on schedule_blocks for all
  to authenticated
  using (true)
  with check (true);
