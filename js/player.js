// Fish INK Factory — player movement, camera, interaction

const PLAYER_SPEED = 120;
const PLAYER_HALF  = 10;
const FISHING_ROD_RANGE = 6 * TILE_SIZE; // max cast distance from the player
let ZOOM = 2.0;
const ZOOM_MAX = 3.5;

// The canvas fills the browser window, so a fixed ZOOM_MIN would let you zoom
// out far enough to see past the map's edge on a large/wide window. Instead
// the minimum scales with the current viewport so it never shows more world
// than actually exists, in either axis.
function minZoomForViewport() {
  return Math.max(CANVAS_W / (WORLD_COLS * TILE_SIZE), CANVAS_H / (WORLD_ROWS * TILE_SIZE));
}
// Camera starts shaking while walking once zoomed in past this — keeps
// normal play stable and only kicks in when zoomed close enough to notice.
const SHAKE_ZOOM_THRESHOLD = 2.6;

// Machine "processing done" chimes only play once zoomed in this far — at
// low zoom many machines are visible/finishing at once, so the chimes would
// overlap into noise; up close they read as a satisfying per-machine cue.
const MACHINE_SFX_ZOOM_THRESHOLD = 2.5;

// Machine chimes fade out with distance from the player and go silent past
// this range (in tiles) — machines right next to you read clearly, distant
// ones in another part of the factory don't clutter the mix.
const MACHINE_SFX_RANGE = 9 * TILE_SIZE;

// Same fade behavior for the coin sound when a fish actually sells (belt
// sale, drone delivery, recycler) — a faraway seller shouldn't ring out as
// loud as one right next to you.
const SELL_SFX_RANGE = 9 * TILE_SIZE;

const player = {
  wx: (WORLD_COLS / 2) * TILE_SIZE,
  wy: 12 * TILE_SIZE,
  facing: 'down',
  walkPhase: 0,  // continuous stride angle — advances only while moving
  walkAmp: 0,    // 0..1, eases toward 1 while moving / 0 while idle, so steps fade out smoothly instead of snapping
  moving: false,
};

// Re-centers the player on the starter dock — call after buildWorld(), since
// STARTER_C/STARTER_R are only known once the map's been generated.
function resetPlayerSpawn() {
  player.wx = (STARTER_C + 1.5) * TILE_SIZE;
  player.wy = (STARTER_R + 1) * TILE_SIZE;
}

const cam = { x: 0, y: 0 };
let CANVAS_W = 1280, CANVAS_H = 720;

// Build mode — `active` lets you place/cancel even with the menu hidden;
// `menuOpen` only controls whether the DOM panel is shown.
const buildMode = {
  active: false,
  menuOpen: false,
  selectedId: B_BELT,
  beltDir: 0,   // index into BELT_DIRS — rotated with R before placing
  boxMode: false, // X toggles — drag a rectangle to bulk place/remove instead of painting tile-by-tile
};

// Per-block popup — opened by clicking a placed machine tile, or by pressing
// E near a Sorter/Crate (see openBlockPopup/closeBlockPopup in ui.js). `kind`
// selects which content renderBlockPopup shows: 'machine' | 'sorter' | 'crate'.
// Pinned at the screen position it was opened at rather than tracked live,
// since it's a quick in-and-out interaction.
const blockPopup = { open: false, kind: null, c: 0, r: 0, x: 0, y: 0 };

const KEYS = {};
window.addEventListener('keydown', e => {
  KEYS[e.key] = true;
  handleBuildKey(e);
});
window.addEventListener('keyup', e => { KEYS[e.key] = false; });

const PLACEABLE_IDS = [B_CONCRETE, B_FISHER, B_BELT, B_SPLITTER, B_SORTER, B_CRATE,
                       B_WASHER, B_SMOKER, B_ICER, B_STAMPER,
                       B_SELLER, B_RECYCLER, B_PACKER, B_SMART_ROUTER, B_TELEPORTER,
                       B_DRONE_FISHER, B_DRONE_DELIVERY];

const MENU_TAB_ORDER = ['build', 'upgrades', 'contracts', 'fishIndex', 'stats', 'controls', 'research', 'blueprints', 'leaderboard'];

