-- AI QuotePlan shadow-report telemetry.
--
-- Purpose:
-- - Persist what the shadow-mode AI QuotePlan planner produced on each run so it can be
--   reviewed: whether it was accepted / normalised / fell back / failed, the AI draft, the
--   validation findings, and how it differed from the deterministic QuotePlan.
-- - `used_for_output` records whether the AI plan actually drove the quote: false in shadow
--   mode (observe-only), true in controlled mode (ENABLE_AI_QUOTE_PLAN) when the plan resolved
--   accepted/normalised. Rows are written best-effort by POST /api/process-quote and a write
--   failure must not fail quote generation (see lib/quote-plan/shadow.ts).
--
-- Row-level security restricts every row to the authenticated user that produced it.
--
-- Safe to run multiple times.

create table if not exists public.quote_plan_shadow_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id text,
  created_at timestamptz not null default now(),
  transcript_hash text,
  deterministic_plan jsonb,
  ai_draft_plan jsonb,
  resolved_ai_plan jsonb,
  resolve_status text not null,
  validation_findings jsonb,
  diff_summary jsonb,
  used_for_output boolean not null default false,
  model jsonb,

  constraint quote_plan_shadow_reports_status_check
    check (resolve_status in ('accepted', 'normalised', 'fallback', 'failed', 'skipped'))
  -- NOTE: controlled mode (ENABLE_AI_QUOTE_PLAN) can set used_for_output = true, so there is
  -- deliberately NO check forcing it to false. See quote_plan_shadow_reports_allow_used.sql to
  -- drop that constraint on databases created before controlled mode.
);

-- Review a user's shadow reports newest-first, optionally scoped to a draft.
create index if not exists quote_plan_shadow_reports_user_created_idx
  on public.quote_plan_shadow_reports (user_id, created_at desc);
create index if not exists quote_plan_shadow_reports_draft_id_idx
  on public.quote_plan_shadow_reports (user_id, draft_id);

-- Row Level Security: a user may only see/insert their own shadow reports.
alter table public.quote_plan_shadow_reports enable row level security;

drop policy if exists "quote_plan_shadow_reports_select_own" on public.quote_plan_shadow_reports;
create policy "quote_plan_shadow_reports_select_own"
  on public.quote_plan_shadow_reports for select
  using (auth.uid() = user_id);

drop policy if exists "quote_plan_shadow_reports_insert_own" on public.quote_plan_shadow_reports;
create policy "quote_plan_shadow_reports_insert_own"
  on public.quote_plan_shadow_reports for insert
  with check (auth.uid() = user_id);
