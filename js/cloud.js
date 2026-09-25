// Fish INK Factory - cloud save + dev commands
//
// Depends on leaderboard.js (loaded first) for:
//   SUPABASE_URL, SUPABASE_ANON, LEADERBOARD_ID_KEY, LEADERBOARD_NAME_KEY
// Depends on the supabase-js UMD bundle (loaded between leaderboard.js and
// this file) for Google OAuth only - everything else still uses the existing
// raw fetch()/PostgREST calls below, unchanged.

const CLOUD_TABLE        = 'players';
const CLOUD_RECOVERY_KEY = 'fishink_recovery_code';

// Set right before redirecting to Google when an EXISTING recovery-code
// player chooses to link their account (as opposed to a fresh sign-up/sign-in).
// Survives the full-page OAuth redirect via localStorage; consumed once on
// the next boot by main.js to decide which Google-session branch to take.
const GOOGLE_LINK_PENDING_KEY = 'fishink_google_link_pending';

// ── Supabase Auth client (Google sign-in only) ──────────────────────────────────

const _sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

// ── Sync-status state machine ──────────────────────────────────────────────────

const CLOUD_STATUS = { IDLE: 'idle', SYNCING: 'syncing', SYNCED: 'synced', ERROR: 'error' };
let _cloudStatus  = CLOUD_STATUS.IDLE;
let _cloudLastSync = null; // Date.now() ms

function setCloudStatus(s) {
  _cloudStatus = s;
  if (s === CLOUD_STATUS.SYNCED) _cloudLastSync = Date.now();
  if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
}

function getCloudStatus() { return { status: _cloudStatus, lastSync: _cloudLastSync }; }

// ── Identity ───────────────────────────────────────────────────────────────────

// Reuse the UUID leaderboard.js already created, or make one now.
function cloudId() {
  let id = localStorage.getItem(LEADERBOARD_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LEADERBOARD_ID_KEY, id);
  }
  return id;
}

function cloudUsername() {
  return localStorage.getItem(LEADERBOARD_NAME_KEY) || '';
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

function _cloudFetch(path, opts) {
  const extra = (opts || {}).headers || {};
  const { headers: _drop, ...rest } = opts || {};
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey:        SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
      Prefer:        'return=minimal',
      ...extra,
    },
  });
}

// ── Recovery code ──────────────────────────────────────────────────────────────

function generateRecoveryCode() {
  const chars = 'ABCDEFHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => chars[b % chars.length]).join('');
}

// ── Username availability ──────────────────────────────────────────────────────

