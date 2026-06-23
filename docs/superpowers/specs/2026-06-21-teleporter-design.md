# Teleporter — Design Spec

## Summary

A new advanced logistics block, `B_TELEPORTER`, that instantly moves a fish
from one placed Teleporter to another anywhere on the map. Solves the
spaghetti/crossing problem in large factories by letting a player skip belt
runs entirely, at the cost of a high cash price and a late-game unlock gate.

## Block & economy

- New block id: `B_TELEPORTER = 17`.
- Category: `floor` (it's a transport block, grouped with Belt/Splitter/Sorter/Crate/Smart Router in the build menu).
- Cost: **$2,500** per placement.
- Unlock gate: **$15,000 lifetime earnings** (`BLOCK_UNLOCK_REQ[B_TELEPORTER] = { type: 'lifetimeEarned', amount: 15000, label: '$15,000 lifetime earnings' }`) — above the Stamper's $5,000 gate, signaling it's a logistics payoff for an established factory, not a starter tool.
- Requires paved floor underneath, same as every other piece of equipment (`canPlaceBlock` treats it like any non-Fisher/Concrete block).

## Data model

- `IS_TRANSPORT` is extended to include `B_TELEPORTER`, so it participates in belt-style jam/backpressure handling (`cellAcceptsItem`, queuing at the edge when blocked) exactly like Belt/Splitter/Sorter/Recycler/Smart Router do today.
- Per-instance cell state (already-present generic fields reused, no new defaults needed in `makeCellState()` beyond what every cell already has):
  - `dir` — output facing at this instance, set via R, same field every transport block already uses.
  - `teleportTarget` — `{ c, r } | null`. Which other Teleporter this instance sends fish to. `null` means "no destination set."
- `captureConfig`/`applyConfig` (in `js/undo.js`) gain `teleportTarget` to their captured/restored field list, so copy/paste and undo/redo preserve it like `sortMode`/`packTarget` already are.
- No central registry of teleporters — destinations are plain coordinates, validated live every time they're used (see "Removed destination" below). This keeps the data model identical in shape to every other per-instance setting already in the game.

## Player interaction

- **Placement**: same flow as any other block — select from build menu, click to place, costs $2,500, requires the unlock gate to be met.
- **Destination picker**: press **E** while hovering a placed Teleporter (same popup mechanism already used for Sorter/Recycler/Crate/Packer settings) to open a list of every *other* Teleporter currently on the map, labeled by position (e.g. `Teleporter @ (12, 7)`), plus a "Clear destination" option at the top. Selecting an entry sets `teleportTarget` immediately; the popup can be reopened any time to rewire it.
- **Self-targeting** is disallowed — a Teleporter's own coordinates are excluded from its own picker list.
- **Output facing**: R rotates the *destination-side* output direction, identical to how R already rotates Belt/Sorter facings before placement and via the per-instance `dir` field afterward.
- **Visual state indicator**: a Teleporter with `teleportTarget === null` (including one that was just auto-cleared) renders dimmed/grayscale instead of its normal active color, so a broken link is obvious without opening the popup.

## Belt integration & transfer behavior

- A fish arriving at a Teleporter (from an adjacent belt feeding into it, via the normal `transferItem` dispatch in `js/sim.js`) is removed from the sender's slot and injected directly into the destination Teleporter's output side, then proceeds through the *normal* `cellAcceptsItem`/`transferItem` hand-off logic from there — i.e. it can still queue up at the destination's exit if whatever is downstream of the destination is jammed. The teleport hop itself is instantaneous (no animation/transit ticks), only the final leg out of the destination behaves like a normal belt step.
- A Teleporter with no input fish behaves like an idle belt (nothing happens).
- **Many-to-one is allowed**: multiple senders may target the same destination Teleporter; if two arrive in the same tick, the existing tie-breaking order already used for belt hand-offs (scan order) applies — no new contention logic needed.

## Removed destination handling

- Every time a Teleporter with a non-null `teleportTarget` is about to act on a fish, first check `blockAt(target.c, target.r) === B_TELEPORTER`.
  - If true, proceed with the teleport.
  - If false (the destination was sold, replaced, or never existed at that coordinate after a load), **clear `teleportTarget` to `null` immediately** and let the fish queue at the sender's edge on this tick (i.e. the sender now behaves like a belt with `teleportTarget === null`, which has nowhere to send the fish, so it queues like any blocked belt until the player picks a new destination). The dimmed visual indicator described above makes this state visible at a glance.

## Blueprint copy/paste & undo/redo

- `teleportTarget` is captured and restored by `captureConfig`/`applyConfig` like any other per-instance setting, so undo/redo of a placed/removed Teleporter preserves its destination correctly (reusing the existing `notifyPlaced`/`attachConfigToLastPlaced` machinery already fixed for this exact class of bug).
- **Pasting a copied Teleporter** (or a copied area containing one) keeps `teleportTarget` pointing at the *original* map coordinates, not remapped relative to the paste location. This is a deliberate simplification: remapping would require detecting whether the *paired* Teleporter was copied in the same blueprint and offsetting accordingly, which adds real complexity for a rare case (most copy/paste use is for production lines, not teleporter pairs). If the original coordinates no longer hold a Teleporter (or never will, post-paste), the existing "removed destination" handling above clears it automatically and the dimmed indicator flags it for the player to re-pick.

## Save/load

- `teleportTarget` is a plain `{c, r}` object (or `null`), already JSON-serializable — no new save-format handling needed beyond whatever generic per-cell-state serialization the save system already does for other settings fields like `sortCategory`/`packTarget`.

## Visuals

- Procedural canvas rendering (no new sprite assets), consistent with Belt/Sorter/Splitter/Smart Router/Recycler today:
  - Two concentric rings: outer in `--c-purple` (#a78bfa), inner in `--c-sky` (#7ec8e3).
  - A small inner swirl shape that slowly rotates over time (purely cosmetic, like the existing scrolling-chevron belt animation) while `teleportTarget` is set, signaling "active."
  - An output-direction arrow/marker matching the existing Sorter/Smart Router convention for indicating facing.
  - When `teleportTarget === null`: both rings render desaturated/gray instead of purple/teal, swirl animation paused, to read as "broken/unset" at a glance.

## Out of scope (explicitly not building)

- No per-fish toll/cooldown/cost beyond the one-time placement price (confirmed: free to operate once placed, like Belt/Splitter/Sorter).
- No network size cap or distance limit.
- No remapping of `teleportTarget` on blueprint paste (see above).
- No new build-menu UI beyond the standard per-block entry; the destination picker reuses the existing block-popup pattern.
