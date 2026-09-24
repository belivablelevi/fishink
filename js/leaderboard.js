// Fish INK Factory - global leaderboard (Supabase, no login)
//
// Identity is a random UUID stored in localStorage, separate from the
// display name, so renaming never splits a player into a second row.
// All requests are plain fetch() calls to Supabase's PostgREST endpoint -
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
// phonetic substitutions (ph->f), separator insertion (f.u.c.k), camelCase and
// compound names (BigAss, giantb4lls), and more.
//
// Three tiers, so real profanity is caught wherever it hides without blocking
// innocent names that merely contain a short fragment (Scunthorpe problem):
//   STRONG - unambiguous; matched anywhere inside the name.
//   WEAK   - short/ambiguous; matched only when it is the whole name, starts
//            or ends it, or is a separate word (so "Class"/"Grassy" are fine,
//            "BigAss"/"assmaster"/"giantballs"/"Norboobs" are not).
//   TOKEN  - shorthand/vowel-drop forms; matched only as a whole word, since
//            inside longer words they are usually innocent ("fishtank" has
//            "sht", "fake" has "fak").
// BENIGN_WORDS are innocent words that contain a banned fragment; they are
// removed before matching.

const STRONG_WORDS = [
  // Core profanity + phonetic/leet/vowel-drop bypasses
  'fuck','fuk','fvk','fux','fck','phuk','fucc','fvcc','fuxk',
  'shit','shyt','shiit',
  'bitch','btch','bytch',
  'cunt','cvnt','kunt',
  'pussy','pusi','pssy',
  'bastard','wanker','jizz','twat','sloot','slut',
  'whore',
  // Racial slurs + common vowel-drop / misspelling bypasses
  'nigger','nigga','niga','nigg','ngger','nggr','neega','neeger','neegar','nigah','nigguh','niglet','nigglet','reggin',
  'beaner','wetback','raghead','towelhead',
  // Homophobic / transphobic / ableist slurs
  'faggot','fagot','tranny','retard',
  // Sexual terms
  'porn','penis','vagina','dildo','blowjob','handjob','cumshot','boner','anus',
  // Hate symbols / figures
  'nazi','hitler','kkk',
];

const WEAK_WORDS = [
  'ass','arse','tits','dick','cock','coon','spic','spick','gook','kike','paki',
  'chink','chinc','dyke','fag','crap','piss','balls','boob','boobs','cum','anal',
  'sex','gay','gooner','rape','rapist','raping','wank','jiz','whor','hoe',
];

const TOKEN_WORDS = [
  'stfu','gtfo',
  'tit','fak','fok','cok','cck','dik','dck','sht','pis','cnt','pusi',
];

const BENIGN_WORDS = [
  // ass
  'assassin','assist','assess','assume','assign','associate','assemble','assault','assemblage',
  'asset','class','classic','glass','grass','brass','mass','massive','pass','passage',
  'passenger','passion','bass','bassist','lass','sass','crass','cassandra','cassette','cassie','massage',
  'compass','embassy','ambassador','harass','morass','crevasse','cutlass','bypass','trespass',
  // tit / tits
  'title','titan','titanic','tithe','entity','petite','competition','competitor','appetite',
  'constitution','institute','substitute','attitude','altitude','latitude','gratitude','multitude',
  // anal / anus
  'analyst','analysis','analog','analogue','canal','banal','manus','janus','uranus',
  // coon
  'tycoon','raccoon','cocoon','coonhound',
  // cock / dick
  'peacock','hancock','cocktail','cockpit','cockatoo','cockatiel','woodcock','shuttlecock','babcock',
  'dickens','dickinson','dickson','dickerson','dickie','dickey',
  // spic / spick
  'spice','spicy','spider','spinach','spike','spirit','spick and span',
  // rape
  'grape','drape','scrape','grapefruit','drapery','trapeze',
  // piss / pis / crap
  'pistol','pistachio','epistle','piston','pisces','scrap','scrapyard','scrappy',
  // cum
  'cumulus','document','cucumber','circumstance','cumin','succumb','accumulate','cumberland',
  // sex
  'sussex','essex','wessex','sextant','sextet','sexton',
  // balls
  'fireball','eyeball','meatball','snowball','cannonball','hairball','moonball','pinball','oddball',
  'snowshoe','gumshoe','screwball','baseball','football','basketball','handball','softball','volleyball','paintball',
  'fishball','spitball','lightningball','energyball','skyball','goldball',
  // cunt
  'scunthorpe',
  // gay
  'gayle','gaylord','gaynor','gaye','norgay','gayatri',
  // wank / hoe / fag / whor
  'wankel','shoe','horseshoe','hoedown','shoehorn','fagin','whorl','whorls',
  // boob / boner
  'booby','boobytrap',
  // chink
  'chinkapin',
  // paki
  'pakistan','pakistani',
  // kike / dyke
  'mikey','dykes',
  // sht / others
  'fishtank','fishtail','fishtown','fishtale','ashtray','shtick',
].sort((x, y) => y.length - x.length);

