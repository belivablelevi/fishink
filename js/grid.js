// Fish INK Factory — world grid and block system

const TILE_SIZE = 32;
let WORLD_COLS = 64;
let WORLD_ROWS = 48;
const WORLD_COLS_BASE = 64;
const WORLD_ROWS_BASE = 48;
const WORLD_COLS_MAX  = 128;
const WORLD_ROWS_MAX  = 96;
const GROW_COLS = 8;
const GROW_ROWS = 6;

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
const B_POND             = 18; // decorative habitat: assign Axolotl pets, they swim inside
const B_FISH_DEPOT       = 19; // auto-placed on worker island; fish drop here, belt out via adjacent belt

const BLOCK_NAMES = ['', 'Fisher', 'Belt',
                     'Washer', 'Smoker', 'Icer', 'Stamper', 'Seller', 'Concrete',
                     'Fishing Drone', 'Drone Delivery',
                     'Splitter', 'Sorter', 'Storage Crate', 'Recycler',
                     'Packer', 'Smart Router', 'Teleporter', 'Tank', 'Fish Depot'];
const BLOCK_COSTS = [0, 150, 10, 400, 1200, 600, 3000, 200, 5, 1000, 900,
                     60, 80, 250, 150, 700, 120, 2500, 800];

// Category id per block (index-aligned with BLOCK_NAMES/COSTS) — drives the
// grouped headers in the build menu.
const BLOCK_CATS = ['', 'fishing', 'floor',
                    'processing', 'processing', 'processing', 'processing',
                    'sales', 'floor', 'fishing', 'sales',
                    'floor', 'floor', 'floor', 'sales',
                    'sales', 'floor', 'floor', 'pets'];

const BLOCK_DESCS = [
  "",
  "Catches one fish every 5s from adjacent water. Must be placed on a shore tile. Connect a Belt to carry fish away. Without one, fish pile up and the Fisher stops. Upgrade to catch faster and get luckier rarity rolls.",
  "Moves items one tile in the direction it faces. Press R to rotate before placing. Chain them to connect machines: Fisher > Belt > Processor > Belt > Seller. Belts back up when the next tile is full.",
  "Increases fish value by +60%. Takes 2s to process. Fish enter from any belt side, exit from the front.",
  "Increases fish value by +140%. Takes 3.5s to process. Fish enter from any belt side, exit from the front.",
  "Increases fish value by +80%. Takes 1.5s to process, the fastest machine. Fish enter from any belt side, exit from the front.",
  "Increases fish value by +250%, the highest of any machine. Takes 4s to process. Unlocks at $5,000 lifetime earned. Fish enter from any belt side, exit from the front.",
  "Converts fish arriving by Belt into cash instantly. Place at the end of any belt line. Run multiple Sellers in parallel for more throughput. Upgrade to increase the sell price multiplier.",
  "Paved floor required to place any machine or belt. Lay it first, then build on top. Right-click to remove. Fisher is the only block that skips this; it goes directly on shore tiles.",
  "Flies to the nearest pond, catches a batch of fish, then returns to drop them on an adjacent belt. Can reach water too far to shore-place on. Multiple Drones near the same pond slow each other down. Upgrade to carry more fish per trip.",
  "Sells fish that arrive by Belt, like a Seller, but adds a delivery bonus on top. Unlocks after 300 fish sold. Great for long-distance belt lines or secondary factory areas.",
  "Splits a single belt line into two, alternating items left and right each tick. Use it to feed two parallel processing lines evenly from one input.",
  "Routes fish to different belt exits based on size or rarity. Press E to switch mode, R to flip which side is the rare exit. Use it to send Rare fish to a Stamper and Common fish to a Washer automatically.",
  "Holds up to 20 fish as a buffer. If the belt ahead jams, items wait here instead of backing up your whole line. Great for smoothing out uneven machine speeds. Press E to see what’s inside.",
  "Instantly sells any fish that arrives for a small flat fee, regardless of rarity. Never jams. Use it to handle overflow or discard fish that would clog your line. Press E to pick which rarities it accepts.",
  "Collects individual fish and bundles them into a single high-value crate worth more than selling them separately. Press E to set how many fish per box. Place before a Seller at the end of a line.",
  "Reads how backed-up each connected belt is and automatically sends fish toward the least-jammed exit. Prevents one line from starving while another overflows. The blue circle marks the input side.",
  "Instantly moves fish to a linked Teleporter anywhere on the map. Press E near one to link it to another. Fish enter the first and exit the second in its facing direction. Bypasses long belt runs entirely.",
  "A home for your Axolotl pets. Place it anywhere and assign up to 3 axolotls from your Pets collection. They swim around inside. Press E to manage which pets live here.",
];

