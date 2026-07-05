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

// Increment LEADERBOARD_SEASON to wipe all scores: every player gets a fresh
// client_id on next load, so old rows become orphaned. Pair with a
// TRUNCATE leaderboard_scores in the Supabase SQL editor for a full reset.
const LEADERBOARD_SEASON   = 3;
const LEADERBOARD_ID_KEY   = `fishink_leaderboard_id_s${LEADERBOARD_SEASON}`;
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

// Hardened profanity filter
// Handles: leet speak, Unicode confusables, invisible chars, elongation (fuuuck),
// phonetic substitutions (ph→f), separator insertion (f.u.c.k), and more.

const BANNED_WORDS = [
  // Core profanity + phonetic/leet/vowel-drop bypasses
  'fuck','fuk','fvk','fux','fok','fck','fak','fack','phuk','fucc','fvcc',
  'shit','sht','shyt',
  'ass','arse',
  'bitch','btch','bytch',
  'cunt','cvnt','kunt','cont','cnt',
  'dick','dik','dck',
  'cock','cok','cck',
  'pussy','pusi','pssy',
  'piss','pis',
  'bastard',
  'crap',
  'anus','anal',
  'tits','tit',
  'jizz','jiz',
  'twat','twot',
  'wank','wanker',
  'slut','sloot',
  // Racial slurs + common vowel-drop / qq-substitution bypasses
  'nigger','nigga','niga','nigg','ngger','nggr',
  'coon',
  'chink','chinc',
  'gook',
  'kike',
  'spic','spick',
  'wetback',
  'beaner',
  'paki',
  'raghead','towelhead',
  // Homophobic / transphobic slurs
  'faggot','fagot','fag',
  'dyke',
  'tranny',
  // Ableist slurs
  'retard',
  // Misogynistic slurs
  'whore','whor',
  // Hate symbols / figures
  'rape',
  'nazi',
  'hitler',
  'kkk',
];

// Build regexes that allow repeated chars per letter: fuuuck → f+u+c+k+ still matches.
const BANNED_RX = BANNED_WORDS.map(w =>
  new RegExp(w.split('').map(c => `${c}+`).join(''))
);

function normaliseName(s) {
  let n = s.toLowerCase();

  // 1. Strip zero-width / invisible Unicode (bypass attempts using invisible chars)
  //    U+00AD soft-hyphen, U+200B–U+200F zero-width spaces/joins, U+FEFF BOM
  n = n.replace(/[­​‌‍‎‏⁠﻿]/g, '');

  // 2. Unicode confusables → ASCII (Cyrillic, accented Latin, Greek look-alikes)
  n = n.replace(/[à-åаαɑ]/g, 'a'); // à-å, Cyrillic а, Greek α, ɑ
  n = n.replace(/[è-ëе]/g,              'e'); // è-ë, Cyrillic е
  n = n.replace(/[ì-ïіι]/g,        'i'); // ì-ï, Cyrillic і, Greek ι
  n = n.replace(/[ò-öо]/g,              'o'); // ò-ö, Cyrillic о
  n = n.replace(/[ù-ü]/g,                    'u'); // ù-ü
  n = n.replace(/[ýÿ]/g,                     'y'); // ý, ÿ
  n = n.replace(/ñ/g,                             'n'); // ñ
  n = n.replace(/ç/g,                             'c'); // ç
  n = n.replace(/ß/g,                             'ss'); // ß

  // 3. Leet-speak substitutions
  n = n.replace(/[@4]/g,  'a');
  n = n.replace(/3/g,     'e');
  n = n.replace(/[1!|]/g, 'i');
  n = n.replace(/0/g,     'o');
  n = n.replace(/[$5]/g,  's'); // $ must be converted before the non-alpha strip
  n = n.replace(/[7+]/g,  't');
  n = n.replace(/8/g,     'b');
  n = n.replace(/[69]/g,  'g'); // 6 and 9 both used as 'g' (n166er, n1gg9r)
  n = n.replace(/2/g,     'z');

  // 4. Phonetic substitutions
  n = n.replace(/ph/g, 'f');   // phuck → fuck
  n = n.replace(/qq/g, 'gg');  // niqqa → nigga, niqqer → nigger
  n = n.replace(/ck/g, 'k');   // fvck → fvk
  n = n.replace(/qu/g, 'k');

  // 5. Strip everything non-alpha — removes separators like f.u.c.k, f-u-c-k,
  //    dollar signs, and any remaining symbols
  n = n.replace(/[^a-z]/g, '');

  return n;
}

function nameIsClean(name) {
  const n = normaliseName(name);
  return !BANNED_RX.some(rx => rx.test(n));
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

// Only allow standard printable ASCII so Unicode "fancy font" characters
// (𝓁𝒾𝓀𝑒 𝓽𝒽𝒾𝓈) can't slip past the profanity filter via lookalike codepoints.
const NAME_ALLOWED_RX = /^[\x20-\x7E]+$/;

// Internal — called by the UI name-prompt form. No auth required.
function _setLeaderboardNameInternal(name) {
  const trimmed = (name || '').trim().slice(0, 20);
  if (!trimmed) return false;
  if (!NAME_ALLOWED_RX.test(trimmed)) return 'fancy';
  if (!nameIsClean(trimmed)) return 'inappropriate';
  localStorage.setItem(LEADERBOARD_NAME_KEY, trimmed);
  return true;
}

// Console-facing — requires dev.auth() first so players can't rename themselves
// from DevTools without the admin password.
function setLeaderboardName(name) {
  if (typeof _devAuth !== 'function' || !_devAuth()) return false;
  return _setLeaderboardNameInternal(name);
}

function leaderboardHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_ANON,
    Authorization: 'Bearer ' + SUPABASE_ANON,
    'Content-Type': 'application/json',
  }, extra || {});
}

let _lastSubmittedEarned = 0;

// Called every sim frame — submits whenever lifetime earnings jump by $10k.
function checkLeaderboardEarnThreshold() {
  if (game.lifetimeEarned - _lastSubmittedEarned >= 10000) submitLeaderboardScore();
}

// Upserts this player's row. Silent no-op while unconfigured or before a
// name is chosen — there is nothing to submit yet in either case. Network
// failures are swallowed: a flaky leaderboard call must never interrupt
// gameplay or surface an error to the player.
function submitLeaderboardScore() {
  if (!isLeaderboardConfigured()) return Promise.resolve();
  const name = getLeaderboardName();
  if (!name) return Promise.resolve();

  // Sanity check: reject earnings that are impossible at any legitimate pace.
  // Generous ceiling is ~$500k/min; beyond that the score was console-edited.
  const playtimeMins = game.time / 60;
  if (playtimeMins > 1 && game.lifetimeEarned / playtimeMins > 500000) return Promise.resolve();

  _lastSubmittedEarned = game.lifetimeEarned;

  const payload = {
    client_id: getLeaderboardClientId(),
    name,
    lifetime_earned: game.lifetimeEarned,
    playtime: Math.round(game.time / 60 * 10) / 10,
    updated_at: new Date().toISOString(),
  };

  return fetch(`${SUPABASE_URL}/rest/v1/leaderboard_scores?on_conflict=client_id`, {
    method: 'POST',
    headers: leaderboardHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(payload),
    keepalive: true,
  }).then(r => {
    if (!r.ok) console.warn('[Leaderboard] Submit failed:', r.status, r.statusText);
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
    if (!topRes.ok) return { configured: true, error: true, status: topRes.status };
    const top = await topRes.json();

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
