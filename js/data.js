// Fish INK Factory — static data

// sprite: column/row in fishes.png (32×32 per cell, 12×12 grid)
// sx = (species_number - 1) % 12,  sy = floor((species_number - 1) / 12)
const FISH = [
  // ── Common ────────────────────────────────────────────────────────────────
  // #23 Guppy            (idx 22 → sx 10, sy 1)
  { species: 'Guppy',          category: 'Common',   value: 0.5,   rarityWeight: 100, color: '#f0a060', sx: 10, sy: 1 },
  // #2  Clownfish         (idx 1  → sx  1, sy 0)
  { species: 'Clownfish',      category: 'Common',   value: 0.8,   rarityWeight: 100, color: '#e87030', sx:  1, sy: 0 },
  // #41 Perch             (idx 40 → sx  4, sy 3)
  { species: 'Perch',          category: 'Common',   value: 1.0,   rarityWeight: 100, color: '#7a9a5a', sx:  4, sy: 3 },
  // #10 Goldfish          (idx 9  → sx  9, sy 0)
  { species: 'Goldfish',       category: 'Common',   value: 1.2,   rarityWeight: 100, color: '#f0c030', sx:  9, sy: 0 },
  // #60 Rainbow Trout     (idx 59 → sx 11, sy 4)
  { species: 'Rainbow Trout',  category: 'Common',   value: 1.5,   rarityWeight: 100, color: '#c898d8', sx: 11, sy: 4 },
  // ── Uncommon ─────────────────────────────────────────────────────────────
  // #33 Common Carp       (idx 32 → sx  8, sy 2)
  { species: 'Common Carp',    category: 'Uncommon', value: 3.0,   rarityWeight: 35,  color: '#9a8a5a', sx:  8, sy: 2 },
  // #54 Pike              (idx 53 → sx  5, sy 4)
  { species: 'Pike',           category: 'Uncommon', value: 4.5,   rarityWeight: 35,  color: '#4a6a3a', sx:  5, sy: 4 },
  // #12 Catfish           (idx 11 → sx 11, sy 0)
  { species: 'Catfish',        category: 'Uncommon', value: 6.5,   rarityWeight: 35,  color: '#7a6a5a', sx: 11, sy: 0 },
  // #28 Atlantic Salmon   (idx 27 → sx  3, sy 2)
  { species: 'Atlantic Salmon',category: 'Uncommon', value: 8.0,   rarityWeight: 35,  color: '#e8836b', sx:  3, sy: 2 },
  // #53 Bluefin Tuna      (idx 52 → sx  4, sy 4)
  { species: 'Bluefin Tuna',   category: 'Uncommon', value: 12.0,  rarityWeight: 35,  color: '#4a6a9a', sx:  4, sy: 4 },
  // ── Rare ─────────────────────────────────────────────────────────────────
  // #43 Lake Sturgeon     (idx 42 → sx  6, sy 3)
  { species: 'Lake Sturgeon',  category: 'Rare',     value: 25.0,  rarityWeight: 8,   color: '#8a8a9a', sx:  6, sy: 3 },
  // #35 Koi               (idx 34 → sx 10, sy 2)
  { species: 'Koi',            category: 'Rare',     value: 35.0,  rarityWeight: 8,   color: '#e85d30', sx: 10, sy: 2 },
  // #45 Swordfish         (idx 44 → sx  8, sy 3)
  { species: 'Swordfish',      category: 'Rare',     value: 50.0,  rarityWeight: 8,   color: '#7a9ac8', sx:  8, sy: 3 },
  // ── Epic ─────────────────────────────────────────────────────────────────
  // #86 Arapaima          (idx 85 → sx  1, sy 7)
  { species: 'Arapaima',       category: 'Epic',     value: 150.0, rarityWeight: 1.5, color: '#8a4a3a', sx:  1, sy: 7 },
  // #65 Oarfish           (idx 64 → sx  4, sy 5)
  { species: 'Oarfish',        category: 'Epic',     value: 220.0, rarityWeight: 1.5, color: '#c8a0a0', sx:  4, sy: 5 },
];

// Display preferences — kept in their own localStorage key, separate from
// the save-game data in js/save.js, since these are UI settings rather than
// gameplay state and shouldn't be wiped by Restart.
const SETTINGS_KEY = 'fishink_settings';
const DEFAULT_SETTINGS = { fullNumbers: false, individualSellToasts: true };
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
  } catch (e) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}
function toggleFullNumbers() {
  settings.fullNumbers = !settings.fullNumbers;
  saveSettings();
}
function toggleIndividualSellToasts() {
  settings.individualSellToasts = !settings.individualSellToasts;
  saveSettings();
}

