// Fish INK Factory — Axolotl pets: gacha system + pond assignment

const PET_PULL_COST = 500;    // single pull
const PET_BULK_COST = 4500;   // 10-pull (10% off)
const POND_CAPACITY = 3;      // base max pets per pond (see effectivePondCapacity() in upgrades.js)

// Spritesheet: 128×256, 8 cols × 16 rows, 16×16 px per frame
// Rows 0-15: 16 heading directions, 22.5° apart, counterclockwise
//   Row 1 ≈ up, row 5 ≈ left, row 9 ≈ down, row 13 ≈ right
// Cols 0-3: swim/moving frames  ·  Cols 4-6: idle frames  ·  Col 7: blank
const AXO_FRAME_W     = 16;
const AXO_FRAME_H     = 16;
const AXO_ROWS        = 16;    // 16 heading directions
const AXO_SWIM_FRAMES = 3;     // columns 0-2: moving animation (col 3 is blank)
// Idle section (cols 4-6) only has art for a subset of rows so we skip it
// entirely during rest and freeze the last swim frame instead.
const AXO_ROW_STEP    = 22.5;  // degrees per row
const AXO_ROW_OFFSET  = 67.5;  // center angle (°) of row 0 (≈ upper-right)

// Maps a velocity vector to the spritesheet row for that heading direction.
// Uses atan2(-vy, vx) so screen-up yields +90°, matching row 1 = up.
function velocityToRow(vx, vy) {
  const deg = Math.atan2(-vy, vx) * 180 / Math.PI;
  return Math.floor(((deg - AXO_ROW_OFFSET + 360) % 360 + 360) % 360 / AXO_ROW_STEP) % AXO_ROWS;
}

const PET_VARIANTS = [
  // Common — 60 combined weight
  { id: 'pink',         name: 'Pink',         rarity: 'common',    weight: 14 },
  { id: 'albino',       name: 'Albino',       rarity: 'common',    weight: 12 },
  { id: 'brown',        name: 'Brown',        rarity: 'common',    weight: 12 },
  { id: 'tan',          name: 'Tan',          rarity: 'common',    weight: 12 },
  { id: 'yellow',       name: 'Yellow',       rarity: 'common',    weight: 10 },
  // Uncommon — 28 combined weight
  { id: 'blue00',       name: 'Blue',         rarity: 'uncommon',  weight: 8 },
  { id: 'blue01',       name: 'Cerulean',     rarity: 'uncommon',  weight: 6 },
  { id: 'red',          name: 'Red',          rarity: 'uncommon',  weight: 6 },
  { id: 'dark-orange',  name: 'Dark Orange',  rarity: 'uncommon',  weight: 5 },
  { id: 'yellow-green', name: 'Yellow-Green', rarity: 'uncommon',  weight: 3 },
  // Rare — 9 combined weight
  { id: 'black',        name: 'Black',        rarity: 'rare',      weight: 3 },
  { id: 'greyscale',    name: 'Greyscale',    rarity: 'rare',      weight: 2 },
  { id: 'swamp-green',  name: 'Swamp Green',  rarity: 'rare',      weight: 2 },
  { id: 'rose-pink',    name: 'Rose Pink',    rarity: 'rare',      weight: 2 },
  // Legendary — 3 combined weight
  { id: 'dark-purple',  name: 'Dark Purple',  rarity: 'legendary', weight: 2 },
  { id: 'retrogreen',   name: 'Retro Green',  rarity: 'legendary', weight: 1 },
];

const RARITY_COLOR = {
  common:    '#9aa0a8',
  uncommon:  '#4dca7c',
  rare:      '#5ba4f7',
  legendary: '#f0c419',
};

const RARITY_LABEL = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary',
};

const _TOTAL_WEIGHT = PET_VARIANTS.reduce((s, v) => s + v.weight, 0);

function getPetVariant(id) { return PET_VARIANTS.find(v => v.id === id) || null; }

