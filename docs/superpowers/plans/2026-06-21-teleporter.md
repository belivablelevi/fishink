# Teleporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new advanced logistics block — the Teleporter — that instantly relays a fish from one placed Teleporter to another anywhere on the map, per `docs/superpowers/specs/2026-06-21-teleporter-design.md`.

**Architecture:** Teleporter is a new `IS_TRANSPORT` block (`B_TELEPORTER`). Each instance stores an optional `teleportTarget: {c, r}` in its cell state, set via a destination-picker popup (E key, reusing the existing per-block popup system). When a fish lands on a Teleporter that has a valid target, it is instantly relocated into the destination's `item` slot (no transit animation), then exits the destination through normal belt-style hand-off using the destination's own `dir`/rotation — exactly like a plain Belt. A transient `fish.viaTeleport` flag on the fish object distinguishes "just arrived via hop, should exit normally" from "freshly fed by an upstream belt, should consume this tile's own `teleportTarget`," preventing accidental teleport-chaining.

**Tech Stack:** Vanilla JS, HTML5 Canvas, no build step, no framework, no test runner.

## Global Constraints

- No build step — every file is loaded directly via `<script>` tags in `index.html`, in load order. No new files need registering in `index.html` for this feature (all changes are to existing files already loaded).
- No test framework exists in this project. "Run the tests" in every task below means: (1) `node -c <file>` to catch syntax errors, and (2) a precise manual verification procedure performed by serving the game locally (`npx serve .` from the project root, or opening `index.html` directly) and checking specific in-game behavior. This mirrors how every prior change in this codebase has been verified.
- Follow existing code conventions exactly: defensive `st && st.field` reads in `render.js` (since `drawBlock` is also called for build-menu swatches with `c = -1, r = -1`, where `stateAt` returns no real cell), and the existing per-instance settings pattern (`captureConfig`/`applyConfig` in `js/undo.js`) for anything that should survive undo/redo and blueprint copy/paste.
- Reuse existing colors/classes; no new sprite image assets (procedural canvas rendering only, consistent with Belt/Splitter/Sorter/Recycler/Smart Router).
- Block id, cost, unlock gate, and array values below are exact and final — do not invent placeholder values.

---

### Task 1: Register the Teleporter block (data layer)

**Files:**
- Modify: `js/grid.js` (B_* constants, `BLOCK_NAMES`, `BLOCK_COSTS`, `BLOCK_CATS`, `BLOCK_DESCS`, `IS_TRANSPORT`, `BLOCK_UNLOCK_REQ`, `makeCellState()`)
- Modify: `js/player.js` (`PLACEABLE_IDS`)

**Interfaces:**
- Produces: `B_TELEPORTER` (numeric id `17`), `IS_TRANSPORT(B_TELEPORTER) === true`, `isBlockUnlocked(B_TELEPORTER)` gated on `game.lifetimeEarned >= 15000`, every cell state object has a `teleportTarget` field (`null` by default) that later tasks read/write, and a new global helper `teleporterTiles(excludeC, excludeR)` that later tasks (the popup) call to list link targets.
- Consumes: nothing new (all referenced globals — `game`, `WORLD_ROWS`, `WORLD_COLS`, `blockAt` — already exist in `js/grid.js`).

- [ ] **Step 1: Add the `B_TELEPORTER` constant**

In `js/grid.js`, the B_* block immediately after `B_SMART_ROUTER` (currently the last entry):

```javascript
const B_SMART_ROUTER    = 16; // belt variant: auto-picks the least-jammed of up to 3 output sides
```

Add directly below it:

```javascript
const B_TELEPORTER       = 17; // belt sink/source pair: instantly relays a fish to a linked Teleporter elsewhere on the map
```

- [ ] **Step 2: Add the name/cost/category/description entries**

In `js/grid.js`, change:

```javascript
const BLOCK_NAMES = ['', 'Fisher', 'Belt',
                     'Washer', 'Smoker', 'Icer', 'Stamper', 'Seller', 'Concrete',
                     'Fishing Drone', 'Drone Delivery',
                     'Splitter', 'Sorter', 'Storage Crate', 'Recycler',
                     'Packer', 'Smart Router'];
const BLOCK_COSTS = [0, 150, 10, 400, 1200, 600, 3000, 200, 5, 1000, 900,
                     60, 80, 250, 150, 700, 120];
```

to:

```javascript
const BLOCK_NAMES = ['', 'Fisher', 'Belt',
                     'Washer', 'Smoker', 'Icer', 'Stamper', 'Seller', 'Concrete',
                     'Fishing Drone', 'Drone Delivery',
                     'Splitter', 'Sorter', 'Storage Crate', 'Recycler',
                     'Packer', 'Smart Router', 'Teleporter'];
const BLOCK_COSTS = [0, 150, 10, 400, 1200, 600, 3000, 200, 5, 1000, 900,
                     60, 80, 250, 150, 700, 120, 2500];
```

Change:

