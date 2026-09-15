-- leaderboard/link_google_account_rpc.sql
--
-- Run this in the Supabase SQL editor AFTER players_google_auth_migration.sql.
--
-- Lets an existing recovery-code player link their Google identity to their
-- CURRENT players row (rather than creating a separate new account). This
-- can't be expressed as a plain RLS policy: at the moment of linking, the
-- row's auth_user_id is still null, so no auth.uid()-scoped policy can match
-- it yet, and a policy permissive enough to let any authenticated user claim
-- any unlinked row would let a stranger steal someone else's save just by
-- knowing/guessing its client_id. So the recovery-code check has to happen
-- inside a single atomic server-side function instead.

-- players.client_id is `text` in the live schema (confirmed against the
-- actual database — it's not a uuid column despite holding UUID-shaped
-- strings), so p_client_id must match that type or the comparison inside
-- the function fails at runtime with "operator does not exist: text = uuid".
--
-- Drop the old uuid-typed version FIRST — `create or replace` can't change a
-- function's parameter types, so without this you'd end up with two
-- overloads of the same name and PostgREST would refuse to pick one.
drop function if exists link_google_account(uuid, text);

create or replace function link_google_account(p_client_id text, p_recovery_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update players
    set auth_user_id = auth.uid()
    where client_id = p_client_id
      and recovery_code = p_recovery_code
      and auth_user_id is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- security definer means this function runs with the privileges of whoever
-- created it (bypassing players' RLS entirely for this one controlled
-- update) — so the only gate on who can call it at all is this grant.
--
-- Supabase projects configure a default-privilege rule that auto-grants
-- EXECUTE on every new function directly to both `anon` and `authenticated`
-- (separate from — and not removed by revoking from — the `public`
-- pseudo-role), so `anon` must be revoked explicitly or it stays callable
-- without any real Google session at all.
revoke all on function link_google_account(text, text) from public;
revoke all on function link_google_account(text, text) from anon;
grant execute on function link_google_account(text, text) to authenticated;
