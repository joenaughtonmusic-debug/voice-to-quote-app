-- Photos MVP: draft_photos table + site-visit-photos storage bucket
-- Run once in Supabase SQL editor.
-- All statements are idempotent (safe to re-run).

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.draft_photos (
  id          uuid        primary key default gen_random_uuid(),
  draft_id    uuid        not null references public.quote_drafts(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  storage_path text       not null,
  caption     text        null,
  taken_at    timestamptz null,
  created_at  timestamptz not null default now()
);

create index if not exists draft_photos_draft_id_idx on public.draft_photos (draft_id);
create index if not exists draft_photos_user_id_idx  on public.draft_photos (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.draft_photos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'draft_photos' and policyname = 'Users can view own draft photos'
  ) then
    create policy "Users can view own draft photos"
      on public.draft_photos
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'draft_photos' and policyname = 'Users can insert own draft photos'
  ) then
    create policy "Users can insert own draft photos"
      on public.draft_photos
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'draft_photos' and policyname = 'Users can delete own draft photos'
  ) then
    create policy "Users can delete own draft photos"
      on public.draft_photos
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket
-- Run this separately in the Supabase Storage UI or via the management API.
-- The bucket cannot be created via SQL, but the RLS policies below apply once
-- the bucket exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- Bucket name:  site-visit-photos
-- Public:       false  (signed URLs only)
-- File size limit: 10 MB (images are resized client-side before upload to ~800px)
-- Allowed MIME types: image/jpeg

-- Storage RLS policies (apply after bucket is created):

-- Allow authenticated users to upload to their own folder  ({user_id}/{draft_id}/*)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects'
      and schemaname = 'storage'
      and policyname = 'site-visit-photos: users can upload own photos'
  ) then
    create policy "site-visit-photos: users can upload own photos"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'site-visit-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects'
      and schemaname = 'storage'
      and policyname = 'site-visit-photos: users can read own photos'
  ) then
    create policy "site-visit-photos: users can read own photos"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'site-visit-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects'
      and schemaname = 'storage'
      and policyname = 'site-visit-photos: users can delete own photos'
  ) then
    create policy "site-visit-photos: users can delete own photos"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'site-visit-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