// Build regexes that allow repeated chars per letter: fuuuck -> f+u+c+k+ still matches.
// The input is folded (ck -> k, ph -> f, qq -> gg, qu -> k) before matching, so
// the word lists must be folded the same way or e.g. "dick" could never match.
const _foldWord = w => w.replace(/ph/g, 'f').replace(/qq/g, 'gg').replace(/ck/g, 'k').replace(/qu/g, 'k');
const _rep = w => _foldWord(w).split('').map(c => `${c}+`).join('');
const STRONG_RX = STRONG_WORDS.map(w => new RegExp(_rep(w)));
// whole name, or at the start, or at the end
const WEAK_RX   = WEAK_WORDS.map(w => new RegExp(`^${_rep(w)}|${_rep(w)}$`));
const TOKEN_RX  = TOKEN_WORDS.map(w => new RegExp(`^${_rep(w)}$`));

// Backwards spellings ("aggin" = nigga, "reggin" = nigger, "kcuf" = fuck). Only
// a short list of core slurs/profanity, and only as the whole name or at its
// start/end - the reversed forms sit inside innocent words ("Bragging",
// "Baggins", "Tagging" all contain "aggin"), so a substring rule would be wrong.
const REVERSED_WORDS = ['nigger','nigga','faggot','fuck','shit','cunt','bitch','whore','slut','retard','pussy'];
const REVERSED_RX = REVERSED_WORDS.map(w => {
  const rev = _foldWord(w.split('').reverse().join(''));
  const r = rev.split('').map(c => `${c}+`).join('');
  return new RegExp(`^${r}|${r}$`);
});

// Steps 1-4 of normalisation (everything except the non-alpha strip), so word
// boundaries survive for tokenising.
function _foldName(s) {
  let n = s.toLowerCase();

  // 1. Strip zero-width / invisible Unicode (bypass attempts using invisible chars)
  //    U+00AD soft-hyphen, U+200B-U+200F zero-width spaces/joins, U+FEFF BOM
  n = n.replace(/[\u00AD\u200B\u200C\u200D\u200E\u200F\u2060\uFEFF]/g, '');

  // 2. Unicode confusables -> ASCII (Cyrillic, accented Latin, Greek look-alikes)
  n = n.replace(/[\u00E0-\u00E5\u0430\u03B1\u0251]/g, 'a'); // a-grave..a-ring, Cyrillic a, Greek alpha
  n = n.replace(/[\u00E8-\u00EB\u0435]/g,              'e'); // e-grave..e-umlaut, Cyrillic e
  n = n.replace(/[\u00EC-\u00EF\u0456\u03B9]/g,        'i'); // i-grave..i-umlaut, Cyrillic i, Greek iota
  n = n.replace(/[\u00F2-\u00F6\u043E]/g,              'o'); // o-grave..o-umlaut, Cyrillic o
  n = n.replace(/[\u00F9-\u00FC]/g,                    'u'); // u-grave..u-umlaut
  n = n.replace(/[\u00FD\u00FF]/g,                     'y');
  n = n.replace(/\u00F1/g,                             'n');
  n = n.replace(/\u00E7/g,                             'c');
  n = n.replace(/\u00DF/g,                             'ss');

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
  n = n.replace(/ph/g, 'f');   // phuck -> fuck
  n = n.replace(/qq/g, 'gg');  // niqqa -> nigga, niqqer -> nigger
  n = n.replace(/ck/g, 'k');   // fvck -> fvk
  n = n.replace(/qu/g, 'k');
  return n;
}

function normaliseName(s) {
  // 5. Strip everything non-alpha - removes separators like f.u.c.k, f-u-c-k,
  //    dollar signs, and any remaining symbols
  // Fold again after stripping: separators inside a word (f.u.c.k) kept the
  // first pass from seeing "ck".
  return _foldWord(_foldName(s).replace(/[^a-z]/g, ''));
}

// Separate words in the name: split on anything non-alphanumeric and on
// camelCase boundaries (BigAss -> big, ass), then fold each word.
function nameTokens(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF@$!|+]+/)
    .map(w => _foldWord(_foldName(w).replace(/[^a-z]/g, '')))
    .filter(Boolean);
}

function _maskBenign(n) {
  for (const w of BENIGN_WORDS) {
    const f = _foldWord(w.replace(/[^a-z]/g, ''));
    if (f && n.includes(f)) n = n.split(f).join('');
  }
  return n;
}

function nameIsClean(name) {
  const raw = String(name);
  // "@" and friends are both leet letters (@ss) and popular separators
  // (@n@i@g@g@e@r), and reading them as letters garbles the second kind, so
  // check the name both ways.
  const noSymbols = raw.replace(/[^A-Za-z0-9À-ɏͰ-ϿЀ-ӿ]/g, '');
  return _cleanNormalised(normaliseName(raw), raw) && _cleanNormalised(normaliseName(noSymbols), noSymbols);
}