```javascript
const BLOCK_CATS = ['', 'fishing', 'floor',
                    'processing', 'processing', 'processing', 'processing',
                    'sales', 'floor', 'fishing', 'sales',
                    'floor', 'floor', 'floor', 'sales',
                    'sales', 'floor'];
```

to:

```javascript
const BLOCK_CATS = ['', 'fishing', 'floor',
                    'processing', 'processing', 'processing', 'processing',
                    'sales', 'floor', 'fishing', 'sales',
                    'floor', 'floor', 'floor', 'sales',
                    'sales', 'floor', 'floor'];
```

Change:

```javascript
const BLOCK_DESCS = ['',
  'Casts a line from shore and reels in fish automatically.',
  'Moves items one tile per pulse. Press R to rotate before placing.',
  'Cleans caught fish, raising their sell value.',
  'Smokes fish for a bigger value boost.',
  'Flash-freezes fish for an even bigger value boost.',
  'Stamps fish with a quality seal for a final price bump.',
  'Sells anything dropped on it for cash.',
  'Paved floor — required before placing any equipment.',
  'Place anywhere — flies to the nearest water, fishes a batch, then flies back.',
  'Belt sink that sells fish for a delivery bonus, like a long-range Seller.',
  'Alternates output between straight-ahead and a turn, balancing two belts.',
  'Routes big fish one way, small fish the other — R flips which side is which.',
  'Buffers up to 20 items so a jam downstream doesn’t stall the whole line.',
  'Belt that salvages selected rarities for a flat fee as they ride past — press E to pick which ones.',
  'Bundles several fish into one higher-value box — press E to set the target count.',
  'Belt junction that auto-routes around a jam instead of backing up. The blue circle marks the input side.',
];
```

to (note the trailing comma stays on the second-to-last line):

```javascript
const BLOCK_DESCS = ['',
  'Casts a line from shore and reels in fish automatically.',
  'Moves items one tile per pulse. Press R to rotate before placing.',
  'Cleans caught fish, raising their sell value.',
  'Smokes fish for a bigger value boost.',
  'Flash-freezes fish for an even bigger value boost.',
  'Stamps fish with a quality seal for a final price bump.',
  'Sells anything dropped on it for cash.',
  'Paved floor — required before placing any equipment.',
  'Place anywhere — flies to the nearest water, fishes a batch, then flies back.',
  'Belt sink that sells fish for a delivery bonus, like a long-range Seller.',
  'Alternates output between straight-ahead and a turn, balancing two belts.',
  'Routes big fish one way, small fish the other — R flips which side is which.',
  'Buffers up to 20 items so a jam downstream doesn’t stall the whole line.',
  'Belt that salvages selected rarities for a flat fee as they ride past — press E to pick which ones.',
  'Bundles several fish into one higher-value box — press E to set the target count.',
  'Belt junction that auto-routes around a jam instead of backing up. The blue circle marks the input side.',
  'Press E to link it to another Teleporter — fish that land on it are instantly relayed there, then exit normally in this block’s facing direction.',
];
```

- [ ] **Step 3: Make the Teleporter a transport block**

In `js/grid.js`, change:

```javascript
const IS_TRANSPORT  = id => IS_BELT(id) || id === B_SPLITTER || id === B_SORTER || id === B_RECYCLER || id === B_SMART_ROUTER;
```

to:

```javascript
const IS_TRANSPORT  = id => IS_BELT(id) || id === B_SPLITTER || id === B_SORTER || id === B_RECYCLER || id === B_SMART_ROUTER || id === B_TELEPORTER;
```

- [ ] **Step 4: Add the unlock gate**

In `js/grid.js`, change:

```javascript
const BLOCK_UNLOCK_REQ = [];
BLOCK_UNLOCK_REQ[B_STAMPER]        = { type: 'lifetimeEarned', amount: 5000, label: '$5,000 lifetime earnings' };
BLOCK_UNLOCK_REQ[B_DRONE_DELIVERY] = { type: 'fishSold',       amount: 300,  label: '300 fish sold' };
```

to:

```javascript
const BLOCK_UNLOCK_REQ = [];
BLOCK_UNLOCK_REQ[B_STAMPER]        = { type: 'lifetimeEarned', amount: 5000,  label: '$5,000 lifetime earnings' };
BLOCK_UNLOCK_REQ[B_DRONE_DELIVERY] = { type: 'fishSold',       amount: 300,   label: '300 fish sold' };
BLOCK_UNLOCK_REQ[B_TELEPORTER]     = { type: 'lifetimeEarned', amount: 15000, label: '$15,000 lifetime earnings' };
```

- [ ] **Step 5: Add the `teleportTarget` default field to cell state**

In `js/grid.js`, change `makeCellState()` from:

```javascript
function makeCellState() {
  return {
    item: null,
    inputItem: null,
    timer: 0,
    processing: false,
    dir: 0, // IS_TRANSPORT only — index into BELT_DIRS — rotated with R before placing
    flashAnim: 0, // drone blocks only — game.time value the visual pulse ends at
    dronePhase: DRONE_OUT, // B_DRONE_FISHER only — current flight phase
    droneT: 0,             // 0..1 progress through the current phase
    waterC: null,          // B_DRONE_FISHER only — cached nearest-water target
    waterR: null,
    carrying: [],          // B_DRONE_FISHER (drop-off queue) or B_CRATE (FIFO buffer)
    altOut: false,         // B_SPLITTER only — which of the two output sides is next
    level: 0,              // IS_MACHINE only — per-instance upgrade level, click to buy
    sortMode: 'size',       // B_SORTER only — 'size' or 'rarity'
    sortThreshold: 2,      // B_SORTER only — SIZES index that splits "big" from "small"
    sortCategory: 'Rare',   // B_SORTER only — CATEGORY_NAMES entry routed to st.dir in rarity mode
    recycleRarities: [],   // B_RECYCLER only — CATEGORY_NAMES entries that get salvaged on sight
    packTarget: 5,          // B_PACKER only — fish count that triggers a bundle
  };
}
```

to:

```javascript
function makeCellState() {
  return {
    item: null,
    inputItem: null,
    timer: 0,
    processing: false,
    dir: 0, // IS_TRANSPORT only — index into BELT_DIRS — rotated with R before placing
    flashAnim: 0, // drone blocks only — game.time value the visual pulse ends at
    dronePhase: DRONE_OUT, // B_DRONE_FISHER only — current flight phase
    droneT: 0,             // 0..1 progress through the current phase
    waterC: null,          // B_DRONE_FISHER only — cached nearest-water target
    waterR: null,
    carrying: [],          // B_DRONE_FISHER (drop-off queue) or B_CRATE (FIFO buffer)
    altOut: false,         // B_SPLITTER only — which of the two output sides is next
    level: 0,              // IS_MACHINE only — per-instance upgrade level, click to buy
    sortMode: 'size',       // B_SORTER only — 'size' or 'rarity'
    sortThreshold: 2,      // B_SORTER only — SIZES index that splits "big" from "small"
    sortCategory: 'Rare',   // B_SORTER only — CATEGORY_NAMES entry routed to st.dir in rarity mode
    recycleRarities: [],   // B_RECYCLER only — CATEGORY_NAMES entries that get salvaged on sight
    packTarget: 5,          // B_PACKER only — fish count that triggers a bundle
    teleportTarget: null,   // B_TELEPORTER only — { c, r } of the linked destination, or null if unset/broken
  };
}
```

- [ ] **Step 6: Add the `teleporterTiles` helper**

In `js/grid.js`, directly after the `isBlockUnlocked` function:

```javascript
function isBlockUnlocked(id) {
  const req = BLOCK_UNLOCK_REQ[id];
  if (!req) return true;
  if (req.type === 'lifetimeEarned') return game.lifetimeEarned >= req.amount;
  if (req.type === 'fishSold')       return game.fishSold >= req.amount;
  return true;
}
```

add:

```javascript
// All placed Teleporter tiles except the one at (excludeC, excludeR) — backs
// the destination picker in the Teleporter's settings popup (ui.js).
function teleporterTiles(excludeC, excludeR) {
  const out = [];
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (blockAt(c, r) !== B_TELEPORTER) continue;
      if (c === excludeC && r === excludeR) continue;
      out.push({ c, r });
    }
  }
  return out;
}
```

- [ ] **Step 7: Add it to the build menu's placeable list**

In `js/player.js`, change:

```javascript
const PLACEABLE_IDS = [B_CONCRETE, B_FISHER, B_BELT, B_SPLITTER, B_SORTER, B_CRATE,
                       B_WASHER, B_SMOKER, B_ICER, B_STAMPER,
                       B_SELLER, B_RECYCLER, B_PACKER, B_SMART_ROUTER,
                       B_DRONE_FISHER, B_DRONE_DELIVERY];
```

to:

```javascript
const PLACEABLE_IDS = [B_CONCRETE, B_FISHER, B_BELT, B_SPLITTER, B_SORTER, B_CRATE,
                       B_WASHER, B_SMOKER, B_ICER, B_STAMPER,
                       B_SELLER, B_RECYCLER, B_PACKER, B_SMART_ROUTER, B_TELEPORTER,
                       B_DRONE_FISHER, B_DRONE_DELIVERY];
```

- [ ] **Step 8: Syntax-check both files**

Run: `node -c js/grid.js && node -c js/player.js`
Expected: no output, exit code 0.

- [ ] **Step 9: Manual verification**

Serve the game (`npx serve .` from the project root, or open `index.html` directly) and:
1. Open the build menu (B). Confirm a "Teleporter" card now appears in the "floor" category group, showing the lock badge and the text `$15,000 lifetime earnings` instead of a price (since a fresh save has `lifetimeEarned: 0`).
2. Open the browser dev console and run `game.lifetimeEarned = 20000;` then close/reopen the build menu (B, B) — the Teleporter card should now show `$2500` and no lock badge.
Expected: both checks match.

- [ ] **Step 10: Commit**

```bash
git add js/grid.js js/player.js
git commit -m "feat: register Teleporter block data (id, cost, unlock gate, cell state field)"
```

