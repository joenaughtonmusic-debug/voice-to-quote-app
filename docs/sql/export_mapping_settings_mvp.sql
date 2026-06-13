-- Export Mapping Settings MVP schema proposal.
--
-- Purpose:
-- - Store user-confirmed export fallback mappings by provider and category.
-- - Keep account codes, tax types, item-code policy, and export enablement out of templates.
-- - Preserve imported item metadata as the highest-priority export source.
--
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.export_category_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'xero',
  category text not null,
  account_code text,
  tax_type text,
  export_enabled boolean not null default true,
  item_code_policy text not null default 'confirmed_inventory_only',
  is_user_confirmed boolean not null default false,
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint export_category_mappings_provider_check
    check (provider in ('xero', 'jms')),
  constraint export_category_mappings_category_check
    check (category in ('labour', 'plants', 'materials', 'waste', 'optional_works', 'equipment', 'generic')),
  constraint export_category_mappings_item_code_policy_check
    check (item_code_policy in ('confirmed_inventory_only', 'allow_imported', 'never_export')),
  constraint export_category_mappings_user_provider_category_key
    unique (user_id, provider, category)
);

alter table public.export_category_mappings
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists provider text not null default 'xero',
  add column if not exists category text,
  add column if not exists account_code text,
  add column if not exists tax_type text,
  add column if not exists export_enabled boolean not null default true,
  add column if not exists item_code_policy text not null default 'confirmed_inventory_only',
  add column if not exists is_user_confirmed boolean not null default false,
  add column if not exists source text not null default 'user',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists export_category_mappings_user_provider_category_idx
  on public.export_category_mappings(user_id, provider, category);

create index if not exists export_category_mappings_user_id_idx
  on public.export_category_mappings(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_export_category_mappings_updated_at on public.export_category_mappings;
create trigger set_export_category_mappings_updated_at
before update on public.export_category_mappings
for each row
execute function public.set_updated_at();

alter table public.export_category_mappings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'export_category_mappings'
      and policyname = 'Users can read own export category mappings'
  ) then
    create policy "Users can read own export category mappings"
      on public.export_category_mappings
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'export_category_mappings'
      and policyname = 'Users can insert own export category mappings'
  ) then
    create policy "Users can insert own export category mappings"
      on public.export_category_mappings
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'export_category_mappings'
      and policyname = 'Users can update own export category mappings'
  ) then
    create policy "Users can update own export category mappings"
      on public.export_category_mappings
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'export_category_mappings'
      and policyname = 'Users can delete own export category mappings'
  ) then
    create policy "Users can delete own export category mappings"
      on public.export_category_mappings
      for delete
      using (auth.uid() = user_id);
  end if;
end;
$$;

