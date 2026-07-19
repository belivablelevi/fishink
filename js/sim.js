// Fish INK Factory — simulation engine

const game = {
  cash: prestigeStartCash(),
  lifetimeEarned: 0,
  fishSold: 0,
  rareCatches: 0,
  blocksPlaced: 0,
  maxMachineLevel: 0,
  time: 0,
  dayTime: 0,
  fishIndex: new Set(), // species names ever caught — backs the Fish Index tab
  fishIndexBonuses: new Set(), // categories already paid out for full discovery
  unlockedAchievements: new Set(),
  tutorialDone: false,
  upgradeTipDone: false,
  automationTutorialDone: false,
  pets: [],          // owned axolotl pets [{uid, variant}]
  petNextUid: 1,
  petPullsTotal: 0,
  waterPonds: {},    // natural water body pet assignments: { "anchorKey": [uid,...] }
  petAutoSell: { common: false, uncommon: false, rare: false, legendary: false },
  frogs: [],         // owned frog pets [{uid, variant, wx, wy}]
  frogNextUid: 1,
  workers: [],         // hired workers [{uid, state, wx, wy, targetWx, targetWy, fish:[], timer}]
  workerNextUid: 1,
  islandChests: {},    // chest state keyed by "cx,cy": { nextOpen: gameTime }
  chestIncomeBonus: 0, // permanent income multiplier accumulated from chest opens (0–0.30)
  islandLevel: 0,      // number of ring expansions purchased
};

const fisherTimers = {};
const manualCast = { active: false, timer: 0, duration: 0, wx: 0, wy: 0 };
const toasts = [];

// Screen-edge flash intensity when a rare/legendary fish is caught (0–1)
let rareFlashIntensity = 0;

// Lifetime-earn milestones — celebrated once per session with a gold toast
const CASH_MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 5000000];
const _celebratedMilestones = new Set();

// Floating catch labels that rise above the catch point and fade out
const floatTexts = [];
const FLOAT_TEXT_SPEED = 55; // world-pixels per second, rising
const FLOAT_TEXT_LIFE  = 2.0;
function spawnFloatText(text, wx, wy, color) {
  floatTexts.push({ text, wx, wy, life: FLOAT_TEXT_LIFE, color: color || '#4dca7c' });
}


function queueToast(msg, color) {
  toasts.push({ msg, color: color || '#4dca7c', life: 2.2 });
}

// Merges rapid repeats of the same event type into one updating toast instead
// of stacking a new line per occurrence — a busy recycler or seller can fire
// several times a second, which used to flood the toast stack off-screen.
// Rarer one-off messages (combos, rare catches, errors) skip this and go
// through queueToast directly so they stay visible as their own line.
function queueCoalescedToast(key, label, amount, color) {
  const existing = toasts.find(t => t.key === key && t.life > 0);
  if (existing) {
    existing.count++;
    existing.total += amount;
    existing.msg = `${label} ×${existing.count}  ${existing.total >= 0 ? '+' : '-'}$${Math.abs(existing.total).toFixed(2)}`;
    existing.life = 2.2;
    return;
  }
  toasts.push({ key, count: 1, total: amount, msg: `${label}  ${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toFixed(2)}`, color: color || '#4dca7c', life: 2.2 });
}

// Single place that actually pays the player — every cash reward (sales,
// recycling, Fish Index bonuses) routes through this so the bookkeeping
// (cash, lifetimeEarned, toast, sfx) can't drift between call sites.
function awardCash(amount, msg, color, volMult = 1) {
  game.cash          += amount;
  game.lifetimeEarned += amount;
  cashGuard.grant(amount);
  if (msg) queueToast(msg, color);
  sfxCoin(volMult);
  checkCashMilestones();
}

function checkCashMilestones() {
  for (const m of CASH_MILESTONES) {
    if (!_celebratedMilestones.has(m) && game.lifetimeEarned >= m) {
      _celebratedMilestones.add(m);
      const label = m >= 1000000 ? `$${(m/1000000).toFixed(0)}M` : m >= 1000 ? `$${(m/1000).toFixed(0)}K` : `$${m}`;
      toasts.push({ msg: `Milestone: ${label} earned!`, color: '#f0c419', life: 3.5, type: 'milestone' });
      sfxUpgrade();
    }
  }
}

// 1 right on top of the tile, fading linearly to 0 at `range` tiles-worth of
// distance away — shared by machine chimes and sell sounds so both fade the
// same way. c/r null (no tile, e.g. UI actions) always plays at full volume.
function distanceVolMult(c, r, range) {
  if (c == null || r == null) return 1;
  const dist = Math.hypot((c + 0.5) * TILE_SIZE - player.wx, (r + 0.5) * TILE_SIZE - player.wy);
  return Math.max(0, 1 - dist / range);
}

// ─── Belt speed ───────────────────────────────────────────────────────────────
const BELT_SPEED = 2.2; // tiles per second; fish take ~0.45s per tile

// individualSellToasts is on by default for early-game feedback, but auto-
// stops once this many fish have been sold (matches the Drone Delivery
// unlock threshold — by then sales are frequent enough to flood the stack).
const INDIVIDUAL_SELL_TOAST_LIMIT = 300;

// Reward for routing a fish through several *different* machine types before
// selling — each distinct step beyond the first adds this much multiplier, so
// diversifying a line is always worth more than running everything through
// one machine twice (duplicates collapse via the Set in comboMultFor).
const COMBO_BONUS_PER_STEP = 0.3;

function comboMultFor(fish) {
  const distinctSteps = new Set(fish.mults).size;
  return { distinctSteps, mult: 1 + Math.max(0, distinctSteps - 1) * COMBO_BONUS_PER_STEP };
}

// ─── Worker island ────────────────────────────────────────────────────────────

const WORKER_SPEED       = TILE_SIZE * 3.5; // world-px per second while rowing
const WORKER_WALK_SPEED  = TILE_SIZE * 1.8; // world-px per second while wandering
const WORKER_FISH_TIME   = 18;              // seconds spent fishing per trip
const WORKER_IDLE_TIME   = 10;             // seconds idle between trips
const WORKER_MAX         = 5;

// Non-persisted walk state per worker uid — cleared on departure, rebuilt on tick.
const _workerWalkCache = new Map();

