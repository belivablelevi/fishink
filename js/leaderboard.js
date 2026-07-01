// Fish INK Factory — global leaderboard (Supabase, no login)
//
// Identity is a random UUID stored in localStorage, separate from the
// display name, so renaming never splits a player into a second row.
// All requests are plain fetch() calls to Supabase's PostgREST endpoint —
// same raw-REST approach the sibling Kei Property Services project uses
// in its own contact.html, so no extra client library is needed.

// ── PASTE YOUR SUPABASE CREDENTIALS HERE ──────────────────────────────
var SUPABASE_URL  = 'https://dcwaensexoprcpswkont.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjd2FlbnNleG9wcmNwc3drb250Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTIxNzcsImV4cCI6MjA5NzQ2ODE3N30.5nr6dPfjzTALnwbKqFvkOLZuq1-7TPQ0B9g9x11xows';
// ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ID_KEY   = 'fishink_leaderboard_id';
const LEADERBOARD_NAME_KEY = 'fishink_leaderboard_name';

// ── Admin name override ────────────────────────────────────────────────────
// Add a `name_locked boolean default false` column to leaderboard_scores.
// When you want to rename a player: edit their `name` in the Supabase table
// editor, then set `name_locked = true`. This trigger will then silently
// ignore any name the client submits, keeping your version intact:
//
//   CREATE OR REPLACE FUNCTION prevent_locked_name_update()
//   RETURNS TRIGGER AS $$
//   BEGIN
//     IF OLD.name_locked = TRUE THEN NEW.name = OLD.name; END IF;
//     RETURN NEW;
//   END;
//   $$ LANGUAGE plpgsql;
//
//   CREATE TRIGGER protect_locked_name
//   BEFORE UPDATE ON leaderboard_scores
//   FOR EACH ROW EXECUTE FUNCTION prevent_locked_name_update();
// ──────────────────────────────────────────────────────────────────────────

// Basic profanity filter — normalises leet-speak before checking
const BANNED_WORDS = [
  'fuck','shit','ass','bitch','cunt','dick','cock','pussy','nigger','nigga',
  'faggot','fag','retard','whore','slut','bastard','piss','damn','hell',
  'rape','kill','nazi','hitler',
];
function normaliseName(s) {
  return s.toLowerCase()
    .replace(/[4@]/g,'a').replace(/3/g,'e').replace(/[1!|]/g,'i')
    .replace(/0/g,'o').replace(/[5$]/g,'s').replace(/[7+]/g,'t')
    .replace(/[^a-z0-9]/g,'');
}
function nameIsClean(name) {
  const n = normaliseName(name);
  return !BANNED_WORDS.some(w => n.includes(w));
}

function isLeaderboardConfigured() {
  return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON !== 'YOUR_SUPABASE_ANON_KEY';
}

function getLeaderboardClientId() {
  let id = localStorage.getItem(LEADERBOARD_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LEADERBOARD_ID_KEY, id);
  }
  return id;
}

function getLeaderboardName() {
  return localStorage.getItem(LEADERBOARD_NAME_KEY) || '';
}

function setLeaderboardName(name) {
  const trimmed = (name || '').trim().slice(0, 20);
  if (!trimmed) return false;
  if (!nameIsClean(trimmed)) return 'inappropriate';
  localStorage.setItem(LEADERBOARD_NAME_KEY, trimmed);
  return true;
}

function leaderboardHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_ANON,
    Authorization: 'Bearer ' + SUPABASE_ANON,
    'Content-Type': 'application/json',
  }, extra || {});
}

// Upserts this player's row. Silent no-op while unconfigured or before a
// name is chosen — there is nothing to submit yet in either case. Network
// failures are swallowed: a flaky leaderboard call must never interrupt
// gameplay or surface an error to the player.
function submitLeaderboardScore() {
  if (!isLeaderboardConfigured()) return;
  const name = getLeaderboardName();
  if (!name) return;

  const payload = {
    client_id: getLeaderboardClientId(),
    name,
    lifetime_earned: game.lifetimeEarned,
  };

  fetch(`${SUPABASE_URL}/rest/v1/leaderboard_scores?on_conflict=client_id`, {
    method: 'POST',
    headers: leaderboardHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// Fetches the top 50 plus this player's own row and rank. Returns a plain
// result object rather than throwing, so callers (the Leaderboard tab) can
// render every outcome — unconfigured, network error, or success — without
// a try/catch of their own.
async function fetchLeaderboard() {
  if (!isLeaderboardConfigured()) return { configured: false };

  const clientId = getLeaderboardClientId();
  try {
    const topRes = await fetch(
      `${SUPABASE_URL}/rest/v1/leaderboard_scores?select=client_id,name,lifetime_earned&order=lifetime_earned.desc&limit=50`,
      { headers: leaderboardHeaders() }
    );
    const top = topRes.ok ? await topRes.json() : [];

    const meRes = await fetch(
      `${SUPABASE_URL}/rest/v1/leaderboard_scores?select=name,lifetime_earned&client_id=eq.${clientId}`,
      { headers: leaderboardHeaders() }
    );
    const meRows = meRes.ok ? await meRes.json() : [];
    const me = meRows[0] || null;

    let myRank = null;
    if (me) {
      // Rank = 1 + how many rows outscore this one. Prefer: count=exact
      // makes PostgREST report the total match count in the Content-Range
      // response header (e.g. "0-24/137" or "*/0" when nothing matches)
      // even though we don't need the rows themselves here.
      const rankRes = await fetch(
        `${SUPABASE_URL}/rest/v1/leaderboard_scores?select=client_id&lifetime_earned=gt.${me.lifetime_earned}`,
        { headers: leaderboardHeaders({ Prefer: 'count=exact' }) }
      );
      const range = rankRes.headers.get('content-range');
      const higherCount = range ? Number(range.split('/')[1]) : null;
      myRank = higherCount != null && !Number.isNaN(higherCount) ? higherCount + 1 : null;
    }

    return { configured: true, top, me, myRank, clientId };
  } catch (e) {
    return { configured: true, error: true };
  }
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isLeaderboardConfigured, getLeaderboardClientId, getLeaderboardName, setLeaderboardName, submitLeaderboardScore, fetchLeaderboard };
  // Also assign to global for the test
  Object.assign(global, { isLeaderboardConfigured, getLeaderboardClientId, getLeaderboardName, setLeaderboardName, submitLeaderboardScore, fetchLeaderboard });
}
