// Fish INK Factory — world grid and block system

const TILE_SIZE = 32;
const WORLD_COLS = 64;
const WORLD_ROWS = 48;

// Base terrain types
const T_EMPTY    = 0;
const T_WATER    = 1;
const T_SHORE    = 2;
const T_WALL     = 3;
const T_CONCRETE = 4; // paved floor — required before placing any equipment

// Placeable block IDs (stored in blocks[][] layer)
const B_NONE     = 0;
const B_FISHER   = 1;
const B_BELT     = 2; // single belt block — direction lives in cellState.dir, set via R to rotate
const B_WASHER   = 3;
const B_SMOKER   = 4;
const B_ICER     = 5;
const B_STAMPER  = 6;
const B_SELLER   = 7;
const B_CONCRETE = 8; // special: placing this lays a T_CONCRETE terrain tile
const B_DRONE_FISHER   = 9;  // higher-tier Fisher: faster catch interval
const B_DRONE_DELIVERY = 10; // belt sink that sells with a bonus, like a long-range Seller
const B_SPLITTER       = 11; // belt variant: alternates output between two sides
const B_SORTER         = 12; // belt variant: routes by fish size, R flips which side is which
const B_CRATE          = 13; // buffer: holds a FIFO queue, decouples backpressure
const B_RECYCLER       = 14; // sink: flat-fee salvage for junk fish, never backs up
const B_PACKER         = 15; // sink-ish machine: bundles several fish into one higher-value item
const B_SMART_ROUTER    = 16; // belt variant: auto-picks the least-jammed of up to 3 output sides

const B_TELEPORTER       = 17; // belt sink/source pair: instantly relays a fish to a linked Teleporter elsewhere on the map

const BLOCK_NAMES = ['', 'Fisher', 'Belt',
                     'Washer', 'Smoker', 'Icer', 'Stamper', 'Seller', 'Concrete',
                     'Fishing Drone', 'Drone Delivery',
                     'Splitter', 'Sorter', 'Storage Crate', 'Recycler',
                     'Packer', 'Smart Router', 'Teleporter'];
const BLOCK_COSTS = [0, 150, 10, 400, 1200, 600, 3000, 200, 5, 1000, 900,
                     60, 80, 250, 150, 700, 120, 2500];

// Category id per block (index-aligned with BLOCK_NAMES/COSTS) — drives the
// grouped headers in the build menu.
const BLOCK_CATS = ['', 'fishing', 'floor',
                    'processing', 'processing', 'processing', 'processing',
                    'sales', 'floor', 'fishing', 'sales',
                    'floor', 'floor', 'floor', 'sales',
                    'sales', 'floor', 'floor'];

const BLOCK_DESCS = [
  '',
  'Casts a line from shore and reels in fish automatically.',
  'Moves items one tile per pulse. Press R to rotate before placing.',
  'Cleans caught fish, raising their sell value.',
  'Smokes fish for a bigger value boost.',
  'Flash-freezes fish for an even bigger value boost.',
  'Stamps fish with a quality seal for a final price bump.',
  'Sells anything dropped on it for cash.',
  'Paved floor — required before placing any equipment.',
  'Place anywhere — flies to the nearest water, fishes a batch, then flies back. Catches skew toward common fish, and crowding several near one pond slows them down.',
  'Belt sink that sells fish for a delivery bonus, like a long-range Seller.',
  'Alternates output between straight-ahead and a turn, balancing two belts.',
  'Routes fish to one of two sides by size or rarity — press E to choose the mode; R flips which side is which before placing.',
  'Buffers up to 20 items so a jam downstream doesn’t stall the whole line — press E to view its contents.',
  'Belt that salvages selected rarities for a flat fee as they ride past — press E to pick which ones.',
  'Bundles several fish into one higher-value box — press E to set the target count.',
  'Belt junction that auto-routes around a jam instead of backing up. The blue circle marks the input side.',
  'Press E to link it to another Teleporter — fish that land on it are instantly relayed there, then exit normally in this block’s facing direction.',
];