function _randomIslandTile(isl) {
  const candidates = [];
  const islC = Math.floor(isl.cx), islR = Math.floor(isl.cy);
  for (let dc = -7; dc <= 7; dc++) {
    for (let dr = -7; dr <= 7; dr++) {
      const c = islC + dc, r = islR + dr;
      if (c >= 0 && c < WORLD_COLS && r >= 0 && r < WORLD_ROWS) {
        if (_isLand(tileAt(c, r))) candidates.push({ c, r });
      }
    }
  }
  if (!candidates.length) return null;
  const t = candidates[Math.floor(Math.random() * candidates.length)];
  return { wx: (t.c + 0.5) * TILE_SIZE, wy: (t.r + 0.5) * TILE_SIZE };
}

function _getWorkerWalk(w, isl) {
  if (!_workerWalkCache.has(w.uid)) {
    const tile = _randomIslandTile(isl) || { wx: w.wx, wy: w.wy };
    _workerWalkCache.set(w.uid, {
      targetWx: tile.wx, targetWy: tile.wy,
      walkTimer: Math.random() * 1.2,
      walkPhase: Math.random(),
      facing: 1,
    });
  }
  return _workerWalkCache.get(w.uid);
}

function workerHireCost() {
  return (game.workers.length + 1) * 500;
}

function hireWorker() {
  if (game.workers.length >= WORKER_MAX) {
    queueToast('Max 5 workers!', '#e85d4a'); return;
  }
  const cost = workerHireCost();
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); return; }
  const isl = offshoreIslands[0];
  if (!isl) return;
  game.cash -= cost;
  game.workers.push({
    uid: game.workerNextUid++,
    state: 'idle',
    wx: (isl.cx + 0.5) * TILE_SIZE,
    wy: (isl.cy + 0.5) * TILE_SIZE,
    targetWx: 0, targetWy: 0,
    fish: [],
    timer: 5,
  });
  queueToast(`Worker hired! (${game.workers.length}/${WORKER_MAX})`, '#4dca7c');
  if (typeof renderBlockPopup === 'function' && blockPopup && blockPopup.open && blockPopup.kind === 'worker_dock') {
    renderBlockPopup();
  }
}

function simUpdateWorkers(dt) {
  if (!game.workers || !game.workers.length) return;
  const isl = offshoreIslands[0];
  if (!isl) return;
  const dockWx = (isl.cx + 0.5) * TILE_SIZE;
  const dockWy = (isl.cy + 0.5) * TILE_SIZE;

  for (const w of game.workers) {
    if (!w.fish) w.fish = []; // migrate old saves

    if (w.state === 'idle') {
      w.timer -= dt;

      // On-island wandering during idle wait
      const ws = _getWorkerWalk(w, isl);
      if (ws.walkTimer > 0) {
        ws.walkTimer -= dt;
        // Standing still — keep walkPhase frozen so legs don't cycle
      } else {
        const dx = ws.targetWx - w.wx;
        const dy = ws.targetWy - w.wy;
        const dist = Math.hypot(dx, dy);
        if (dist < 3) {
          // Reached target — pick a new random island tile and pause briefly
          const tile = _randomIslandTile(isl);
          if (tile) { ws.targetWx = tile.wx; ws.targetWy = tile.wy; }
          ws.walkTimer = 0.4 + Math.random() * 1.4;
        } else {
          const speed = WORKER_WALK_SPEED * dt;
          w.wx += (dx / dist) * Math.min(speed, dist);
          w.wy += (dy / dist) * Math.min(speed, dist);
          ws.facing  = dx < 0 ? -1 : 1;
          ws.walkPhase = (ws.walkPhase + dt * 4) % 1;
        }
      }

      if (w.timer > 0) continue;

      // Depart on a fishing trip — snap back to dock so the boat starts there
      const candidates = [];
      const islC = Math.floor(isl.cx), islR = Math.floor(isl.cy);
      for (let dc = -12; dc <= 12; dc++) {
        for (let dr = -12; dr <= 12; dr++) {
          const c = islC + dc;
          const r = islR + dr;
          if (c >= 0 && c < WORLD_COLS && r >= 0 && r < WORLD_ROWS &&
              tileAt(c, r) === T_WATER) {
            candidates.push({ c, r });
          }
        }
      }
      if (!candidates.length) { w.timer = WORKER_IDLE_TIME; continue; }
      const t = candidates[Math.floor(Math.random() * candidates.length)];
      w.targetWx = (t.c + 0.5) * TILE_SIZE;
      w.targetWy = (t.r + 0.5) * TILE_SIZE;
      w.wx = dockWx;
      w.wy = dockWy;
      w.fish = [];
      _workerWalkCache.delete(w.uid); // fresh walk state on return
      w.state = 'outbound';

    } else if (w.state === 'outbound' || w.state === 'inbound') {
      const dx = w.targetWx - w.wx;
      const dy = w.targetWy - w.wy;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        w.wx = w.targetWx;
        w.wy = w.targetWy;
        if (w.state === 'outbound') {
          w.state = 'fishing';
          w.timer = WORKER_FISH_TIME;
        } else {
          // Arrived at dock — deposit caught fish into the depot block
          const depotC = isl.depotC ?? Math.floor(isl.cx);
          const depotR = isl.depotR ?? Math.floor(isl.cy);
          const depotSt = stateAt(depotC, depotR);
          let deposited = 0;
          for (const f of w.fish) {
            if (depotSt.carrying.length < DEPOT_CAPACITY) { depotSt.carrying.push(f); deposited++; }
          }
          if (deposited) spawnFloatText(`+${deposited} fish`, w.wx, w.wy - 10, '#4dca7c');
          w.fish = [];
          w.state = 'idle';
          w.timer = WORKER_IDLE_TIME;
          w.wx = dockWx;
          w.wy = dockWy;
          _workerWalkCache.delete(w.uid); // start wandering from dock
        }
      } else {
        const speed = WORKER_SPEED * dt;
        w.wx += (dx / dist) * Math.min(speed, dist);
        w.wy += (dy / dist) * Math.min(speed, dist);
      }

    } else if (w.state === 'fishing') {
      w.timer -= dt;
      if (w.timer <= 0) {
        // Roll 1-3 fish when fishing completes
        const count = 1 + Math.floor(Math.random() * 3);
        w.fish = [];
        for (let i = 0; i < count; i++) {
          const f = randomFish(effectiveGlobalLuckMult());
          if (f.category === 'Rare' || f.category === 'Epic' || f.category === 'Legendary') game.rareCatches++;
          w.fish.push(f);
        }
        w.state = 'inbound';
        w.targetWx = dockWx;
        w.targetWy = dockWy;
      }
    }
  }
}