// Returns image key for IMAGES object
function axoImgKey(variantId) { return 'axo_' + variantId.replace(/-/g, '_'); }

// ── Sell prices ──────────────────────────────────────────────────────────────

const PET_SELL_PRICE = { common: 50, uncommon: 150, rare: 400, legendary: 1500 };

function petSellPrice(uid) {
  const pet = game.pets.find(p => p.uid === uid);
  if (!pet) return 0;
  const v = getPetVariant(pet.variant);
  return v ? (PET_SELL_PRICE[v.rarity] || 0) : 0;
}

function sellPet(uid) {
  unassignPet(uid);
  const price = petSellPrice(uid);
  const idx = game.pets.findIndex(p => p.uid === uid);
  if (idx === -1) return;
  const pet = game.pets[idx];
  const v = getPetVariant(pet.variant);
  game.pets.splice(idx, 1);
  game.cash += price;
  game.lifetimeEarned += price;
  if (price > 0) queueToast(`Sold ${v ? v.name : 'pet'} +$${price}`, '#9aa0a8');
  saveGame();
}

// ── Gacha ─────────────────────────────────────────────────────────────────────

function rollGacha() {
  let r = Math.random() * _TOTAL_WEIGHT;
  for (const v of PET_VARIANTS) { r -= v.weight; if (r <= 0) return v; }
  return PET_VARIANTS[PET_VARIANTS.length - 1];
}

// Returns array of new pet objects (after auto-sell), or null if can't afford.
function pullPets(count = 1) {
  const cost = count === 1 ? PET_PULL_COST : PET_BULK_COST;
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return null; }
  game.cash -= cost;
  const results = [];
  const autoSell = game.petAutoSell || {};
  let autoSoldCount = 0, autoSoldValue = 0;
  for (let i = 0; i < count; i++) {
    const v = rollGacha();
    const pet = { uid: game.petNextUid++, variant: v.id };
    game.pets.push(pet);
    if (autoSell[v.rarity]) {
      const price = PET_SELL_PRICE[v.rarity] || 0;
      game.pets.splice(game.pets.indexOf(pet), 1);
      game.cash += price;
      game.lifetimeEarned += price;
      autoSoldCount++;
      autoSoldValue += price;
    } else {
      results.push({ pet, variant: v });
    }
  }
  game.petPullsTotal += count;
  if (autoSoldCount > 0) queueToast(`Auto-sold ${autoSoldCount} pet${autoSoldCount > 1 ? 's' : ''} +$${autoSoldValue}`, '#9aa0a8');
  saveGame();
  return results;
}

// ── Pond assignment ────────────────────────────────────────────────────────────

// Returns location info for the pond a pet is currently in, or null.
// type: 'block' (placed B_POND) or 'water' (natural water body)
function petCurrentPond(uid) {
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (blockAt(c, r) === B_POND && stateAt(c, r).pondPets.includes(uid))
        return { type: 'block', c, r };
  for (const [key, uids] of Object.entries(game.waterPonds || {}))
    if (uids.includes(uid)) return { type: 'water', key };
  return null;
}

function assignPetToPond(uid, pc, pr) {
  unassignPet(uid);
  const st = stateAt(pc, pr);
  if (st.pondPets.length >= effectivePondCapacity()) return false;
  st.pondPets.push(uid);
  saveGame();
  return true;
}

function assignPetToWaterPond(uid, anchorKey) {
  unassignPet(uid);
  if (!game.waterPonds[anchorKey]) game.waterPonds[anchorKey] = [];
  if (game.waterPonds[anchorKey].length >= effectivePondCapacity()) return false;
  game.waterPonds[anchorKey].push(uid);
  saveGame();
  return true;
}

function unassignPet(uid) {
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++) {
      if (blockAt(c, r) !== B_POND) continue;
      const st = stateAt(c, r);
      const i = st.pondPets.indexOf(uid);
      if (i !== -1) { st.pondPets.splice(i, 1); saveGame(); return; }
    }
  for (const [key, uids] of Object.entries(game.waterPonds)) {
    const i = uids.indexOf(uid);
    if (i !== -1) { uids.splice(i, 1); saveGame(); return; }
  }
}

