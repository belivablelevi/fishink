-- leaderboard/players_google_auth_migration.sql
--
-- Run this in your Supabase project's SQL editor (Database > SQL Editor)
-- AFTER enabling the Google provider in Authentication > Providers.
--
-- This adds Google-linked identity to the existing `players` table used by
-- js/cloud.js. It does NOT touch the existing username + recovery-code flow —
-- that keeps working exactly as it does today.

-- ── Step 1: add the linking column ──────────────────────────────────────────

alter table players
  add column if not exists auth_user_id uuid references auth.users(id) unique;

-- ── Step 2: check what RLS policies already exist on `players` ─────────────
--
-- Run this first and read the output before touching anything below.
--
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where tablename = 'players';
--
-- IMPORTANT — read this before Step 3:
-- Postgres RLS policies are *permissive* — if ANY policy on a table allows an
-- action, it's allowed, regardless of how many other, stricter policies also
-- exist. So if `players` currently has blanket policies along the lines of
-- `using (true)` / `with check (true)` (matching the "anyone can ..." pattern
-- leaderboard_scores uses, documented in schema.sql), then simply adding the
-- auth.uid()-scoped policies in Step 3 below changes nothing — the old
-- permissive policies still let anyone with the anon key read/write ANY row,
-- Google-linked or not.
--
-- To actually make Google-linked rows harder to tamper with, the existing
-- open policies need to be narrowed to `auth_user_id is null` (i.e. "open
-- access only applies to legacy recovery-code rows that were never
-- Google-linked"). That is a real behavior change to policies that are
-- already live in production, so it's written here as an explicit,
-- copy-adjust-run step rather than something this migration does blindly —
-- confirm the actual policy names from the query above and adapt the
-- `drop policy` statements in Step 4 to match before running them.

-- ── Step 3: add new policies scoped to the authenticated Google session ────

create policy "google players can select own row"
  on players for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy "google players can update own row"
  on players for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "google players can insert own row"
  on players for insert
  to authenticated
  with check (auth_user_id = auth.uid());

-- ── Step 4 (optional but recommended): close the gap for Google-linked rows ─
--
-- Only run this after confirming the actual existing policy names from the
-- Step 2 query — the names below are guesses based on the leaderboard_scores
-- pattern and will error (harmlessly — `drop policy` fails if the name
-- doesn't match) if your `players` table used different names.
--
-- drop policy if exists "anyone can select" on players;
-- create policy "legacy recovery-code players stay open"
--   on players for select
--   to anon
--   using (auth_user_id is null);
--
-- drop policy if exists "anyone can insert" on players;
-- create policy "legacy recovery-code players can insert"
--   on players for insert
--   to anon
--   with check (auth_user_id is null);
--
-- drop policy if exists "anyone can update" on players;
-- create policy "legacy recovery-code players can update"
--   on players for update
--   to anon
--   using (auth_user_id is null)
--   with check (auth_user_id is null);
--
-- After Step 4, a row only becomes truly scoped to auth.uid() once
-- auth_user_id is set on it — exactly the accounts created via
-- cloudCreatePlayerWithGoogle() in js/cloud.js. Existing recovery-code rows
-- (auth_user_id is null) keep behaving exactly as before Step 4.
