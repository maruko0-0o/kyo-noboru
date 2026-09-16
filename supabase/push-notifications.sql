-- PWA push notification storage and delivery trigger.
-- Run this once in Supabase Dashboard → SQL Editor after deploying
-- `push-notifications` and creating the Vault secret described in
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

-- pg_net sends the request asynchronously after the current transaction
-- commits, so notification delivery can never prevent a calendar change.
create extension if not exists pg_net;

create or replace function public.climb_send_session_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint_url constant text := 'https://mtbrvujoandyhrkeplio.supabase.co/functions/v1/push-notifications';
  webhook_secret text;
  payload jsonb;
begin
  select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
   where name = 'climb_push_webhook_20260915'
   limit 1;

  if coalesce(webhook_secret, '') <> '' then
    payload := jsonb_build_object(
      'action', 'dispatch',
      'event_type', tg_op,
      'table_name', tg_table_name,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
    );

    perform net.http_post(
      url := endpoint_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-climb-push-secret', webhook_secret
      ),
      timeout_milliseconds := 1000
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
exception when others then
  -- A notification outage must never block a member from saving a session.
  raise warning 'Skipping climb push dispatch: %', sqlerrm;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists climb_session_push_after_change on public.climb_sessions;
create trigger climb_session_push_after_change
after insert or update or delete on public.climb_sessions
for each row execute function public.climb_send_session_push();
