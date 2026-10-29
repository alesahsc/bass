-- Run in the Supabase SQL Editor. Each account can access only its own rows.
create table if not exists public.practice_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id integer not null check (song_id between 1 and 53),
  progress jsonb not null check (jsonb_typeof(progress) = 'object'),
  primary key (user_id, song_id)
);
alter table public.practice_progress enable row level security;
revoke all on public.practice_progress from anon;
grant select, insert, update, delete on public.practice_progress to authenticated;
drop policy if exists "Own practice progress" on public.practice_progress;
create policy "Own practice progress" on public.practice_progress
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
