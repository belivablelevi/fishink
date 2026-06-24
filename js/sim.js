// Fish INK Factory — simulation engine

const game = {
  cash: 50,
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
};

const fisherTimers = {};
const manualCast = { active: false, timer: 0, duration: 0, wx: 0, wy: 0 };
const toasts = [];

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
  if (msg) queueToast(msg, color);
  sfxCoin(volMult);
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

  saveAccum += dt;
  if (saveAccum >= AUTOSAVE_INTERVAL) {
    saveAccum = 0;
    saveGame();
    submitLeaderboardScore();
  }

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
                    value: Math.round(bundleValue * 10) / 10, color: '#e8a030', sx: 0, sy: 0, mults: [],
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
  if (nb === B_CRATE)          return stateAt(nc, nr).carrying.length < researchCrateCapacity();
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
      nst.inputItem  = st.item;
      nst.processing = true;
      nst.timer      = def.processTime * machineSpeedMult(nst.level || 0);
      st.item        = null;
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
        else if (nb === B_CRATE && stateAt(nc, nr).carrying.length < researchCrateCapacity()) {
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
  const luck = fisherLuckMult(level);
  const dirs = [{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
  for (const {dc, dr} of dirs) {
    const nc = c + dc, nr = r + dr;
    const nb = blockAt(nc, nr);
    if (IS_TRANSPORT(nb)) {
      const nst = stateAt(nc, nr);
      if (!nst.item) {
        const fish = randomFish(luck);
        fish.progress = 0;
        nst.item = fish;
        fisherTimers[`${c},${r}`] = interval;
        return;
      }
    } else if (IS_MACHINE(nb)) {
      const nst = stateAt(nc, nr);
      if (!nst.inputItem && !nst.processing && !nst.item) {
        nst.inputItem = randomFish(luck);
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
      for (let i = 0; i < DRONE_BATCH; i++) st.carrying.push(randomFish(droneLuckMult(st.level || 0)));
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

function sfxForMachine(id) {
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
    queueToast('Hands full! Drop fish first.', '#e85d4a');
    sfxFail();
    return;
  }
  const fish = randomFish();
  fish.progress = 0;
  heldFish.push(fish);
  const rare = fish.category === 'Rare' || fish.category === 'Epic';
  queueToast(
    rare ? `★ ${fish.size} ${fish.species}!` : `${fish.size} ${fish.species}`,
    rare ? '#e8c43f' : '#4dca7c'
  );
  sfxCatch(rare);
  spawnParticles(manualCast.wx, manualCast.wy, 'splash', 6);
  if (rare) {
    game.rareCatches++;
    spawnParticles(manualCast.wx, manualCast.wy, 'sparkle', 10);
  }
  tutorialNotify('catch');
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

function buyAndPlace(id, c, r, dir, silent = false) {
  const cost = BLOCK_COSTS[id];
  if (!isBlockUnlocked(id)) {
    if (!silent) { queueToast(`Locked — reach ${BLOCK_UNLOCK_REQ[id].label}`, '#e85d4a'); sfxFail(); }
    return false;
  }
  if (game.cash < cost) { if (!silent) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); } return false; }
  if (!placeBlock(id, c, r, dir)) { if (!silent) { queueToast('Cannot place here', '#e85d4a'); sfxFail(); } return false; }
  game.cash -= cost;
  game.blocksPlaced++;
  if (id === B_FISHER) fisherTimers[`${c},${r}`] = effectiveFisherInterval();
  if (!silent) sfxPlace();
  notifyPlaced(id, c, r, dir, cost);
  saveGame();
  return true;
}

function sellAndRemove(c, r, silent = false) {
  const id = blockAt(c, r);
  if (id !== B_NONE) {
    const refund = Math.floor(BLOCK_COSTS[id] * 0.5);
    const dir = stateAt(c, r).dir;
    const prevConfig = captureConfig(c, r);
    removeBlock(c, r);
    if (id === B_FISHER) delete fisherTimers[`${c},${r}`];
    game.cash += refund;
    if (refund > 0 && !silent) { queueToast(`+$${refund} (salvage)`, '#e8a030'); sfxCoin(); }
    notifyRemoved(id, c, r, dir, refund, prevConfig);
    saveGame();
    return true;
  }
  if (tileAt(c, r) === T_CONCRETE) {
    const refund = Math.floor(BLOCK_COSTS[B_CONCRETE] * 0.5);
    removeBlock(c, r);
    game.cash += refund;
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

function tickParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; // gravity
  }
}