function _cleanNormalised(normalised, name) {
  const n = _maskBenign(normalised);
  if (!n) return true;
  if (STRONG_RX.some(rx => rx.test(n))) return false;
  if (WEAK_RX.some(rx => rx.test(n))) return false;
  if (TOKEN_RX.some(rx => rx.test(n))) return false;
  if (REVERSED_RX.some(rx => rx.test(n))) return false;
  // Word-level checks catch short words hiding in the middle of a compound
  // that the start/end rules can't see (e.g. "big_ass_fish", "FishGayLord").
  for (const tok of nameTokens(name)) {
    const t = _maskBenign(tok);
    if (!t) continue;
    if (STRONG_RX.some(rx => rx.test(t))) return false;
    if (WEAK_WORDS.some(w => new RegExp(`^${_rep(w)}$`).test(t))) return false;
    if (TOKEN_RX.some(rx => rx.test(t))) return false;
  }
  return true;
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

// Internal - called by the UI name-prompt form. No auth required.
function _setLeaderboardNameInternal(name) {
  const trimmed = (name || '').trim().slice(0, 20);
  if (!trimmed) return false;
  if (!NAME_ALLOWED_RX.test(trimmed)) return 'fancy';
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

let _lastSubmittedEarned = 0;
let _lastSubmitGameTime  = 0; // game.time (seconds) as of the last successful submission
let _lbBaselined = false;
let _lastThresholdSubmit = 0;

// Anti-cheat ceiling on how fast lifetime earnings may grow between accepted
// submissions. A flat $/min cap is a trap in this exponential economy: a
// top account legitimately out-earns any fixed number, and because a rejected
// submission never moves the baseline, the board then stays frozen for good
// (reported live: a run frozen at $1.36B after ~62 minutes). So the allowance
// is the larger of a generous flat floor (covers the early/mid game) and a
// fraction of the account's own last accepted total per minute (scales with
// the account). A console-edited jump is still many orders of magnitude over.
const LEADERBOARD_RATE_FLOOR     = 50000000; // $/min, always allowed
const LEADERBOARD_GROWTH_PER_MIN = 0.5;      // plus 50% of the last accepted total per minute

// Takes the loaded save as the starting point for the session. Without this the
// baseline is 0/0, so the first check of every session compared the account's
// ENTIRE lifetime earnings against its total playtime (a lifetime average),
// which a high earner fails permanently. Runs on the first sim frame, before
// anything can tamper with the value.
function _baselineLeaderboard() {
  if (_lbBaselined) return;
  _lbBaselined = true;
  _lastSubmittedEarned = game.lifetimeEarned;
  _lastSubmitGameTime  = game.time;
}

// Called every sim frame - submits whenever lifetime earnings jump by $10k, at
// most once every 5 seconds (a late-game account earns $10k many times a second,
// which used to fire a network request per frame).
function checkLeaderboardEarnThreshold() {
  _baselineLeaderboard();
  if (game.lifetimeEarned - _lastSubmittedEarned < 10000) return;
  const now = performance.now();
  if (now - _lastThresholdSubmit < 5000) return;
  _lastThresholdSubmit = now;
  submitLeaderboardScore();
}

// Upserts this player's row. Silent no-op while unconfigured or before a
// name is chosen - there is nothing to submit yet in either case. Network
// failures are swallowed: a flaky leaderboard call must never interrupt
// gameplay or surface an error to the player.
function submitLeaderboardScore() {
  if (!isLeaderboardConfigured()) return Promise.resolve();
  const name = getLeaderboardName();
  if (!name) return Promise.resolve();

  _baselineLeaderboard();

  // Reject a submission whose earnings grew implausibly fast since the LAST
  // accepted one (not since the game began). The denominator is floored rather
  // than the check skipped for short windows, so a huge jump applied in
  // near-zero time is still caught.
  const deltaEarned = game.lifetimeEarned - _lastSubmittedEarned;
  const deltaMins   = Math.max((game.time - _lastSubmitGameTime) / 60, 0.1);
  const allowedPerMin = Math.max(LEADERBOARD_RATE_FLOOR, _lastSubmittedEarned * LEADERBOARD_GROWTH_PER_MIN);
  if (deltaEarned / deltaMins > allowedPerMin) return Promise.resolve();

  _lastSubmittedEarned = game.lifetimeEarned;
  _lastSubmitGameTime  = game.time;

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
// render every outcome - unconfigured, network error, or success - without
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
  module.exports = { isLeaderboardConfigured, getLeaderboardClientId, getLeaderboardName, submitLeaderboardScore, fetchLeaderboard };
  // Also assign to global for the test
  Object.assign(global, { isLeaderboardConfigured, getLeaderboardClientId, getLeaderboardName, submitLeaderboardScore, fetchLeaderboard });
}