(If this project is not its own git repository — it may live inside a much larger personal home-directory repo — skip the commit and just note the change is complete; do not run `git add`/`git commit` against unrelated files.)

---

### Task 2: Teleport relay logic (simulation layer)

**Files:**
- Modify: `js/sim.js` (`stepBeltCell`)

**Interfaces:**
- Consumes: `B_TELEPORTER`, `IS_TRANSPORT` (Task 1), `stateAt(c, r).teleportTarget` (Task 1), `blockAt`, `cellAcceptsItem`, `transferItem`, `nextCellFor`, `effectiveBeltSpeed` (all pre-existing in `js/sim.js`).
- Produces: at runtime, a fish object may carry a transient `fish.viaTeleport` boolean property (not part of `makeCellState`, lives on the fish item itself, mirroring how `fish.progress` already does). No other task reads this directly, but Task 5 (rendering) must NOT assume fish state — it only reads cell state.

- [ ] **Step 1: Add the Teleporter sender/receiver branch**

In `js/sim.js`, `stepBeltCell` currently reads:

```javascript
function stepBeltCell(c, r, dt, onlyPositive) {
  const id = blockAt(c, r);
  if (!IS_TRANSPORT(id)) return;
  const st = stateAt(c, r);
  const dir = primaryDir(id, st);
  if (onlyPositive && (dir.dx < 0 || dir.dy < 0)) return;
  if (!st.item) return;

  const fish = st.item;
  if (fish.progress === undefined) fish.progress = 0;

  // Recycler: a fish whose rarity is selected gets salvaged the instant it
  // lands here — it never continues onward to wherever the belt points.
  if (id === B_RECYCLER && st.recycleRarities.includes(fish.category)) {
    recycleFish(fish, c, r);
    st.item = null;
    return;
  }

  const { nc, nr } = nextCellFor(c, r, id, st, fish);
  const nb = blockAt(nc, nr);
  const blocked = !cellAcceptsItem(nc, nr, nb);

  const beltSpeed = effectiveBeltSpeed();
  if (blocked) {
    // Queue up near the tile edge — shows backpressure visually
    fish.progress = Math.min(fish.progress + dt * beltSpeed, 0.88);
  } else {
    fish.progress += dt * beltSpeed;
  }

  if (fish.progress >= 1.0) {
    fish.progress = 0;
    transferItem(c, r, st, nc, nr, nb);
    if (id === B_SPLITTER && !st.item) st.altOut = !st.altOut;
  }
}
```

Replace it with:

```javascript
function stepBeltCell(c, r, dt, onlyPositive) {
  const id = blockAt(c, r);
  if (!IS_TRANSPORT(id)) return;
  const st = stateAt(c, r);
  const dir = primaryDir(id, st);
  if (onlyPositive && (dir.dx < 0 || dir.dy < 0)) return;
  if (!st.item) return;

  const fish = st.item;
  if (fish.progress === undefined) fish.progress = 0;

  // Recycler: a fish whose rarity is selected gets salvaged the instant it
  // lands here — it never continues onward to wherever the belt points.
  if (id === B_RECYCLER && st.recycleRarities.includes(fish.category)) {
    recycleFish(fish, c, r);
    st.item = null;
    return;
  }

  // Teleporter sender role: a fish that arrived here normally (not one that
  // just hopped in from another Teleporter — see fish.viaTeleport below)
  // instantly relays to the linked destination's *item slot*, the moment a
  // destination is set and free. The destination then exits it through the
  // normal belt-step logic below using its own `dir`, exactly like a plain
  // Belt — the hop itself has no transit animation, only the final leg out
  // of the destination does.
  if (id === B_TELEPORTER && !fish.viaTeleport) {
    if (st.teleportTarget && blockAt(st.teleportTarget.c, st.teleportTarget.r) !== B_TELEPORTER) {
      // Destination was sold/replaced since this was set — clear it so the
      // dimmed "no destination" indicator picks it up (see render.js).
      st.teleportTarget = null;
    }
    const destSt = st.teleportTarget ? stateAt(st.teleportTarget.c, st.teleportTarget.r) : null;
    if (!destSt || destSt.item) {
      // No destination, or destination tile currently occupied — queue at
      // the edge like any other blocked belt until it clears.
      fish.progress = Math.min(fish.progress + dt * effectiveBeltSpeed(), 0.88);
      return;
    }
    fish.viaTeleport = true;
    fish.progress = 0;
    destSt.item = fish;
    st.item = null;
    return;
  }

  const { nc, nr } = nextCellFor(c, r, id, st, fish);
  const nb = blockAt(nc, nr);
  const blocked = !cellAcceptsItem(nc, nr, nb);

  const beltSpeed = effectiveBeltSpeed();
  if (blocked) {
    // Queue up near the tile edge — shows backpressure visually
    fish.progress = Math.min(fish.progress + dt * beltSpeed, 0.88);
  } else {
    fish.progress += dt * beltSpeed;
  }

  if (fish.progress >= 1.0) {
    fish.progress = 0;
    // Clears the hop flag the instant a fish successfully leaves ANY tile —
    // this is what makes a Teleporter-to-Teleporter belt hand-off (the
    // destination's exit happens to feed straight into another Teleporter)
    // treat that next Teleporter as a fresh sender, not a second hop.
    fish.viaTeleport = false;
    transferItem(c, r, st, nc, nr, nb);
    if (id === B_SPLITTER && !st.item) st.altOut = !st.altOut;
  }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node -c js/sim.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Manual verification (console-driven, since the destination picker UI doesn't exist until Task 4)**

Serve the game and, in the browser dev console:
1. `game.lifetimeEarned = 20000;` then open the build menu and place two Teleporters several tiles apart (e.g. at world cells `(5,5)` and `(20,5)`), each on its own paved Concrete tile, each with a Belt feeding into the first one and a Belt/Seller leading away from the second one.
2. Run `stateAt(5,5).teleportTarget = {c: 20, r: 5};` to link them (the popup will do this automatically once Task 4 lands).
3. Drop a fish onto the belt feeding the first Teleporter (cast a line, walk it over, press E to drop it on the belt — or directly run `stateAt(<belt c>,<belt r>).item = randomFish();` for a faster check).
4. Confirm: the fish disappears from the first Teleporter's tile without ever visibly riding across it, then a moment later appears riding out of the second Teleporter in its facing direction and continues down the belt/into the Seller as normal.
5. Run `stateAt(20,5).item = randomFish();` directly (simulating the exit being momentarily occupied) right as another fish is mid-hop, and confirm the sender's fish queues (visually nudges toward its tile edge) instead of being lost, then completes the hop once the destination clears.
Expected: all behaviors match.

- [ ] **Step 4: Commit**

```bash
git add js/sim.js
git commit -m "feat: add Teleporter instant-relay logic to belt simulation"
```

(Skip the commit, as noted in Task 1 Step 10, if this isn't its own git repo.)

---

### Task 3: Undo/redo and blueprint persistence

**Files:**
- Modify: `js/undo.js` (`captureConfig`, `applyConfig`)

**Interfaces:**
- Consumes: `stateAt(c, r).teleportTarget` (Task 1).
- Produces: nothing new — `captureConfig`/`applyConfig` already have a defined shape consumed by `js/blueprint.js`'s `pasteBlueprint` and `js/undo.js`'s own `redoOneEntry`; this task only adds one more field to that existing shape, no signature change.

- [ ] **Step 1: Add `teleportTarget` to the captured/applied config shape**

In `js/undo.js`, change:

```javascript
function captureConfig(c, r) {
  const st = stateAt(c, r);
  if (!st) return null;
  return {
    dir: st.dir, sortMode: st.sortMode, sortThreshold: st.sortThreshold,
    sortCategory: st.sortCategory, recycleRarities: [...st.recycleRarities],
    packTarget: st.packTarget, level: st.level,
  };
}
```

to:

```javascript
function captureConfig(c, r) {
  const st = stateAt(c, r);
  if (!st) return null;
  return {
    dir: st.dir, sortMode: st.sortMode, sortThreshold: st.sortThreshold,
    sortCategory: st.sortCategory, recycleRarities: [...st.recycleRarities],
    packTarget: st.packTarget, level: st.level,
    teleportTarget: st.teleportTarget ? { ...st.teleportTarget } : null,
  };
}
```

`applyConfig` needs no change — it already does `Object.assign(stateAt(c, r), cfg)`, which will pick up the new `teleportTarget` key automatically.

- [ ] **Step 2: Syntax-check**

Run: `node -c js/undo.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Manual verification**

Serve the game and, with the two linked Teleporters from Task 2's verification still in place:
1. In the dev console, confirm `stateAt(5,5).teleportTarget` is `{c: 20, r: 5}`.
2. Press Ctrl+Z to undo the second Teleporter's placement (you may need to undo a few times to reach it, depending on what else you placed). Confirm the tile at `(20,5)` reverts to bare concrete (or whatever it was before).
3. Press Ctrl+Shift+Z (or Ctrl+Y) to redo. Confirm the Teleporter reappears at `(20,5)` AND `stateAt(5,5).teleportTarget` still reads `{c: 20, r: 5}` (i.e. the *sender's* link survived its own undo/redo cycle, since the sender itself was never removed — this step is really confirming the redo path for the destination's own placement doesn't throw and the sender's independent state is untouched).
4. Use C to copy a box containing the first Teleporter, then V to paste it elsewhere. Confirm the pasted copy's `teleportTarget` (check via `stateAt(<paste c>, <paste r>).teleportTarget` in console) still points at the *original* `{c: 20, r: 5}` coordinates, per the spec's documented simplification (no remapping on paste).
Expected: all four checks match.

- [ ] **Step 4: Commit**

```bash
git add js/undo.js
git commit -m "feat: preserve Teleporter destination across undo/redo and blueprint paste"
```