const IS_MACHINE    = id => id >= B_WASHER && id <= B_STAMPER;
const IS_BELT       = id => id === B_BELT;
const IS_TRANSPORT  = id => IS_BELT(id) || id === B_SPLITTER || id === B_SORTER || id === B_RECYCLER || id === B_SMART_ROUTER || id === B_TELEPORTER;
const IS_CRATE       = id => id === B_CRATE || id === B_FISH_DEPOT;
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
const DEPOT_CAPACITY = 50; // larger than crate — workers keep depositing

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

// Fixed shipping-boat dock. Guaranteed clear of land by a post-generation
// force-clear in buildWorld() — no terrain pass may leave land here.
// These are let so growWorld() can shift them when the world expands in all directions.
let BOAT_C = WORLD_COLS - 6;  // col 58
let BOAT_R = 6;
const BOAT_CLEAR = 5; // tiles radius kept as open ocean around the boat

const ISLAND_EDGE_MARGIN = 3; // tiles of guaranteed ocean kept around the world border

// Offshore islands discovered by buildWorld() — each entry has cx/cy (island
// centre) and depotC/depotR (tile where B_FISH_DEPOT is placed). Persisted in save.
let offshoreIslands = [];

function randRange(min, max) { return min + Math.random() * (max - min); }

// Random-walking union of circles — each step nudges the center and resizes
// the radius a bit before painting, so the result is one connected but
// irregular landmass instead of a neat ellipse.
function carveIslandBlob() {
  let cx = WORLD_COLS / 2 + randRange(-4, 4);
  let cy = WORLD_ROWS / 2 + randRange(-3, 3);
  let radius = randRange(6, 9);
  const circles = [];
  const steps = 4 + Math.floor(Math.random() * 4);
  const minC = ISLAND_EDGE_MARGIN + 6, maxC = WORLD_COLS - ISLAND_EDGE_MARGIN - 6;
  const minR = ISLAND_EDGE_MARGIN + 6, maxR = WORLD_ROWS - ISLAND_EDGE_MARGIN - 6;
  for (let i = 0; i < steps; i++) {
    circles.push({ cx, cy, r: radius });
    cx = Math.max(minC, Math.min(maxC, cx + randRange(-9, 9)));
    cy = Math.max(minR, Math.min(maxR, cy + randRange(-7, 7)));
    radius = Math.max(4, Math.min(10, radius + randRange(-2, 2)));
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

// Carves a small island blob in the open ocean. Uses the same union-of-circles
// approach as the main island but capped at a smaller radius. Enforces a
// 3-tile clearance from any existing land so there's always open water between
// offshore islands and the main island. Returns true if placed, false if the
// requested position overlapped existing land (caller retries or skips).
// Returns { cx, cy } (island centroid) on successful placement, null if
// rejected (overlaps land or is too close to the cargo-ship dock).
function carveOffshoreIsland(cx, cy, maxR) {
  const steps = 2 + Math.floor(Math.random() * 2);
  const circles = [];
  let ox = cx, oy = cy, r = maxR * (0.55 + Math.random() * 0.45);
  for (let i = 0; i < steps; i++) {
    circles.push({ cx: ox, cy: oy, r });
    ox = Math.max(3, Math.min(WORLD_COLS - 3, ox + randRange(-2.5, 2.5)));
    oy = Math.max(3, Math.min(WORLD_ROWS - 3, oy + randRange(-2.5, 2.5)));
    r  = Math.max(2, Math.min(maxR, r + randRange(-1, 1)));
  }

  // Reject if any circle lands within BOAT_CLEAR tiles of the boat dock.
  for (const circ of circles) {
    const dx = circ.cx - BOAT_C, dy = circ.cy - BOAT_R;
    if (Math.sqrt(dx * dx + dy * dy) - circ.r < BOAT_CLEAR) return false;
  }

  // Reject if too close to existing land (3-tile clearance from main island).
  const CLEAR = 3;
  for (const circ of circles) {
    const c0 = Math.max(0, Math.floor(circ.cx - circ.r - CLEAR));
    const c1 = Math.min(WORLD_COLS - 1, Math.ceil(circ.cx + circ.r + CLEAR));
    const r0 = Math.max(0, Math.floor(circ.cy - circ.r - CLEAR));
    const r1 = Math.min(WORLD_ROWS - 1, Math.ceil(circ.cy + circ.r + CLEAR));
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++)
        if (terrain[row][col] === T_EMPTY) return null;
  }

  for (const circ of circles) {
    const c0 = Math.max(0, Math.floor(circ.cx - circ.r));
    const c1 = Math.min(WORLD_COLS - 1, Math.ceil(circ.cx + circ.r));
    const r0 = Math.max(0, Math.floor(circ.cy - circ.r));
    const r1 = Math.min(WORLD_ROWS - 1, Math.ceil(circ.cy + circ.r));
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) {
        const dx = col - circ.cx, dy = row - circ.cy;
        if (dx * dx + dy * dy <= circ.r * circ.r) terrain[row][col] = T_EMPTY;
      }
  }

  // Return the centroid of all painted circles as the island's reference point
  const centC = circles.reduce((s, c) => s + c.cx, 0) / circles.length;
  const centR = circles.reduce((s, c) => s + c.cy, 0) / circles.length;
  return { cx: centC, cy: centR };
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

  // Offshore islands — small landmasses dotted around the ocean, reserved for
  // the future boat-travel system. The NE corner is intentionally omitted: the
  // cargo ship docks there (BOAT_C/BOAT_R) and needs clear water. Each slot
  // gets up to 4 placement attempts with jitter; unsuccessful ones are skipped.
  const offshoreSlots = [
    { cx:  8,                cy:  7               }, // NW
    { cx:  22,               cy:  5               }, // N-mid (clear of NE boat dock)
    { cx:  8,                cy:  WORLD_ROWS - 9  }, // SW
    { cx:  WORLD_COLS - 10,  cy:  WORLD_ROWS - 9  }, // SE
  ];
  offshoreIslands = [];
  for (const slot of offshoreSlots) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const jx = slot.cx + randRange(-3, 3);
      const jy = slot.cy + randRange(-2, 2);
      const result = carveOffshoreIsland(jx, jy, 4 + Math.random() * 2);
      if (result) { offshoreIslands.push(result); break; }
    }
  }

  applyShorePass();

  // ── Boat dock guarantee ───────────────────────────────────────────────────
  // Belt-and-suspenders: regardless of what any terrain pass produced, force
  // the zone around the cargo-ship dock back to open water. This is the single
  // source of truth — if BOAT_C/BOAT_R ever moves, update BOAT_CLEAR too.
  for (let r = BOAT_R - BOAT_CLEAR; r <= BOAT_R + BOAT_CLEAR; r++)
    for (let c = BOAT_C - BOAT_CLEAR; c <= BOAT_C + BOAT_CLEAR; c++)
      if (r >= 0 && r < WORLD_ROWS && c >= 0 && c < WORLD_COLS)
        terrain[r][c] = T_WATER;

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

  ensureWorkerIslandDepot();
}