function toggleBoxMode() {
  buildMode.boxMode = !buildMode.boxMode;
  boxDragStart = null;
  boxDragButton = null;
  queueToast(buildMode.boxMode ? 'Multi mode ON' : 'Multi mode OFF', '#7ec8e3');
}

function rotateBeltDir() {
  buildMode.beltDir = (buildMode.beltDir + 1) % BELT_DIRS.length;
}

function handleBuildKey(e) {
  if ((e.ctrlKey || e.metaKey) && !boxDragStart && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !boxDragStart && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key === 'c' || e.key === 'C') {
    toggleBlueprintSelect();
    return;
  }
  if (e.key === 'v' || e.key === 'V') {
    toggleBlueprintPaste();
    return;
  }
  if ((e.key === 'r' || e.key === 'R') && blueprint.pasting) {
    rotateBlueprintClipboard();
    return;
  }
  if (e.key === 'Escape' && !buildMode.active && blockPopup.open) {
    closeBlockPopup();
    return;
  }
  if (e.key === 'b' || e.key === 'B') {
    // First press enters build mode and opens the menu. While still active,
    // B just toggles the menu panel — placing stays usable with it closed.
    if (!buildMode.active) {
      buildMode.active = true;
      buildMode.menuOpen = true;
    } else {
      buildMode.menuOpen = !buildMode.menuOpen;
    }
    setBuildMenuOpen(buildMode.menuOpen);
    closeBlockPopup();
    return;
  }
  if (buildMode.menuOpen && e.key === 'Tab') {
    e.preventDefault();
    const cur = buildMenuEl.querySelector('.tab.active').dataset.tab;
    const idx = MENU_TAB_ORDER.indexOf(cur);
    switchMenuTab(MENU_TAB_ORDER[(idx + 1) % MENU_TAB_ORDER.length]);
    return;
  }
  if (buildMode.active && e.key === 'Escape') {
    // Single Escape cancels everything build-related at once — box mode,
    // any in-progress blueprint select/paste, and the rotation preview —
    // rather than requiring a second press to fully back out.
    buildMode.active = false;
    buildMode.menuOpen = false;
    buildMode.boxMode = false;
    setBuildMenuOpen(false);
    boxDragStart = null;
    boxDragButton = null;
    blueprint.selecting = false;
    blueprint.pasting = false;
    bpDragStart = null;
    blueprint.pasteRotation = 0;
    return;
  }
  if (!buildMode.active) return;

  if (e.key === 'x' || e.key === 'X') {
    toggleBoxMode();
  }
  if (e.key === 'q' || e.key === 'Q') {
    const idx = PLACEABLE_IDS.indexOf(buildMode.selectedId);
    buildMode.selectedId = PLACEABLE_IDS[(idx - 1 + PLACEABLE_IDS.length) % PLACEABLE_IDS.length];
  }
  if (e.key === 'e' || e.key === 'E') {
    const idx = PLACEABLE_IDS.indexOf(buildMode.selectedId);
    buildMode.selectedId = PLACEABLE_IDS[(idx + 1) % PLACEABLE_IDS.length];
  }
  // Number shortcuts
  const num = parseInt(e.key);
  if (num >= 1 && num <= PLACEABLE_IDS.length) {
    buildMode.selectedId = PLACEABLE_IDS[num - 1];
  }
  // R rotates the belt facing (clockwise through BELT_DIRS) before placing.
  if (e.key === 'r' || e.key === 'R') {
    rotateBeltDir();
  }
  refreshBuildPanel();
}

