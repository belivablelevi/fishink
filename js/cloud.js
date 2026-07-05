// Fish INK Factory — cloud save + dev commands
//
// Depends on leaderboard.js (loaded first) for:
//   SUPABASE_URL, SUPABASE_ANON, LEADERBOARD_ID_KEY, LEADERBOARD_NAME_KEY

const CLOUD_TABLE        = 'players';
const CLOUD_RECOVERY_KEY = 'fishink_recovery_code';

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

// ── Account creation ───────────────────────────────────────────────────────────

// Creates a players row for this device, uploading any existing local save.
// Returns { ok: true, code } on success, { ok: false } on failure.
async function cloudCreatePlayer(username) {
  try {
    const code     = generateRecoveryCode();
    const saveData = typeof serializeGame === 'function' ? serializeGame() : {};
    const res = await _cloudFetch(CLOUD_TABLE, {
      method:  'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        client_id: cloudId(), username,
        save_data: saveData, recovery_code: code,
      }),
    });
    if (res.ok || res.status === 409) {
      localStorage.setItem(CLOUD_RECOVERY_KEY, code);
      return { ok: true, code };
    }
    return { ok: false };
  } catch { return { ok: false }; }
}

// ── Cross-device login ─────────────────────────────────────────────────────────

// Looks up a player by username + recovery_code. On success, overwrites the
// local identity keys so this device is now tied to that account.
async function cloudLogin(username, code) {
  try {
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}&recovery_code=eq.${encodeURIComponent(code.trim())}&select=client_id,save_data`
    );
    if (!res.ok) return { error: 'network' };
    const rows = await res.json();
    if (!rows.length) return { error: 'invalid' };
    localStorage.setItem(LEADERBOARD_ID_KEY,   rows[0].client_id);
    localStorage.setItem(LEADERBOARD_NAME_KEY,  username);
    localStorage.setItem(CLOUD_RECOVERY_KEY,    code.trim());
    return { ok: true, saveData: rows[0].save_data };
  } catch { return { error: 'network' }; }
}

// ── Sign out ───────────────────────────────────────────────────────────────────

function cloudSignOut() {
  localStorage.removeItem(LEADERBOARD_ID_KEY);
  localStorage.removeItem(LEADERBOARD_NAME_KEY);
  localStorage.removeItem(CLOUD_RECOVERY_KEY);
  location.reload();
}

// ── Save sync ──────────────────────────────────────────────────────────────────

// Loads this device's cloud save. Returns { username, save_data, updated_at } or null.
async function cloudLoadSave() {
  try {
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?client_id=eq.${cloudId()}&select=username,save_data,updated_at`
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch { return null; }
}

// Upserts the current in-memory game state to the cloud.
let _pushTimer = null;

function _doCloudPush(keepalive) {
  if (!isLeaderboardConfigured()) return;
  if (!cloudUsername()) return;
  setCloudStatus(CLOUD_STATUS.SYNCING);
  const saveData = typeof serializeGame === 'function' ? serializeGame() : {};
  _cloudFetch(`${CLOUD_TABLE}?client_id=eq.${encodeURIComponent(cloudId())}`, {
    method:    'PATCH',
    body:      JSON.stringify({ save_data: saveData }),
    keepalive: keepalive || false,
  }).then(r => setCloudStatus(r.ok ? CLOUD_STATUS.SYNCED : CLOUD_STATUS.ERROR))
    .catch(() => setCloudStatus(CLOUD_STATUS.ERROR));
}

// Debounced version for in-game saves — batches rapid save calls.
function cloudPushSave() {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => _doCloudPush(false), 3000);
}

// Immediate version for beforeunload and manual sync.
function cloudPushSaveImmediate() {
  clearTimeout(_pushTimer);
  _doCloudPush(true);
}

// ── Dev console ────────────────────────────────────────────────────────────────
// Usage:
//   dev.auth('your_password')              — unlock dev mode
//   dev.view('username')                   — print a player's save to console
//   dev.load('username')                   — load a player's save into your current session
//   dev.wipe('username')                   — zero out a player's save data
//   dev.rename('oldName', 'newName')       — change a player's username
//   dev.give('username', 5000)             — add cash to a player's save
//   dev.migrateLeaderboard()               — seed players table from leaderboard_scores

const _DEV_PASSWORD = 'fishink_dev'; // ← change this before shipping

let _devUnlocked = false;

