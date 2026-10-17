-- Run this once in the Supabase SQL Editor for the project.
create table if not exists public.velora_simulations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.velora_simulations enable row level security;

drop policy if exists "Users can read their own simulation" on public.velora_simulations;
create policy "Users can read their own simulation"
  on public.velora_simulations for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own simulation" on public.velora_simulations;
create policy "Users can create their own simulation"
  on public.velora_simulations for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own simulation" on public.velora_simulations;
create policy "Users can update their own simulation"
  on public.velora_simulations for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.velora_simulations to authenticated;