// ─── Main update ─────────────────────────────────────────────────────────────

let machineAccum = 0;
const MACHINE_STEP = 0.08;

const AUTOSAVE_INTERVAL = 30;
let saveAccum = 0;

function simUpdate(dt) {
  game.time   += dt;
  game.dayTime = game.time % DAY_CYCLE_SECONDS;

  checkAchievements();
  maybeShowUpgradeTip();
  tickParticles(dt);
  simUpdateWorkers(dt);
  if (typeof updateMusicForTimeOfDay === 'function') {
    updateMusicForTimeOfDay(game.dayTime / DAY_CYCLE_SECONDS, dt);
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].life -= dt;
    floatTexts[i].wy   -= dt * FLOAT_TEXT_SPEED;
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }

  saveAccum += dt;
  const cheated = saveAccum >= AUTOSAVE_INTERVAL ? cashGuard.check() : false;
  if (saveAccum >= AUTOSAVE_INTERVAL) {
    saveAccum = 0;
    saveGame();
    if (!cheated) submitLeaderboardScore();
  }

  // Also push score whenever lifetime earnings cross a new $10k milestone.
  if (!cheated) checkLeaderboardEarnThreshold();


  // Manual cast countdown
  if (manualCast.active) {
    manualCast.timer -= dt;
    if (manualCast.timer <= 0) completeCast();
  }

  // Auto-fisher timers
  for (const key in fisherTimers) {
    fisherTimers[key] -= dt;
    if (fisherTimers[key] <= 0) {
      const [c, r] = key.split(',').map(Number);
      tryFisherProduce(c, r);
    }
  }

  // Fishing Drones (continuous flight state machine)
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (blockAt(c, r) === B_DRONE_FISHER) tickDroneFisher(c, r, dt);
    }
  }

  // Machine processing timers (continuous)
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      const id = blockAt(c, r);
      if (!IS_MACHINE(id)) continue;
      const st = stateAt(c, r);
      if (st.bypassFlash > 0) st.bypassFlash = Math.max(0, st.bypassFlash - dt);
      if (!st.processing) continue;
      st.timer -= dt;
      if (st.timer <= 0) {
        st.processing = false;
        if (st.inputItem) {
          const def      = machineDef(id);
          const good     = def.goodFor.includes(st.inputItem.category);
          const baseMult = good ? def.goodMult : def.badMult;
          const mult     = baseMult * machineValueMult(st.level || 0);
          st.inputItem.value = Math.round(st.inputItem.value * mult * 10) / 10;
          st.inputItem.mults.push(def.label);
          st.item      = st.inputItem;
          st.inputItem = null;
          const sfx = sfxForMachine(id);
          if (sfx && ZOOM > MACHINE_SFX_ZOOM_THRESHOLD) {
            const volMult = distanceVolMult(c, r, MACHINE_SFX_RANGE);
            if (volMult > 0) sfx(volMult);
          }
        }
      }
    }
  }

  // Continuous belt movement
  updateBeltFish(dt);

  tickDeliveryFlights(dt);

  // Packer processing timers (continuous, mirrors the IS_MACHINE loop above)
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (!IS_PACKER(blockAt(c, r))) continue;
      const st = stateAt(c, r);
      if (!st.processing) continue;
      st.timer -= dt;
      if (st.timer <= 0) {
        st.processing = false;
        const bundleValue = st.carrying.reduce((s, f) => s + f.value, 0) * 1.5 * machineValueMult(st.level || 0);
        st.item = { species: `${st.carrying.length}-Fish Bundle`, category: 'Bundle', size: 'Bundle',
                    value: Math.round(bundleValue * 10) / 10, color: '#e8a030', sx: 0, sy: 0,
                    mults: ['Washer', 'Icer', 'Smoker', 'Stamper'],
                    wigglePhase: 0, isBundle: true, count: st.carrying.length };
        st.carrying = [];
        stateAt(c, r).flashAnim = game.time + 0.5;
      }
    }
  }

  // Machine output hand-off (discrete, fast tick)
  machineAccum += dt;
  while (machineAccum >= MACHINE_STEP) {
    machineAccum -= MACHINE_STEP;
    tickMachineOutput();
  }
}

// ─── Belt movement (continuous, progress-based) ───────────────────────────────

function nextCellFor(c, r, id, st, fish) {
  let dirIdx = st.dir;
  if (id === B_SPLITTER) {
    // Outputs are the two sides perpendicular to the direction the fish
    // actually arrived from (st.inDir, set in transferItem) — not st.dir,
    // the block's placement rotation. Using st.dir here would only avoid
    // routing a fish straight back into whatever feeds the Splitter when
    // st.dir happens to be rotated to face directly away from that feed;
    // any other rotation lets one of the two outputs point right back at
    // the input belt. Basing it on actual incoming travel direction makes
    // the Splitter correct regardless of how it's rotated.
    const forward = st.inDir !== undefined ? st.inDir : st.dir;
    dirIdx = st.altOut ? (forward + 3) % 4 : (forward + 1) % 4;
  } else if (id === B_SORTER) {
    const matches = st.sortMode === 'rarity' ? fish.category === st.sortCategory : isBigFish(fish, st.sortThreshold);
    dirIdx = matches ? st.dir : (st.dir + 2) % 4;
  } else if (id === B_SMART_ROUTER) {
    // Decide the output side once, the instant this exact fish lands on the
    // tile, and stick with it for the whole ride — re-checking every frame
    // would let the fish visibly flip-flop sides mid-transit if a downstream
    // jam clears (or reappears) while it's still riding across this cell.
    if (st.routeLockedFor !== fish) {
      st.routeLockedFor = fish;
      st.routeDir = st.dir;
      for (const cand of [st.dir, (st.dir + 1) % 4, (st.dir + 3) % 4]) {
        const d = BELT_DIRS[cand];
        if (cellAcceptsItem(c + d.dx, r + d.dy, blockAt(c + d.dx, r + d.dy))) { st.routeDir = cand; break; }
      }
      st.routeSetAt = game.time;
    }
    dirIdx = st.routeDir;
  }
  const dir = BELT_DIRS[dirIdx];
  return { nc: c + dir.dx, nr: r + dir.dy };
}

