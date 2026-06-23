// Fish INK Factory — Research tree: one-shot late-game cash sink, unlocked
// once a player has earned enough lifetime cash to have maxed everything else.

const RESEARCH_UNLOCK_LIFETIME = 50000;

const RESEARCH_NODES = [
  { id: 'capTier2', name: 'Advanced Tooling', desc: "Raises every machine's upgrade cap from Lv 5 to Lv 8", cost: 8000, requires: null },
  { id: 'capTier3', name: 'Precision Engineering', desc: "Raises every machine's upgrade cap from Lv 8 to Lv 10", cost: 25000, requires: 'capTier2' },
  { id: 'globalSellBonus', name: 'Automation Bonus', desc: 'All fish sell for +10% (stacks with Market Contacts)', cost: 15000, requires: null },
  { id: 'crateCapacity', name: 'Crate Expansion', desc: 'Storage Crates hold 20 more items (40 total)', cost: 6000, requires: null },
];

const researchLevels = { capTier2: 0, capTier3: 0, globalSellBonus: 0, crateCapacity: 0 };

function isResearchUnlocked() { return game.lifetimeEarned >= RESEARCH_UNLOCK_LIFETIME; }

function researchCost(def) {
  if (researchLevels[def.id] >= 1) return null;
  if (def.requires && researchLevels[def.requires] < 1) return null;
  return def.cost;
}

function buyResearch(id) {
  const def = RESEARCH_NODES.find(n => n.id === id);
  if (!def) return false;
  const cost = researchCost(def);
  if (cost == null) { queueToast('Not available yet', '#9aa0a8'); return false; }
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return false; }
  game.cash -= cost;
  researchLevels[id] = 1;
  sfxCoin();
  queueToast(`Research complete: ${def.name}!`, '#4dca7c');
  saveGame();
  return true;
}

function machineUpgradeCapFor(id) {
  if (researchLevels.capTier3) return 10;
  if (researchLevels.capTier2) return 8;
  return MACHINE_UPGRADE_MAX_LEVEL;
}
function researchSellMult() { return 1 + researchLevels.globalSellBonus * 0.10; }
function researchCrateCapacity() { return CRATE_CAPACITY + researchLevels.crateCapacity * 20; }
