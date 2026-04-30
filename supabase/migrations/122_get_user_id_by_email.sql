-- Migration 122: Helper RPC to look up a user ID by email in auth.users.
-- Used by the invite-registration flow to avoid loading all users into memory.

create or replace function public.get_user_id_by_email(lookup_email text)
returns table(id uuid) language sql security definer
set search_path = '' as $$
  select au.id
  from auth.users au
  where lower(au.email) = lower(lookup_email)
  limit 1;
$$;

-- Only service_role should call this (via supabaseAdmin).
revoke execute on function public.get_user_id_by_email(text) from anon, authenticated;
