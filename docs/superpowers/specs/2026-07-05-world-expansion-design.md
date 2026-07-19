# World Expansion & Starting Island Size Design

## Goal

Extend the existing cash-based island expand so that once the main island has filled the current canvas, the same button grows the world itself — adding new ocean and new offshore islands. Add one new prestige upgrade that starts each run with free island rings already applied.

## Architecture

The existing `expandIsland()` in `sim.js` already handles ring growth and detects when the island is full (`toConvert.length === 0`). We extend that branch: instead of failing, it calls a new `growWorld()` in `grid.js` that enlarges the canvas and spawns new offshore islands in the fresh ocean. The UI label reflects which mode the next purchase is in.

`WORLD_COLS` and `WORLD_ROWS` become `let` instead of `const`. `minZoomForViewport()` in `player.js` already reads these dynamically, so zoom adjusts automatically. Save/load infers dimensions from the terrain array size so no new save fields are needed.

## Global Constraints

- No new buttons or UI panels — same expand button, same cost formula (`5000 × 3^islandLevel`)
- `BOAT_C` stays fixed at 58 (col 58 was `WORLD_COLS - 6` at world start; world expands right/downward so the boat position is unchanged)
- Max world size: 128 cols × 96 rows (4 world expansions from the base 64×48, each +16 cols / +12 rows — slightly larger than the original 12×8 sketch to give meaningful new space)
- Max 5 levels of `islandStart` prestige upgrade
- New offshore islands: 1–2 attempts per world expansion, placed in the newly added ocean area only
- `WORLD_COLS`/`WORLD_ROWS` must be serialized in the save so load can restore them before reconstructing the terrain arrays (inferring from `terrain.length` / `terrain[0].length` is equivalent and preferred — no new save fields)

## Components

### 1. `js/grid.js` — mutable world dimensions + `growWorld()`

**Change:** `const WORLD_COLS = 64` and `const WORLD_ROWS = 48` → `let`. Keep initial values the same.

**New function `growWorld()`:**
- Guard: if `WORLD_COLS >= 128 && WORLD_ROWS >= 96`, return `false` (already at max).
- Add `GROW_COLS = 16` new columns to the right: for each existing row, append 16 `T_WATER` terrain entries and 16 `B_NONE` block entries and 16 `makeCellState()` entries.
- Add `GROW_ROWS = 12` new rows at the bottom: push 12 new rows, each `WORLD_COLS + GROW_COLS` wide, all water/none/default.
- Update `WORLD_COLS += GROW_COLS`, `WORLD_ROWS += GROW_ROWS`.
- Attempt to place 1–2 new offshore islands in the new space using the existing `carveOffshoreIsland()`. New island centers should be placed within the added columns and rows (i.e., `cx` in range `[old_WORLD_COLS + 4, new_WORLD_COLS - 4]` and/or `cy` in range `[old_WORLD_ROWS + 4, new_WORLD_ROWS - 4]`). Up to 4 attempts per island slot with jitter. Push successful results into `offshoreIslands` and call `applyShorePass()` for the new area only (or full pass — full pass is simpler and safe to re-run).
- Call `ensureWorkerIslandDepot()` for any new offshore islands.
- Return `true`.

### 2. `js/sim.js` — `expandIsland()` + world-full branch

**Change in `expandIsland()`:** The existing `toConvert.length === 0` branch currently shows "Island is at maximum size!" and returns. Replace with:
```
if (!toConvert.length) {
  const grew = growWorld();
  if (!grew) { queueToast('World is at maximum size!', '#e85d4a'); return; }
  game.cash -= cost;
  game.islandLevel++;
  saveGame();
  sfxCoin();
  queueToast(`World expanded! Ring ${game.islandLevel}`, '#4dca7c');
  return;
}
```
No other changes to cost formula or `game.islandLevel` — progression is continuous.

**New helper `nextExpandIsWorldGrow()`:** Returns `true` when `expandIsland()` would hit the world-grow branch — i.e., no adjacent-water tiles available on the main island. Used by the UI to update the button label.

### 3. `js/prestige.js` — `islandStart` upgrade

**Add to `PRESTIGE_UPGRADES`:**
```js
{ id: 'islandStart', name: 'Head Start', desc: '+1 free island ring at run start per level', baseCost: 2, costMult: 2.0, maxLevel: 5 }
```

**Add to `prestigeLevels`:** `islandStart: 0`

**New function `applyStartingIslandRings()`:** Called at the end of `buildWorld()` (in `grid.js`) or in the post-build hook in `main.js`. Runs the ring-expansion logic `prestigeLevels.islandStart` times without charging cash:
- For each level, compute `toConvert` (same logic as `expandIsland()`), convert tiles to shore, promote interior shore to grass.
- After all rings applied, set `game.islandLevel = prestigeLevels.islandStart`.
- This means the player starts the run with `islandLevel` already set, so costs continue from that base.

`applyStartingIslandRings()` must live in `sim.js` (it needs `terrain`, `_isLand`, `_protectedTile`, `toConvert` logic) and be called from `main.js` after `buildWorld()` and after `game` object is initialized.

### 4. `js/save.js` — restore world dimensions on load

**In `deserializeGame(data)`:** Before the terrain/blocks loop, read dimensions from saved arrays:
```js
if (data.terrain && data.terrain.length) {
  WORLD_ROWS = data.terrain.length;
  WORLD_COLS = data.terrain[0].length;
}
```
This must happen before the existing `for (let r = 0; r < WORLD_ROWS; r++)` deserialization loop. No new save fields needed — the arrays carry their own dimensions.

**In `serializeGame()`:** No changes needed — terrain/blocks are already serialized as arrays of arrays, which carry their dimensions implicitly.

### 5. `js/ui.js` — button label

**In the existing `islandExpandBtn` update logic** (around line 134), replace the static label:
```js
const worldGrow = nextExpandIsWorldGrow();
islandExpandInfo.textContent = worldGrow
  ? `World Expansion · Ring ${game.islandLevel} · Next: $${cost.toLocaleString()}`
  : `Island Ring ${game.islandLevel} · Next: $${cost.toLocaleString()}`;
```

If world is at max (`WORLD_COLS >= 128 && WORLD_ROWS >= 96`) and island is also full, show "World at maximum size" and disable the button.

## Edge Cases

- **Shore pass on expansion:** `applyShorePass()` iterates all tiles; calling it again after `growWorld()` is safe (idempotent) and simpler than a partial pass.
- **Water body cache:** `_wbAnchorCache`/`_wbTileCache` are computed lazily. Existing entries remain valid after growth (ocean bodies were already marked `isOcean = true`). New tiles compute on first access. No invalidation needed.
- **`_protectedTile()` in `sim.js`:** Uses `WORLD_ROWS`/`WORLD_COLS` dynamically — will correctly use updated values after expansion.
- **Teleporter links:** `teleporterTiles()` in `grid.js` iterates `WORLD_ROWS`/`WORLD_COLS` — already dynamic.
- **Prestige start rings + world-full:** If `prestigeLevels.islandStart` would overflow the current canvas, the free-ring loop just stops early (same `toConvert` guard) and the player starts with a partially-expanded island. Acceptable.
- **`BOAT_C` stays 58:** The boat dock is in the upper-right of the original canvas. World grows right and down, so the boat remains in valid ocean. `_protectedTile()` still buffers around it correctly.
