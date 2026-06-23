# Global Leaderboard — Design

## Goal

Let players compare progress against everyone else playing FishInk Factory, ranked by lifetime cash earned, with no login required.

## Context

FishInk Factory (`C:\Users\Jacob\Documents\FishInk\factory`) is a no-build-step static HTML5 Canvas game. All state today is single-player and local — `js/save.js` serializes/deserializes one `fishink_save` blob to `localStorage`; there is no backend and no network call anywhere in the codebase (confirmed by grep — the only `fetch(` hit in `js/audio.js` is inside a comment explaining why `fetch()` is deliberately *not* used for local audio files). A global leaderboard is new infrastructure for this project, not an extension of an existing system.

The game already has a tabbed build-menu UI pattern (`index.html`'s `data-tab`/`data-panel` pairs, `js/player.js`'s `MENU_TAB_ORDER` array, `js/ui.js`'s per-tab `render*Panel()` functions) used by Build/Upgrades/Contracts/Fish Index/Stats/Controls/Research/Blueprints — the new Leaderboard tab follows this exact pattern, no new UI mechanism needed.

`game.lifetimeEarned` (`js/save.js:11`) already tracks all-time cash earned and only ever increases — it's the ranking metric.

`AUTOSAVE_INTERVAL = 30` (`js/sim.js:85-97`) already drives a periodic `saveGame()` call every 30 in-game seconds. Leaderboard submission piggybacks on this same tick (not every `saveGame()` call elsewhere in the codebase, which fires far more often — e.g. on every blueprint copy or contract claim — and would be far too chatty for a network request).

## Decisions (from brainstorming)

- **Scope:** global online leaderboard — every player who runs the game competes against everyone else.
- **Metric:** lifetime cash earned (`game.lifetimeEarned`), all-time, monotonically increasing.
- **Identity:** no login. A random client-side UUID is generated once and stored in `localStorage`, independent of the player's chosen display name (the UUID is the row identity in the database; the name is just a label, so renaming never loses your rank or splits it into a new row).
- **Backend:** a new, separate Supabase project (separate from the unrelated Kei Property Services project — different app, own credentials).
- **Submission timing:** automatic, piggybacking on the existing 30-second `AUTOSAVE_INTERVAL` tick in `js/sim.js` — no new timer, no manual "submit" button.
- **UI placement:** new "Leaderboard" tab in the existing build-menu tab system.
- **List size:** top 50 by lifetime earned, plus the player's own row always shown separately below (their rank, even if outside the top 50).

## Known limitation — accepted tradeoff

Because there's no auth, Supabase Row Level Security cannot verify that a client only writes to *their own* row — RLS policies here can only check "is this a row at all," not "is this row yours." Anyone with the public anon key could, via devtools, write an arbitrary score to an arbitrary row (their own or someone else's). For a casual feedback-gathering demo this is an explicitly accepted risk, not an oversight. A future move to real Supabase Auth (per-user accounts) would close this gap by scoping `update`/`insert` policies to `auth.uid()`.

## Database (new Supabase project)

One table, `leaderboard_scores`:

```sql
create table leaderboard_scores (
  client_id uuid primary key,
  name text not null check (char_length(name) between 1 and 20),
  lifetime_earned numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table leaderboard_scores enable row level security;

create policy "anyone can read" on leaderboard_scores
  for select using (true);

create policy "anyone can insert" on leaderboard_scores
  for insert with check (true);

create policy "anyone can update" on leaderboard_scores
  for update using (true);
```

