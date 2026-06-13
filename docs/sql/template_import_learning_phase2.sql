-- Template Import Learning Phase 2 schema proposal.
--
-- Purpose:
-- - Store reviewed quote template shells and their sections.
-- - Preserve existing quote_templates usage by keeping legacy columns.
-- - Keep templates separate from inventory, item code, account code, tax code, and pricing authority.
--
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  -- Legacy/current app fields. Keep these so existing Template screens continue to work.
  template_name text,
  category text,
  default_scope jsonb,
  default_exclusions jsonb,
  default_pricing_structure jsonb,
  template_content jsonb,
  source_uploaded_quote_example_id uuid,

  -- Template Import Learning Phase 2 fields.
  name text,
  trade text,
  job_type text,
  source_type text,
  source_filename text,
  source_text text,
  status text default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quote_templates_status_check
    check (status is null or status in ('draft', 'reviewed', 'active', 'archived'))
);

alter table public.quote_templates
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists template_name text,
  add column if not exists category text,
  add column if not exists default_scope jsonb,
  add column if not exists default_exclusions jsonb,
  add column if not exists default_pricing_structure jsonb,
  add column if not exists template_content jsonb,
  add column if not exists source_uploaded_quote_example_id uuid,
  add column if not exists name text,
  add column if not exists trade text,
  add column if not exists job_type text,
  add column if not exists source_type text,
  add column if not exists source_filename text,
  add column if not exists source_text text,
  add column if not exists status text default 'draft',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.quote_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.quote_templates(id) on delete cascade,
  display_order integer not null default 0,
  section_name text,
  section_category text,
  raw_text text,
  template_text text,
  placeholders jsonb not null default '[]'::jsonb,
  customer_facing boolean not null default true,
  exportable boolean not null default false,
  export_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quote_template_sections
  add column if not exists template_id uuid references public.quote_templates(id) on delete cascade,
  add column if not exists display_order integer not null default 0,
  add column if not exists section_name text,
  add column if not exists section_category text,
  add column if not exists raw_text text,
  add column if not exists template_text text,
  add column if not exists placeholders jsonb not null default '[]'::jsonb,
  add column if not exists customer_facing boolean not null default true,
  add column if not exists exportable boolean not null default false,
  add column if not exists export_category text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists quote_templates_user_id_idx
  on public.quote_templates(user_id);

create index if not exists quote_templates_status_idx
  on public.quote_templates(status);

create index if not exists quote_template_sections_template_id_idx
  on public.quote_template_sections(template_id);

create index if not exists quote_template_sections_order_idx
  on public.quote_template_sections(template_id, display_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_quote_templates_updated_at on public.quote_templates;
create trigger set_quote_templates_updated_at
before update on public.quote_templates
for each row
execute function public.set_updated_at();

drop trigger if exists set_quote_template_sections_updated_at on public.quote_template_sections;
create trigger set_quote_template_sections_updated_at
before update on public.quote_template_sections
for each row
execute function public.set_updated_at();

alter table public.quote_templates enable row level security;
alter table public.quote_template_sections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_templates'
      and policyname = 'Users can read own quote templates'
  ) then
    create policy "Users can read own quote templates"
      on public.quote_templates
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_templates'
      and policyname = 'Users can insert own quote templates'
  ) then
    create policy "Users can insert own quote templates"
      on public.quote_templates
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_templates'
      and policyname = 'Users can update own quote templates'
  ) then
    create policy "Users can update own quote templates"
      on public.quote_templates
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_templates'
      and policyname = 'Users can delete own quote templates'
  ) then
    create policy "Users can delete own quote templates"
      on public.quote_templates
      for delete
      using (auth.uid() = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_template_sections'
      and policyname = 'Users can read own quote template sections'
  ) then
    create policy "Users can read own quote template sections"
      on public.quote_template_sections
      for select
      using (
        exists (
          select 1
          from public.quote_templates
          where quote_templates.id = quote_template_sections.template_id
            and quote_templates.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_template_sections'
      and policyname = 'Users can insert own quote template sections'
  ) then
    create policy "Users can insert own quote template sections"
      on public.quote_template_sections
      for insert
      with check (
        exists (
          select 1
          from public.quote_templates
          where quote_templates.id = quote_template_sections.template_id
            and quote_templates.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_template_sections'
      and policyname = 'Users can update own quote template sections'
  ) then
    create policy "Users can update own quote template sections"
      on public.quote_template_sections
      for update
      using (
        exists (
          select 1
          from public.quote_templates
          where quote_templates.id = quote_template_sections.template_id
            and quote_templates.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.quote_templates
          where quote_templates.id = quote_template_sections.template_id
            and quote_templates.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_template_sections'
      and policyname = 'Users can delete own quote template sections'
  ) then
    create policy "Users can delete own quote template sections"
      on public.quote_template_sections
      for delete
      using (
        exists (
          select 1
          from public.quote_templates
          where quote_templates.id = quote_template_sections.template_id
            and quote_templates.user_id = auth.uid()
        )
      );
  end if;
end;
$$;