const IS_MACHINE    = id => id >= B_WASHER && id <= B_STAMPER;
const IS_BELT       = id => id === B_BELT;
const IS_TRANSPORT  = id => IS_BELT(id) || id === B_SPLITTER || id === B_SORTER || id === B_RECYCLER || id === B_SMART_ROUTER || id === B_TELEPORTER;
const IS_CRATE       = id => id === B_CRATE;
const IS_PACKER      = id => id === B_PACKER;

// Every block type with a per-instance level (click/E to buy, see upgrades.js
// buyMachineUpgrade) — the processing machines plus the other production/sink
// blocks that benefit from a per-instance speed or value boost.
const IS_UPGRADABLE = id => IS_MACHINE(id) || id === B_FISHER || id === B_DRONE_FISHER ||
                             id === B_RECYCLER || id === B_PACKER || id === B_DRONE_DELIVERY;

// Unlock gates — null for everything except the two blocks the player must
// earn access to. Checked by canPlaceBlock/buyAndPlace; nothing else cares.
const BLOCK_UNLOCK_REQ = [];
BLOCK_UNLOCK_REQ[B_STAMPER]        = { type: 'lifetimeEarned', amount: 5000,  label: '$5,000 lifetime earnings' };
BLOCK_UNLOCK_REQ[B_DRONE_DELIVERY] = { type: 'fishSold',       amount: 300,   label: '300 fish sold' };
BLOCK_UNLOCK_REQ[B_TELEPORTER]     = { type: 'lifetimeEarned', amount: 15000, label: '$15,000 lifetime earnings' };

function isBlockUnlocked(id) {
  const req = BLOCK_UNLOCK_REQ[id];
  if (!req) return true;
  if (req.type === 'lifetimeEarned') return game.lifetimeEarned >= req.amount;
  if (req.type === 'fishSold')       return game.fishSold >= req.amount;
  return true;
}

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

const CRATE_CAPACITY = 20;

// Rotation order for belts (clockwise), indexed by cellState.dir
const BELT_DIRS = [
  { dx:  1, dy:  0 }, // right
  { dx:  0, dy:  1 }, // down
  { dx: -1, dy:  0 }, // left
  { dx:  0, dy: -1 }, // up
];

// Fishing Drone trip phases (cellState.dronePhase)
const DRONE_OUT     = 'out';     // flying from pad to its water target
const DRONE_FISHING = 'fishing'; // hovering over water, filling its batch
const DRONE_BACK    = 'back';    // flying from water back to the pad
const DRONE_UNLOAD  = 'unload';  // dropping its catch onto an adjacent belt/machine

const DRONE_SPEED      = 3.5; // tiles/second, base flight speed (Drone Fisher gameplay timing) — slowed from 5 so the drone is actually visible mid-flight, at the cost of a modest throughput dip
const DRONE_FISH_TIME  = 1.4; // seconds hovering over water per trip
const DRONE_BATCH      = 3;   // fish collected per round trip

// Delivery flight (the cosmetic Drone Delivery → boat hop) is purely visual —
// the sale already happened by the time it launches — so it gets its own,
// much slower speed instead of reusing DRONE_SPEED, which stayed fast
// because slowing it down would also nerf Drone Fisher's real throughput.
const DELIVERY_FLIGHT_SPEED = 2; // tiles/second

// terrain[row][col], blocks[row][col]
let terrain   = [];
let blocks    = [];
let cellState = [];

// Tracks placed B_FISHER/B_DRONE_FISHER count so the coin SFX can back off
// once automation is doing most of the selling (see sfxCoin in audio.js).
let autoFisherCount = 0;
const IS_AUTO_FISHER = id => id === B_FISHER || id === B_DRONE_FISHER;
function countAutoFishers() { return autoFisherCount; }

// Recomputed by buildWorld() each run — where the proc-gen landed the starter
// dock. STARTER_C is the platform's center column.
let STARTER_C = 30;
let STARTER_R = 10;

// Fixed shipping-boat dock — sits in the open ocean corner that
// carveIslandBlob() never reaches (see ISLAND_EDGE_MARGIN below), so it's
// guaranteed clear of land/ponds on every world regardless of seed.
const BOAT_C = WORLD_COLS - 6;
const BOAT_R = 6;