Saved to a new file `leaderboard/schema.sql` (mirrors the existing `dashboard/schema.sql` pattern from the unrelated Kei project — schema lives next to the feature it belongs to, not in the game's `js/` tree).

A second file, `leaderboard/SETUP.md`, documents: create a Supabase project, run `schema.sql` in the SQL editor, copy the project URL + anon key into `js/leaderboard.js`'s two config vars (same `SUPABASE_URL`/`SUPABASE_ANON` pattern already used in the Kei project's `contact.html`/`dashboard.html`, so it's a familiar shape even though this is an unrelated codebase).

## Client (new `js/leaderboard.js`)

Loaded in `index.html` after `js/save.js` (needs nothing from it directly, but conceptually belongs near the save/persistence layer) and before `js/main.js`. Responsibilities:

1. **Client identity.** On first load, if no `fishink_leaderboard_id` key exists in `localStorage`, generate one via `crypto.randomUUID()` and store it. This UUID never changes for that browser/device.
2. **Display name.** Stored in `localStorage` as `fishink_leaderboard_name`. If unset, the first time the player opens the Leaderboard tab, show an inline name-entry field instead of the list (placeholder text: "Pick a name to join the leaderboard"). 1–20 characters, trimmed; re-editable later via a "Change name" link always visible above the list once set.
3. **Submit.** `submitLeaderboardScore()` — does nothing if no name is set yet (no anonymous rows). Otherwise calls Supabase's REST `upsert` on `leaderboard_scores` with `{ client_id, name, lifetime_earned: game.lifetimeEarned }`. Called from `js/sim.js`'s existing `AUTOSAVE_INTERVAL` branch, right next to the existing `saveGame()` call. Network failures are swallowed (`.catch(() => {})`) — a flaky leaderboard submission must never interrupt gameplay or surface an error to the player.
4. **Fetch.** `fetchLeaderboard()` — two Supabase queries: top 50 rows ordered by `lifetime_earned desc`, and (separately) the row matching the local `client_id` plus a count of rows with a higher score (for the player's own rank number). Called when the Leaderboard tab is opened (not on a timer — no need to poll while the tab is closed).
5. Both calls use the Supabase JS client loaded via CDN `<script>` tag in `index.html` (same no-build-step approach the Kei project uses for its own Supabase integration), configured with the two vars `SUPABASE_URL` / `SUPABASE_ANON` at the top of `js/leaderboard.js`, left as placeholder strings until the user creates their Supabase project and fills them in (matching `contact.html`'s existing placeholder-var pattern).
6. **Unconfigured guard.** While `SUPABASE_URL`/`SUPABASE_ANON` are still the placeholder strings, `submitLeaderboardScore()` and `fetchLeaderboard()` both no-op immediately, and `renderLeaderboardPanel()` shows a "Leaderboard not set up yet" hint instead of the name prompt — so the game works exactly as it does today out of the box, and nothing breaks before the user has created their Supabase project.

## UI

- `index.html`: new `<button class="tab" data-tab="leaderboard">Leaderboard</button>` after the Blueprints tab button, and a matching `<div class="tab-panel hidden" data-panel="leaderboard" id="leaderboardPanel"></div>`.
- `js/player.js`: add `'leaderboard'` to `MENU_TAB_ORDER` so Tab-key cycling includes it.
- `js/ui.js`: `leaderboardPanelEl` lookup in `initBuildMenu()`; `renderLeaderboardPanel()` called both there and from `setBuildMenuOpen()` (same refresh-on-open pattern as `renderUpgradesPanel`/`renderResearchPanel`), since the list should reflect current standings each time the tab is opened, not just once.
- `renderLeaderboardPanel()`:
  - If no display name set yet: render the name-entry field + a "Join leaderboard" button.
  - Otherwise: render "Change name" link, then a fetch-in-progress placeholder, then (once `fetchLeaderboard()` resolves) a numbered list of the top 50 (`rank. name — $lifetime_earned`, the current player's row highlighted if it happens to be in the top 50), then a visually separated "Your rank" row below showing the player's own position even when outside the top 50 (e.g. "#4,212 — YourName — $12,340").
  - Reuses existing `.upgrade-row`-family CSS classes from `style.css` for row layout; one new class for the "your rank" highlighted footer row.

## Testing (manual, in-browser — no test harness in this codebase)

1. `node -c` every changed/new `.js` file.
2. Create a Supabase project, run `leaderboard/schema.sql`, fill in the two config vars.
3. Open the game fresh (clear `localStorage`), open the Leaderboard tab, confirm the name-entry prompt appears (not a list).
4. Enter a name, confirm a row appears in Supabase's table editor with the right `client_id`/`name`/`lifetime_earned`.
5. Let the game run past one `AUTOSAVE_INTERVAL` (30s) with `game.lifetimeEarned` changed in between (e.g. via `cheat.money()`), confirm the Supabase row's `lifetime_earned` updates without any extra action.
6. Open a second browser profile (or incognito) with a different name, confirm both rows show up ranked correctly in the first browser's leaderboard tab, and that each player's own "Your rank" row matches their own `client_id`, not the other player's.
7. Rename via "Change name", confirm the same row updates (same `client_id`) rather than creating a second entry.
8. Disconnect network and confirm the game keeps running normally (autosave/leaderboard submit failure is silent, no toast, no freeze).