// List all available ponds (block + natural water) with capacity info
function listAvailablePonds() {
  const ponds = [];
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (blockAt(c, r) === B_POND) {
        const st = stateAt(c, r);
        ponds.push({ type: 'block', c, r, count: st.pondPets.length, capacity: effectivePondCapacity() });
      }
  // Natural water bodies — deduplicate by anchor key, skip ocean (null anchor)
  const seenAnchors = new Set();
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (tileAt(c, r) === T_WATER) {
        const key = waterBodyAnchor(c, r);
        if (!key || seenAnchors.has(key)) continue;
        seenAnchors.add(key);
        const count = (game.waterPonds[key] || []).length;
        ponds.push({ type: 'water', key, count, capacity: effectivePondCapacity() });
      }
  return ponds;
}

// ── Swim state (non-persisted, rebuilt each session) ──────────────────────────
// Each pet steers toward a waypoint, smoothly accelerating/decelerating.
// Animation speed scales with actual velocity so the tail-swish matches motion.
//
// Block tank:  tile-relative (px, py), target (tpx, tpy)
// Water body:  world-space  (wx, wy),  target (twx, twy)
const _swimStates = {};

function _randBlockTarget(S, sw, m) {
  return { x: m + Math.random() * (S - m * 2 - sw), y: m + Math.random() * (S - m * 2 - sw) };
}

function _randWaterTarget(anchorKey, m, sw) {
  const tiles = waterBodyTiles(anchorKey);
  if (!tiles.length) return null;
  const t = tiles[Math.floor(Math.random() * tiles.length)];
  return {
    x: t.c * TILE_SIZE + m + Math.random() * (TILE_SIZE - m * 2 - sw),
    y: t.r * TILE_SIZE + m + Math.random() * (TILE_SIZE - m * 2 - sw),
  };
}

function _getSwimState(uid, pc, pr) {
  const key = `${pc},${pr}`;
  if (!_swimStates[key]) _swimStates[key] = {};
  const pool = _swimStates[key];
  if (!pool[uid]) {
    const sw = 12, m = 4;
    if (blockAt(pc, pr) === B_POND) {
      const S = TILE_SIZE;
      const t = _randBlockTarget(S, sw, m);
      const initRowB    = Math.floor(Math.random() * AXO_ROWS);
      pool[uid] = {
        type: 'block',
        px: m + Math.random() * (S - m * 2 - sw),
        py: m + Math.random() * (S - m * 2 - sw),
        vx: 0, vy: 0,
        tpx: t.x, tpy: t.y,
        topSpeed: 22 + Math.random() * 10,
        frame: Math.floor(Math.random() * AXO_SWIM_FRAMES),
        frameAccum: 0,
        idleFrame: 0, idleFrameAccum: 0,
        heading: (initRowB * AXO_ROW_STEP + AXO_ROW_OFFSET) * Math.PI / 180,
        row: initRowB,
        restTimer: 0,
      };
    } else {
      const t     = _randWaterTarget(key, m, sw);
      const start = _randWaterTarget(key, m, sw);
      if (!t || !start) return null;  // tile cache not ready yet — skip this frame
      const initRowW = Math.floor(Math.random() * AXO_ROWS);
      pool[uid] = {
        type: 'water',
        wx: start.x, wy: start.y,
        vx: 0, vy: 0,
        twx: t.x, twy: t.y,
        topSpeed: 40 + Math.random() * 20,
        frame: Math.floor(Math.random() * AXO_SWIM_FRAMES),
        frameAccum: 0,
        idleFrame: 0, idleFrameAccum: 0,
        heading: (initRowW * AXO_ROW_STEP + AXO_ROW_OFFSET) * Math.PI / 180,
        row: initRowW,
        restTimer: 0,
      };
    }
  }
  return pool[uid];
}