function updateCamera() {
  const vw = CANVAS_W / ZOOM, vh = CANVAS_H / ZOOM;
  const minX = 0, maxX = WORLD_COLS * TILE_SIZE - vw;
  const minY = 0, maxY = WORLD_ROWS * TILE_SIZE - vh;
  let camX = Math.max(minX, Math.min(player.wx - vw / 2, maxX));
  let camY = Math.max(minY, Math.min(player.wy - vh / 2, maxY));

  // Subtle handheld shake while walking, intensity scaling with how far past
  // the threshold we're zoomed — barely noticeable just past it, more at max zoom.
  const shaking = player.moving && ZOOM > SHAKE_ZOOM_THRESHOLD;
  if (shaking) {
    const intensity = Math.min(0.6, (ZOOM - SHAKE_ZOOM_THRESHOLD) * 0.25);
    // Re-clamp after adding shake so it can't push the camera past the world
    // edge near a border, where it would expose unrendered space.
    camX = Math.max(minX, Math.min(camX + Math.sin(game.time * 38) * intensity, maxX));
    camY = Math.max(minY, Math.min(camY + Math.cos(game.time * 31) * intensity, maxY));
  }

  // Skip integer rounding while shaking — sub-pixel motion is what makes a
  // "small vibration" actually readable instead of snapping between pixels.
  cam.x = shaking ? camX : Math.round(camX);
  cam.y = shaking ? camY : Math.round(camY);
}

function playerCanMoveTo(wx, wy) {
  const corners = [
    [wx - PLAYER_HALF, wy - PLAYER_HALF],
    [wx + PLAYER_HALF, wy - PLAYER_HALF],
    [wx - PLAYER_HALF, wy + PLAYER_HALF],
    [wx + PLAYER_HALF, wy + PLAYER_HALF],
  ];
  for (const [cx, cy] of corners) {
    const tc = Math.floor(cx / TILE_SIZE);
    const tr = Math.floor(cy / TILE_SIZE);
    const t  = tileAt(tc, tr);
    if (!tileWalkable(t)) return false;
    // Can't walk through machines/sellers, but belts and the shore Fisher dock
    // are walkable — the Drone Pad is solid equipment like any other machine.
    const b = blockAt(tc, tr);
    if (b !== B_NONE && !IS_TRANSPORT(b) && b !== B_FISHER) return false;
  }
  return true;
}

// Used by canPlaceBlock (grid.js) to stop solid equipment from being placed
// on top of the player.
function playerOccupiesTile(c, r) {
  const corners = [
    [player.wx - PLAYER_HALF, player.wy - PLAYER_HALF],
    [player.wx + PLAYER_HALF, player.wy - PLAYER_HALF],
    [player.wx - PLAYER_HALF, player.wy + PLAYER_HALF],
    [player.wx + PLAYER_HALF, player.wy + PLAYER_HALF],
  ];
  return corners.some(([cx, cy]) => Math.floor(cx / TILE_SIZE) === c && Math.floor(cy / TILE_SIZE) === r);
}

function updatePlayer(dt) {
  const dx = manualCast.active ? 0 : ((KEYS['d'] || KEYS['D'] || KEYS['ArrowRight']) ? 1 : 0) - ((KEYS['a'] || KEYS['A'] || KEYS['ArrowLeft'])  ? 1 : 0);
  const dy = manualCast.active ? 0 : ((KEYS['s'] || KEYS['S'] || KEYS['ArrowDown'])  ? 1 : 0) - ((KEYS['w'] || KEYS['W'] || KEYS['ArrowUp'])    ? 1 : 0);

  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const spd = PLAYER_SPEED * dt;
  let moved = false;

  if (dx !== 0 || dy !== 0) {
    const nx = player.wx + (dx / len) * spd;
    const ny = player.wy + (dy / len) * spd;
    if (playerCanMoveTo(nx, player.wy)) { player.wx = nx; moved = true; }
    if (playerCanMoveTo(player.wx, ny)) { player.wy = ny; moved = true; }

    if      (dx > 0) player.facing = 'right';
    else if (dx < 0) player.facing = 'left';
    else if (dy > 0) player.facing = 'down';
    else              player.facing = 'up';
  }

  player.moving = moved;
  if (moved && TUT.active && Math.hypot(player.wx - TUT.startWx, player.wy - TUT.startWy) > TILE_SIZE) {
    tutorialNotify('move');
  }
  if (moved) player.walkPhase += dt * (PLAYER_SPEED / 14);
  player.walkAmp += ((moved ? 1 : 0) - player.walkAmp) * Math.min(1, dt * 10);

  updateCamera();

  // E key — interacts with whatever block the mouse is hovering: opens its
  // popup (settings/upgrade), or drops held fish if hovering a belt. Popups
  // (including the per-instance upgrade buy) open from anywhere on the map,
  // no need to stand next to the block — only fish-dropping still requires
  // being in reach, since that's physically handing fish to a belt. Falls
  // back to a small player-radius search for fish-dropping only, so you
  // don't need pixel-precise aim just to unload.
  const eDown = !!(KEYS['e'] || KEYS['E']);
  if (eDown && !player._eWas && !buildMode.active) {
    const pc = Math.floor(player.wx / TILE_SIZE);
    const pr = Math.floor(player.wy / TILE_SIZE);
    const inReach = hoverTile && Math.abs(hoverTile.c - pc) <= 1 && Math.abs(hoverTile.r - pr) <= 1;
    const hoveredId = hoverTile ? blockAt(hoverTile.c, hoverTile.r) : B_NONE;
    const kind = interactionKindFor(hoveredId);
    if (kind) {
      toggleBlockPopupAtMouse(kind, hoverTile.c, hoverTile.r);
    } else if (inReach && IS_TRANSPORT(hoveredId) && heldFish.length > 0) {
      dropHeldFishOnBelt(hoverTile.c, hoverTile.r);
    } else if (heldFish.length > 0) {
      dropNearestBelt();
    }
  }
  player._eWas = eDown;
}

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