window.dev = {
  auth(password) {
    _devUnlocked = password === _DEV_PASSWORD;
    console.log(_devUnlocked ? '✅ Dev mode unlocked' : '❌ Wrong password');
  },

  money(n = 10000) {
    if (!_devAuth()) return;
    game.cash += n;
    cashGuard.grant(n);
    queueToast(`+$${n.toLocaleString()} (dev)`, '#e8a030');
    console.log(`💰 Added $${n.toLocaleString()}`);
  },

  async view(username) {
    if (!_devAuth()) return;
    try {
      const res = await _cloudFetch(
        `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}&select=client_id,username,save_data`
      );
      if (!res.ok) { console.error('Request failed', res.status); return; }
      const rows = await res.json();
      if (!rows.length) { console.log(`Player "${username}" not found`); return; }
      const p = rows[0];
      console.group(`👤 ${p.username}  (${p.client_id})`);
      console.log('Cash:',            p.save_data?.game?.cash ?? 'n/a');
      console.log('Lifetime earned:', p.save_data?.game?.lifetimeEarned ?? 'n/a');
      console.log('Fish sold:',       p.save_data?.game?.fishSold ?? 'n/a');
      console.log('Time (s):',        p.save_data?.game?.time ?? 'n/a');
      console.log('Full save data:',  p.save_data);
      console.groupEnd();
    } catch (e) { console.error(e); }
  },

  async load(username) {
    if (!_devAuth()) return;
    try {
      const res = await _cloudFetch(
        `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}&select=save_data`
      );
      if (!res.ok) { console.error('Request failed', res.status); return; }
      const rows = await res.json();
      if (!rows.length) { console.log(`Player "${username}" not found`); return; }
      const data = rows[0].save_data;
      if (!data || !Object.keys(data).length) { console.log(`"${username}" has no save data`); return; }
      for (let v = (data.version || 1); v < SAVE_VERSION; v++) SAVE_MIGRATIONS[v]?.(data);
      deserializeGame(data);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      console.log(`✅ Loaded ${username}'s save into your session`);
    } catch (e) { console.error(e); }
  },

  async wipe(username) {
    if (!_devAuth()) return;
    // eslint-disable-next-line no-alert
    const confirm = window.prompt(`Type "${username}" to confirm wipe:`);
    if (confirm !== username) { console.log('Aborted'); return; }
    try {
      const res = await _cloudFetch(
        `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}`,
        { method: 'PATCH', body: JSON.stringify({ save_data: {} }) }
      );
      console.log(res.ok ? `✅ Wiped ${username}'s save` : `❌ Failed (${res.status})`);
    } catch (e) { console.error(e); }
  },

  async rename(oldName, newName) {
    if (!_devAuth()) return;
    const available = await cloudUsernameAvailable(newName);
    if (available === false) { console.log(`❌ "${newName}" is already taken`); return; }
    if (available === null)  { console.log('❌ Network error'); return; }
    try {
      const res = await _cloudFetch(
        `${CLOUD_TABLE}?username=eq.${encodeURIComponent(oldName)}`,
        { method: 'PATCH', body: JSON.stringify({ username: newName }) }
      );
      console.log(res.ok ? `✅ Renamed "${oldName}" → "${newName}"` : `❌ Failed (${res.status})`);
    } catch (e) { console.error(e); }
  },

  async give(username, cash) {
    if (!_devAuth()) return;
    if (typeof cash !== 'number' || cash <= 0) { console.log('Usage: dev.give("name", amount)'); return; }
    try {
      const loadRes = await _cloudFetch(
        `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}&select=save_data`
      );
      if (!loadRes.ok) { console.error('Load failed'); return; }
      const rows = await loadRes.json();
      if (!rows.length) { console.log(`Player "${username}" not found`); return; }
      const saveData = rows[0].save_data || {};
      if (!saveData.game) saveData.game = {};
      saveData.game.cash            = (saveData.game.cash            || 0) + cash;
      saveData.game.lifetimeEarned  = (saveData.game.lifetimeEarned  || 0) + cash;
      const patchRes = await _cloudFetch(
        `${CLOUD_TABLE}?username=eq.${encodeURIComponent(username)}`,
        { method: 'PATCH', body: JSON.stringify({ save_data: saveData }) }
      );
      console.log(patchRes.ok ? `✅ Gave $${cash} to ${username}` : `❌ Failed (${patchRes.status})`);
    } catch (e) { console.error(e); }
  },

  async migrateLeaderboard() {
    if (!_devAuth()) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_scores?select=client_id,name&limit=1000`, {
        headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
      });
      if (!res.ok) { console.error('Fetch leaderboard failed', res.status); return; }
      const rows = await res.json();
      console.log(`Found ${rows.length} leaderboard entries — seeding players table...`);

      const seen = new Set();
      const unique = rows.filter(r => {
        if (!r.client_id || !r.name || seen.has(r.client_id)) return false;
        seen.add(r.client_id);
        return true;
      });

      let created = 0, skipped = 0;
      for (const row of unique) {
        const r = await _cloudFetch(CLOUD_TABLE, {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ client_id: row.client_id, username: row.name, save_data: {} }),
        });
        if (r.status === 204 || r.ok) created++;
        else skipped++;
      }
      console.log(`✅ Done: ${created} players seeded, ${skipped} skipped (already existed or name conflict)`);
    } catch (e) { console.error(e); }
  },
};

function _devAuth() {
  if (!_devUnlocked) { console.warn('Run dev.auth("password") first'); return false; }
  return true;
}
