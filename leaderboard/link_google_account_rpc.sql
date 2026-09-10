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

create or replace function link_google_account(p_client_id uuid, p_recovery_code text)
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
-- update) — so the only gate on who can call it at all is this grant:
revoke all on function link_google_account(uuid, text) from public;
grant execute on function link_google_account(uuid, text) to authenticated;
