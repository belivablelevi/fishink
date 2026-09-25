// Fish INK Factory - blueprint copy/paste (every block is single-tile, so
// the copied region is just a flat list of {dc, dr, id, dir, config} cells)

const blueprint = {
  selecting: false, // 'C' toggles - drag a rectangle to copy
  pasting: false,   // 'V' toggles - ghost follows the mouse, click to stamp
  current: null,    // { w, h, tiles } - the one copied layout; each Copy overwrites it
  pasteRotation: 0, // 0-3 - preview-only rotation steps applied on top of the copy; resets after each stamp
};

function activeBlueprint() {
  return blueprint.current;
}

let bpDragStart = null; // { c, r } - set on mousedown while blueprint.selecting

function toggleBlueprintSelect() {
  blueprint.pasting = false;
  blueprint.selecting = !blueprint.selecting;
  bpDragStart = null;
  queueToast(blueprint.selecting ? 'Blueprint: drag to copy' : 'Blueprint copy OFF', '#7ec8e3');
}

function toggleBlueprintPaste() {
  if (!activeBlueprint()) { queueToast('Nothing copied yet', '#9aa0a8'); return; }
  blueprint.selecting = false;
  bpDragStart = null;
  blueprint.pasting = !blueprint.pasting;
  queueToast(blueprint.pasting ? 'Blueprint: click to paste' : 'Blueprint paste OFF', '#7ec8e3');
}

// Advances the preview-only rotation by one 90° clockwise step. This never
// touches the copied layout itself - only the ghost preview (and the tiles
// actually stamped down) reflect the rotation; the clipboard always goes
// back to its originally-copied orientation once you place it.
function rotateBlueprintClipboard() {
  if (!activeBlueprint()) return;
  blueprint.pasteRotation = (blueprint.pasteRotation + 1) % 4;
}

// Returns the copied layout rotated 90° clockwise `blueprint.pasteRotation`
// times, without mutating the original. Each step maps a tile's offset into
// a box with width/height swapped, and `dir` advances one step through
// BELT_DIRS (same clockwise convention used everywhere else dir is rotated,
// e.g. the build-mode R key and the Smart Router's right turn).
function getRotatedClipboard() {
  const active = activeBlueprint();
  if (!active) return null;
  let { w, h, tiles } = active;
  for (let i = 0; i < blueprint.pasteRotation; i++) {
    tiles = tiles.map(t => ({
      ...t,
      dc: h - 1 - t.dr,
      dr: t.dc,
      dir: (t.dir + 1) % BELT_DIRS.length,
    }));
    [w, h] = [h, w];
  }
  return { w, h, tiles };
}

function captureBlueprint(start, end) {
  const c0 = Math.min(start.c, end.c), c1 = Math.max(start.c, end.c);
  const r0 = Math.min(start.r, end.r), r1 = Math.max(start.r, end.r);
  const tiles = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = blockAt(c, r);
      const terr = tileAt(c, r);
      if (id === B_NONE && terr !== T_CONCRETE) continue; // nothing worth copying
      const st = stateAt(c, r);
      tiles.push({
        dc: c - c0, dr: r - r0, id,
        dir: st ? st.dir : 0,
        config: id !== B_NONE ? captureConfig(c, r) : null,
      });
    }
  }
  blueprint.current = { w: c1 - c0 + 1, h: r1 - r0 + 1, tiles };
  blueprint.pasteRotation = 0;
  queueToast(`Copied ${tiles.length} tile(s)`, '#4dca7c');
  saveGame();
}

// Pasting a leveled-up machine must cost the same as leveling it up by hand -
// applies levels one at a time via machineUpgradeCost, stopping (silently,
// like the rest of pasteBlueprint's best-effort placement) at whatever level
// the player can currently afford. Returns the level actually paid for.
function chargeForPastedLevel(c, r, id, targetLevel) {
  if (!targetLevel) return 0;
  let level = 0;
  while (level < targetLevel) {
    const cost = machineUpgradeCost(id, level);
    if (cost == null || game.cash < cost) break;
    game.cash -= cost;
    level++;
  }
  stateAt(c, r).level = level;
  game.maxMachineLevel = Math.max(game.maxMachineLevel, level);
  return level;
}

// Best-effort: tiles whose destination fails canPlaceBlock (terrain mismatch,
// unlock gate, etc.) are silently skipped and never charged - see plan D13.
function pasteBlueprint(originC, originR) {
  if (!activeBlueprint()) return;
  const clip = getRotatedClipboard();
  let placed = 0;
  const total = clip.tiles.length;
  beginUndoBatch();
  for (const t of clip.tiles) {
    const c = originC + t.dc, r = originR + t.dr;
    // Pasting onto a tile that already has a block would otherwise fail
    // canPlaceBlock (occupied) and get silently skipped, leaving the old
    // block's settings/upgrades in place instead of the copied ones.
    if (blockAt(c, r) !== B_NONE) removeBlock(c, r);
    if (t.id === B_NONE) {
      // Bare concrete tile with nothing built on it.
      if (tileAt(c, r) === T_CONCRETE) { placed++; continue; }
      if (!canPlaceBlock(B_CONCRETE, c, r, 0)) continue;
      if (game.cash < BLOCK_COSTS[B_CONCRETE]) continue;
      if (buyAndPlace(B_CONCRETE, c, r, 0)) placed++;
      continue;
    }
    // Most equipment needs a paved floor underneath - lay it first if missing
    // (Fisher/Concrete themselves don't, per canPlaceBlock's own rules).
    if (t.id !== B_FISHER && t.id !== B_CONCRETE && tileAt(c, r) !== T_CONCRETE) {
      if (!canPlaceBlock(B_CONCRETE, c, r, 0)) continue;
      if (game.cash < BLOCK_COSTS[B_CONCRETE]) continue;
      buyAndPlace(B_CONCRETE, c, r, 0);
    }
    if (!canPlaceBlock(t.id, c, r, t.dir)) continue;
    if (game.cash < BLOCK_COSTS[t.id]) continue;
    if (buyAndPlace(t.id, c, r, t.dir)) {
      const targetLevel = (t.config && t.config.level) || 0;
      // t.config.dir is the pre-rotation direction captured at copy time -
      // t.dir (already rotated by getRotatedClipboard) is the source of
      // truth here, so it must override config.dir or this Object.assign
      // would clobber the just-placed correct orientation right back to it.
      applyConfig(c, r, { ...t.config, dir: t.dir, level: 0 });
      const achievedLevel = chargeForPastedLevel(c, r, t.id, targetLevel);
      attachConfigToLastPlaced({ ...t.config, dir: t.dir, level: achievedLevel });
      placed++;
    }
  }
  endUndoBatch();
  queueToast(`Pasted ${placed}/${total} tiles`, placed === total ? '#4dca7c' : '#e8a030');
  blueprint.pasteRotation = 0; // back to the original orientation for the next stamp
}

