-- leaderboard/schema.sql
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor).

create table leaderboard_scores (
  client_id uuid primary key,
  name text not null check (char_length(name) between 1 and 20),
  lifetime_earned numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table leaderboard_scores enable row level security;

-- No login in this game (see SETUP.md for the tradeoff this implies):
-- every policy below is intentionally "anyone", not scoped to a specific
-- row owner, because there is no auth.uid() to scope it to.
create policy "anyone can read" on leaderboard_scores
  for select using (true);

create policy "anyone can insert" on leaderboard_scores
  for insert with check (true);

create policy "anyone can update" on leaderboard_scores
  for update using (true);
