-- Run this once in the Supabase SQL editor. The Nexus website (nexusnext.lovable.app)
-- and extension can then read/write the same JSON document for the authenticated user.
create table if not exists public.scholarpath_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.scholarpath_states enable row level security;

create policy "Users can read their Nexus state"
  on public.scholarpath_states for select
  using (auth.uid() = user_id);

create policy "Users can create their Nexus state"
  on public.scholarpath_states for insert
  with check (auth.uid() = user_id);

create policy "Users can update their Nexus state"
  on public.scholarpath_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