(Skip the commit, as noted in Task 1 Step 10, if this isn't its own git repo.)

---

### Task 4: Destination-picker popup

**Files:**
- Modify: `js/player.js` (`interactionKindFor`)
- Modify: `js/ui.js` (`renderBlockPopup`, `updateBlockPopupLive`, new `renderTeleporterPopupContent`)
- Modify: `style.css` (new `.mp-target-list` / `.mp-target-btn` rules)

**Interfaces:**
- Consumes: `teleporterTiles(excludeC, excludeR)` (Task 1), `stateAt(c, r).teleportTarget` (Task 1), `blockPopup`/`blockPopupEl`/`closeBlockPopup`/`renderBlockPopup` (all pre-existing in `js/ui.js`/`js/player.js`).
- Produces: pressing E on a hovered `B_TELEPORTER` now opens a popup of `kind: 'teleporter'`; nothing outside `js/ui.js` needs to call the new renderer directly.

- [ ] **Step 1: Make E recognize the Teleporter**

In `js/player.js`, change:

```javascript
// Which popup kind (if any) E should open for a hovered block id.
function interactionKindFor(id) {
  if (id === B_SORTER) return 'sorter';
  if (id === B_CRATE) return 'crate';
  if (id === B_RECYCLER) return 'recycler';
  if (id === B_PACKER) return 'packer';
  if (IS_MACHINE(id) || id === B_FISHER || id === B_DRONE_FISHER || id === B_DRONE_DELIVERY) return 'machine';
  return null;
}
```

to:

```javascript
// Which popup kind (if any) E should open for a hovered block id.
function interactionKindFor(id) {
  if (id === B_SORTER) return 'sorter';
  if (id === B_CRATE) return 'crate';
  if (id === B_RECYCLER) return 'recycler';
  if (id === B_PACKER) return 'packer';
  if (id === B_TELEPORTER) return 'teleporter';
  if (IS_MACHINE(id) || id === B_FISHER || id === B_DRONE_FISHER || id === B_DRONE_DELIVERY) return 'machine';
  return null;
}
```

- [ ] **Step 2: Wire the popup dispatcher**

In `js/ui.js`, change:

```javascript
function renderBlockPopup() {
  const { kind, c, r } = blockPopup;
  if (kind === 'machine')        renderMachinePopupContent(c, r);
  else if (kind === 'sorter')    renderSorterPopupContent(c, r);
  else if (kind === 'crate')     renderCratePopupContent(c, r);
  else if (kind === 'recycler')  renderRecyclerPopupContent(c, r);
  else if (kind === 'packer')    renderPackerPopupContent(c, r);
}
```

to:

```javascript
function renderBlockPopup() {
  const { kind, c, r } = blockPopup;
  if (kind === 'machine')        renderMachinePopupContent(c, r);
  else if (kind === 'sorter')    renderSorterPopupContent(c, r);
  else if (kind === 'crate')     renderCratePopupContent(c, r);
  else if (kind === 'recycler')  renderRecyclerPopupContent(c, r);
  else if (kind === 'packer')    renderPackerPopupContent(c, r);
  else if (kind === 'teleporter') renderTeleporterPopupContent(c, r);
}
```

- [ ] **Step 3: Add the Teleporter case to the live-validity check**

In `js/ui.js`, change `updateBlockPopupLive`'s validity switch from:

```javascript
  const stillValid = kind === 'machine'   ? IS_UPGRADABLE(id)
                    : kind === 'sorter'   ? id === B_SORTER
                    : kind === 'crate'    ? id === B_CRATE
                    : kind === 'recycler' ? id === B_RECYCLER
                    : kind === 'packer'   ? IS_PACKER(id)
                    : false;
```

to:

```javascript
  const stillValid = kind === 'machine'     ? IS_UPGRADABLE(id)
                    : kind === 'sorter'     ? id === B_SORTER
                    : kind === 'crate'      ? id === B_CRATE
                    : kind === 'recycler'   ? id === B_RECYCLER
                    : kind === 'packer'     ? IS_PACKER(id)
                    : kind === 'teleporter' ? id === B_TELEPORTER
                    : false;
```

- [ ] **Step 4: Write the popup content renderer**

In `js/ui.js`, directly after the existing `renderRecyclerPopupContent` function, add:

```javascript
// Teleporter settings: pick which other Teleporter on the map this one sends
// fish to. The list is rebuilt fresh every render (cheap — the map is small
// and this only runs when the popup is opened or a button inside it is
// clicked, never per-frame; see updateBlockPopupLive for the per-frame path).
function renderTeleporterPopupContent(c, r) {
  if (blockAt(c, r) !== B_TELEPORTER) { closeBlockPopup(); return; }
  const st = stateAt(c, r);
  const others = teleporterTiles(c, r);

  const targetRows = others.length === 0
    ? `<div class="mp-target-empty">No other Teleporters placed yet.</div>`
    : others.map(({ c: tc, r: tr }) => {
        const active = st.teleportTarget && st.teleportTarget.c === tc && st.teleportTarget.r === tr;
        return `<button class="mp-target-btn ${active ? 'active' : ''}" data-c="${tc}" data-r="${tr}">Teleporter @ (${tc}, ${tr})</button>`;
      }).join('');

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">Teleporter Settings</div>
      <button class="mp-close">&times;</button>
    </div>
    <div class="mp-effect">Fish landing here are instantly sent to the linked Teleporter, then exit it in that block's own facing direction.</div>
    <div class="mp-target-list">
      <button class="mp-target-btn mp-target-clear ${!st.teleportTarget ? 'active' : ''}" data-clear="1">No destination</button>
      ${targetRows}
    </div>
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  const clearBtn = blockPopupEl.querySelector('.mp-target-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      st.teleportTarget = null;
      renderBlockPopup();
    });
  }
  blockPopupEl.querySelectorAll('.mp-target-btn:not(.mp-target-clear)').forEach(btn => {
    btn.addEventListener('click', () => {
      st.teleportTarget = { c: Number(btn.dataset.c), r: Number(btn.dataset.r) };
      renderBlockPopup();
    });
  });
}
```

- [ ] **Step 5: Add popup CSS for the destination list**

In `style.css`, directly after the existing crate-list rules (the block ending in `.block-popup .mp-crate-value { color: var(--c-mint); font-weight: 700; }`), add:

```css
/* Teleporter settings — destination picker list */
.block-popup .mp-target-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}
.block-popup .mp-target-btn {
  appearance: none;
  border: 1px solid var(--c-border);
  background: rgba(255,255,255,0.04);
  color: var(--c-muted);
  border-radius: 5px;
  padding: 7px 8px;
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--font-mono);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.block-popup .mp-target-btn:hover { color: var(--c-text); }
.block-popup .mp-target-btn.active {
  background: rgba(167,139,250,0.18);
  border-color: var(--c-purple);
  color: var(--c-purple);
}
.block-popup .mp-target-clear { font-style: italic; }
.block-popup .mp-target-empty {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--c-muted);
  padding: 6px 2px;
}
```

- [ ] **Step 6: Syntax-check the JS files**

Run: `node -c js/player.js && node -c js/ui.js`
Expected: no output, exit code 0.

- [ ] **Step 7: Manual verification**

Serve the game and:
1. With the two Teleporters from earlier tasks still placed, hover the first one and press E. Confirm a popup opens titled "Teleporter Settings" listing "No destination" and "Teleporter @ (20, 5)" (or whatever its actual coordinates are), with "Teleporter @ (20, 5)" highlighted as active (since Task 2's verification already set it via the console).
2. Click "No destination." Confirm the button highlights as active and, back in the dev console, `stateAt(5,5).teleportTarget` now reads `null`.
3. Click "Teleporter @ (20, 5)" again. Confirm it re-highlights and `stateAt(5,5).teleportTarget` is restored.
4. Hover the *second* Teleporter and press E. Confirm its own popup lists only the *first* Teleporter as an option (not itself) — i.e. self-targeting is impossible because the picker never lists the tile it was opened from.
5. Press Escape (or click the × ) to close the popup. Confirm it closes.
Expected: all five checks match.

- [ ] **Step 8: Commit**

```bash
git add js/player.js js/ui.js style.css
git commit -m "feat: add Teleporter destination-picker popup"
```

(Skip the commit, as noted in Task 1 Step 10, if this isn't its own git repo.)

---

### Task 5: Procedural rendering

**Files:**
- Modify: `js/render.js` (`drawBlock` dispatcher, new `drawTeleporterIcon`)

**Interfaces:**
- Consumes: `BELT_DIRS`, `drawBelt`, `drawDirArrow` (all pre-existing in `js/render.js`), `stateAt(c, r).dir`/`.teleportTarget` (Task 1).
- Produces: nothing consumed elsewhere — this is a leaf rendering function.

- [ ] **Step 1: Wire the dispatcher**

In `js/render.js`, `drawBlock` currently has this sequence (showing the relevant slice):

```javascript
  } else if (id === B_SORTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    drawBelt(ctx, BELT_DIRS[dirIdx], sx, sy, S);
    drawSorterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, S);

  } else if (id === B_CRATE) {
```

Insert a new branch between them, so it reads:

```javascript
  } else if (id === B_SORTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    drawBelt(ctx, BELT_DIRS[dirIdx], sx, sy, S);
    drawSorterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, S);

  } else if (id === B_TELEPORTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    drawBelt(ctx, BELT_DIRS[dirIdx], sx, sy, S);
    drawTeleporterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, !!(st && st.teleportTarget), S);

  } else if (id === B_CRATE) {
```

- [ ] **Step 2: Add the icon renderer**

In `js/render.js`, directly after the existing `drawSorterIcon` function, add:

```javascript
// Teleporter: two concentric rings (purple outer, sky-blue inner) with a
// slowly rotating inner swirl while it has a valid destination, plus the
// same output-direction arrow convention as Sorter/Smart Router. With no
// destination set (or one that was auto-cleared because the target tile
// stopped being a Teleporter), both rings desaturate to gray and the swirl
// stops, so a broken link reads as "broken" at a glance without opening
// the settings popup.
function drawTeleporterIcon(ctx, cx, cy, dirIdx, hasTarget, S) {
  const outerColor = hasTarget ? '#a78bfa' : '#6b6b78';
  const innerColor = hasTarget ? '#7ec8e3' : '#888892';

  ctx.strokeStyle = outerColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.22, 0, Math.PI * 2);
  ctx.stroke();

  if (hasTarget) {
    const spin = game.time * 2.2;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const a0 = spin + i * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, S * 0.14, a0, a0 + Math.PI * 0.7);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  drawDirArrow(ctx, cx, cy, BELT_DIRS[dirIdx], S * 0.3, outerColor, 2, 3.5);
}
```

- [ ] **Step 3: Syntax-check**

Run: `node -c js/render.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Manual verification**

Serve the game and:
1. Open the build menu and find the Teleporter card's swatch preview — confirm it shows a gray (no-destination) double-ring icon over a belt base, since the swatch is drawn with `c=-1, r=-1` (no real state, so `st` is falsy and `hasTarget` is `false`).
2. With the linked pair from earlier tasks placed and linked (destination set), zoom in and confirm the *sender* Teleporter (the one with a destination set) renders with purple/sky-blue rings and a visibly rotating swirl, with a small arrow pointing in its facing direction.
3. Open the sender's popup (E) and click "No destination." Confirm its rings immediately desaturate to gray and the swirl stops, without needing to reopen the popup or refresh the page.
4. While in build mode with the Teleporter selected, press R a few times before placing one. Confirm the preview's arrow direction rotates accordingly, matching how R already behaves for Belt/Sorter.
Expected: all four checks match.

- [ ] **Step 5: Commit**

```bash
git add js/render.js
git commit -m "feat: add procedural Teleporter rendering (rings, swirl, facing arrow)"
```

(Skip the commit, as noted in Task 1 Step 10, if this isn't its own git repo.)

---

### Task 6: Full end-to-end verification pass

**Files:** none (verification only — no code changes expected; if this step uncovers a bug, fix it in the relevant file from Tasks 1–5 and re-run this task's checklist from the top).

**Interfaces:** N/A.

- [ ] **Step 1: Fresh-save placement and economy check**

Serve the game with a fresh save (clear `localStorage` for the page, or use a private/incognito window). Confirm the Teleporter card is locked and shows `$15,000 lifetime earnings`. Use the console (`game.lifetimeEarned = 15000;`) to cross the threshold, reopen the build menu, and confirm it unlocks and shows `$2500`. Place one — confirm `game.cash` drops by exactly 2500 and it requires a paved Concrete tile underneath first (try placing directly on bare dirt — it should be rejected, same as any other piece of equipment).

- [ ] **Step 2: Basic relay over a real belt line**

Build a small real production line with no console shortcuts: Fisher → Belt → Teleporter A (linked via its popup to Teleporter B placed far away) → on Teleporter B's exit side, a Belt → Seller. Let it run for ~30 seconds of real fishing and confirm fish actually flow end-to-end and cash increases.

- [ ] **Step 3: Many-to-one**

Add a second sender Teleporter (fed by its own Belt/Fisher line) and link it to the *same* destination Teleporter B used in Step 2. Feed both senders simultaneously (e.g. drop multiple fish via console at the same instant: `stateAt(<sender1 belt>).item = randomFish(); stateAt(<sender2 belt>).item = randomFish();`). Confirm neither fish is lost — one hops through immediately and the other queues at its sender's edge until the destination's `item` slot clears, then it also hops through.

- [ ] **Step 4: Destination removed mid-network**

With Teleporter A still linked to Teleporter B, right-click Teleporter B to remove/sell it. Confirm: (a) Teleporter A's icon immediately desaturates to gray (no destination), (b) opening Teleporter A's popup shows "No destination" as active and no longer lists a "Teleporter @ (...)" entry for B's old coordinates, (c) a fish dropped onto Teleporter A's input belt now queues visibly at A's edge instead of vanishing or throwing a console error.

- [ ] **Step 5: Save/reload persistence**

With at least one linked Teleporter pair on the map, trigger a save (the game menu's "Save Now" button, or however the project's autosave fires). Reload the page. Confirm both Teleporters are still present at the same coordinates and the sender's destination link survived the reload (check via its popup, or `stateAt(c,r).teleportTarget` in console).

- [ ] **Step 6: No regressions in existing transport blocks**

Quickly re-verify Belt, Splitter, Sorter, Recycler, and Smart Router still behave exactly as before (place one of each, run a fish through each) — this confirms the new `IS_TRANSPORT` membership and the new branch inserted at the top of `stepBeltCell` didn't change behavior for any block type other than `B_TELEPORTER`.

- [ ] **Step 7: Final full syntax pass**

Run: `for f in js/*.js; do node -c "$f" || echo "FAIL: $f"; done`
Expected: no `FAIL` lines printed.

- [ ] **Step 8: Commit (if any fixes were made during this task)**

```bash
git add -A
git commit -m "fix: address issues found during Teleporter end-to-end verification"
```

(Only run this if Step 1–6 actually required code changes. Skip entirely, including for this task, if this isn't its own git repo — see Task 1 Step 10.)
