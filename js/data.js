// Fish INK Factory — static data

// sprite: column/row in fishes.png (32×32 per cell, 12×12 grid)
// sx = (species_number - 1) % 12,  sy = floor((species_number - 1) / 12)
const FISH = [
  // ── Common ──────────────────────────────────────────────────────
  { species: 'Progenetica', category: 'Common', value: 0.4, rarityWeight: 110, color: '#c8d0d0', sx:  0, sy: 0 },
  { species: 'European Anchovy', category: 'Common', value: 0.5, rarityWeight: 110, color: '#c8c8a0', sx: 11, sy: 5 },
  { species: 'Roule\'s Goby', category: 'Common', value: 0.6, rarityWeight: 100, color: '#7890a0', sx:  4, sy: 1 },
  { species: 'Guppy', category: 'Common', value: 0.6, rarityWeight: 100, color: '#f0a060', sx: 10, sy: 1 },
  { species: 'Zebrafish', category: 'Common', value: 0.6, rarityWeight: 100, color: '#3050a0', sx:  2, sy: 3 },
  { species: 'Petticoat Tetra', category: 'Common', value: 0.6, rarityWeight: 100, color: '#2040a0', sx:  3, sy: 3 },
  { species: 'Sailfin Molly', category: 'Common', value: 0.8, rarityWeight: 90, color: '#707890', sx: 11, sy: 1 },
  { species: 'Emperor Tetra', category: 'Common', value: 0.8, rarityWeight: 100, color: '#604880', sx:  1, sy: 3 },
  { species: 'Sardine', category: 'Common', value: 0.8, rarityWeight: 100, color: '#a0b8c0', sx: 10, sy: 3 },
  { species: 'Cardinal Tetra', category: 'Common', value: 0.9, rarityWeight: 100, color: '#e03020', sx:  0, sy: 3 },
  { species: 'Atlantic Herring', category: 'Common', value: 0.9, rarityWeight: 100, color: '#7a9ab8', sx: 11, sy: 3 },
  { species: 'Cherry Barb', category: 'Common', value: 0.9, rarityWeight: 90, color: '#c03030', sx:  8, sy: 4 },
  { species: 'Clownfish', category: 'Common', value: 1.0, rarityWeight: 100, color: '#e87030', sx:  1, sy: 0 },
  { species: 'Tiger Barb', category: 'Common', value: 1.0, rarityWeight: 90, color: '#e08020', sx:  7, sy: 4 },
  { species: 'Sea Cucumber', category: 'Common', value: 1.0, rarityWeight: 90, color: '#806040', sx:  0, sy: 11 },
  { species: 'Flying Fish', category: 'Common', value: 1.1, rarityWeight: 90, color: '#6080c0', sx:  9, sy: 1 },
  { species: 'Blue Tang', category: 'Common', value: 1.2, rarityWeight: 100, color: '#1870c8', sx:  2, sy: 0 },
  { species: 'Fighting Fish', category: 'Common', value: 1.2, rarityWeight: 80, color: '#9020c0', sx: 10, sy: 0 },
  { species: 'Perch', category: 'Common', value: 1.2, rarityWeight: 90, color: '#7a9a5a', sx:  4, sy: 3 },
  { species: 'Bartlett\'s Anthias', category: 'Common', value: 1.2, rarityWeight: 85, color: '#e06070', sx:  6, sy: 6 },
  { species: 'Blue Acara', category: 'Common', value: 1.2, rarityWeight: 80, color: '#3078b0', sx:  9, sy: 6 },
  { species: 'Dwarf Gourami', category: 'Common', value: 1.2, rarityWeight: 85, color: '#e06828', sx: 11, sy: 6 },
  { species: 'Hillstream Loach', category: 'Common', value: 1.2, rarityWeight: 85, color: '#806840', sx: 10, sy: 7 },
  { species: 'Mediterranean Mussel', category: 'Common', value: 1.2, rarityWeight: 90, color: '#504878', sx:  4, sy: 8 },
  { species: 'Sea Sponge', category: 'Common', value: 1.2, rarityWeight: 90, color: '#f0c030', sx:  6, sy: 9 },
  { species: 'Shrimp', category: 'Common', value: 1.2, rarityWeight: 90, color: '#f0a080', sx:  4, sy: 10 },
  { species: 'Yellow Tang', category: 'Common', value: 1.4, rarityWeight: 90, color: '#f0d020', sx:  3, sy: 0 },
  { species: 'Angelfish', category: 'Common', value: 1.5, rarityWeight: 80, color: '#b8c8c0', sx:  6, sy: 0 },
  { species: 'Goldfish', category: 'Common', value: 1.5, rarityWeight: 100, color: '#f0c030', sx:  9, sy: 0 },
  { species: 'Atlantic Trumpetfish', category: 'Common', value: 1.5, rarityWeight: 80, color: '#f0d070', sx:  5, sy: 6 },
  { species: 'Boeseman\'s Rainbowfish', category: 'Common', value: 1.5, rarityWeight: 85, color: '#e08030', sx:  9, sy: 7 },
  { species: 'Hard Clam', category: 'Common', value: 1.5, rarityWeight: 85, color: '#c0b8a0', sx:  2, sy: 8 },
  { species: 'Common Starfish', category: 'Common', value: 1.5, rarityWeight: 85, color: '#e04020', sx:  5, sy: 9 },
  { species: 'Fire Goby', category: 'Common', value: 1.6, rarityWeight: 80, color: '#e06010', sx:  7, sy: 6 },
  { species: 'Clown Loach', category: 'Common', value: 1.6, rarityWeight: 80, color: '#e06020', sx:  0, sy: 7 },
  { species: 'Catfish', category: 'Common', value: 1.9, rarityWeight: 70, color: '#7a6a5a', sx: 11, sy: 0 },
  { species: 'Garfish', category: 'Common', value: 1.9, rarityWeight: 80, color: '#60a860', sx:  9, sy: 3 },
  { species: 'Hake', category: 'Common', value: 1.9, rarityWeight: 75, color: '#909898', sx:  3, sy: 4 },
  { species: 'Common Barbel', category: 'Common', value: 1.9, rarityWeight: 80, color: '#907848', sx:  6, sy: 4 },
  { species: 'Rainbow Trout', category: 'Common', value: 1.9, rarityWeight: 80, color: '#c898d8', sx: 11, sy: 4 },
  { species: 'Raccoon Butterflyfish', category: 'Common', value: 1.9, rarityWeight: 80, color: '#f0c028', sx:  4, sy: 6 },
  { species: 'Oscar', category: 'Common', value: 1.9, rarityWeight: 80, color: '#c06818', sx: 10, sy: 6 },
  { species: 'Bluehead Wrasse', category: 'Common', value: 1.9, rarityWeight: 80, color: '#2060a0', sx:  7, sy: 7 },
  { species: 'Pacific Oyster', category: 'Common', value: 1.9, rarityWeight: 80, color: '#a0a8a0', sx:  0, sy: 8 },
  { species: 'Spiny Cockle', category: 'Common', value: 1.9, rarityWeight: 85, color: '#e0c090', sx:  6, sy: 8 },
  { species: 'Nomad Jellyfish', category: 'Common', value: 1.9, rarityWeight: 80, color: '#e08870', sx:  8, sy: 8 },
  { species: 'Moon Jelly', category: 'Common', value: 1.9, rarityWeight: 80, color: '#d0e8f0', sx: 10, sy: 8 },
  { species: 'Cushion Star', category: 'Common', value: 1.9, rarityWeight: 85, color: '#e07030', sx:  4, sy: 9 },
  { species: 'Hermit Crab', category: 'Common', value: 1.9, rarityWeight: 85, color: '#c88040', sx:  9, sy: 9 },
  { species: 'Goose Barnacle', category: 'Common', value: 1.9, rarityWeight: 80, color: '#a0b0b0', sx:  8, sy: 10 },
  { species: 'Tench', category: 'Common', value: 2.2, rarityWeight: 70, color: '#607840', sx:  9, sy: 2 },
  { species: 'Blackspot Seabream', category: 'Common', value: 2.2, rarityWeight: 75, color: '#a09880', sx:  0, sy: 4 },
  { species: 'Atlantic Spadefish', category: 'Common', value: 2.2, rarityWeight: 75, color: '#a8a8a8', sx:  8, sy: 6 },
  { species: 'Lumpfish', category: 'Common', value: 2.2, rarityWeight: 75, color: '#5880a0', sx:  8, sy: 7 },
  { species: 'Fried Egg Jellyfish', category: 'Common', value: 2.2, rarityWeight: 80, color: '#f0e060', sx:  7, sy: 8 },
  { species: 'Common Squid', category: 'Common', value: 2.2, rarityWeight: 80, color: '#9070b0', sx:  3, sy: 9 },
  { species: 'Common Carp', category: 'Common', value: 2.5, rarityWeight: 70, color: '#9a8a5a', sx:  8, sy: 2 },
  { species: 'Great Scallop', category: 'Common', value: 2.5, rarityWeight: 80, color: '#f0d0b0', sx:  5, sy: 8 },
  { species: 'Sea Urchin', category: 'Common', value: 2.5, rarityWeight: 80, color: '#202020', sx:  7, sy: 9 },
  { species: 'Blue Crab', category: 'Common', value: 2.5, rarityWeight: 80, color: '#3050c0', sx: 10, sy: 9 },
  { species: 'Atlantic Crayfish', category: 'Common', value: 2.5, rarityWeight: 75, color: '#c04020', sx:  1, sy: 10 },
  // ── Uncommon ────────────────────────────────────────────────────
  { species: 'Greater Weever', category: 'Uncommon', value: 4.0, rarityWeight: 35, color: '#987848', sx:  0, sy: 2 },
  { species: 'Sea Butterfly', category: 'Uncommon', value: 5.0, rarityWeight: 35, color: '#c0d8f0', sx: 10, sy: 10 },
  { species: 'Spotted Pufferfish', category: 'Uncommon', value: 5.5, rarityWeight: 35, color: '#c8b060', sx:  1, sy: 1 },
  { species: 'Sailfin Tang', category: 'Uncommon', value: 6.0, rarityWeight: 32, color: '#3858a8', sx:  5, sy: 0 },
  { species: 'Japanese Trout', category: 'Uncommon', value: 6.0, rarityWeight: 30, color: '#b08868', sx:  4, sy: 2 },
  { species: 'River Lamprey', category: 'Uncommon', value: 6.0, rarityWeight: 30, color: '#607050', sx:  3, sy: 6 },
  { species: 'Flame Jellyfish', category: 'Uncommon', value: 6.0, rarityWeight: 32, color: '#e04020', sx: 11, sy: 8 },
  { species: 'Porcupinefish', category: 'Uncommon', value: 6.5, rarityWeight: 35, color: '#c0a060', sx:  0, sy: 1 },
  { species: 'Gem Tang', category: 'Uncommon', value: 7.0, rarityWeight: 32, color: '#304870', sx:  4, sy: 0 },
  { species: 'Harlequin Snake Eel', category: 'Uncommon', value: 7.0, rarityWeight: 28, color: '#e0d0a0', sx:  3, sy: 5 },
  { species: 'Horseshoe Crab', category: 'Uncommon', value: 7.0, rarityWeight: 30, color: '#806840', sx:  0, sy: 10 },
  { species: 'French Angelfish', category: 'Uncommon', value: 8.0, rarityWeight: 28, color: '#202828', sx:  8, sy: 0 },
  { species: 'Red Piranha', category: 'Uncommon', value: 8.0, rarityWeight: 28, color: '#c03020', sx:  5, sy: 1 },
  { species: 'Atlantic Salmon', category: 'Uncommon', value: 8.0, rarityWeight: 35, color: '#e0836b', sx:  3, sy: 2 },
  { species: 'Gilthead Seabream', category: 'Uncommon', value: 8.0, rarityWeight: 30, color: '#c0a860', sx:  1, sy: 4 },
  { species: 'European Conger', category: 'Uncommon', value: 8.0, rarityWeight: 28, color: '#605050', sx:  2, sy: 5 },
  { species: 'Seahorse', category: 'Uncommon', value: 8.0, rarityWeight: 30, color: '#e09830', sx: 11, sy: 7 },
  { species: 'Common Octopus', category: 'Uncommon', value: 8.0, rarityWeight: 30, color: '#702040', sx:  0, sy: 9 },
  { species: 'Queen Angelfish', category: 'Uncommon', value: 9.0, rarityWeight: 28, color: '#e0c020', sx:  7, sy: 0 },
  { species: 'Mahi-Mahi', category: 'Uncommon', value: 9.0, rarityWeight: 30, color: '#30c8a0', sx:  3, sy: 1 },
  { species: 'Sockeye Salmon', category: 'Uncommon', value: 9.0, rarityWeight: 28, color: '#e05030', sx:  1, sy: 2 },
  { species: 'Longnose Gar', category: 'Uncommon', value: 9.0, rarityWeight: 28, color: '#687848', sx:  6, sy: 5 },
  { species: 'Senegal Bichir', category: 'Uncommon', value: 9.0, rarityWeight: 28, color: '#7a7050', sx:  8, sy: 5 },
  { species: 'Hogfish', category: 'Uncommon', value: 9.0, rarityWeight: 28, color: '#c05870', sx:  6, sy: 7 },
  { species: 'Barracuda', category: 'Uncommon', value: 10.0, rarityWeight: 25, color: '#4a7a8a', sx: 11, sy: 2 },
  { species: 'Atlantic Cod', category: 'Uncommon', value: 10.0, rarityWeight: 28, color: '#a09070', sx:  2, sy: 4 },
  { species: 'Pike', category: 'Uncommon', value: 10.0, rarityWeight: 28, color: '#4a6a3a', sx:  5, sy: 4 },
  { species: 'Banggai Cardinalfish', category: 'Uncommon', value: 10.0, rarityWeight: 25, color: '#202828', sx:  4, sy: 7 },
  { species: 'Monkfish', category: 'Uncommon', value: 11.0, rarityWeight: 25, color: '#9a8060', sx:  5, sy: 2 },
  { species: 'Saddled Bichir', category: 'Uncommon', value: 11.0, rarityWeight: 25, color: '#807040', sx:  7, sy: 5 },
  { species: 'Common Stingray', category: 'Uncommon', value: 11.0, rarityWeight: 25, color: '#8090a8', sx:  1, sy: 6 },
  { species: 'Koi', category: 'Uncommon', value: 12.0, rarityWeight: 25, color: '#e85d30', sx: 10, sy: 2 },
  { species: 'Ribbon Eel', category: 'Uncommon', value: 12.0, rarityWeight: 25, color: '#f0e020', sx:  0, sy: 5 },
  { species: 'European Seabass', category: 'Uncommon', value: 12.0, rarityWeight: 25, color: '#9898a0', sx: 10, sy: 5 },
  { species: 'Longhorn Cowfish', category: 'Uncommon', value: 12.0, rarityWeight: 25, color: '#d0c030', sx:  5, sy: 7 },
  { species: 'Moorish Idol', category: 'Uncommon', value: 14.0, rarityWeight: 22, color: '#f0d030', sx:  3, sy: 7 },
  // ── Rare ────────────────────────────────────────────────────────
  { species: 'Lionfish', category: 'Rare', value: 28.0, rarityWeight: 9, color: '#e04818', sx:  6, sy: 1 },
  { species: 'Red Scorpionfish', category: 'Rare', value: 30.0, rarityWeight: 8, color: '#b82018', sx:  7, sy: 1 },
  { species: 'Stonefish', category: 'Rare', value: 32.0, rarityWeight: 7, color: '#807060', sx:  8, sy: 1 },
  { species: 'Hairy Frogfish', category: 'Rare', value: 35.0, rarityWeight: 8, color: '#c08040', sx:  7, sy: 2 },
  { species: 'Portuguese Man-o-War', category: 'Rare', value: 35.0, rarityWeight: 9, color: '#9060d0', sx:  9, sy: 8 },
  { species: 'Anglerfish', category: 'Rare', value: 38.0, rarityWeight: 8, color: '#201818', sx:  6, sy: 2 },
  { species: 'Ocean Sunfish', category: 'Rare', value: 40.0, rarityWeight: 8, color: '#9ab0b8', sx:  2, sy: 1 },
  { species: 'Giant Clam', category: 'Rare', value: 40.0, rarityWeight: 8, color: '#80c0e0', sx:  3, sy: 8 },
  { species: 'Lake Sturgeon', category: 'Rare', value: 42.0, rarityWeight: 7, color: '#8a8a9a', sx:  6, sy: 3 },
  { species: 'Taimen', category: 'Rare', value: 45.0, rarityWeight: 7, color: '#887060', sx:  2, sy: 2 },
  { species: 'Starry Sturgeon', category: 'Rare', value: 45.0, rarityWeight: 7, color: '#707890', sx:  5, sy: 3 },
  { species: 'Pearl Oyster', category: 'Rare', value: 45.0, rarityWeight: 8, color: '#f0f0e0', sx:  1, sy: 8 },
  { species: 'Yeti Crab', category: 'Rare', value: 45.0, rarityWeight: 7, color: '#e8e8f0', sx: 11, sy: 9 },
  { species: 'Giant Moray Eel', category: 'Rare', value: 50.0, rarityWeight: 6, color: '#604828', sx:  1, sy: 5 },
  { species: 'Red King Crab', category: 'Rare', value: 50.0, rarityWeight: 6, color: '#c03020', sx:  8, sy: 9 },
  { species: 'Swordfish', category: 'Rare', value: 55.0, rarityWeight: 6, color: '#7a9ac8', sx:  8, sy: 3 },
  { species: 'Turbot', category: 'Rare', value: 55.0, rarityWeight: 7, color: '#c0a870', sx:  9, sy: 5 },
  { species: 'Flapjack Octopus', category: 'Rare', value: 55.0, rarityWeight: 6, color: '#e07060', sx:  1, sy: 9 },
  { species: 'Spiny Lobster', category: 'Rare', value: 55.0, rarityWeight: 6, color: '#c84020', sx:  3, sy: 10 },
  { species: 'Opah', category: 'Rare', value: 60.0, rarityWeight: 6, color: '#c03060', sx:  9, sy: 4 },
  { species: 'Common Lobster', category: 'Rare', value: 60.0, rarityWeight: 6, color: '#203098', sx:  2, sy: 10 },
  { species: 'Blue Discus', category: 'Rare', value: 65.0, rarityWeight: 5, color: '#2060c0', sx: 10, sy: 4 },
  { species: 'Giant Cuttlefish', category: 'Rare', value: 65.0, rarityWeight: 6, color: '#706858', sx: 11, sy: 10 },
  { species: 'Humphead Wrasse', category: 'Rare', value: 70.0, rarityWeight: 5, color: '#3070a0', sx:  0, sy: 6 },
  // ── Epic ────────────────────────────────────────────────────────
  { species: 'Green Sea Turtle', category: 'Epic', value: 180.0, rarityWeight: 1.5, color: '#408050', sx:  5, sy: 10 },
  { species: 'Striped Marlin', category: 'Epic', value: 200.0, rarityWeight: 1.5, color: '#3060c8', sx:  7, sy: 3 },
  { species: 'Chambered Nautilus', category: 'Epic', value: 250.0, rarityWeight: 1.0, color: '#e0d0a0', sx:  7, sy: 10 },
  { species: 'Mako Shark', category: 'Epic', value: 280.0, rarityWeight: 1.0, color: '#607080', sx:  2, sy: 6 },
  { species: 'Bluefin Tuna', category: 'Epic', value: 300.0, rarityWeight: 1.0, color: '#4a6a9a', sx:  4, sy: 4 },
  { species: 'Arapaima', category: 'Epic', value: 350.0, rarityWeight: 0.8, color: '#8a4a3a', sx:  1, sy: 7 },
  { species: 'Asian Arowana', category: 'Epic', value: 420.0, rarityWeight: 0.5, color: '#d09030', sx:  2, sy: 7 },
  // ── Legendary ───────────────────────────────────────────────────
  { species: 'Oarfish', category: 'Legendary', value: 800.0, rarityWeight: 0.1, color: '#c8a0a0', sx:  4, sy: 5 },
  { species: 'Axolotl', category: 'Legendary', value: 900.0, rarityWeight: 0.12, color: '#f090c0', sx:  6, sy: 10 },
  { species: 'Atlantic Giant Squid', category: 'Legendary', value: 1000.0, rarityWeight: 0.08, color: '#7020a0', sx:  2, sy: 9 },
  { species: 'Coelacanth', category: 'Legendary', value: 1200.0, rarityWeight: 0.05, color: '#204880', sx:  5, sy: 5 },
  { species: 'Blue Sea Dragon', category: 'Legendary', value: 1500.0, rarityWeight: 0.05, color: '#3070e0', sx:  9, sy: 10 },
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

const CATEGORY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const CATEGORY_COLOR = { Common: '#9aa0a8', Uncommon: '#4dca7c', Rare: '#5aa8e8', Epic: '#b86bdc', Legendary: '#f0c030' };

// One-time cash reward for discovering every species in a Fish Index category.
const FISH_INDEX_CATEGORY_BONUS = { Common: 100, Uncommon: 300, Rare: 1000, Epic: 3000, Legendary: 15000 };

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

const DAY_CYCLE_SECONDS = 600; // 10 real minutes = one in-game day (was 3600)

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