function updateBeltFish(dt) {
  // Two sweeps so fish already-at-edge don't stall for a frame. Cells are
  // bucketed by each fish's actual current exit direction (not the block's
  // facing/st.dir) — Splitter and Sorter can send a fish out a side that
  // differs from st.dir, and grouping by facing instead of actual movement
  // let a Splitter's perpendicular output land in the wrong sweep, racing
  // the belt it just fed into and visibly snapping the fish backward.
  const positive = [];
  const negative = [];
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      const id = blockAt(c, r);
      if (!IS_TRANSPORT(id)) continue;
      const st = stateAt(c, r);
      if (!st.item) continue;
      const { nc, nr } = nextCellFor(c, r, id, st, st.item);
      (nc < c || nr < r ? negative : positive).push({ c, r, nc, nr });
    }
  }
  // Sweep A: right/down movers — scan from output end (bottom-right)
  positive.sort((a, b) => (b.r - a.r) || (b.c - a.c));
  for (const cell of positive) stepBeltCell(cell, dt);
  // Sweep B: left/up movers — scan from output end (top-left)
  negative.sort((a, b) => (a.r - b.r) || (a.c - b.c));
  for (const cell of negative) stepBeltCell(cell, dt);
}

function stepBeltCell(cell, dt) {
  const { c, r, nc, nr } = cell;
  const id = blockAt(c, r);
  const st = stateAt(c, r);
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
    if (ZOOM > MACHINE_SFX_ZOOM_THRESHOLD) {
      const volMult = distanceVolMult(c, r, SELL_SFX_RANGE);
      if (volMult > 0) sfxTeleport(volMult);
    }
    return;
  }

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

function cellAcceptsItem(nc, nr, nb) {
  // A belt with nothing past it has nowhere to put the item — queue it at the
  // edge like any other blocked hand-off, instead of silently destroying it.
  if (nb === B_NONE)           return false;
  if (nb === B_SELLER)         return true;
  if (nb === B_DRONE_DELIVERY) return true;
  if (nb === B_CRATE)          return stateAt(nc, nr).carrying.length < CRATE_CAPACITY;
  if (IS_TRANSPORT(nb))        return !stateAt(nc, nr).item;
  if (IS_MACHINE(nb))          { const s = stateAt(nc, nr); return !s.inputItem && !s.processing && !s.item; }
  if (IS_PACKER(nb))           { const s = stateAt(nc, nr); return s.carrying.length < s.packTarget && !s.processing && !s.item; }
  return false;
}

function transferItem(c, r, st, nc, nr, nb) {
  if (nb === B_SELLER) {
    // Clear the slot before selling — if sellFish ever throws partway through,
    // the source slot must not be left pointing at a fish that gets sold again
    // on the next tick.
    const fish = st.item;
    st.item = null;
    sellFish(fish, nc, nr);
    return;
  }
  if (nb === B_DRONE_DELIVERY) {
    const fish = st.item;
    st.item = null;
    droneSellFish(fish, nc, nr);
    return;
  }
  if (nb === B_CRATE) {
    stateAt(nc, nr).carrying.push(st.item);
    st.item = null;
    return;
  }
  if (IS_TRANSPORT(nb)) {
    const nst = stateAt(nc, nr);
    if (!nst.item) {
      nst.item = st.item;
      st.item = null;
      nst.inDir = BELT_DIRS.findIndex(d => d.dx === nc - c && d.dy === nr - r);
    }
    return;
  }
  if (IS_MACHINE(nb)) {
    const nst = stateAt(nc, nr);
    if (!nst.inputItem && !nst.processing && !nst.item) {
      const def = machineDef(nb);
      if (st.item.mults && st.item.mults.includes(def.label)) {
        // Already processed by this machine type — pass through and flash red
        nst.bypassFlash = 0.45;
        nst.item = st.item;
        st.item  = null;
      } else {
        nst.inputItem  = st.item;
        nst.processing = true;
        nst.timer      = def.processTime * machineSpeedMult(nst.level || 0);
        st.item        = null;
      }
    }
    return;
  }
  if (IS_PACKER(nb)) {
    const nst = stateAt(nc, nr);
    if (nst.carrying.length < nst.packTarget && !nst.processing && !nst.item) {
      nst.carrying.push(st.item);
      st.item = null;
      if (nst.carrying.length >= nst.packTarget) {
        nst.processing = true;
        nst.timer = 1.0 * machineSpeedMult(nst.level || 0);
      }
    }
  }
}

function sellFish(fish, c, r) {
  const { distinctSteps, mult: comboMult } = comboMultFor(fish);
  const earned = Math.round(fish.value * effectiveSellMult() * researchSellMult() * comboMult * 10) / 10;
  game.fishSold += fish.count || 1;
  game.cash          += earned;
  game.lifetimeEarned += earned;
  cashGuard.grant(earned);
  sfxCoin(distanceVolMult(c, r, SELL_SFX_RANGE));
  // Combos are notable enough to call out on their own line; plain sells
  // coalesce so a fast seller doesn't flood the stack. individualSellToasts
  // defaults on so early sales feel concrete, but it self-disables past
  // INDIVIDUAL_SELL_TOAST_LIMIT once the flood of sales would just spam the
  // toast stack.
  if (distinctSteps >= 2 || (settings.individualSellToasts && game.fishSold <= INDIVIDUAL_SELL_TOAST_LIMIT)) {
    const msg = distinctSteps >= 2 ? `+$${earned.toFixed(1)} ${fish.species} (combo x${distinctSteps}!)`
                                    : `+$${earned.toFixed(1)} ${fish.species}`;
    queueToast(msg, distinctSteps >= 2 ? '#e8c43f' : '#4dca7c');
  } else {
    queueCoalescedToast('sold', 'Sold', earned, '#4dca7c');
  }
  if (c != null) stateAt(c, r).flashAnim = game.time + 0.5;
  tutorialNotify('sell');
}

const RECYCLE_FLAT_PAYOUT = 0.75;