function tickSwimStates(dt) {
  const S    = TILE_SIZE;
  const sw   = 12, m = 4;
  // How fast animation runs at full speed (frames/sec). Scales linearly with speed.
  const ANIM_MAX_FPS = 10;

  for (const key in _swimStates) {
    const pool   = _swimStates[key];
    const [keyC, keyR] = key.split(',').map(Number);

    for (const uid in pool) {
      const s = pool[uid];

      // ── Resting pause ──────────────────────────────────────────────────────
      if (s.restTimer > 0) {
        s.restTimer -= dt;
        s.vx *= Math.pow(0.05, dt);
        s.vy *= Math.pow(0.05, dt);
        const spd = Math.hypot(s.vx, s.vy);
        _advanceFrame(s, spd, s.topSpeed, ANIM_MAX_FPS, dt, true);
        continue;
      }

      if (s.type === 'block') {
        const dx = s.tpx - s.px;
        const dy = s.tpy - s.py;
        const dist = Math.hypot(dx, dy);

        if (dist < 3) {
          // Reached waypoint — maybe rest, then pick new one
          if (Math.random() < 0.35) s.restTimer = 0.4 + Math.random() * 0.8;
          const t = _randBlockTarget(S, sw, m);
          s.tpx = t.x; s.tpy = t.y;
        } else {
          const steer   = Math.min(1, dt * 5);
          const wantVx  = (dx / dist) * s.topSpeed;
          const wantVy  = (dy / dist) * s.topSpeed;
          s.vx += (wantVx - s.vx) * steer;
          s.vy += (wantVy - s.vy) * steer;

          const nx = s.px + s.vx * dt;
          const ny = s.py + s.vy * dt;
          if (nx >= m && nx <= S - sw - m) { s.px = nx; } else { s.vx = -s.vx; const t = _randBlockTarget(S, sw, m); s.tpx = t.x; }
          if (ny >= m && ny <= S - sw - m) { s.py = ny; } else { s.vy = -s.vy; const t = _randBlockTarget(S, sw, m); s.tpy = t.y; }
        }

      } else {
        // Water body — world-space steering
        const anchor = waterBodyAnchor(keyC, keyR);
        const dx  = s.twx - s.wx;
        const dy  = s.twy - s.wy;
        const dist = Math.hypot(dx, dy);

        if (dist < 6) {
          if (Math.random() < 0.3) s.restTimer = 0.3 + Math.random() * 1.0;
          const t = _randWaterTarget(key, m, sw);
          if (t) { s.twx = t.x; s.twy = t.y; }
        } else {
          const steer  = Math.min(1, dt * 3.5);
          const wantVx = (dx / dist) * s.topSpeed;
          const wantVy = (dy / dist) * s.topSpeed;
          s.vx += (wantVx - s.vx) * steer;
          s.vy += (wantVy - s.vy) * steer;

          const nx = s.wx + s.vx * dt;
          const ny = s.wy + s.vy * dt;
          const prevWx = s.wx;

          // Validate x step
          const txX = Math.floor((nx + (s.vx >= 0 ? sw : 0)) / S);
          const tyX = Math.floor((s.wy + sw / 2) / S);
          if (anchor && tileAt(txX, tyX) === T_WATER && waterBodyAnchor(txX, tyX) === anchor) {
            s.wx = nx;
          } else {
            s.vx = -s.vx * 0.6;
            const t = _randWaterTarget(key, m, sw);
            if (t) s.twx = t.x;
          }

          // Validate y step — use prevWx (before X-step may have mutated s.wx)
          const txY = Math.floor((prevWx + sw / 2) / S);
          const tyY = Math.floor((ny + (s.vy >= 0 ? sw : 0)) / S);
          if (anchor && tileAt(txY, tyY) === T_WATER && waterBodyAnchor(txY, tyY) === anchor) {
            s.wy = ny;
          } else {
            s.vy = -s.vy * 0.6;
            const t = _randWaterTarget(key, m, sw);
            if (t) s.twy = t.y;
          }
        }
      }

      const spd = Math.hypot(s.vx, s.vy);
      if (spd > 0.5) {
        const targetAngle = Math.atan2(-s.vy, s.vx);
        let hdiff = targetAngle - s.heading;
        hdiff = ((hdiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        s.heading += Math.sign(hdiff) * Math.min(Math.abs(hdiff), Math.PI * 3 * dt);
        const hdgDeg = s.heading * 180 / Math.PI;
        s.row = Math.floor(((hdgDeg - AXO_ROW_OFFSET + 360) % 360 + 360) % 360 / AXO_ROW_STEP) % AXO_ROWS;
      }
      _advanceFrame(s, spd, s.topSpeed, ANIM_MAX_FPS, dt, false);
    }
  }
}

// Advance animation frame at a rate proportional to how fast the pet is moving.
function _advanceFrame(s, speed, topSpeed, maxFps, dt, isIdle) {
  if (isIdle) return; // freeze on last swim frame during rest — idle rows are incomplete
  const frac = Math.min(1, speed / (topSpeed * 0.5));
  const fps  = 1.5 + frac * (maxFps - 1.5);
  s.frameAccum += dt * fps;
  while (s.frameAccum >= 1) {
    s.frameAccum -= 1;
    s.frame = (s.frame + 1) % AXO_SWIM_FRAMES;
  }
}

// Returns the pet uids assigned to a given tile via either system
function petsAtTile(c, r) {
  if (blockAt(c, r) === B_POND) return stateAt(c, r).pondPets;
  if (tileAt(c, r) === T_WATER) {
    const key = waterBodyAnchor(c, r);
    return game.waterPonds[key] || [];
  }
  return [];
}

// ═══ Frog Pets ════════════════════════════════════════════════════════════════
// Spritesheet: 512×512, 32×32 frames, 16 cols × 16 rows
//   Rows 0-7: 8 directions (clockwise from east: E SE S SW W NW N NE)
//   IDLE cols 0-3 · CROAK cols 4-7 · HOP cols 12-15  (rows 0-7)
//   SHOCK cols 0-3  (rows 8-15)

const FROG_FRAME_W = 32;
const FROG_FRAME_H = 32;
const FROG_DIRS    = 8;
const FROG_ANIM = {
  idle:  { col: 0,  row: 0, frames: 3 },
  croak: { col: 4,  row: 0, frames: 3 },
  hop:   { col: 12, row: 0, frames: 3 },
  shock: { col: 0,  row: 8, frames: 3 },
};
const FROG_SIZE          = 32;  // rendered px
const FROG_SHOCK_RADIUS  = 10 * TILE_SIZE;

const FROG_VARIANTS = [
  { id: 'green',         name: 'Green',        rarity: 'common',    cost: 200 },
  { id: 'brown',         name: 'Brown',        rarity: 'common',    cost: 200 },
  { id: 'blue',          name: 'Blue',         rarity: 'uncommon',  cost: 350 },
  { id: 'purple',        name: 'Purple',       rarity: 'rare',      cost: 600 },
  { id: 'gameboy_green', name: 'Game Boy',     rarity: 'rare',      cost: 600 },
  { id: 'gameboy_bw',    name: 'Game Boy B&W', rarity: 'legendary', cost: 1000 },
];

function frogImgKey(variant) { return `frog_${variant}`; }

// Row 0=S(facing cam) 1=SE 2=E 3=NE 4=N 5=NW 6=W 7=SW
// Formula: start at S(90°) and rotate counterclockwise through rows
function _vecToFrogDir(dx, dy) {
  const deg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
  return Math.round((90 - deg + 360) / 45) % FROG_DIRS;
}

const _frogStates = {};

// Pick a nearby land tile center to hop to (1-3 tile range = short realistic hops)
function _randLandTarget(wx, wy) {
  const S = TILE_SIZE, range = 3;
  const cc = Math.floor(wx / S), cr = Math.floor(wy / S);
  const picks = [];
  for (let dr = -range; dr <= range; dr++)
    for (let dc = -range; dc <= range; dc++) {
      if (dc === 0 && dr === 0) continue;
      const tc = cc + dc, tr = cr + dr;
      const t = tileAt(tc, tr);
      if ((t === T_EMPTY || t === T_SHORE) && blockAt(tc, tr) === B_NONE)
        picks.push({ x: tc * S + S / 2 - FROG_SIZE / 2,
                     y: tr * S + S / 2 - FROG_SIZE / 2 });
    }
  return picks.length ? picks[Math.floor(Math.random() * picks.length)] : null;
}

// phase: 'wait' (idle/croak) → 'hop' (lerp to target) → back to 'wait'
function _getFrogState(uid, startWx, startWy) {
  if (!_frogStates[uid]) {
    _frogStates[uid] = {
      wx: startWx, wy: startWy,
      dir: 0,
      frame: 0, frameAccum: 0,
      phase: 'wait',
      waitTimer: 0.4 + Math.random() * 1.5,
      crOakTimer: 0,
      crOakCooldown: 3 + Math.random() * 6,
      shockTimer: 0,
      hopStartX: startWx, hopStartY: startWy,
      hopEndX: startWx,   hopEndY: startWy,
      hopProgress: 0,
      hopDuration: 0.2,
    };
  }
  return _frogStates[uid];
}

function isFrogPlaced(uid) {
  const f = (game.frogs || []).find(f => f.uid === uid);
  return f && f.wx !== -9999;
}

function triggerFrogShock(castWx, castWy) {
  if (!game.frogs) return;
  const r2 = FROG_SHOCK_RADIUS * FROG_SHOCK_RADIUS;
  for (const frog of game.frogs) {
    if (!isFrogPlaced(frog.uid)) continue;
    const s = _frogStates[frog.uid];
    if (!s) continue;
    const dx = s.wx - castWx, dy = s.wy - castWy;
    if (dx*dx + dy*dy <= r2) { s.shockTimer = 1.8; s.phase = 'wait'; s.frame = 0; s.frameAccum = 0; }
  }
}

function tickFrogStates(dt) {
  if (!game.frogs) return;
  const IDLE_FPS = 4, HOP_FPS = 12, SHOCK_FPS = 10, CROAK_FPS = 8;

  for (const frog of game.frogs) {
    if (!isFrogPlaced(frog.uid)) continue;
    const s = _getFrogState(frog.uid, frog.wx, frog.wy);

    // SHOCK — plays in place, overrides everything
    if (s.shockTimer > 0) {
      s.shockTimer -= dt;
      s.frameAccum += dt * SHOCK_FPS;
      while (s.frameAccum >= 1) { s.frameAccum -= 1; s.frame = (s.frame + 1) % FROG_ANIM.shock.frames; }
      if (s.shockTimer <= 0) { s.phase = 'wait'; s.waitTimer = 0.5; s.frame = 0; s.frameAccum = 0; }
      continue;
    }

    // CROAK — plays croak anim then returns to wait
    if (s.phase === 'croak') {
      s.crOakTimer -= dt;
      s.frameAccum += dt * CROAK_FPS;
      while (s.frameAccum >= 1) { s.frameAccum -= 1; s.frame = (s.frame + 1) % FROG_ANIM.croak.frames; }
      if (s.crOakTimer <= 0) { s.phase = 'wait'; s.waitTimer = 0.3 + Math.random() * 0.8; s.frame = 0; s.frameAccum = 0; }
      continue;
    }

    // WAIT — idle anim, countdown to next hop, maybe croak
    if (s.phase === 'wait') {
      s.frameAccum += dt * IDLE_FPS;
      while (s.frameAccum >= 1) { s.frameAccum -= 1; s.frame = (s.frame + 1) % FROG_ANIM.idle.frames; }
      s.waitTimer -= dt;
      s.crOakCooldown -= dt;
      if (s.crOakCooldown <= 0) {
        s.phase = 'croak';
        s.crOakTimer = 0.6 + Math.random() * 0.5;
        s.crOakCooldown = 5 + Math.random() * 8;
        s.frame = 0; s.frameAccum = 0;
      } else if (s.waitTimer <= 0) {
        const target = _randLandTarget(s.wx, s.wy);
        if (target) {
          s.phase = 'hop';
          s.hopStartX = s.wx; s.hopStartY = s.wy;
          s.hopEndX = target.x; s.hopEndY = target.y;
          s.hopProgress = 0;
          const dist = Math.hypot(target.x - s.wx, target.y - s.wy);
          s.hopDuration = 0.1 + dist / 260;
          s.dir = _vecToFrogDir(target.x - s.wx, target.y - s.wy);
          s.frame = 0; s.frameAccum = 0;
        } else {
          s.waitTimer = 0.5 + Math.random();
        }
      }
      continue;
    }

    // HOP — lerp with ease-out from start to end, play hop anim
    if (s.phase === 'hop') {
      s.hopProgress = Math.min(1, s.hopProgress + dt / s.hopDuration);
      const ease = 1 - (1 - s.hopProgress) * (1 - s.hopProgress); // ease-out quad
      s.wx = s.hopStartX + (s.hopEndX - s.hopStartX) * ease;
      s.wy = s.hopStartY + (s.hopEndY - s.hopStartY) * ease;
      s.frameAccum += dt * HOP_FPS;
      while (s.frameAccum >= 1) { s.frameAccum -= 1; s.frame = (s.frame + 1) % FROG_ANIM.hop.frames; }
      if (s.hopProgress >= 1) {
        s.wx = s.hopEndX; s.wy = s.hopEndY;
        s.phase = 'wait';
        s.waitTimer = 0.5 + Math.random() * 1.8;
        s.frame = 0; s.frameAccum = 0;
      }
    }
  }
}

function buyFrog(variantId) {
  const v = FROG_VARIANTS.find(f => f.id === variantId);
  if (!v) return false;
  if (game.cash < v.cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return false; }
  game.cash -= v.cost;
  if (!game.frogs) game.frogs = [];
  if (!game.frogNextUid) game.frogNextUid = 1;
  const uid = game.frogNextUid++;
  game.frogs.push({ uid, variant: variantId, wx: -9999, wy: -9999 });
  sfxUpgrade();
  saveGame();
  return uid;
}

function placeFrogAt(uid, wx, wy) {
  const frog = (game.frogs || []).find(f => f.uid === uid);
  if (!frog) return false;
  frog.wx = wx; frog.wy = wy;
  delete _frogStates[uid];
  saveGame();
  return true;
}

function pickUpFrog(uid) {
  const frog = (game.frogs || []).find(f => f.uid === uid);
  if (!frog) return;
  frog.wx = -9999; frog.wy = -9999;
  delete _frogStates[uid];
  saveGame();
}

function sellFrog(uid) {
  const frog = (game.frogs || []).find(f => f.uid === uid);
  if (!frog) return;
  const v = FROG_VARIANTS.find(f => f.id === frog.variant);
  const refund = v ? Math.floor(v.cost * 0.5) : 0;
  game.cash += refund;
  game.frogs = game.frogs.filter(f => f.uid !== uid);
  delete _frogStates[uid];
  queueToast(`Frog sold for $${refund}`, '#4dca7c');
  saveGame();
}

// Prune swim states for uids no longer assigned (called from pond popup close)
function pruneSwimStates(pc, pr) {
  const key = `${pc},${pr}`;
  if (!_swimStates[key]) return;
  const current = petsAtTile(pc, pr);
  for (const uid in _swimStates[key])
    if (!current.includes(Number(uid)))
      delete _swimStates[key][uid];
}
