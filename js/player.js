// Fish INK Factory — player movement, camera, interaction

const PLAYER_SPEED = 120;
const BOAT_SPEED   = 150; // slightly faster than walking on land
const PLAYER_HALF  = 7;
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
  inBoat: false,          // true while player is sailing on water
  boatAngle: -Math.PI / 2, // current visual heading (smoothly animated)
  boatTargetAngle: -Math.PI / 2, // where the boat wants to face
};

// Re-centers the player on the starter dock — call after buildWorld(), since
// STARTER_C/STARTER_R are only known once the map's been generated.
function resetPlayerSpawn() {
  player.wx = (STARTER_C + 1.5) * TILE_SIZE;
  player.wy = (STARTER_R + 1) * TILE_SIZE;
}

const cam = { x: 0, y: 0 };
let CANVAS_W = 1280, CANVAS_H = 720;

// Pet placement mode — entered when player clicks Place from the Pets tab.
// While active the player clicks a water body or Tank tile to assign the pet.
const petPlaceMode = { active: false, uid: null };
let _placeCooldown = false; // one-frame guard prevents double-fire on touch

function enterPetPlaceMode(uid) {
  petPlaceMode.active = true;
  petPlaceMode.uid = uid;
  exitBuildMode();
}

function exitPetPlaceMode() {
  petPlaceMode.active = false;
  petPlaceMode.uid = null;
}

// Frog placement mode — entered when player clicks Place for a frog.
// While active the player clicks any land tile (T_EMPTY or T_SHORE, no block).
const frogPlaceMode = { active: false, uid: null };

function enterFrogPlaceMode(uid) {
  frogPlaceMode.active = true;
  frogPlaceMode.uid = uid;
  exitBuildMode();
}

function exitFrogPlaceMode() {
  frogPlaceMode.active = false;
  frogPlaceMode.uid = null;
}

