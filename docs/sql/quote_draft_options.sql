-- Persist structured quote_options on saved drafts.
-- Run in Supabase SQL editor before using draft save/reopen with priced trade options.

alter table public.quote_drafts
  add column if not exists quote_options jsonb not null default '[]'::jsonb;

comment on column public.quote_drafts.quote_options is
  'Structured QuoteOption[] from MaterialBill → Resolver. Restored on draft reopen without re-running calculators.';