function recycleFish(fish, c, r) {
  const payout = RECYCLE_FLAT_PAYOUT * machineValueMult(stateAt(c, r).level || 0);
  game.fishSold += fish.count || 1;
  game.cash          += payout;
  game.lifetimeEarned += payout;
  cashGuard.grant(payout);
  queueCoalescedToast('recycled', 'Recycled', payout, '#9aa0a8');
  sfxCoin(distanceVolMult(c, r, SELL_SFX_RANGE));
  stateAt(c, r).flashAnim = game.time + 0.5;
}

function droneSellFish(fish, c, r) {
  const { distinctSteps, mult: comboMult } = comboMultFor(fish);
  const levelBonus = machineValueMult(stateAt(c, r).level || 0);
  const earned = Math.round(fish.value * effectiveSellMult() * researchSellMult() * comboMult * effectiveDroneDeliveryBonus() * levelBonus * 10) / 10;
  game.fishSold += fish.count || 1;
  game.cash          += earned;
  game.lifetimeEarned += earned;
  cashGuard.grant(earned);
  sfxCoin(distanceVolMult(c, r, SELL_SFX_RANGE));
  // Same flood guard as sellFish: a wall of delivery drones can sell several
  // times a second, so only combos get their own line.
  if (distinctSteps >= 2 || (settings.individualSellToasts && game.fishSold <= INDIVIDUAL_SELL_TOAST_LIMIT)) {
    const msg = `+$${earned.toFixed(1)} ${fish.species} (drone${distinctSteps >= 2 ? ` combo x${distinctSteps}` : ''})`;
    queueToast(msg, distinctSteps >= 2 ? '#e8c43f' : '#5ad0e8');
  } else {
    queueCoalescedToast('droneSold', 'Drone sold', earned, '#5ad0e8');
  }
  stateAt(c, r).flashAnim = game.time + 0.5;
  spawnDeliveryFlight(c, r);
}

// ─── Delivery flights (purely cosmetic — payout already happened above) ───────
// A Drone Delivery sale is instant for gameplay purposes; this just launches a
// little drone sprite from the station to the shipping boat so the sale reads
// as "sent somewhere" instead of vanishing in place.
const deliveryFlights = [];
const MAX_CONCURRENT_DELIVERY_FLIGHTS = 24;

function spawnDeliveryFlight(c, r) {
  if (deliveryFlights.length >= MAX_CONCURRENT_DELIVERY_FLIGHTS) return; // cosmetic only, sale already applied
  const dist = Math.hypot(BOAT_C - c, BOAT_R - r);
  // Random perpendicular offset (applied in render.js) so a burst of flights
  // from the same station fans out into a loose swarm instead of stacking
  // directly on top of one another along the same line to the boat.
  const offset = (Math.random() - 0.5) * 70;
  deliveryFlights.push({ fromC: c, fromR: r, t: 0, dur: Math.max(0.3, dist / DELIVERY_FLIGHT_SPEED), offset });
}

function tickDeliveryFlights(dt) {
  for (let i = deliveryFlights.length - 1; i >= 0; i--) {
    const f = deliveryFlights[i];
    f.t += dt / f.dur;
    if (f.t >= 1) deliveryFlights.splice(i, 1);
  }
}

// ─── Machine output push ──────────────────────────────────────────────────────

// A belt only counts as a real output path if it actually carries the item
// away — otherwise a belt feeding straight into a crate/machine gets handed
// the item right back the instant it empties, which just bounces the fish
// between the two tiles forever (looked like the fish freezing/glitching).
function transportLeadsAwayFrom(nc, nr, c, r) {
  const dir = BELT_DIRS[stateAt(nc, nr).dir || 0];
  return nc + dir.dx !== c || nr + dir.dy !== r;
}

function tickMachineOutput() {
  const dirs = [{dc:1,dr:0},{dc:0,dr:1},{dc:-1,dr:0},{dc:0,dr:-1}];
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      const id = blockAt(c, r);
      if (!IS_MACHINE(id) && !IS_CRATE(id) && !IS_PACKER(id)) continue;
      const st = stateAt(c, r);
      const outItem = IS_CRATE(id) ? st.carrying[0] : st.item;
      if (!outItem || st.processing) continue;
      // Try to push to an adjacent belt (Splitter/Sorter/Recycler included), seller,
      // drone-delivery, or crate
      for (const {dc, dr} of dirs) {
        const nc = c + dc, nr = r + dr;
        const nb = blockAt(nc, nr);
        const isSell = nb === B_SELLER || nb === B_DRONE_DELIVERY;
        let pushed = false;
        // For sales, clear the source slot BEFORE calling sellFish/droneSellFish —
        // if the sell call ever threw partway through, leaving the slot filled
        // would let the same fish get pushed and sold again next tick.
        if (isSell) { if (IS_CRATE(id)) st.carrying.shift(); else st.item = null; }
        if (IS_TRANSPORT(nb) && !stateAt(nc, nr).item && transportLeadsAwayFrom(nc, nr, c, r)) {
          stateAt(nc, nr).item = outItem; pushed = true;
        } else if (nb === B_SELLER) { sellFish(outItem, nc, nr); pushed = true; }
        else if (nb === B_DRONE_DELIVERY) { droneSellFish(outItem, nc, nr); pushed = true; }
        else if (nb === B_CRATE && stateAt(nc, nr).carrying.length < CRATE_CAPACITY) {
          stateAt(nc, nr).carrying.push(outItem); pushed = true;
        }
        if (pushed) {
          if (!isSell) { if (IS_CRATE(id)) st.carrying.shift(); else st.item = null; }
          break;
        }
      }
    }
  }
}

// ─── Auto-fisher ─────────────────────────────────────────────────────────────

