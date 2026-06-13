-- Adds optional export metadata for Knowledge Base / JMS / Plant Library items.
-- Safe to run multiple times.

alter table public.knowledge_items
  add column if not exists account_code text,
  add column if not exists sales_account_code text,
  add column if not exists tax_code text,
  add column if not exists tax_type text,
  add column if not exists gst_rate numeric;

