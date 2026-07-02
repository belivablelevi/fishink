// Fish INK Factory — Axolotl pets: gacha system + pond assignment

const PET_PULL_COST = 500;    // single pull
const PET_BULK_COST = 4500;   // 10-pull (10% off)
const POND_CAPACITY = 3;      // max pets per pond

// Spritesheet layout: 128×256, 8 cols × 16 rows, 16×16 per frame
// Row 0 = walk cycle used for swimming (flip horizontally for left direction)
const AXO_FRAME_W   = 16;
const AXO_FRAME_H   = 16;
const AXO_SWIM_ROW  = 0;   // row index of the swimming/walk animation
const AXO_FRAMES    = 8;   // frames per animation row

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

// ── Gacha ─────────────────────────────────────────────────────────────────────

function rollGacha() {
  let r = Math.random() * _TOTAL_WEIGHT;
  for (const v of PET_VARIANTS) { r -= v.weight; if (r <= 0) return v; }
  return PET_VARIANTS[PET_VARIANTS.length - 1];
}

// Returns array of new pet objects, or null if can't afford.
function pullPets(count = 1) {
  const cost = count === 1 ? PET_PULL_COST : PET_BULK_COST;
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return null; }
  game.cash -= cost;
  const results = [];
  for (let i = 0; i < count; i++) {
    const v = rollGacha();
    const pet = { uid: game.petNextUid++, variant: v.id };
    game.pets.push(pet);
    results.push({ pet, variant: v });
  }
  game.petPullsTotal += count;
  if (UPGRADE_TIP && UPGRADE_TIP.active) {} // no-op, just guard
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
  for (const [key, uids] of Object.entries(game.waterPonds))
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
  // Natural water bodies — deduplicate by anchor key
  const seenAnchors = new Set();
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (tileAt(c, r) === T_WATER) {
        const key = waterBodyAnchor(c, r);
        if (seenAnchors.has(key)) continue;
        seenAnchors.add(key);
        const count = (game.waterPonds[key] || []).length;
        ponds.push({ type: 'water', key, count, capacity: POND_CAPACITY });
      }
  return ponds;
}

// ── Swim state (non-persisted, rebuilt each session) ──────────────────────────
// Key: `${c},${r}` → { [uid]: { px, py, vx, vy, frame, frameTimer, flipX } }
const _swimStates = {};

function _getSwimState(uid, pc, pr) {
  const key = `${pc},${pr}`;
  if (!_swimStates[key]) _swimStates[key] = {};
  const pool = _swimStates[key];
  if (!pool[uid]) {
    const S = TILE_SIZE;
    const m = 4, sw = 12;
    pool[uid] = {
      px: m + Math.random() * (S - m * 2 - sw),
      py: m + Math.random() * (S - m * 2 - sw),
      vx: (Math.random() < 0.5 ? 1 : -1) * (8 + Math.random() * 10),
      vy: (Math.random() < 0.5 ? 1 : -1) * (4 + Math.random() * 6),
      frame: Math.floor(Math.random() * AXO_FRAMES),
      frameTimer: 0,
      flipX: Math.random() < 0.5,
    };
  }
  return pool[uid];
}

function tickSwimStates(dt) {
  const S = TILE_SIZE;
  const sw = 12, m = 3; // sprite draw size, margin
  const ANIM_FPS = 9;

  for (const key in _swimStates) {
    const pool = _swimStates[key];
    for (const uid in pool) {
      const s = pool[uid];
      s.px += s.vx * dt;
      s.py += s.vy * dt;
      if (s.px < m)           { s.px = m;           s.vx =  Math.abs(s.vx); s.flipX = false; }
      if (s.px > S - sw - m)  { s.px = S - sw - m;  s.vx = -Math.abs(s.vx); s.flipX = true;  }
      if (s.py < m)           { s.py = m;            s.vy =  Math.abs(s.vy); }
      if (s.py > S - sw - m)  { s.py = S - sw - m;  s.vy = -Math.abs(s.vy); }
      s.frameTimer += dt;
      if (s.frameTimer >= 1 / ANIM_FPS) {
        s.frameTimer -= 1 / ANIM_FPS;
        s.frame = (s.frame + 1) % AXO_FRAMES;
      }
    }
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