// Nearest belt tile in a small radius (for prompt)
function nearbyBeltTile() {
  return !!findNearbyBlock(IS_TRANSPORT);
}

// 3x3 radius search around the player's current tile for a block matching
// `pred(id)`; returns its { c, r } or null. Still used as the fish-drop
// fallback when E is pressed without precisely hovering a belt.
function findNearbyBlock(pred) {
  const pc = Math.floor(player.wx / TILE_SIZE);
  const pr = Math.floor(player.wy / TILE_SIZE);
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (pred(blockAt(pc + dc, pr + dr))) return { c: pc + dc, r: pr + dr };
  return null;
}

// ─── Mouse / click handling ──────────────────────────────────────────────────

let mouseCanvas = { x: 0, y: 0 };

function worldFromMouse(mx, my) {
  return {
    wx: cam.x + mx / ZOOM,
    wy: cam.y + my / ZOOM,
  };
}

function tileFromMouse(mx, my) {
  const w = worldFromMouse(mx, my);
  return {
    c: Math.floor(w.wx / TILE_SIZE),
    r: Math.floor(w.wy / TILE_SIZE),
  };
}

let isDragPlacing = false;
let lastPaintedTile = null;
let boxDragStart = null;  // { c, r } — set on mousedown while buildMode.boxMode is on
let boxDragButton = null; // 0 (place) or 2 (remove), mirrors the button that started the drag

// Hover-tooltip dwell tracking (D14) — reset whenever the hovered tile
// changes; render.js checks elapsed time against HOVER_TOOLTIP_DELAY.
let hoverTile = null;
let hoverStart = 0;

function handleMouseMove(e) {
  const rect = e.target.getBoundingClientRect();
  mouseCanvas.x = e.clientX - rect.left;
  mouseCanvas.y = e.clientY - rect.top;

  const { c, r } = tileFromMouse(mouseCanvas.x, mouseCanvas.y);
  if (!hoverTile || hoverTile.c !== c || hoverTile.r !== r) {
    hoverTile = { c, r };
    hoverStart = performance.now();
  }

  if (isDragPlacing) {
    paintBuildTile(c, r);
  }
}

// Drag-painting: place the selected block as the mouse passes over new tiles
// while held down, skipping already-occupied tiles silently (no toast spam)
// and stopping quietly once cash runs out.
function paintBuildTile(c, r) {
  if (!buildMode.active) return;
  if (lastPaintedTile && lastPaintedTile.c === c && lastPaintedTile.r === r) return;
  lastPaintedTile = { c, r };
  if (!canPlaceBlock(buildMode.selectedId, c, r, buildMode.beltDir)) return;
  if (game.cash < BLOCK_COSTS[buildMode.selectedId]) return;
  buyAndPlace(buildMode.selectedId, c, r, buildMode.beltDir);
}