// Returns true = available, false = taken, null = network error
async function cloudUsernameAvailable(username) {
  try {
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}&select=client_id`
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length === 0;
  } catch { return null; }
}

// ── Google sign-in ─────────────────────────────────────────────────────────────
//
// Additive alongside the username + recovery-code flow above - this never
// replaces it. A Google-authenticated player still gets a `players` row keyed
// by client_id like everyone else, just with `auth_user_id` set so RLS can
// scope it to `auth.uid()` instead of relying on the open anon-key policies
// the recovery-code path uses.

// Kicks off the OAuth redirect. Resolves once Google sends the browser away -
// the actual sign-in result is picked up after the redirect back, in
// cloudGetGoogleSession().
function cloudSignInWithGoogle() {
  if (!_sb) return Promise.resolve({ error: 'unavailable' });
  const redirectTo = location.origin + location.pathname;

  // Google's own sign-in page sends X-Frame-Options: DENY, so it refuses to
  // render inside an iframe. If this game is embedded (e.g. on a Google
  // Sites page), redirecting in place would just show players a blank or
  // blocked frame - the OAuth step has to happen on the top-level window
  // instead. Note this means, once embedded, finishing sign-in lands the
  // player on the bare game URL rather than back inside the embedding page -
  // an unavoidable side effect of Google refusing to be framed at all.
  if (window.top !== window.self) {
    return _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    }).then(({ data, error }) => {
      if (error || !data?.url) return { error: error || 'no-url' };
      window.top.location.href = data.url;
      return { ok: true };
    });
  }

  return _sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}

// Cached in-memory so synchronous call sites (e.g. the beforeunload-triggered
// _doCloudPush below) can attach the right auth header without awaiting a
// fresh lookup - refreshed every time cloudGetGoogleSession() is called.
let _googleSession = null;

// Returns the current Supabase Auth session (or null) without redirecting.
async function cloudGetGoogleSession() {
  if (!_sb) return null;
  try {
    const { data } = await _sb.auth.getSession();
    _googleSession = data?.session || null;
    return _googleSession;
  } catch { return null; }
}

// Looks up an existing players row already linked to this Google identity.
// `session` must be passed and its access_token sent as the Authorization
// bearer - the "google players can select own row" RLS policy only permits
// authenticated requests matching auth.uid(), so a plain anon-key query (the
// _cloudFetch default) sees nothing for a Google-linked row, even one that
// genuinely belongs to the caller.
async function cloudFindPlayerByAuthId(userId, session) {
  try {
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?auth_user_id=eq.${encodeURIComponent(userId)}&select=client_id,username,save_data`,
      { headers: { Authorization: 'Bearer ' + session.access_token } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch { return null; }
}

// Creates a players row for a first-time Google sign-in. Google-created
// accounts don't use the recovery-code system at all - Google *is* the
// credential - so the code is generated only to satisfy the column (in case
// it's non-nullable) and is deliberately never cached to localStorage or
// shown to the player; the recovery-code sign-in path stays exclusive to
// pre-existing accounts made before this feature.
//
// `session` is the Supabase Auth session from cloudGetGoogleSession() - we
// send its access_token as the request's Authorization bearer (instead of
// the plain anon key) so the insert runs as an authenticated user and can be
// matched by the auth.uid()-scoped RLS policy on `players`.
async function cloudCreatePlayerWithGoogle(username, session) {
  try {
    const saveData = typeof serializeGame === 'function' ? serializeGame() : {};
    const res = await _cloudFetch(CLOUD_TABLE, {
      method:  'POST',
      headers: {
        Prefer:        'resolution=ignore-duplicates,return=minimal',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        client_id: cloudId(), username,
        save_data: saveData, recovery_code: generateRecoveryCode(),
        auth_user_id: session.user.id,
      }),
    });
    if (res.ok) return { ok: true };
    let detail = '';
    try { detail = (await res.json())?.message || ''; } catch { /* non-JSON error body */ }
    console.warn('cloudCreatePlayerWithGoogle failed', res.status, detail);
    // `Prefer: resolution=ignore-duplicates` already silently absorbs a
    // client_id conflict (the intended idempotent-retry case) by targeting
    // the primary key - so any 409 that actually reaches here can only be
    // the auth_user_id unique constraint, meaning this Google identity
    // already has an EXISTING row under a different client_id. That's not a
    // fresh signup at all; the caller must adopt the existing row instead of
    // treating this as success (there's no new row to point at).
    if (res.status === 409) return { ok: false, alreadyLinked: true, error: detail };
    return { ok: false, error: detail || `HTTP ${res.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Links an ALREADY-active Google session to the current device's EXISTING
// recovery-code account, rather than creating a separate new one. Proof of
// ownership is the recovery code already cached locally from when this
// device originally signed into that account - no re-typing needed, since a
// device that has it cached already demonstrated it once. The actual check
// happens server-side in the link_google_account() Postgres function
// (leaderboard/link_google_account_rpc.sql), which atomically verifies
// client_id + recovery_code match before setting auth_user_id - this can't
// be done as a plain RLS policy (see that file's comments for why).
async function cloudLinkGoogleAccount(session) {
  const code = localStorage.getItem(CLOUD_RECOVERY_KEY);
  if (!code) return { error: 'no-recovery-code' };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/link_google_account`, {
      method: 'POST',
      headers: {
        apikey:        SUPABASE_ANON,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_client_id: cloudId(), p_recovery_code: code }),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.message || ''; } catch { /* non-JSON error body */ }
      console.warn('cloudLinkGoogleAccount failed', res.status, detail);
      return { error: detail || `HTTP ${res.status}` };
    }
    const linked = await res.json();
    return linked ? { ok: true } : { error: 'mismatch' };
  } catch (e) { return { error: e.message }; }
}

// ── Cross-device login ─────────────────────────────────────────────────────────