const ISLAND_EDGE_MARGIN = 3; // tiles of guaranteed ocean kept around the world border

function randRange(min, max) { return min + Math.random() * (max - min); }

// Random-walking union of circles — each step nudges the center and resizes
// the radius a bit before painting, so the result is one connected but
// irregular landmass instead of a neat ellipse.
function carveIslandBlob() {
  let cx = WORLD_COLS / 2 + randRange(-6, 6);
  let cy = WORLD_ROWS / 2 + randRange(-4, 4);
  let radius = randRange(9, 13);
  const circles = [];
  const steps = 8 + Math.floor(Math.random() * 5);
  const minC = ISLAND_EDGE_MARGIN + 6, maxC = WORLD_COLS - ISLAND_EDGE_MARGIN - 6;
  const minR = ISLAND_EDGE_MARGIN + 6, maxR = WORLD_ROWS - ISLAND_EDGE_MARGIN - 6;
  for (let i = 0; i < steps; i++) {
    circles.push({ cx, cy, r: radius });
    cx = Math.max(minC, Math.min(maxC, cx + randRange(-9, 9)));
    cy = Math.max(minR, Math.min(maxR, cy + randRange(-7, 7)));
    radius = Math.max(6, Math.min(14, radius + randRange(-3, 3)));
  }

  for (let r = ISLAND_EDGE_MARGIN; r < WORLD_ROWS - ISLAND_EDGE_MARGIN; r++) {
    for (let c = ISLAND_EDGE_MARGIN; c < WORLD_COLS - ISLAND_EDGE_MARGIN; c++) {
      for (const circ of circles) {
        const dx = c - circ.cx, dy = r - circ.cy;
        if (dx * dx + dy * dy <= circ.r * circ.r) { terrain[r][c] = T_EMPTY; break; }
      }
    }
  }
}

// Carves one pond fully inside existing land — retries a handful of random
// spots/sizes and silently gives up if none fit, so a crowded map just ends
// up with fewer ponds rather than biting into the coastline.
//
// Each pond is a union of 2-4 sub-circles offset from the pond's nominal
// center instead of one perfect circle, so ponds come out irregular and
// visually distinct from each other (same idea as the island's coastline
// blob) rather than every pond reading as a uniform stamped-out disc. Every
// sub-circle is kept fully inside the original `radius` bound around (cx,
// cy), so the containment scan and the returned {cx, cy, radius} stay valid
// exactly as before.
function carvePond(radius) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const cx = Math.floor(randRange(radius + 3, WORLD_COLS - radius - 3));
    const cy = Math.floor(randRange(radius + 3, WORLD_ROWS - radius - 3));
    let ok = true;
    for (let r = cy - radius - 1; r <= cy + radius + 1 && ok; r++) {
      for (let c = cx - radius - 1; c <= cx + radius + 1; c++) {
        if (terrain[r][c] !== T_EMPTY) { ok = false; break; }
      }
    }
    if (!ok) continue;

    const subCount = 2 + Math.floor(Math.random() * 3); // 2-4 lobes
    const circles = [];
    for (let i = 0; i < subCount; i++) {
      const off   = randRange(0, radius * 0.4);
      const angle = randRange(0, Math.PI * 2);
      const subR  = randRange(radius * 0.5, radius - off);
      circles.push({ cx: cx + Math.cos(angle) * off, cy: cy + Math.sin(angle) * off, r: subR });
    }

    for (let r = cy - radius; r <= cy + radius; r++) {
      for (let c = cx - radius; c <= cx + radius; c++) {
        for (const circ of circles) {
          const dx = c - circ.cx, dy = r - circ.cy;
          if (dx * dx + dy * dy <= circ.r * circ.r) { terrain[r][c] = T_WATER; break; }
        }
      }
    }
    return { cx, cy, radius };
  }
  return null;
}