// Places B_FISH_DEPOT at the center of the worker island if it isn't already there.
// Called on new world gen and on save load so old saves get backfilled automatically.
function ensureWorkerIslandDepot() {
  const isl = offshoreIslands && offshoreIslands[0];
  if (!isl) return;
  if (isl.depotC !== undefined && blocks[isl.depotR] && blocks[isl.depotR][isl.depotC] === B_FISH_DEPOT) return;
  // Search center-out for an empty land tile
  const offsets = [[0,0],[0,-1],[1,0],[0,1],[-1,0],[1,-1],[-1,-1],[1,1],[-1,1],[0,-2],[2,0],[0,2],[-2,0]];
  for (const [dc, dr] of offsets) {
    const c = Math.floor(isl.cx) + dc, r = Math.floor(isl.cy) + dr;
    if (c < 0 || c >= WORLD_COLS || r < 0 || r >= WORLD_ROWS) continue;
    if (terrain[r][c] === T_WATER) continue;
    if (blocks[r][c] !== B_NONE && blocks[r][c] !== B_FISH_DEPOT) continue;
    blocks[r][c] = B_FISH_DEPOT;
    cellState[r][c] = makeCellState();
    isl.depotC = c;
    isl.depotR = r;
    return;
  }
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
    pondPets: [],           // B_POND only — array of pet uid numbers assigned to swim here
  };
}