function tryFisherProduce(c, r) {
  const level = stateAt(c, r).level || 0;
  const interval = effectiveFisherInterval() * machineSpeedMult(level);
  const luck = fisherLuckMult(level) * effectiveGlobalLuckMult();
  const dirs = [{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
  for (const {dc, dr} of dirs) {
    const nc = c + dc, nr = r + dr;
    const nb = blockAt(nc, nr);
    if (IS_TRANSPORT(nb)) {
      const nst = stateAt(nc, nr);
      if (!nst.item) {
        const fish = randomFish(luck);
        if (fish.category === 'Rare' || fish.category === 'Epic' || fish.category === 'Legendary') game.rareCatches++;
        fish.progress = 0;
        nst.item = fish;
        fisherTimers[`${c},${r}`] = interval;
        return;
      }
    } else if (IS_MACHINE(nb)) {
      const nst = stateAt(nc, nr);
      if (!nst.inputItem && !nst.processing && !nst.item) {
        const mFish = randomFish(luck);
        if (mFish.category === 'Rare' || mFish.category === 'Epic' || mFish.category === 'Legendary') game.rareCatches++;
        nst.inputItem = mFish;
        const def = machineDef(nb);
        nst.processing = true;
        nst.timer = def.processTime * machineSpeedMult(nst.level || 0);
        fisherTimers[`${c},${r}`] = interval;
        return;
      }
    }
  }
  fisherTimers[`${c},${r}`] = 0.5; // retry soon
}

// ─── Fishing Drone ───────────────────────────────────────────────────────────
// A placeable pad that flies out to the nearest water tile, hovers there to
// fill a batch of fish, then flies home and drips the catch onto whatever
// belt/machine is next to the pad — independent of pad placement, unlike the
// shore-only Fisher.

function droneTripDuration(c, r, st) {
  const dist = Math.hypot(st.waterC - c, st.waterR - r);
  return dist / (DRONE_SPEED * effectiveDroneSpeedMult()) * machineSpeedMult(st.level || 0);
}

// Counts other Drone Fishers currently targeting the same water tile — backs
// the crowding penalty so stacking drones on one pond isn't free.
function dronesSharingWater(wc, wr, excludeC, excludeR) {
  let n = 0;
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++) {
      if (c === excludeC && r === excludeR) continue;
      if (blockAt(c, r) !== B_DRONE_FISHER) continue;
      const s = stateAt(c, r);
      if (s.waterC === wc && s.waterR === wr) n++;
    }
  return n;
}

function tickDroneFisher(c, r, dt) {
  const st = stateAt(c, r);

  if (st.waterC === null) {
    const target = findNearestWaterTile(c, r);
    if (!target) return; // no water anywhere on the map — pad sits idle
    st.waterC = target.c;
    st.waterR = target.r;
  }

  if (st.dronePhase === DRONE_OUT) {
    st.droneT += dt / droneTripDuration(c, r, st);
    if (st.droneT >= 1) { st.dronePhase = DRONE_FISHING; st.droneT = 0; }

  } else if (st.dronePhase === DRONE_FISHING) {
    const crowd = dronesSharingWater(st.waterC, st.waterR, c, r);
    st.droneT += dt / (DRONE_FISH_TIME * (1 + crowd * 0.15) / effectiveDroneSpeedMult() * machineSpeedMult(st.level || 0));
    if (st.droneT >= 1) {
      for (let i = 0; i < DRONE_BATCH; i++) st.carrying.push(randomFish(droneLuckMult(st.level || 0) * effectiveGlobalLuckMult()));
      st.dronePhase = DRONE_BACK;
      st.droneT = 0;
    }

  } else if (st.dronePhase === DRONE_BACK) {
    st.droneT += dt / droneTripDuration(c, r, st);
    if (st.droneT >= 1) { st.dronePhase = DRONE_UNLOAD; st.droneT = 0; }

  } else if (st.dronePhase === DRONE_UNLOAD) {
    if (st.carrying.length === 0) {
      st.dronePhase = DRONE_OUT;
      st.droneT = 0;
      return;
    }
    const dirs = [{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
    for (const {dc, dr} of dirs) {
      const nc = c + dc, nr = r + dr;
      const nb = blockAt(nc, nr);
      if (IS_TRANSPORT(nb)) {
        const nst = stateAt(nc, nr);
        if (!nst.item) {
          const fish = st.carrying.shift();
          fish.progress = 0;
          nst.item = fish;
          stateAt(c, r).flashAnim = game.time + 0.3;
          return;
        }
      } else if (IS_MACHINE(nb)) {
        const nst = stateAt(nc, nr);
        if (!nst.inputItem && !nst.processing && !nst.item) {
          const def = machineDef(nb);
          nst.inputItem  = st.carrying.shift();
          nst.processing = true;
          nst.timer      = def.processTime * machineSpeedMult(nst.level || 0);
          stateAt(c, r).flashAnim = game.time + 0.3;
          return;
        }
      }
    }
    // Nowhere to put the next fish yet — wait and retry next tick.
  }
}

function machineDef(id) {
  if (id === B_WASHER)  return MACHINE_DEFS.WASHER;
  if (id === B_SMOKER)  return MACHINE_DEFS.SMOKER;
  if (id === B_ICER)    return MACHINE_DEFS.ICER;
  if (id === B_STAMPER) return MACHINE_DEFS.STAMPER;
  return null;
}

// Rate-limit machine dings per type — at most one ding per 800ms per machine
// type so a dense factory doesn't create overlapping noise from the same tone.
const _machineDingCooldown = {};
const MACHINE_DING_INTERVAL = 0.8; // seconds

function sfxForMachine(id) {
  const now = game.time;
  const last = _machineDingCooldown[id] ?? game.time;
  if (now - last < MACHINE_DING_INTERVAL) return null;
  _machineDingCooldown[id] = now;
  if (id === B_WASHER)  return sfxWasher;
  if (id === B_SMOKER)  return sfxSmoker;
  if (id === B_ICER)    return sfxIcer;
  if (id === B_STAMPER) return sfxStamper;
  return null;
}

// ─── Manual fishing ───────────────────────────────────────────────────────────

const MAX_HELD = 6;

function startManualCast(wx, wy) {
  if (manualCast.active) return;
  manualCast.active   = true;
  manualCast.duration  = effectiveCastTime();
  manualCast.timer     = manualCast.duration;
  manualCast.wx = wx;
  manualCast.wy = wy;
  sfxCast();
  tutorialNotify('cast');
}

function completeCast() {
  manualCast.active = false;
  if (heldFish.length >= effectiveMaxHeld()) {
    const msg = (typeof TUT !== 'undefined' && TUT.active)
      ? 'Inventory full! Walk to the Belt and press E (or click it) to drop your fish.'
      : 'Hands full! Drop fish on a Belt or Seller first.';
    queueToast(msg, '#e8a030');
    sfxFail();
    return;
  }
  const fish = randomFish(effectiveGlobalLuckMult());
  fish.progress = 0;
  heldFish.push(fish);
  const rare = fish.category === 'Rare' || fish.category === 'Epic' || fish.category === 'Legendary';
  const catchColor = rare ? '#e8c43f' : '#4dca7c';
  queueToast(
    rare ? `★ ${fish.size} ${fish.species}!` : `${fish.size} ${fish.species}`,
    catchColor
  );
  // Floating label above the player (not the water tile) so it's always visible
  spawnFloatText((rare ? '★ ' : '') + fish.species, player.wx, player.wy - 34, rare ? '#e8c43f' : '#ffffff');
  sfxCatch(rare);
  spawnParticles(manualCast.wx, manualCast.wy, 'splash', 6);
  if (rare) {
    game.rareCatches++;
    rareFlashIntensity = 1.0;
    spawnParticles(manualCast.wx, manualCast.wy, 'sparkle', 10);
    if (typeof triggerFrogShock === 'function') triggerFrogShock(manualCast.wx, manualCast.wy);
  }
  tutorialNotify('catch');
  // If inventory just filled up and the tutorial is still on 'cast' or 'catch',
  // skip ahead to 'drop' so the player isn't stuck wondering why they can't fish.
  if (typeof TUT !== 'undefined' && TUT.active && TUT.phase === 1
      && heldFish.length >= effectiveMaxHeld()) {
    const steps = TUTORIAL_PHASE1_STEPS;
    const currentId = steps[TUT.stepIndex]?.id;
    if (currentId === 'cast' || currentId === 'catch') {
      TUT.stepIndex = steps.findIndex(s => s.id === 'drop');
      renderTutorialOverlay();
      updateBuildHintUI();
    }
  }
}

function dropHeldFishOnBelt(c, r) {
  if (heldFish.length === 0) return false;
  const b = blockAt(c, r);
  if (!IS_TRANSPORT(b)) return false;
  const st = stateAt(c, r);
  if (st.item) return false;
  const fish = heldFish.shift();
  fish.progress = 0;
  st.item = fish;
  sfxDrop();
  sfxCoin(1, true);
  tutorialNotify('drop');
  return true;
}

function dropNearestBelt() {
  if (heldFish.length === 0) return false;
  const pc = Math.floor(player.wx / TILE_SIZE);
  const pr = Math.floor(player.wy / TILE_SIZE);
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (dropHeldFishOnBelt(pc + dc, pr + dr)) return true;
  return false;
}

// ─── Build / demolish ─────────────────────────────────────────────────────────

// Picks up a block for free (no refund, no charge) — used by the "Move" button
// in block popups. Stores a full state snapshot in buildMode.pendingMove so the
// block can be re-placed with its level/config intact. If the player cancels the
// move (exits build mode), exitBuildMode refunds the original purchase price.
function movePickUpBlock(c, r) {
  const id = blockAt(c, r);
  if (id === B_NONE) return;
  const st = stateAt(c, r);
  buildMode.pendingMove = {
    id,
    dir:    st ? st.dir : 0,
    level:  st ? (st.level || 0) : 0,
    config: typeof captureConfig === 'function' ? (captureConfig(c, r) || {}) : {},
  };
  // Remove silently — no cash change here; cost is recovered if move is cancelled
  removeBlock(c, r);
  if (id === B_FISHER) delete fisherTimers[`${c},${r}`];
  notifyRemoved(id, c, r, buildMode.pendingMove.dir, 0, buildMode.pendingMove.config);
  closeBlockPopup();
  if (!buildMode.active) {
    buildMode.active   = true;
    buildMode.menuOpen = false;
    setBuildMenuOpen(false);
  }
  buildMode.selectedId = id;
  buildMode.beltDir    = buildMode.pendingMove.dir;
  updateBuildHintUI();
  saveGame();
  queueToast(`Moving ${BLOCK_NAMES[id]} — click to place`, '#7ec8e3');
}

// Returns a specific human-readable reason why canPlaceBlock failed, replacing
// the previous generic "Cannot place here" toast. Only called after the unlock
// and cash checks already passed, so those cases are excluded here.
function placementFailReason(id, c, r) {
  const t = tileAt(c, r);
  const b = blockAt(c, r);
  if (id === B_CONCRETE) {
    if (t === T_CONCRETE)  return 'Already paved here';
    if (t === T_WATER)     return 'Cannot pave over water';
    if (t === T_SHORE)     return 'Cannot pave shore tiles';
    if (b !== B_NONE)      return 'Something is already here';
    return 'Cannot place concrete here';
  }
  if (id === B_FISHER) {
    if (b !== B_NONE)              return 'Something is already here';
    if (t !== T_SHORE)             return 'Fisher needs a shore tile next to water';
    if (!isAdjacentToWater(c, r)) return 'No water adjacent to this tile';
    return 'Cannot place Fisher here';
  }
  if (id === B_POND) {
    if (b !== B_NONE) return 'Something is already here';
    return 'Pond needs empty ground (dirt or concrete)';
  }
  // All other equipment requires a concrete floor
  if (t !== T_CONCRETE) return 'Needs concrete floor — place Concrete here first';
  if (b !== B_NONE)     return 'Something is already here';
  if (!IS_TRANSPORT(id) && playerOccupiesTile(c, r)) return 'Move out of the way first';
  return 'Cannot place here';
}

function buyAndPlace(id, c, r, dir, silent = false) {
  // Move operation: free placement, restores full saved state
  if (buildMode.pendingMove && buildMode.pendingMove.id === id) {
    if (!placeBlock(id, c, r, dir)) {
      if (!silent) { queueToast(placementFailReason(id, c, r), '#e85d4a'); sfxFail(); }
      return false;
    }
    const pm = buildMode.pendingMove;
    buildMode.pendingMove = null;
    game.blocksPlaced++;
    if (id === B_FISHER) fisherTimers[`${c},${r}`] = effectiveFisherInterval();
    if (typeof applyConfig === 'function') applyConfig(c, r, { ...pm.config, dir, level: 0 });
    const st = stateAt(c, r);
    if (st && pm.level) { st.level = pm.level; game.maxMachineLevel = Math.max(game.maxMachineLevel, pm.level); }
    if (typeof attachConfigToLastPlaced === 'function') attachConfigToLastPlaced({ ...pm.config, dir, level: pm.level });
    if (!silent) sfxPlace();
    notifyPlaced(id, c, r, dir, 0);
    saveGame();
    return true;
  }

  const cost = BLOCK_COSTS[id];
  if (!isBlockUnlocked(id)) {
    if (!silent) { queueToast(`Locked — reach ${BLOCK_UNLOCK_REQ[id].label}`, '#e85d4a'); sfxFail(); }
    return false;
  }
  if (game.cash < cost) { if (!silent) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); } return false; }
  if (!placeBlock(id, c, r, dir)) {
    if (!silent) { queueToast(placementFailReason(id, c, r), '#e85d4a'); sfxFail(); }
    return false;
  }
  game.cash -= cost;
  game.blocksPlaced++;
  if (id === B_FISHER) fisherTimers[`${c},${r}`] = effectiveFisherInterval();
  if (!silent) sfxPlace();
  notifyPlaced(id, c, r, dir, cost);
  // Tutorial Phase 2 — notify on first placement of each key block type
  const tutAction = id === B_CONCRETE  ? 'place_concrete'
                  : id === B_FISHER    ? 'place_fisher'
                  : IS_TRANSPORT(id)   ? 'place_belt'
                  : null;
  if (tutAction) tutorialNotify(tutAction);
  // link_seller advances on any subsequent belt placement (same trigger, different step)
  if (IS_TRANSPORT(id)) tutorialNotify('link_seller');
  saveGame();
  return true;
}

function sellAndRemove(c, r, silent = false) {
  const id = blockAt(c, r);
  if (id !== B_NONE) {
    const st = stateAt(c, r);
    if ((st.level || 0) > 0 && !silent) {
      let spent = 0;
      for (let lv = 0; lv < st.level; lv++) spent += machineUpgradeCost(id, lv) || 0;
      const ok = confirm(`Remove Lv ${st.level} ${BLOCK_NAMES[id]}? Upgrade investment ($${spent.toLocaleString()}) will be lost.`);
      if (!ok) return false;
    }
    const refund = Math.floor(BLOCK_COSTS[id] * 0.5);
    const dir = stateAt(c, r).dir;
    const prevConfig = captureConfig(c, r);
    removeBlock(c, r);
    if (id === B_FISHER) delete fisherTimers[`${c},${r}`];
    game.cash += refund;
    cashGuard.grant(refund);
    if (refund > 0 && !silent) { queueToast(`+$${refund} (salvage)`, '#e8a030'); sfxCoin(); }
    notifyRemoved(id, c, r, dir, refund, prevConfig);
    saveGame();
    return true;
  }
  if (tileAt(c, r) === T_CONCRETE) {
    const refund = Math.floor(BLOCK_COSTS[B_CONCRETE] * 0.5);
    removeBlock(c, r);
    game.cash += refund;
    cashGuard.grant(refund);
    if (!silent) { queueToast(`+$${refund} (salvage)`, '#e8a030'); sfxCoin(); }
    saveGame();
    return true;
  }
  return false;
}

const heldFish = [];

// ─── Particles (splash on catch, sparkle on rare catch) ───────────────────────
const particles = [];

function spawnParticles(x, y, kind, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 40;
    particles.push({
      x, y, kind,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
      life: 0, maxLife: kind === 'sparkle' ? 0.6 : 0.4,
    });
  }
}

