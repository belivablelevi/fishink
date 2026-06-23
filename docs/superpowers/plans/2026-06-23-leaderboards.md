# Global Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players compare progress against everyone else playing FishInk Factory on a global leaderboard ranked by lifetime cash earned, with no login required.

**Architecture:** A new Supabase project (Postgres + PostgREST) holds one table, `leaderboard_scores`, keyed by a random client-side UUID generated once per browser/device. The game talks to it with plain `fetch()` calls to Supabase's REST endpoint (the same raw-fetch-to-PostgREST pattern already used by the sibling Kei Property Services project's `contact.html` — no extra client library needed). A new `js/leaderboard.js` module owns all of that logic; `js/sim.js`'s existing 30-second autosave tick triggers submission; a new "Leaderboard" tab in the existing build-menu tab system displays the top 50 plus the player's own rank.

**Tech Stack:** Vanilla JS (no build step, no new dependencies), Supabase (Postgres + PostgREST + Row Level Security), plain `fetch()`.

## Global Constraints

- No build step — plain `<script>` tags, global functions, fixed load order in `index.html`.
- Ranking metric is `game.lifetimeEarned` (already exists, monotonically increasing) — not current cash, not a timestamp.
- Identity is a random `crypto.randomUUID()` stored in `localStorage` under `fishink_leaderboard_id`, independent of the display name stored under `fishink_leaderboard_name` (1–20 characters).
- Submission happens automatically on the existing `AUTOSAVE_INTERVAL` (30s) tick in `js/sim.js` — never a new timer, never tied to every `saveGame()` call elsewhere (those fire far more often than once every 30s).
- Leaderboard UI is a new tab in the existing build-menu tab system (`index.html`'s `data-tab`/`data-panel` pairs, `js/player.js`'s `MENU_TAB_ORDER`, `js/ui.js`'s per-tab `render*Panel()` functions) — same pattern as Build/Upgrades/Contracts/Research/Blueprints.
- Shows top 50 by `lifetime_earned` descending, plus the player's own row (with their numeric rank) always visible separately, even when outside the top 50.
- While `SUPABASE_URL`/`SUPABASE_ANON` are still placeholder strings, every leaderboard function no-ops and the UI shows a "not set up yet" hint — the game must work exactly as it does today out of the box.
- Network failures on submit/fetch are swallowed silently (`.catch(() => {})`) — a flaky leaderboard call must never interrupt gameplay or surface an error that blocks play.
- No test runner exists in this codebase. Verification is `node -c` per changed file (syntax gate) plus manual in-browser checks, matching every prior plan in this repo (see `docs/superpowers/plans/` history).

---

### Task 1: Supabase schema and setup doc

**Files:**
- Create: `leaderboard/schema.sql`
- Create: `leaderboard/SETUP.md`

**Interfaces:**
- Produces: the `leaderboard_scores` table shape that Task 2's `js/leaderboard.js` REST calls assume: columns `client_id` (uuid, primary key), `name` (text), `lifetime_earned` (numeric), `updated_at` (timestamptz, default now()).

- [ ] **Step 1: Write the schema file**

```sql
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
```

- [ ] **Step 2: Write the setup doc**

```markdown
# Leaderboard Setup

Takes about 5 minutes.

1. Create a free project at https://supabase.com.
2. Open the SQL Editor in your new project and run the contents of `leaderboard/schema.sql`.
3. Go to Settings -> API and copy your **Project URL** and **anon public key**.
4. Open `js/leaderboard.js` and replace the two placeholder values near the top:
   ```javascript
   var SUPABASE_URL  = 'YOUR_SUPABASE_URL';
   var SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
   ```
5. Reload the game. The Leaderboard tab will switch from "not set up yet" to a name-entry prompt.

## Known limitation

There is no login for this leaderboard — identity is just a random ID stored
in your browser. That means the Row Level Security policies in `schema.sql`
can't actually verify a request is updating *its own* row, only that some
row is being read/written. Anyone with the public anon key (which is, by
design, public — it ships in the page source) could write an arbitrary score
to an arbitrary row via the browser console. This is an accepted tradeoff
for a casual feedback-gathering demo, not an oversight. Closing this gap
later would mean adding real Supabase Auth accounts and scoping the
`insert`/`update` policies to `auth.uid()`.
```

- [ ] **Step 3: Verify**

No code to run yet — confirm both files exist and the SQL is syntactically plausible by reading it back:

```bash
cat leaderboard/schema.sql
cat leaderboard/SETUP.md
```

Expected: both files print their full contents with no truncation.

- [ ] **Step 4: Commit**

```bash
git add leaderboard/schema.sql leaderboard/SETUP.md
git commit -m "Add Supabase schema and setup doc for leaderboard"
```

---

### Task 2: `js/leaderboard.js` — identity, config, submit, fetch

**Files:**
- Create: `js/leaderboard.js`

**Interfaces:**
- Consumes: `game.lifetimeEarned` (`js/save.js`/`js/sim.js` global `game` object, already exists).
- Produces (used by Task 4 and Task 5):
  - `isLeaderboardConfigured(): boolean`
  - `getLeaderboardName(): string` (empty string if unset)
  - `setLeaderboardName(name: string): boolean` (returns false and does nothing if the trimmed name is empty)
  - `submitLeaderboardScore(): void` (no-op if unconfigured or no name set; fires a fetch, swallows errors)
  - `fetchLeaderboard(): Promise<{ configured: boolean, error?: boolean, top?: Array<{client_id, name, lifetime_earned}>, me?: {name, lifetime_earned}|null, myRank?: number|null, clientId?: string }>`

- [ ] **Step 1: Create the file**

```javascript
// Fish INK Factory — global leaderboard (Supabase, no login)
//
// Identity is a random UUID stored in localStorage, separate from the
// display name, so renaming never splits a player into a second row.
// All requests are plain fetch() calls to Supabase's PostgREST endpoint —
// same raw-REST approach the sibling Kei Property Services project uses
// in its own contact.html, so no extra client library is needed.

// ── PASTE YOUR SUPABASE CREDENTIALS HERE ──────────────────────────────
var SUPABASE_URL  = 'YOUR_SUPABASE_URL';        // e.g. https://xyzxyz.supabase.co
var SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';   // from Settings -> API
// ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ID_KEY   = 'fishink_leaderboard_id';
const LEADERBOARD_NAME_KEY = 'fishink_leaderboard_name';

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
```

- [ ] **Step 2: Verify syntax**

```bash
node -c js/leaderboard.js
```

Expected: no output (exit code 0).

- [ ] **Step 3: Manual smoke test (no Supabase project needed yet)**

This file isn't loaded by `index.html` until Task 3, so test it standalone with Node:

```bash
node -e "
global.localStorage = (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v) }; })();
global.crypto = require('crypto').webcrypto;
global.game = { lifetimeEarned: 1234 };
require('./js/leaderboard.js');
console.log('configured:', isLeaderboardConfigured());
console.log('name before set:', JSON.stringify(getLeaderboardName()));
console.log('setLeaderboardName empty:', setLeaderboardName('   '));
console.log('setLeaderboardName real:', setLeaderboardName('Alex'));
console.log('name after set:', getLeaderboardName());
console.log('client id:', getLeaderboardClientId());
"
```

Expected output:
```
configured: false
name before set: ""
setLeaderboardName empty: false
setLeaderboardName real: true
name after set: Alex
client id: <some uuid>
```

- [ ] **Step 4: Commit**

```bash
git add js/leaderboard.js
git commit -m "Add leaderboard client module (identity, submit, fetch)"
```

---

### Task 3: Wire the Leaderboard tab into the build menu shell

**Files:**
- Modify: `index.html:64-76` (tab buttons, tab panels, script tag list)
- Modify: `js/player.js:83` (`MENU_TAB_ORDER`)

**Interfaces:**
- Consumes: nothing new — this task only adds markup and a load-order entry.
- Produces: a `data-tab="leaderboard"` button, a `data-panel="leaderboard" id="leaderboardPanel"` div, and `'leaderboard'` in `MENU_TAB_ORDER`, all of which Task 4 wires up with real content.

- [ ] **Step 1: Add the tab button and panel div**

In `index.html`, change:

```html
      <button class="tab" data-tab="blueprints">Blueprints</button>
      <div class="tab-hint">Tab to switch &middot; Esc to close</div>
```

to:

```html
      <button class="tab" data-tab="blueprints">Blueprints</button>
      <button class="tab" data-tab="leaderboard">Leaderboard</button>
      <div class="tab-hint">Tab to switch &middot; Esc to close</div>
```

and change:

```html
      <div class="tab-panel hidden" data-panel="blueprints" id="blueprintsPanel"></div>
    </div>
  </div>
```

to:

```html
      <div class="tab-panel hidden" data-panel="blueprints" id="blueprintsPanel"></div>
      <div class="tab-panel hidden" data-panel="leaderboard" id="leaderboardPanel"></div>
    </div>
  </div>
```

- [ ] **Step 2: Add the script tag**

In `index.html`, change:

```html
  <script src="js/save.js"></script>
  <script src="js/tutorial.js"></script>
```

to:

```html
  <script src="js/save.js"></script>
  <script src="js/leaderboard.js"></script>
  <script src="js/tutorial.js"></script>
```

- [ ] **Step 3: Add to the Tab-key cycle order**

In `js/player.js:83`, change:

```javascript
const MENU_TAB_ORDER = ['build', 'upgrades', 'contracts', 'fishIndex', 'stats', 'controls', 'research', 'blueprints'];
```

to:

```javascript
const MENU_TAB_ORDER = ['build', 'upgrades', 'contracts', 'fishIndex', 'stats', 'controls', 'research', 'blueprints', 'leaderboard'];
```

- [ ] **Step 4: Verify**

```bash
node -c js/player.js
```

Expected: no output. Then open `index.html` directly in a browser and confirm a "Leaderboard" tab button appears in the build menu and is clickable (it will show an empty panel — `renderLeaderboardPanel` doesn't exist until Task 4, so check the browser console for a `renderLeaderboardPanel is not defined` error only if `js/ui.js` already tries to call it; at this point in the plan it doesn't yet, so the panel will just stay blank with no error).

- [ ] **Step 5: Commit**

```bash
git add index.html js/player.js
git commit -m "Add Leaderboard tab shell to build menu"
```

---

### Task 4: Render the Leaderboard panel

**Files:**
- Modify: `js/ui.js:3` (panel element variable list)
- Modify: `js/ui.js:204-233` (`initBuildMenu`)
- Modify: `js/ui.js:235-239` (`switchMenuTab`)
- Modify: `js/ui.js:241-253` (`setBuildMenuOpen`)
- Modify: `js/ui.js` (append new rendering functions after `renderBlueprintsPanel`, i.e. after line 578)
- Modify: `style.css` (append new rules)

**Interfaces:**
- Consumes: `isLeaderboardConfigured()`, `getLeaderboardName()`, `setLeaderboardName(name)`, `submitLeaderboardScore()`, `fetchLeaderboard()` (all from Task 2's `js/leaderboard.js`), `formatMoney(n)` (`js/data.js:73`, already exists).
- Produces: `renderLeaderboardPanel()`, `renderLeaderboardNamePrompt()`, `renderLeaderboardList(result)` — `renderLeaderboardPanel` is the only one called from outside this file (by `initBuildMenu`/`setBuildMenuOpen`/`switchMenuTab`).

- [ ] **Step 1: Add the panel element variable**

In `js/ui.js:3`, change:

```javascript
let buildMenuEl, buildPanelEl, upgradesPanelEl, contractsPanelEl, fishIndexPanelEl, statsPanelEl, controlsPanelEl, researchPanelEl, blueprintsPanelEl, menuCashEl;
```

to:

```javascript
let buildMenuEl, buildPanelEl, upgradesPanelEl, contractsPanelEl, fishIndexPanelEl, statsPanelEl, controlsPanelEl, researchPanelEl, blueprintsPanelEl, leaderboardPanelEl, menuCashEl;
```

- [ ] **Step 2: Look up the element and render on init**

In `js/ui.js`'s `initBuildMenu()`, change:

```javascript
  researchPanelEl  = document.getElementById('researchPanel');
  blueprintsPanelEl = document.getElementById('blueprintsPanel');
  menuCashEl       = document.getElementById('menuCash');
```

to:

```javascript
  researchPanelEl  = document.getElementById('researchPanel');
  blueprintsPanelEl = document.getElementById('blueprintsPanel');
  leaderboardPanelEl = document.getElementById('leaderboardPanel');
  menuCashEl       = document.getElementById('menuCash');
```

and change:

```javascript
  renderResearchPanel();
  renderBlueprintsPanel();
}

function switchMenuTab(name) {
```

to:

```javascript
  renderResearchPanel();
  renderBlueprintsPanel();
  renderLeaderboardPanel();
}

function switchMenuTab(name) {
```

- [ ] **Step 3: Refresh on tab switch and on menu open**

The Leaderboard list should reflect current standings every time the player switches into the tab, not just once when the whole menu first opens — change `switchMenuTab`:

```javascript
function switchMenuTab(name) {
  buildMenuEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  buildMenuEl.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
  if (name === 'stats') renderStatsPanel();
  if (name === 'leaderboard') renderLeaderboardPanel();
}
```

and change `setBuildMenuOpen`:

```javascript
function setBuildMenuOpen(open) {
  buildMenuEl.classList.toggle('hidden', !open);
  if (open) {
    refreshBuildPanel();
    renderUpgradesPanel();
    renderContractsPanel();
    renderFishIndexPanel();
    renderStatsPanel();
    renderResearchPanel();
    renderBlueprintsPanel();
    renderLeaderboardPanel();
    menuCashEl.textContent = `$${formatMoney(game.cash)}`;
  }
}
```

- [ ] **Step 4: Add the rendering functions**

Append after `renderBlueprintsPanel()`'s closing brace (after `js/ui.js` line 578, right before the `// ─── Contracts tab ─────` comment):

```javascript
// ─── Leaderboard tab ───────────────────────────────────────────────────────
function renderLeaderboardPanel() {
  leaderboardPanelEl.innerHTML = '';

  if (!isLeaderboardConfigured()) {
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'Leaderboard not set up yet — see leaderboard/SETUP.md';
    leaderboardPanelEl.appendChild(hint);
    return;
  }

  if (!getLeaderboardName()) {
    renderLeaderboardNamePrompt();
    return;
  }

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.innerHTML = `Playing as <strong>${getLeaderboardName()}</strong> — <a href="#" id="lbChangeName">change name</a>`;
  leaderboardPanelEl.appendChild(hint);
  hint.querySelector('#lbChangeName').addEventListener('click', (e) => {
    e.preventDefault();
    renderLeaderboardNamePrompt();
  });

  const loading = document.createElement('div');
  loading.className = 'panel-hint';
  loading.textContent = 'Loading leaderboard…';
  leaderboardPanelEl.appendChild(loading);

  fetchLeaderboard().then(result => {
    if (loading.parentNode === leaderboardPanelEl) leaderboardPanelEl.removeChild(loading);
    if (result.error) {
      const err = document.createElement('div');
      err.className = 'panel-hint';
      err.textContent = 'Could not reach the leaderboard — check your connection.';
      leaderboardPanelEl.appendChild(err);
      return;
    }
    renderLeaderboardList(result);
  });
}

function renderLeaderboardNamePrompt() {
  leaderboardPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Pick a name to join the leaderboard';
  leaderboardPanelEl.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'upgrade-row';

  const input = document.createElement('input');
  input.className = 'bp-name-input';
  input.type = 'text';
  input.maxLength = 20;
  input.placeholder = 'Your name';
  input.value = getLeaderboardName();

  const joinBtn = document.createElement('button');
  joinBtn.className = 'upgrade-buy';
  joinBtn.textContent = 'Join leaderboard';
  joinBtn.addEventListener('click', () => {
    if (setLeaderboardName(input.value)) {
      submitLeaderboardScore();
      renderLeaderboardPanel();
    }
  });

  row.appendChild(input);
  row.appendChild(joinBtn);
  leaderboardPanelEl.appendChild(row);
}

function renderLeaderboardList(result) {
  const { top, me, myRank, clientId } = result;

  const list = document.createElement('div');
  list.className = 'lb-list';

  top.forEach((row, i) => {
    const rankRow = document.createElement('div');
    rankRow.className = 'upgrade-row lb-row';
    if (row.client_id === clientId) rankRow.classList.add('lb-self');
    rankRow.innerHTML = `
      <div class="upgrade-info">
        <div class="name">#${i + 1} ${row.name}</div>
      </div>
      <div class="lb-score">$${formatMoney(Number(row.lifetime_earned))}</div>
    `;
    list.appendChild(rankRow);
  });

  leaderboardPanelEl.appendChild(list);

  if (me) {
    const footer = document.createElement('div');
    footer.className = 'upgrade-row lb-row lb-own-row';
    footer.innerHTML = `
      <div class="upgrade-info">
        <div class="name">#${myRank != null ? myRank : '?'} ${me.name} <span class="level-badge">YOU</span></div>
      </div>
      <div class="lb-score">$${formatMoney(Number(me.lifetime_earned))}</div>
    `;
    leaderboardPanelEl.appendChild(footer);
  }
}
```

- [ ] **Step 5: Add styling**

Append to `style.css` (after the `.bp-delete-btn:hover` rule, around line 485):

```css
.lb-row .lb-score {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--c-mint);
  white-space: nowrap;
}
.lb-self { outline: 1px solid var(--c-accent); }
.lb-own-row {
  margin-top: 14px;
  background: rgba(232,160,48,0.12);
  outline: 1px solid var(--c-accent);
}
```

- [ ] **Step 6: Verify**

```bash
node -c js/ui.js
```

Expected: no output.

Then in a browser, open `index.html`, open the build menu, click the Leaderboard tab. With the placeholder Supabase values still in place, expect to see the "Leaderboard not set up yet — see leaderboard/SETUP.md" hint (not a blank panel, not a console error). Switch to another tab and back to Leaderboard to confirm it re-renders without errors.

- [ ] **Step 7: Commit**

```bash
git add js/ui.js style.css
git commit -m "Render Leaderboard panel: name prompt, top 50, own rank"
```

---

### Task 5: Submit the score on the existing autosave tick

**Files:**
- Modify: `js/sim.js:96-97`

**Interfaces:**
- Consumes: `submitLeaderboardScore()` (Task 2).
- Produces: nothing new — this is the wiring that makes Task 2's submission function actually fire during gameplay.

- [ ] **Step 1: Hook into the autosave branch**

In `js/sim.js`, change:

```javascript
  saveAccum += dt;
  if (saveAccum >= AUTOSAVE_INTERVAL) { saveAccum = 0; saveGame(); }
```

to:

```javascript
  saveAccum += dt;
  if (saveAccum >= AUTOSAVE_INTERVAL) {
    saveAccum = 0;
    saveGame();
    submitLeaderboardScore();
  }
```

- [ ] **Step 2: Verify syntax**

```bash
node -c js/sim.js
```

Expected: no output.

- [ ] **Step 3: Manual end-to-end test (requires a real Supabase project — follow `leaderboard/SETUP.md` first)**

1. Fill in `SUPABASE_URL`/`SUPABASE_ANON` in `js/leaderboard.js` per the setup doc.
2. Open the game fresh (clear `localStorage` for the page first, e.g. via devtools).
3. Open the build menu, go to the Leaderboard tab, confirm the name prompt appears (not the "not set up" hint, not the list).
4. Enter a name and click "Join leaderboard". In the Supabase dashboard's Table Editor, confirm a new row appeared in `leaderboard_scores` with that `client_id`/`name`/`lifetime_earned`.
5. In the browser devtools console, run `game.lifetimeEarned += 5000;` then wait just over 30 seconds (or temporarily set `AUTOSAVE_INTERVAL` to `2` in `js/sim.js` for a faster test, then revert it). Confirm the Supabase row's `lifetime_earned` updates to match, without any toast or visible interruption.
6. Reopen the Leaderboard tab and confirm the player's own row appears in the list (or in the separate "your rank" row if outside the top 50) with the updated amount.
7. Open a second browser (or an incognito window) pointed at the same `index.html`, join with a different name, and confirm both players now appear correctly ranked in either browser's leaderboard, with each browser's own "your rank" row matching only its own `client_id`.
8. With devtools' Network tab set to "Offline", trigger another autosave tick and confirm the game keeps running normally — no error toast, no freeze.

- [ ] **Step 4: Commit**

```bash
git add js/sim.js
git commit -m "Submit leaderboard score on the existing autosave tick"
```

## Self-Review

**Spec coverage:**
- Global online leaderboard, lifetime-earned metric — Tasks 1, 2, 5. ✅
- No-login client-UUID identity, name independent of identity — Task 2. ✅
- Supabase backend, schema + RLS + documented no-auth tradeoff — Task 1. ✅
- Automatic submission piggybacking on the 30s autosave tick (not every `saveGame()`) — Task 5. ✅
- Build-menu tab UI — Tasks 3, 4. ✅
- Top 50 + pinned own rank — Task 4 (`renderLeaderboardList`). ✅
- Unconfigured guard (placeholder vars → no-op + "not set up" hint) — Task 2 (`isLeaderboardConfigured`) and Task 4 (`renderLeaderboardPanel`'s first branch). ✅
- Raw `fetch()` to PostgREST instead of the Supabase JS CDN client — a deliberate implementation refinement made during planning (matches the sibling Kei project's actual pattern, found by reading `contact.html`, and avoids an unnecessary new script dependency); behavior is identical to what the spec described. Noted here since the spec's wording mentioned a CDN client.

**Placeholder scan:** no TBD/TODO; every step has runnable code or an exact command with expected output.

**Type consistency:** `getLeaderboardClientId()`, `getLeaderboardName()`, `setLeaderboardName()`, `submitLeaderboardScore()`, `fetchLeaderboard()`, `isLeaderboardConfigured()` are defined once in Task 2 and used with identical names/signatures in Tasks 4 and 5. `fetchLeaderboard()`'s resolved shape (`{ configured, error?, top?, me?, myRank?, clientId? }`) matches exactly what `renderLeaderboardPanel`/`renderLeaderboardList` destructure in Task 4.