// Expands the world canvas uniformly in all 4 directions. Fills new space with
// ocean, shifts all absolute coordinates, then tries to place new offshore islands.
// Returns true if the world grew, false if already at max.
function growWorld() {
  if (WORLD_COLS >= WORLD_COLS_MAX && WORLD_ROWS >= WORLD_ROWS_MAX) return false;

  const oldCols = WORLD_COLS;
  const oldRows = WORLD_ROWS;
  const newCols = Math.min(WORLD_COLS_MAX, WORLD_COLS + GROW_COLS);
  const newRows = Math.min(WORLD_ROWS_MAX, WORLD_ROWS + GROW_ROWS);

  const addedCols = newCols - oldCols;
  const addedRows = newRows - oldRows;
  const addLeft   = Math.floor(addedCols / 2);
  const addRight  = addedCols - addLeft;
  const addTop    = Math.floor(addedRows / 2);
  const addBottom = addedRows - addTop;

  // Build new terrain: all water, then stamp old content offset by (addLeft, addTop).
  const newTerrain   = [];
  const newBlocks    = [];
  const newCellState = [];
  for (let r = 0; r < newRows; r++) {
    newTerrain[r]   = new Uint8Array(newCols).fill(T_WATER);
    newBlocks[r]    = new Uint8Array(newCols);
    newCellState[r] = [];
    for (let c = 0; c < newCols; c++) {
      const or = r - addTop, oc = c - addLeft;
      if (or >= 0 && or < oldRows && oc >= 0 && oc < oldCols) {
        newTerrain[r][c]   = terrain[or][oc];
        newBlocks[r][c]    = blocks[or][oc];
        newCellState[r][c] = cellState[or][oc];
      } else {
        newCellState[r][c] = makeCellState();
      }
    }
  }
  terrain   = newTerrain;
  blocks    = newBlocks;
  cellState = newCellState;

  WORLD_COLS = newCols;
  WORLD_ROWS = newRows;

  // Shift all stored absolute tile coordinates by the left/top additions.
  BOAT_C    += addLeft;
  BOAT_R    += addTop;
  STARTER_C += addLeft;
  STARTER_R += addTop;

  for (const isl of offshoreIslands) {
    isl.cx += addLeft;
    isl.cy += addTop;
    if (isl.depotC !== undefined) isl.depotC += addLeft;
    if (isl.depotR !== undefined) isl.depotR += addTop;
  }

  // Shift teleporter links and drone water-target cache.
  for (let r = addTop; r < addTop + oldRows; r++) {
    for (let c = addLeft; c < addLeft + oldCols; c++) {
      const st = cellState[r][c];
      if (st.teleportTarget) {
        st.teleportTarget.c += addLeft;
        st.teleportTarget.r += addTop;
      }
      if (st.waterC !== null) st.waterC += addLeft;
      if (st.waterR !== null) st.waterR += addTop;
    }
  }

  // Shift player world-pixel position and camera.
  if (typeof player !== 'undefined') {
    player.wx += addLeft * TILE_SIZE;
    player.wy += addTop  * TILE_SIZE;
  }
  if (typeof cam !== 'undefined') {
    cam.x += addLeft * TILE_SIZE;
    cam.y += addTop  * TILE_SIZE;
  }

  // Try to place one island in each of the 4 new ocean strips.
  const mid = { c: Math.floor(newCols / 2), r: Math.floor(newRows / 2) };
  const newIslandSlots = [
    { cx: addLeft  / 2,                    cy: mid.r        }, // left strip
    { cx: oldCols + addLeft + addRight / 2, cy: mid.r        }, // right strip
    { cx: mid.c,                            cy: addTop  / 2  }, // top strip
    { cx: mid.c,                            cy: oldRows + addTop + addBottom / 2 }, // bottom strip
  ];
  for (const slot of newIslandSlots) {
    if (slot.cx < 4 || slot.cx >= newCols - 4 || slot.cy < 4 || slot.cy >= newRows - 4) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      const jx = slot.cx + randRange(-2, 2);
      const jy = slot.cy + randRange(-2, 2);
      const result = carveOffshoreIsland(Math.floor(jx), Math.floor(jy), 3 + Math.random() * 2);
      if (result) { offshoreIslands.push(result); break; }
    }
  }

  applyShorePass();
  ensureWorkerIslandDepot();
  return true;
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