// Any land tile touching water becomes sand — covers the coastline and every
// pond bank in one pass, so Fisher placement (T_SHORE adjacent to T_WATER)
// works the same everywhere.
function applyShorePass() {
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (terrain[r][c] !== T_EMPTY) continue;
      if (tileAt(c, r - 1) === T_WATER || tileAt(c, r + 1) === T_WATER ||
          tileAt(c - 1, r) === T_WATER || tileAt(c + 1, r) === T_WATER) {
        terrain[r][c] = T_SHORE;
      }
    }
  }
}

// Finds the dry w×h rectangle closest to the map center for the starter
// dock — adapts to whatever shape carveIslandBlob() produced instead of
// assuming a fixed layout. `ponds` (and minPondDist, in tiles from the pond's
// edge) keeps the dock from landing right next to an interior pond; if no
// spot clears that buffer, retries without it rather than failing outright.
function findFlatLandSpot(w, h, ponds = [], minPondDist = 0) {
  const cx = WORLD_COLS / 2, cy = WORLD_ROWS / 2;
  let best = null, bestDist = Infinity;
  for (let r0 = 1; r0 <= WORLD_ROWS - h - 1; r0++) {
    for (let c0 = 1; c0 <= WORLD_COLS - w - 1; c0++) {
      let ok = true;
      for (let r = r0; r < r0 + h && ok; r++)
        for (let c = c0; c < c0 + w; c++)
          if (terrain[r][c] === T_WATER) { ok = false; break; }
      if (!ok) continue;
      const rectCx = c0 + w / 2, rectCy = r0 + h / 2;
      for (const p of ponds) {
        if (Math.hypot(rectCx - p.cx, rectCy - p.cy) - p.radius < minPondDist) { ok = false; break; }
      }
      if (!ok) continue;
      const dr = r0 + h / 2 - cy, dc = c0 + w / 2 - cx;
      const dist = dr * dr + dc * dc;
      if (dist < bestDist) { bestDist = dist; best = { r0, c0 }; }
    }
  }
  return best;
}

function buildWorld() {
  terrain   = [];
  blocks    = [];
  cellState = [];
  autoFisherCount = 0;

  for (let r = 0; r < WORLD_ROWS; r++) {
    terrain[r]   = new Uint8Array(WORLD_COLS);
    blocks[r]    = new Uint8Array(WORLD_COLS);
    cellState[r] = [];
    for (let c = 0; c < WORLD_COLS; c++) {
      cellState[r][c] = makeCellState();
    }
  }

  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      terrain[r][c] = T_WATER;

  carveIslandBlob();

  const pondCount = 2 + Math.floor(Math.random() * 3); // 2-4 ponds
  const ponds = [];
  for (let i = 0; i < pondCount; i++) {
    const p = carvePond(3 + Math.floor(Math.random() * 4)); // radius 3-6
    if (p) ponds.push(p);
  }

  applyShorePass();

  // ── Starter concrete platform ──────────────────────────────────────────────
  // A 3-row × 8-col pad, placed on whichever dry patch landed closest to the
  // map center this generation — kept a buffer away from any pond so the
  // dock never opens right onto one.
  const spot = findFlatLandSpot(8, 3, ponds, 6) || findFlatLandSpot(8, 3) ||
    { r0: Math.floor(WORLD_ROWS / 2) - 1, c0: Math.floor(WORLD_COLS / 2) - 4 };
  STARTER_R = spot.r0;
  STARTER_C = spot.c0 + 2;

  for (let r = STARTER_R; r <= STARTER_R + 2; r++)
    for (let c = STARTER_C - 2; c <= STARTER_C + 5; c++)
      terrain[r][c] = T_CONCRETE;

  // Pre-built belt chain + seller on the platform — player places the Fisher
  blocks[STARTER_R][STARTER_C]     = B_BELT;
  blocks[STARTER_R][STARTER_C + 1] = B_BELT;
  blocks[STARTER_R][STARTER_C + 2] = B_BELT;
  blocks[STARTER_R][STARTER_C + 3] = B_SELLER;
  // default dir (0 = right) from makeCellState() already points them the right way
}

