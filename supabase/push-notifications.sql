-- PWA push notification storage and delivery trigger.
-- Run this once in Supabase Dashboard → SQL Editor after deploying
-- `push-notifications` and setting the two database settings shown in
-- SUPABASE_PUSH_SETUP.md.

create table if not exists public.climb_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  member_id uuid not null,
  auth_user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, endpoint)
);

alter table public.climb_push_subscriptions enable row level security;

-- Subscriptions are only read and written by the Edge Function using its
-- server-side key. Do not add browser policies to this table.

create index if not exists climb_push_subscriptions_group_id_idx
  on public.climb_push_subscriptions (group_id);

create or replace function public.climb_send_session_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_url text := current_setting('app.climb_push_function_url', true);
  webhook_secret text := current_setting('app.climb_push_webhook_secret', true);
  payload jsonb;
begin
  -- Leaving these settings empty makes this trigger a safe no-op until the
  -- Edge Function is deployed and configured.
  if endpoint_url is null or endpoint_url = '' or webhook_secret is null or webhook_secret = '' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  payload := jsonb_build_object(
    'action', 'dispatch',
    'event_type', tg_op,
    'table_name', tg_table_name,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );

  perform supabase_functions.http_request(
    endpoint_url,
    'POST',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-climb-push-secret', webhook_secret
    ),
    payload,
    '1000'
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists climb_session_push_after_change on public.climb_sessions;
create trigger climb_session_push_after_change
after insert or update or delete on public.climb_sessions
for each row execute function public.climb_send_session_push();