// Returns a stable string key "c,r" for the top-left tile of the connected
// T_WATER body containing (startC, startR). Used as the natural-pond identity.
// Ocean (water body touching map boundary) returns null — excluded from ponds.
const _wbAnchorCache = {};  // tile key → anchor string or null (ocean)
const _wbTileCache   = {};  // anchor key → [{c, r}] list of all tiles in body

function waterBodyAnchor(startC, startR) {
  const startKey = `${startC},${startR}`;
  if (startKey in _wbAnchorCache) return _wbAnchorCache[startKey];
  const visited = new Set();
  const queue = [[startC, startR]];
  let minC = startC, minR = startR, isOcean = false;
  while (queue.length) {
    const [c, r] = queue.shift();
    const k = `${c},${r}`;
    if (visited.has(k)) continue;
    if (c < 0 || c >= WORLD_COLS || r < 0 || r >= WORLD_ROWS) continue;
    if (tileAt(c, r) !== T_WATER) continue;
    visited.add(k);
    if (c === 0 || c === WORLD_COLS - 1 || r === 0 || r === WORLD_ROWS - 1) isOcean = true;
    if (r < minR || (r === minR && c < minC)) { minR = r; minC = c; }
    queue.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
  const anchor = isOcean ? null : `${minC},${minR}`;
  for (const k of visited) _wbAnchorCache[k] = anchor;
  if (anchor) {
    const tiles = [];
    for (const k of visited) { const [c, r] = k.split(',').map(Number); tiles.push({ c, r }); }
    _wbTileCache[anchor] = tiles;
  }
  return anchor;
}

// Returns all tile coords of the water body with the given anchor key.
function waterBodyTiles(anchorKey) {
  return _wbTileCache[anchorKey] || [];
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

  if (id === B_POND) {
    // Can go on any solid ground — dirt or concrete, no existing block
    return b === B_NONE && (t === T_EMPTY || t === T_CONCRETE);
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
  if (blocks[r][c] === B_FISH_DEPOT) return false; // immovable world block
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