function makeCellState() {
  return {
    item: null,
    inputItem: null,
    timer: 0,
    processing: false,
    dir: 0, // IS_TRANSPORT only — index into BELT_DIRS, rotated with R before placing
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

function tileAt(c, r) {
  if (c < 0 || r < 0 || c >= WORLD_COLS || r >= WORLD_ROWS) return T_WALL;
  return terrain[r][c];
}

function blockAt(c, r) {
  if (c < 0 || r < 0 || c >= WORLD_COLS || r >= WORLD_ROWS) return B_NONE;
  return blocks[r][c];
}

function stateAt(c, r) {
  if (c < 0 || r < 0 || c >= WORLD_COLS || r >= WORLD_ROWS) return null;
  return cellState[r][c];
}

function tileWalkable(t) {
  return t === T_EMPTY || t === T_SHORE || t === T_CONCRETE;
}

// Single-cell equipment placement rule.
function canPlaceEquipmentCell(id, c, r) {
  const t = tileAt(c, r);
  const b = blockAt(c, r);
  if (b !== B_NONE) return false;
  // Belts/Splitter/Sorter are walkable, so the player standing on the tile
  // doesn't block placement the way it would for a solid machine/seller.
  if (!IS_TRANSPORT(id) && playerOccupiesTile(c, r)) return false;
  return t === T_CONCRETE;
}

function canPlaceBlock(id, c, r, dir) {
  const t = tileAt(c, r);
  const b = blockAt(c, r);

  if (!isBlockUnlocked(id)) return false;

  if (id === B_CONCRETE) {
    // Lay concrete on bare dirt only
    return t === T_EMPTY && b === B_NONE;
  }

  if (id === B_FISHER) {
    // Shore tile adjacent to water, no existing block
    if (b !== B_NONE) return false;
    return t === T_SHORE && isAdjacentToWater(c, r);
  }

  // All other equipment (including the Fishing Drone, which flies to water
  // on its own — see findNearestWaterTile) requires concrete floor and no
  // existing block
  return canPlaceEquipmentCell(id, c, r);
}

function placeBlock(id, c, r, dir) {
  if (!canPlaceBlock(id, c, r, dir)) return false;
  if (id === B_CONCRETE) {
    terrain[r][c] = T_CONCRETE;
    // Concrete is terrain, not a block — nothing stored in blocks[][]
    return true;
  }

  blocks[r][c] = id;
  cellState[r][c] = makeCellState();
  if (IS_TRANSPORT(id)) cellState[r][c].dir = dir || 0;
  if (IS_AUTO_FISHER(id)) autoFisherCount++;
  return true;
}

function removeBlock(c, r) {
  if (c < 0 || r < 0 || c >= WORLD_COLS || r >= WORLD_ROWS) return false;
  if (blocks[r][c] !== B_NONE) {
    if (IS_AUTO_FISHER(blocks[r][c])) autoFisherCount--;
    blocks[r][c] = B_NONE;
    cellState[r][c] = makeCellState();
    return true;
  }
  // Right-click bare concrete: remove it
  if (terrain[r][c] === T_CONCRETE) {
    terrain[r][c] = T_EMPTY;
    return true;
  }
  return false;
}

function isAdjacentToWater(c, r) {
  return tileAt(c, r-1) === T_WATER || tileAt(c, r+1) === T_WATER ||
         tileAt(c-1, r) === T_WATER || tileAt(c+1, r) === T_WATER;
}

// Breadth-first search outward from (c, r) for the nearest water tile —
// lets a Fishing Drone pad placed anywhere find a target to fly to.
function findNearestWaterTile(c, r) {
  const seen = new Set([`${c},${r}`]);
  let ring = [{ c, r }];
  while (ring.length) {
    const next = [];
    for (const { c: cc, r: rr } of ring) {
      if (tileAt(cc, rr) === T_WATER) return { c: cc, r: rr };
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = cc + dc, nr = rr + dr;
        const key = `${nc},${nr}`;
        if (seen.has(key) || nc < 0 || nr < 0 || nc >= WORLD_COLS || nr >= WORLD_ROWS) continue;
        seen.add(key);
        next.push({ c: nc, r: nr });
      }
    }
    ring = next;
  }
  return null;
}