// ─── Island expansion ─────────────────────────────────────────────────────────

const ISLAND_EXPAND_BASE = 5000;
const ISLAND_EXPAND_SCALE = 3;

function islandExpandCost() {
  return Math.floor(ISLAND_EXPAND_BASE * Math.pow(ISLAND_EXPAND_SCALE, game.islandLevel));
}

function _isLand(t) {
  return t === T_EMPTY || t === T_SHORE || t === T_CONCRETE;
}

function _protectedTile(c, r) {
  // Keep a buffer around the world border
  if (r < ISLAND_EDGE_MARGIN || r >= WORLD_ROWS - ISLAND_EDGE_MARGIN) return true;
  if (c < ISLAND_EDGE_MARGIN || c >= WORLD_COLS - ISLAND_EDGE_MARGIN) return true;
  // Keep a buffer around the boat dock (BOAT_C, BOAT_R)
  const bd = Math.max(Math.abs(c - BOAT_C), Math.abs(r - BOAT_R));
  if (bd <= BOAT_CLEAR + 2) return true;
  // Keep a buffer around each offshore island so the main island can't merge with them
  for (const isl of offshoreIslands) {
    const d = Math.max(Math.abs(c - isl.cx), Math.abs(r - isl.cy));
    if (d <= 8) return true;
  }
  return false;
}