// Looks up a player by username + recovery_code. On success, overwrites the
// local identity keys so this device is now tied to that account.
async function cloudLogin(username, code) {
  try {
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}&recovery_code=eq.${encodeURIComponent(code.trim())}&select=client_id,save_data,auth_user_id`
    );
    if (!res.ok) return { error: 'network' };
    const rows = await res.json();
    if (!rows.length) return { error: 'invalid' };
    localStorage.setItem(LEADERBOARD_ID_KEY,   rows[0].client_id);
    localStorage.setItem(LEADERBOARD_NAME_KEY,  username);
    localStorage.setItem(CLOUD_RECOVERY_KEY,    code.trim());
    return { ok: true, saveData: rows[0].save_data, authUserId: rows[0].auth_user_id };
  } catch { return { error: 'network' }; }
}

// ── Sign out ───────────────────────────────────────────────────────────────────

async function cloudSignOut() {
  if (typeof restarting !== 'undefined') restarting = true; // prevent beforeunload from re-saving locally
  // The `restarting` guard above stops beforeunload's saveGameNow() from
  // resurrecting the local save we're about to delete - but beforeunload
  // ALSO does the final cloudPushSaveImmediate() flush, so that guard was
  // silently skipping it too. Without an explicit push here, any progress
  // made since the last debounced cloud save (up to a few seconds' worth)
  // was discarded on sign-out instead of reaching the server - confirmed
  // live: cash looked reverted after a sign-out/sign-in cycle while the map
  // (which changes far less often) looked consistent.
  //
  // Awaited, not fire-and-forget with keepalive: this isn't a real page
  // unload (we control the reload ourselves below), and keepalive fetches
  // are capped around 64KB - this payload's full terrain/block grids
  // routinely exceed that, so a keepalive push here would silently drop.
  if (typeof cloudPushSaveImmediate === 'function') await cloudPushSaveImmediate();
  // Must be awaited BEFORE reload - Supabase persists its session under its
  // own localStorage key (separate from the four we clear below). If reload()
  // fired before this finished, that session could survive sign-out and get
  // picked up fresh on the next boot as if the player never signed out.
  if (_sb) { try { await _sb.auth.signOut(); } catch { /* best-effort */ } }
  localStorage.removeItem(SAVE_KEY);       // don't let this account's save bleed into next session
  localStorage.removeItem(LEADERBOARD_ID_KEY);
  localStorage.removeItem(LEADERBOARD_NAME_KEY);
  localStorage.removeItem(CLOUD_RECOVERY_KEY);
  localStorage.removeItem('fishink_guest');
  location.reload();
}

// ── Save sync ──────────────────────────────────────────────────────────────────

// Loads this device's cloud save. Returns { username, save_data, updated_at, auth_user_id } or null.
async function cloudLoadSave() {
  try {
    // Same reasoning as cloudFindPlayerByAuthId: a Google-linked row is only
    // visible to a request authenticated as that same auth.uid(), not to the
    // plain anon key recovery-code accounts otherwise use here.
    const authHeader = _googleSession ? { Authorization: 'Bearer ' + _googleSession.access_token } : {};
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?client_id=eq.${cloudId()}&select=username,save_data,updated_at,auth_user_id`,
      { headers: authHeader }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch { return null; }
}

// Upserts the current in-memory game state to the cloud.
let _pushTimer = null;

// Returns the underlying fetch promise so callers who can afford to wait
// (i.e. aren't inside a synchronous beforeunload handler) can await the
// actual response instead of firing-and-forgetting.
function _doCloudPush(keepalive) {
  if (!isLeaderboardConfigured()) return Promise.resolve();
  if (!cloudUsername()) return Promise.resolve();
  setCloudStatus(CLOUD_STATUS.SYNCING);
  const saveData = typeof serializeGame === 'function' ? serializeGame() : {};
  // Google-linked accounts sync as the authenticated user (see cloudCreatePlayerWithGoogle
  // for why) so the update matches the auth.uid()-scoped RLS policy; recovery-code
  // accounts fall through to _cloudFetch's default anon-key auth, unchanged.
  const authHeader = _googleSession ? { Authorization: 'Bearer ' + _googleSession.access_token } : {};
  return _cloudFetch(`${CLOUD_TABLE}?client_id=eq.${encodeURIComponent(cloudId())}`, {
    method:    'PATCH',
    headers:   authHeader,
    body:      JSON.stringify({ save_data: saveData }),
    keepalive: keepalive || false,
  }).then(r => setCloudStatus(r.ok ? CLOUD_STATUS.SYNCED : CLOUD_STATUS.ERROR))
    .catch(() => setCloudStatus(CLOUD_STATUS.ERROR));
}

// Debounced version for in-game saves - batches rapid save calls.
function cloudPushSave() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => _doCloudPush(false), 3000);
}

// Immediate version for manual sync, sign-out, restart, etc. Defaults to NOT
// keepalive: browsers cap keepalive request bodies around 64KB, and this
// save payload (full terrain/block grids) routinely exceeds that - verified
// live, a keepalive PATCH with this payload throws "Failed to fetch"
// immediately, before the request even leaves the browser. The ONLY caller
// that should pass `keepalive: true` is the actual beforeunload handler,
// where the page is genuinely disappearing and a normal fetch would be
// aborted outright - everywhere else (sign-out, restart, the Save/Sync
// buttons) controls its own timing and should just let this resolve
// normally, awaiting it where that's possible (see cloudSignOut()).
function cloudPushSaveImmediate(keepalive = false) {
  clearTimeout(_pushTimer);
  return _doCloudPush(keepalive);
}