function handleClick(e) {
  if (e.button !== 0 && e.button !== 2) return;
  const { c, r } = tileFromMouse(mouseCanvas.x, mouseCanvas.y);

  if (blueprint.selecting) {
    if (e.button === 0) bpDragStart = { c, r };
    return;
  }
  if (blueprint.pasting) {
    if (e.button === 0) pasteBlueprint(c, r);
    return;
  }

  if (!buildMode.active) {
    if (e.button === 0) {
      // Drop held fish on clicked belt
      if (heldFish.length > 0 && IS_TRANSPORT(blockAt(c, r))) {
        dropHeldFishOnBelt(c, r);
        return;
      }
      // Machines/sorter/crate/etc. now open via hover + E, not a direct
      // click — clicking elsewhere just dismisses an open popup, same as Escape
      closeBlockPopup();
      // Cast at water only (not shore), within rod range
      const t = tileAt(c, r);
      if (t === T_WATER && !manualCast.active && heldFish.length < effectiveMaxHeld()) {
        const tx = c * TILE_SIZE + TILE_SIZE / 2, ty = r * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - player.wx, dy = ty - player.wy;
        if (Math.hypot(dx, dy) <= FISHING_ROD_RANGE) {
          if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
          else                             player.facing = dy > 0 ? 'down'  : 'up';
          startManualCast(tx, ty);
        } else {
          queueToast('Too far to cast!', '#e85d4a');
          sfxFail();
        }
      }
    }
    return;
  }
  closeBlockPopup();

  if (buildMode.boxMode) {
    boxDragStart = { c, r };
    boxDragButton = e.button;
    return;
  }

  if (e.button === 0) {
    buyAndPlace(buildMode.selectedId, c, r, buildMode.beltDir);
    isDragPlacing = true;
    lastPaintedTile = { c, r };
  } else if (e.button === 2) {
    // Right-click removes whatever's on that tile; if nothing was there,
    // treat it as "cancel" and exit build mode entirely.
    const removed = sellAndRemove(c, r);
    if (!removed) {
      buildMode.active = false;
      buildMode.menuOpen = false;
      setBuildMenuOpen(false);
    }
  }
}

// Bulk-applies the box-mode drag over every tile in the rectangle between
// `start` and `end` — button 0 places (skipping occupied tiles and stopping
// quietly once cash runs out, same as paintBuildTile), button 2 sells/removes.
function applyBoxAction(start, end, button) {
  const c0 = Math.min(start.c, end.c), c1 = Math.max(start.c, end.c);
  const r0 = Math.min(start.r, end.r), r1 = Math.max(start.r, end.r);
  beginUndoBatch();
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (button === 0) {
        if (!canPlaceBlock(buildMode.selectedId, c, r, buildMode.beltDir)) continue;
        if (game.cash < BLOCK_COSTS[buildMode.selectedId]) break;
        buyAndPlace(buildMode.selectedId, c, r, buildMode.beltDir);
      } else if (button === 2) {
        sellAndRemove(c, r);
      }
    }
  }
  endUndoBatch();
}

function handleMouseUp(e) {
  if (bpDragStart && e.button === 0) {
    const end = tileFromMouse(mouseCanvas.x, mouseCanvas.y);
    captureBlueprint(bpDragStart, end);
    bpDragStart = null;
    blueprint.selecting = false;
  }
  if (boxDragStart && e.button === boxDragButton) {
    const end = tileFromMouse(mouseCanvas.x, mouseCanvas.y);
    applyBoxAction(boxDragStart, end, boxDragButton);
    boxDragStart = null;
    boxDragButton = null;
  }
  if (e.button === 0) {
    isDragPlacing = false;
    lastPaintedTile = null;
  }
}

function handleWheel(e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  ZOOM = Math.min(ZOOM_MAX, Math.max(minZoomForViewport(), ZOOM * factor));
}

function initMouseHandlers(canvas) {
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mousedown', handleClick);
  window.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', handleWheel, { passive: false });
}
