-- Migration: allow used_for_output = true (controlled mode).
--
-- The original quote_plan_shadow_reports table constrained used_for_output to false (shadow was
-- observe-only). Controlled mode (ENABLE_AI_QUOTE_PLAN) lets an accepted/normalised AI plan drive
-- the quote, so that column must be allowed to be true. Run this once on databases created before
-- controlled mode. Safe to run multiple times.

alter table public.quote_plan_shadow_reports
  drop constraint if exists quote_plan_shadow_reports_not_used_for_output;
