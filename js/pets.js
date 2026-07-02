// Fish INK Factory — Axolotl pets: gacha system + pond assignment

const PET_PULL_COST = 500;    // single pull
const PET_BULK_COST = 4500;   // 10-pull (10% off)
const POND_CAPACITY = 3;      // max pets per pond

// Spritesheet: 128×256, 8 cols × 16 rows, 16×16 px per frame
// Rows 0-15: 16 heading directions, 22.5° apart, counterclockwise
//   Row 1 ≈ up, row 5 ≈ left, row 9 ≈ down, row 13 ≈ right
// Cols 0-3: swim/moving frames  ·  Cols 4-6: idle frames  ·  Col 7: blank
const AXO_FRAME_W     = 16;
const AXO_FRAME_H     = 16;
const AXO_ROWS        = 16;    // 16 heading directions
const AXO_SWIM_FRAMES = 4;     // columns 0-3: moving animation
const AXO_IDLE_COL    = 4;     // column start of idle section
const AXO_IDLE_FRAMES = 3;     // columns 4-6: idle animation
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
  if (st.pondPets.length >= POND_CAPACITY) return false;
  st.pondPets.push(uid);
  saveGame();
  return true;
}

function assignPetToWaterPond(uid, anchorKey) {
  unassignPet(uid);
  if (!game.waterPonds[anchorKey]) game.waterPonds[anchorKey] = [];
  if (game.waterPonds[anchorKey].length >= POND_CAPACITY) return false;
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
        ponds.push({ type: 'block', c, r, count: st.pondPets.length, capacity: POND_CAPACITY });
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
        ponds.push({ type: 'water', key, count, capacity: POND_CAPACITY });
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
  const frac = Math.min(1, speed / (topSpeed * 0.5));
  const fps  = 1.5 + frac * (maxFps - 1.5);
  s.frameAccum += dt * fps;
  const frameCount = isIdle ? AXO_IDLE_FRAMES : AXO_SWIM_FRAMES;
  s.frame = s.frame % frameCount; // clamp on mode switch so blank col 7 never shows
  while (s.frameAccum >= 1) {
    s.frameAccum -= 1;
    s.frame = (s.frame + 1) % frameCount;
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

// Prune swim states for uids no longer assigned (called from pond popup close)
function pruneSwimStates(pc, pr) {
  const key = `${pc},${pr}`;
  if (!_swimStates[key]) return;
  const current = petsAtTile(pc, pr);
  for (const uid in _swimStates[key])
    if (!current.includes(Number(uid)))
      delete _swimStates[key][uid];
}
