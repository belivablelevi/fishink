// Fish INK Factory — cloud save + dev commands
//
// Depends on leaderboard.js (loaded first) for:
//   SUPABASE_URL, SUPABASE_ANON, LEADERBOARD_ID_KEY, LEADERBOARD_NAME_KEY

const CLOUD_TABLE = 'players';

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
// Returns true on success, false on failure (name taken, network, etc.)
async function cloudCreatePlayer(username) {
  try {
    const saveData = typeof serializeGame === 'function' ? serializeGame() : {};
    const res = await _cloudFetch(CLOUD_TABLE, {
      method:  'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ client_id: cloudId(), username, save_data: saveData }),
    });
    return res.ok || res.status === 409;
  } catch { return false; }
}

// ── Save sync ──────────────────────────────────────────────────────────────────

// Loads this device's cloud save. Returns { username, save_data } or null.
async function cloudLoadSave() {
  try {
    const res = await _cloudFetch(
      `${CLOUD_TABLE}?client_id=eq.${cloudId()}&select=username,save_data`
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch { return null; }
}

// Pushes the current in-memory game state to the cloud. Silent on failure.
function cloudPushSave() {
  if (!isLeaderboardConfigured() || !cloudUsername()) return;
  const saveData = typeof serializeGame === 'function' ? serializeGame() : {};
  _cloudFetch(`${CLOUD_TABLE}?client_id=eq.${encodeURIComponent(cloudId())}`, {
    method: 'PATCH',
    body: JSON.stringify({ save_data: saveData }),
  }).catch(() => {});
}

// ── Dev console ────────────────────────────────────────────────────────────────
// Usage:
//   dev.auth('your_password')          — unlock dev mode
//   dev.view('username')               — print a player's save to console
//   dev.wipe('username')               — zero out a player's save data
//   dev.rename('oldName', 'newName')   — change a player's username
//   dev.give('username', 5000)         — add cash to a player's save

const _DEV_PASSWORD = 'fishink_dev'; // ← change this before shipping

let _devUnlocked = false;

window.dev = {
  auth(password) {
    _devUnlocked = password === _DEV_PASSWORD;
    console.log(_devUnlocked ? '✅ Dev mode unlocked' : '❌ Wrong password');
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
};

function _devAuth() {
  if (!_devUnlocked) { console.warn('Run dev.auth("password") first'); return false; }
  return true;
}