function expandIsland() {
  const cost = islandExpandCost();
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return; }

  const toConvert = [];
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (terrain[r][c] !== T_WATER) continue;
      if (_protectedTile(c, r)) continue;
      // Skip interior pond water — only expand the ocean coastline.
      if (waterBodyAnchor(c, r) !== null) continue;
      if (_isLand(tileAt(c - 1, r)) || _isLand(tileAt(c + 1, r)) ||
          _isLand(tileAt(c, r - 1)) || _isLand(tileAt(c, r + 1))) {
        toConvert.push({ c, r });
      }
    }
  }

  if (!toConvert.length) { queueToast('Island is at maximum size!', '#e85d4a'); return; }

  // Add the new outer ring as shore tiles
  for (const { c, r } of toConvert) terrain[r][c] = T_SHORE;

  // Promote old shore tiles that are now interior (no longer adjacent to water) to grass
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (terrain[r][c] !== T_SHORE) continue;
      if (tileAt(c - 1, r) !== T_WATER && tileAt(c + 1, r) !== T_WATER &&
          tileAt(c, r - 1) !== T_WATER && tileAt(c, r + 1) !== T_WATER) {
        terrain[r][c] = T_EMPTY;
      }
    }
  }

  game.cash -= cost;
  game.islandLevel++;
  saveGame();
  sfxCoin();
  queueToast(`Island expanded! (Ring ${game.islandLevel}) · +${toConvert.length} tiles`, '#4dca7c');
}

function tickParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; // gravity
  }
}