// Compact cash formatting — plain comma-separated digits below a million,
// then short-scale suffixes (M/B/T/Qd/Qn/...) so totals that run for hours
// (top-bar cash, lifetime earnings) don't render as a wall of digits.
// settings.fullNumbers lets the player opt out and always see plain digits.
const MONEY_SUFFIXES = ['', '', 'M', 'B', 'T', 'Qd', 'Qn', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function formatMoney(n) {
  n = Math.floor(n);
  if (settings.fullNumbers || n < 1e6) return n.toLocaleString();
  const tier = Math.min(Math.floor(Math.log10(n) / 3), MONEY_SUFFIXES.length - 1);
  const scaled = n / Math.pow(10, tier * 3);
  const digits = parseFloat(scaled.toFixed(scaled < 10 ? 2 : 1));
  return `${digits}${MONEY_SUFFIXES[tier]}`;
}

const CATEGORY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic'];
const CATEGORY_COLOR = { Common: '#9aa0a8', Uncommon: '#4dca7c', Rare: '#5aa8e8', Epic: '#b86bdc' };

// One-time cash reward for discovering every species in a Fish Index category.
const FISH_INDEX_CATEGORY_BONUS = { Common: 100, Uncommon: 300, Rare: 1000, Epic: 3000 };

const SIZES = [
  { name: 'Tiny',   mult: 0.5, weight: 30 },
  { name: 'Small',  mult: 0.8, weight: 30 },
  { name: 'Medium', mult: 1.0, weight: 25 },
  { name: 'Large',  mult: 1.6, weight: 11 },
  { name: 'Huge',   mult: 2.5, weight: 4  },
];

// Each machine is only really good at certain fish categories (goodMult) —
// run the wrong category through it and it still works, just barely (badMult).
const MACHINE_DEFS = {
  WASHER:  { label: 'Washer',  processTime: 2.0, cost: 400,
             goodFor: ['Common', 'Uncommon'], goodMult: 1.6, badMult: 1.1  },
  ICER:    { label: 'Icer',    processTime: 1.5, cost: 600,
             goodFor: ['Common'],             goodMult: 1.8, badMult: 1.05 },
  SMOKER:  { label: 'Smoker',  processTime: 3.5, cost: 1200,
             goodFor: ['Uncommon', 'Rare'],    goodMult: 2.4, badMult: 1.2  },
  STAMPER: { label: 'Stamper', processTime: 4.0, cost: 3000,
             goodFor: ['Rare', 'Epic'],        goodMult: 3.5, badMult: 1.3  },
};

// Auto-fisher catch interval in seconds
const FISHER_INTERVAL = 5.0;
// Manual cast time
const CAST_TIME = 3.0;

const DAY_CYCLE_SECONDS = 3600;

function weightedRandom(pool, weightKey) {
  const total = pool.reduce((s, e) => s + e[weightKey], 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= e[weightKey]; if (r <= 0) return e; }
  return pool[pool.length - 1];
}

// luckMult > 1 boosts the weight of every non-Common species (a leveled-up
// Fisher's effect — see fisherLuckMult in upgrades.js), leaving Common's odds
// as the fixed baseline so the bias is purely "rarer fish come up more often"
// rather than uniformly rescaling the whole pool.
function randomFish(luckMult = 1) {
  const pool = luckMult === 1 ? FISH : FISH.map(f => ({
    ...f, rarityWeight: f.category === 'Common' ? f.rarityWeight : f.rarityWeight * luckMult,
  }));
  const spec = weightedRandom(pool, 'rarityWeight');
  const size  = weightedRandom(SIZES, 'weight');
  const value = Math.round(spec.value * size.mult * 10) / 10;
  // first catch of a species unlocks it in the Fish Index tab — only species
  // discoveries can ever complete a category, so only bother checking then,
  // instead of re-scanning the whole category on every single catch.
  const wasNew = !game.fishIndex.has(spec.species);
  game.fishIndex.add(spec.species);
  if (wasNew) maybeAwardFishIndexCategoryBonus(spec.category);
  return { species: spec.species, category: spec.category, size: size.name,
           value, color: spec.color, sx: spec.sx, sy: spec.sy, mults: [],
           wigglePhase: Math.random() * Math.PI * 2 };
}

// Pays out once, the moment every species in a category has been caught at
// least once — only ever called right after a NEW species is added to fishIndex.
function maybeAwardFishIndexCategoryBonus(category) {
  if (game.fishIndexBonuses.has(category)) return;
  const catSpecies = FISH.filter(f => f.category === category);
  if (!catSpecies.every(f => game.fishIndex.has(f.species))) return;
  game.fishIndexBonuses.add(category);
  const bonus = FISH_INDEX_CATEGORY_BONUS[category];
  awardCash(bonus, `Fish Index complete: ${category}! +$${bonus}`, CATEGORY_COLOR[category]);
}

// Quality Sorter's routing rule — fish at or above `threshold` (a SIZES index,
// player-configurable per-instance via the Sorter's E-key settings menu) count
// as "big" and exit toward st.dir; smaller fish exit the opposite side.
function isBigFish(fish, threshold = 2) {
  const idx = SIZES.findIndex(s => s.name === fish.size);
  return idx >= threshold;
}
