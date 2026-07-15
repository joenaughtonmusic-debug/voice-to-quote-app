-- Xero export idempotency + result persistence.
--
-- Purpose:
-- - Make POST /api/export-xero-quote idempotent so a double-click / retry does not
--   create duplicate Xero draft quotes.
-- - Persist the webhook result (xero_quote_id if returned, status, timestamp) against
--   the draft so the prior result can be returned on a repeat instead of re-firing.
--
-- The idempotency key is `draft_id + ':' + sha256(stable_json(payload))` (or just the
-- payload hash when no draft_id is present) — see lib/xero-export.ts.
--
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.xero_quote_exports (
  idempotency_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id text,
  payload_hash text not null,
  status text not null default 'sent',
  xero_quote_id text,
  webhook_status integer,
  webhook_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint xero_quote_exports_status_check
    check (status in ('sent', 'webhook_failed'))
);

-- Look up prior exports for a draft (result persisted "against the draft").
create index if not exists xero_quote_exports_draft_id_idx
  on public.xero_quote_exports (user_id, draft_id);

-- Row Level Security: a user may only see/insert/update their own export records.
alter table public.xero_quote_exports enable row level security;

drop policy if exists "xero_quote_exports_select_own" on public.xero_quote_exports;
create policy "xero_quote_exports_select_own"
  on public.xero_quote_exports for select
  using (auth.uid() = user_id);

drop policy if exists "xero_quote_exports_insert_own" on public.xero_quote_exports;
create policy "xero_quote_exports_insert_own"
  on public.xero_quote_exports for insert
  with check (auth.uid() = user_id);

drop policy if exists "xero_quote_exports_update_own" on public.xero_quote_exports;
create policy "xero_quote_exports_update_own"
  on public.xero_quote_exports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