// Build mode — `active` lets you place/cancel even with the menu hidden;
// `menuOpen` only controls whether the DOM panel is shown.
const buildMode = {
  active: false,
  menuOpen: false,
  selectedId: B_BELT,
  beltDir: 0,      // index into BELT_DIRS — rotated with R before placing
  boxMode: false,  // X toggles — drag a rectangle to bulk place/remove
  pendingMove: null, // { id, dir, level, config } set by movePickUpBlock(); free placement + state restore
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
window.addEventListener('keyup',  e => { KEYS[e.key] = false; });
window.addEventListener('blur',   () => { for (const k in KEYS) KEYS[k] = false; });

const PLACEABLE_IDS = [B_CONCRETE, B_FISHER, B_BELT, B_SPLITTER, B_SORTER, B_CRATE,
                       B_WASHER, B_SMOKER, B_ICER, B_STAMPER,
                       B_SELLER, B_RECYCLER, B_PACKER, B_SMART_ROUTER, B_TELEPORTER,
                       B_DRONE_FISHER, B_DRONE_DELIVERY, B_POND];

const MENU_TAB_ORDER = ['build', 'upgrades', 'fishIndex', 'stats', 'controls', 'research', 'prestige', 'pets'];

function toggleBoxMode() {
  buildMode.boxMode = !buildMode.boxMode;
  boxDragStart = null;
  boxDragButton = null;
  queueToast(buildMode.boxMode ? 'Multi mode ON' : 'Multi mode OFF', '#7ec8e3');
}

function rotateBeltDir() {
  buildMode.beltDir = (buildMode.beltDir + 1) % BELT_DIRS.length;
}

// Enters build mode on first call; exits it on second call.
// Shared by the B key and the mobile Build button.
function triggerBuildToggle() {
  if (!buildMode.active) {
    buildMode.active = true;
    buildMode.menuOpen = true;
    setBuildMenuOpen(true);
    closeBlockPopup();
    tutorialNotify('build_open');
    updateBuildHintUI();
  } else {
    exitBuildMode();
  }
}

// Cancels everything build-related at once — box mode, any in-progress
// blueprint select/paste, and the rotation preview — rather than requiring
// several separate steps to fully back out. Shared by the Escape key, the
// build menu's X button, and the mobile Exit button (which has no Escape
// key to fall back on).
function exitBuildMode() {
  // If player cancels a pending move, refund the full original cost
  if (buildMode.pendingMove) {
    game.cash += BLOCK_COSTS[buildMode.pendingMove.id] || 0;
    cashGuard.grant(BLOCK_COSTS[buildMode.pendingMove.id] || 0);
    queueToast('Move cancelled — refunded', '#e8a030');
    buildMode.pendingMove = null;
  }
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
  tutorialNotify('close_build');
  updateBuildHintUI();
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
  if (e.key === 'Escape' && typeof closeFrogPopup === 'function' && _frogPopupUid !== null) {
    closeFrogPopup();
    return;
  }
  if (e.key === 'Escape' && petPlaceMode.active) {
    exitPetPlaceMode();
    queueToast('Placement cancelled', '#9aa0a8');
    return;
  }
  if (e.key === 'Escape' && frogPlaceMode.active) {
    exitFrogPlaceMode();
    queueToast('Placement cancelled', '#9aa0a8');
    return;
  }
  if (e.key === 'Escape' && !buildMode.active && blockPopup.open) {
    closeBlockPopup();
    return;
  }
  if (e.key === 'b' || e.key === 'B') {
    triggerBuildToggle();
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
    exitBuildMode();
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
    if (player.inBoat) {
      // Boat travels on open water; T_SHORE lets the player glide to a beach
      if (t !== T_WATER && t !== T_SHORE) return false;
    } else {
      if (!tileWalkable(t)) return false;
      // Can't walk through machines/sellers, but belts and the shore Fisher
      // dock are walkable — the Drone Pad is solid equipment like any other.
      const b = blockAt(tc, tr);
      if (b !== B_NONE && !IS_TRANSPORT(b) && b !== B_FISHER) return false;
    }
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

// Interacts with whatever block hoverTile currently points at: opens its
// popup (settings/upgrade), or drops held fish if hovering a belt. Popups
// (including the per-instance upgrade buy) open from anywhere on the map,
// no need to stand next to the block — only fish-dropping still requires
// being in reach, since that's physically handing fish to a belt. Falls
// back to a small player-radius search for fish-dropping only, so you
// don't need pixel-precise aim just to unload. Shared by the E key and the
// mobile Interact button.
function triggerInteract(fromKey = false) {
  if (_placeCooldown) return;
  // Always dismiss open frog popup on any interact
  if (typeof closeFrogPopup === 'function') closeFrogPopup();
  const pc = Math.floor(player.wx / TILE_SIZE);
  const pr = Math.floor(player.wy / TILE_SIZE);
  const inReach = hoverTile && Math.abs(hoverTile.c - pc) <= 1 && Math.abs(hoverTile.r - pr) <= 1;
  const hoveredId = hoverTile ? blockAt(hoverTile.c, hoverTile.r) : B_NONE;
  const kind = interactionKindFor(hoveredId);
  const hoverTerrain = hoverTile ? tileAt(hoverTile.c, hoverTile.r) : null;

  // Frog placement mode — intercept all interactions until the player clicks/E-keys a valid land tile
  if (frogPlaceMode.active) {
    if (!hoverTile) return;
    const t = tileAt(hoverTile.c, hoverTile.r);
    if ((t === T_EMPTY || t === T_SHORE) && blockAt(hoverTile.c, hoverTile.r) === B_NONE) {
      const wx = hoverTile.c * TILE_SIZE + FROG_SIZE / 2;
      const wy = hoverTile.r * TILE_SIZE + FROG_SIZE / 2;
      placeFrogAt(frogPlaceMode.uid, wx, wy);
      queueToast('Frog placed!', '#4dca7c');
      exitFrogPlaceMode();
      _placeCooldown = true;
      requestAnimationFrame(() => { _placeCooldown = false; });
      if (typeof renderPetsPanel === 'function') renderPetsPanel();
    }
    return;
  }

  // Pet placement mode — intercept all interactions until the player clicks a valid spot
  if (petPlaceMode.active) {
    if (!hoverTile) return;
    if (hoveredId === B_POND) {
      if (!assignPetToPond(petPlaceMode.uid, hoverTile.c, hoverTile.r)) {
        queueToast('Pond is full!', '#e85d4a'); return;
      }
      queueToast('Axolotl placed in tank!', '#4dca7c');
      exitPetPlaceMode();
      _placeCooldown = true;
      requestAnimationFrame(() => { _placeCooldown = false; });
      if (typeof renderPetsPanel === 'function') renderPetsPanel();
    } else if (hoverTerrain === T_WATER) {
      const anchor = waterBodyAnchor(hoverTile.c, hoverTile.r);
      if (anchor) {
        if (!assignPetToWaterPond(petPlaceMode.uid, anchor)) {
          queueToast('Pond is full!', '#e85d4a'); return;
        }
        queueToast('Axolotl placed in natural pond!', '#4dca7c');
        exitPetPlaceMode();
        _placeCooldown = true;
        requestAnimationFrame(() => { _placeCooldown = false; });
        if (typeof renderPetsPanel === 'function') renderPetsPanel();
      }
    }
    return;
  }

  // Nearby frog — open interaction popup (Pick Up / Sell)
  if (game.frogs && game.frogs.length) {
    const FROG_REACH = TILE_SIZE * 2;
    const nearFrog = game.frogs.find(frog => {
      if (frog.wx === -9999) return false;
      const s = _frogStates[frog.uid];
      return s && Math.hypot(s.wx + FROG_SIZE / 2 - player.wx, s.wy + FROG_SIZE / 2 - player.wy) < FROG_REACH;
    });
    if (nearFrog) {
      openFrogPopup(nearFrog.uid);
      _placeCooldown = true;
      requestAnimationFrame(() => { _placeCooldown = false; });
      return;
    }
  }

  // Chest interaction — non-worker offshore islands have a chest at their center
  // Each island is gated by lifetime earnings; opening gives cash + permanent income bonus.
  const CHEST_EARN_GATES  = [5000, 25000, 100000];   // lifetime $ needed per island (index 0 = island 1)
  const CHEST_CASH_RANGES = [[200, 500], [600, 1500], [2000, 5000]]; // [min, max] cash per island
  const CHEST_INCOME_INC  = [0.005, 0.008, 0.012];   // income bonus per open per island
  const CHEST_INCOME_CAP  = 0.30;                     // total cap across all chests
  const CHEST_COOLDOWN    = 300;                      // 5 minutes between opens
  if (offshoreIslands.length > 1) {
    for (let i = 1; i < offshoreIslands.length; i++) {
      const isl = offshoreIslands[i];
      if (Math.hypot(pc - isl.cx, pr - isl.cy) < 3) {
        const idx = Math.min(i - 1, CHEST_EARN_GATES.length - 1);
        const gate = CHEST_EARN_GATES[idx];
        if ((game.lifetimeEarned || 0) < gate) {
          queueToast(`Chest locked — earn $${gate.toLocaleString()} lifetime to open`, '#9aa0a8');
          return;
        }
        const key = `${isl.cx},${isl.cy}`;
        if (!game.islandChests) game.islandChests = {};
        const chest = game.islandChests[key];
        if (!chest || game.time >= chest.nextOpen) {
          const [cMin, cMax] = CHEST_CASH_RANGES[idx];
          const reward = Math.floor(cMin + Math.random() * (cMax - cMin));
          awardCash(reward, `Chest! +$${reward.toLocaleString()}`, '#f0c030');
          if ((game.chestIncomeBonus || 0) < CHEST_INCOME_CAP) {
            const inc = CHEST_INCOME_INC[idx];
            game.chestIncomeBonus = Math.min(CHEST_INCOME_CAP, (game.chestIncomeBonus || 0) + inc);
            const pct = Math.round(game.chestIncomeBonus * 100);
            queueToast(`Income bonus now +${pct}%!`, '#f0c030');
          }
          game.islandChests[key] = { nextOpen: game.time + CHEST_COOLDOWN };
        } else {
          const secs = Math.ceil(chest.nextOpen - game.time);
          const min = Math.floor(secs / 60), sec = secs % 60;
          queueToast(`Chest refills in ${min > 0 ? `${min}m ` : ''}${sec}s`, '#9aa0a8');
        }
        return;
      }
    }
  }

  // Worker island interaction — first offshore island, press E near center
  if (offshoreIslands.length > 0 && !player.inBoat) {
    const wisl = offshoreIslands[0];
    if (Math.hypot(pc - wisl.cx, pr - wisl.cy) < 3) {
      toggleBlockPopupAtMouse('worker_dock', wisl.cx, wisl.cy);
      return;
    }
  }

  if (kind) {
    toggleBlockPopupAtMouse(kind, hoverTile.c, hoverTile.r);
  } else if (hoverTile && hoverTerrain === T_WATER && waterBodyAnchor(hoverTile.c, hoverTile.r)) {
    toggleBlockPopupAtMouse('water_pond', hoverTile.c, hoverTile.r);
  } else if (inReach && IS_TRANSPORT(hoveredId) && heldFish.length > 0) {
    dropHeldFishOnBelt(hoverTile.c, hoverTile.r);
  } else if (heldFish.length > 0) {
    dropNearestBelt();
  }
}

function updatePlayer(dt) {
  const kx = ((KEYS['d'] || KEYS['D'] || KEYS['ArrowRight']) ? 1 : 0) - ((KEYS['a'] || KEYS['A'] || KEYS['ArrowLeft'])  ? 1 : 0);
  const ky = ((KEYS['s'] || KEYS['S'] || KEYS['ArrowDown'])  ? 1 : 0) - ((KEYS['w'] || KEYS['W'] || KEYS['ArrowUp'])    ? 1 : 0);
  // On touch devices joystickVector carries movement instead of key state;
  // it stays {0,0} on desktop, so keyboard input always wins when present
  // and this is a no-op there.
  const dx = manualCast.active ? 0 : (kx !== 0 ? kx : joystickVector.x);
  const dy = manualCast.active ? 0 : (ky !== 0 ? ky : joystickVector.y);

  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const spd = (player.inBoat ? BOAT_SPEED : PLAYER_SPEED) * dt;
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
    if (player.inBoat) player.boatTargetAngle = Math.atan2(dy, dx);
  }

  // Smoothly rotate the boat's visual heading toward the target angle.
  // Takes the shortest arc so it never spins the long way around.
  if (player.inBoat) {
    let diff = player.boatTargetAngle - player.boatAngle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = 6 * dt; // radians/sec — full 360° spin takes ~1 s
    player.boatAngle += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
  }

  // If the player is already embedded in an impassable tile (e.g. slid into a
  // concave shore corner), push them out so they're never permanently frozen.
  if (!player.inBoat) {
    let pushX = 0, pushY = 0;
    const half = PLAYER_HALF;
    for (const [cx, cy] of [
      [player.wx - half, player.wy - half],
      [player.wx + half, player.wy - half],
      [player.wx - half, player.wy + half],
      [player.wx + half, player.wy + half],
    ]) {
      const tc = Math.floor(cx / TILE_SIZE), tr = Math.floor(cy / TILE_SIZE);
      if (!tileWalkable(tileAt(tc, tr))) {
        pushX += player.wx - (tc + 0.5) * TILE_SIZE;
        pushY += player.wy - (tr + 0.5) * TILE_SIZE;
      }
    }
    if (pushX !== 0 || pushY !== 0) {
      const pl = Math.sqrt(pushX * pushX + pushY * pushY) || 1;
      player.wx += (pushX / pl) * 2;
      player.wy += (pushY / pl) * 2;
    }
  }

  player.moving = moved;
  if (moved && TUT.active && Math.hypot(player.wx - TUT.startWx, player.wy - TUT.startWy) > TILE_SIZE) {
    tutorialNotify('move');
  }
  if (moved) player.walkPhase += dt * (PLAYER_SPEED / 14);
  player.walkAmp += ((moved ? 1 : 0) - player.walkAmp) * Math.min(1, dt * 10);

  updateCamera();

  // E key — first press: open popup or drop fish. While held: repeat fish-drop
  // at a fixed interval (hold-to-unload) without re-triggering popup opens.
  const eDown = !!(KEYS['e'] || KEYS['E']);
  if (!buildMode.active && !player.inBoat) {
    if (eDown && !player._eWas) {
      triggerInteract(true);
      player._eHoldAccum = 0;
    } else if (eDown && heldFish.length > 0) {
      player._eHoldAccum = (player._eHoldAccum || 0) + dt;
      while (player._eHoldAccum >= 0.18) {
        player._eHoldAccum -= 0.18;
        dropNearestBelt();
      }
    } else {
      player._eHoldAccum = 0;
    }
  }
  player._eWas = eDown;

  // F key — embark / disembark the boat. T_SHORE is the embarkation zone in
  // both directions: walk to the beach to board, sail back to beach to land.
  const fDown = !!(KEYS['f'] || KEYS['F']);
  if (!buildMode.active && fDown && !player._fWas) {
    const pc = Math.floor(player.wx / TILE_SIZE);
    const pr = Math.floor(player.wy / TILE_SIZE);
    const t  = tileAt(pc, pr);
    if (!player.inBoat) {
      if (t === T_SHORE) {
        player.inBoat = true;
        // Snap to tile center so all 4 corner probes land on T_SHORE, not the
        // adjacent inland tile — otherwise the boat collision check immediately
        // fails and the player can't move.
        player.wx = (pc + 0.5) * TILE_SIZE;
        player.wy = (pr + 0.5) * TILE_SIZE;
        queueToast('Boat — WASD to sail · F to land', '#7ec8e3');
      } else {
        queueToast('Walk to the beach (sandy edge) to board your boat', '#9aa0a8');
      }
    } else {
      // Are we near an offshore island at all?
      const nearIsland = offshoreIslands.find(isl =>
        Math.hypot(pc - isl.cx, pr - isl.cy) < 8
      );

      if (t === T_SHORE || tileWalkable(t)) {
        player.inBoat = false;
        // Snap to tile center so no corners hang over water after switching to
        // foot mode — tileWalkable(T_WATER) is false so a water corner freezes
        // the player.
        player.wx = (pc + 0.5) * TILE_SIZE;
        player.wy = (pr + 0.5) * TILE_SIZE;
        queueToast(nearIsland ? 'Landed on island' : 'Back on land', '#7ec8e3');
      } else {
        queueToast('Sail to shore to disembark', '#9aa0a8');
      }
    }
  }
  player._fWas = fDown;
}

// Which popup kind (if any) E should open for a hovered block id.
function interactionKindFor(id) {
  if (id === B_SORTER) return 'sorter';
  if (id === B_CRATE) return 'crate';
  if (id === B_RECYCLER) return 'recycler';
  if (id === B_PACKER) return 'packer';
  if (id === B_TELEPORTER) return 'teleporter';
  if (id === B_POND) return 'pond';
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

  // Pet placement mode — left click places the pet; right click cancels
  if (petPlaceMode.active) {
    if (e.button === 0) triggerInteract();
    else { exitPetPlaceMode(); queueToast('Placement cancelled', '#9aa0a8'); }
    return;
  }

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
      // Cast at water only (not shore), within rod range, not while boating
      const t = tileAt(c, r);
      if (t === T_WATER && !manualCast.active && !player.inBoat && heldFish.length < effectiveMaxHeld()) {
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
      } else if (t === T_WATER && !manualCast.active && !player.inBoat && heldFish.length >= effectiveMaxHeld()) {
        const msg = (typeof TUT !== 'undefined' && TUT.active)
          ? 'Inventory full! Walk to the Belt and press E (or click it) to drop your fish.'
          : 'Hands full! Drop fish on a Belt or Seller first.';
        queueToast(msg, '#e8a030');
        sfxFail();
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
      updateBuildHintUI();
    }
  }
}

// Bulk-applies the box-mode drag over every tile in the rectangle between
// `start` and `end` — button 0 places (skipping occupied tiles and stopping
// quietly once cash runs out, same as paintBuildTile), button 2 sells/removes.
function applyBoxAction(start, end, button) {
  const c0 = Math.min(start.c, end.c), c1 = Math.max(start.c, end.c);
  const r0 = Math.min(start.r, end.r), r1 = Math.max(start.r, end.r);
  let count = 0;
  beginUndoBatch();
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (button === 0) {
        if (!canPlaceBlock(buildMode.selectedId, c, r, buildMode.beltDir)) continue;
        if (game.cash < BLOCK_COSTS[buildMode.selectedId]) break;
        if (buyAndPlace(buildMode.selectedId, c, r, buildMode.beltDir, true)) count++;
      } else if (button === 2) {
        if (sellAndRemove(c, r, true)) count++;
      }
    }
  }
  endUndoBatch();
  // Per-tile placement already plays sfxPlace()/sfxCoin() — a box drag can
  // hit dozens of tiles in one mouseup, which would otherwise fire that
  // sound (and stack that many toasts) all in the same instant. One sound
  // and one summary toast for the whole drag instead.
  if (count > 0) {
    if (button === 0) { sfxPlace(); queueToast(`Placed ${count} block${count === 1 ? '' : 's'}`, '#7ec8e3'); }
    else { sfxCoin(); queueToast(`Sold ${count} block${count === 1 ? '' : 's'}`, '#e8a030'); }
  }
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
