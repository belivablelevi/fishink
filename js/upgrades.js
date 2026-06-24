// Fish INK Factory — upgrades: persistent stat boosts bought with cash

const UPGRADES = [
  { id: 'castSpeed',   name: 'Quick Cast',         desc: 'Casting lands a catch faster', baseCost: 200, costMult: 1.8, maxLevel: 5, perLevel: 0.15, suffix: ' cast time' },
  { id: 'beltSpeed',   name: 'Belt Motors',        desc: 'Belts move fish faster',      baseCost: 250, costMult: 1.8, maxLevel: 5, perLevel: 0.15, suffix: ' belt speed' },
  { id: 'maxHeld',     name: 'Tackle Bag',         desc: 'Carry more fish by hand',     baseCost: 180, costMult: 1.6, maxLevel: 4, perLevel: 2,    suffix: ' max held', flat: true },
  { id: 'fisherSpeed', name: 'Auto-Fisher Tuning', desc: 'Auto-fishers catch faster',   baseCost: 300, costMult: 1.8, maxLevel: 5, perLevel: 0.12, suffix: ' catch interval' },
  { id: 'sellPrice',   name: 'Market Contacts',    desc: 'Sell fish for more cash',     baseCost: 350, costMult: 2.0, maxLevel: 5, perLevel: 0.10, suffix: ' sell price' },
  { id: 'droneFisherSpeed',   name: 'Drone Engine Tuning', desc: 'Fishing Drones fly and fish faster',
    baseCost: 500, costMult: 1.8, maxLevel: 5, perLevel: 0.15, suffix: ' drone speed' },
  { id: 'droneDeliveryBonus', name: 'Delivery Network',    desc: 'Delivery Drones sell for more',
    baseCost: 600, costMult: 1.8, maxLevel: 5, perLevel: 0.08, suffix: ' drone delivery bonus' },
];

const upgradeLevels = { castSpeed: 0, beltSpeed: 0, maxHeld: 0, fisherSpeed: 0, sellPrice: 0,
                        droneFisherSpeed: 0, droneDeliveryBonus: 0 };

function upgradeCost(def) {
  const lvl = upgradeLevels[def.id];
  if (lvl >= globalUpgradeCapFor(def.id)) return null;
  return Math.round(def.baseCost * Math.pow(def.costMult, lvl));
}

// Split current vs. next-level effect strings for the two-sided upgrade display.
function upgradeEffectParts(def) {
  const lvl = upgradeLevels[def.id];
  const next = lvl + 1;
  if (def.flat) {
    return { current: `+${def.perLevel * lvl}${def.suffix}`, next: `+${def.perLevel * next}${def.suffix}` };
  }
  const sign = def.suffix.includes('interval') || def.suffix.includes('cast time') ? '-' : '+';
  return {
    current: `${sign}${Math.round(def.perLevel * lvl * 100)}%${def.suffix}`,
    next: `${sign}${Math.round(def.perLevel * next * 100)}%${def.suffix}`,
  };
}

function buyUpgrade(id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def) return false;
  const cost = upgradeCost(def);
  if (cost == null) { queueToast('Already maxed!', '#e8a030'); return false; }
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return false; }
  game.cash -= cost;
  upgradeLevels[id]++;
  sfxUpgrade();
  queueToast(`${def.name} upgraded! (Lv ${upgradeLevels[id]})`, '#4dca7c');
  saveGame();
  return true;
}

// ─── Derived gameplay values (base stat × upgrade level) ──────────────────────
function effectiveCastTime()       { return CAST_TIME * (1 - upgradeLevels.castSpeed * 0.15); }
function effectiveBeltSpeed()      { return BELT_SPEED * (1 + upgradeLevels.beltSpeed * 0.15); }
function effectiveMaxHeld()        { return MAX_HELD + upgradeLevels.maxHeld * 2; }
function effectiveFisherInterval() { return FISHER_INTERVAL * (1 - upgradeLevels.fisherSpeed * 0.12); }
function effectiveSellMult()       { return 1 + upgradeLevels.sellPrice * 0.10; }
function effectiveDroneSpeedMult()      { return 1 + upgradeLevels.droneFisherSpeed * 0.15; }
function effectiveDroneDeliveryBonus()  { return 1.10 + upgradeLevels.droneDeliveryBonus * 0.08; }

// ─── Per-instance upgrades ───────────────────────────────────────────────────
// Separate from the global tree above — click/E a placed instance of any
// IS_UPGRADABLE block (the four processing machines, Fisher, Drone Fisher,
// Recycler, Packer, Drone Delivery) to level up that *specific* block. Cost
// scales off that block's own price, so pricier blocks cost more per level.
const MACHINE_UPGRADE_MAX_LEVEL    = 5;
const MACHINE_UPGRADE_COST_MULT    = 1.9;
const MACHINE_UPGRADE_SPEED_PER_LV = 0.08; // -8% process/catch/trip time per level
const MACHINE_UPGRADE_VALUE_PER_LV = 0.08; // +8% value/payout multiplier per level
const MACHINE_UPGRADE_LUCK_PER_LV  = 0.25; // +25% weight on Uncommon+ catches per level

// Which stat(s) leveling a given block improves — production blocks (Fisher,
// Drone Fisher) get faster, sinks (Recycler, Drone Delivery) pay out more,
// and the four processing machines plus Packer get both. Fisher additionally
// gets luck (better odds at rarer fish) since speed alone doesn't make a
// leveled-up Fisher feel meaningfully better once belts are already the
// bottleneck. Drives the popup's effect text; sim.js/data.js apply the
// matching mult at each block's own site.
const UPGRADABLE_EFFECTS = {
  [B_WASHER]:         { speed: true,  value: true,  luck: false },
  [B_SMOKER]:         { speed: true,  value: true,  luck: false },
  [B_ICER]:           { speed: true,  value: true,  luck: false },
  [B_STAMPER]:        { speed: true,  value: true,  luck: false },
  [B_FISHER]:         { speed: true,  value: false, luck: true  },
  [B_DRONE_FISHER]:   { speed: true,  value: false, luck: 'penalty' },
  [B_RECYCLER]:       { speed: false, value: true,  luck: false },
  [B_PACKER]:         { speed: true,  value: true,  luck: false },
  [B_DRONE_DELIVERY]: { speed: false, value: true,  luck: false },
};

function machineUpgradeCost(id, level) {
  if (level >= machineUpgradeCapFor(id)) return null;
  const base = Math.round(BLOCK_COSTS[id] * 0.5);
  return Math.round(base * Math.pow(MACHINE_UPGRADE_COST_MULT, level));
}

function machineSpeedMult(level) { return 1 - level * MACHINE_UPGRADE_SPEED_PER_LV; }
function machineValueMult(level) { return 1 + level * MACHINE_UPGRADE_VALUE_PER_LV; }
function fisherLuckMult(level)   { return 1 + level * MACHINE_UPGRADE_LUCK_PER_LV; }

const DRONE_LUCK_PENALTY = 0.6; // Drone Fisher catches rarer fish at 60% normal odds, before leveling
function droneLuckMult(level) {
  // Per-level recovery claws back some of the penalty but a maxed drone
  // (0.6 + 5*0.06 = 0.9) never reaches a level-0 Fisher's baseline (1.0),
  // let alone a maxed Fisher's 2.25x — Drone Fisher wins on throughput,
  // Fisher wins on quality.
  return Math.min(1, DRONE_LUCK_PENALTY + level * 0.06);
}

function buyMachineUpgrade(c, r) {
  const id = blockAt(c, r);
  if (!IS_UPGRADABLE(id)) return false;
  const st = stateAt(c, r);
  const level = st.level || 0;
  const cost = machineUpgradeCost(id, level);
  if (cost == null) { queueToast('Already maxed!', '#e8a030'); return false; }
  if (game.cash < cost) { queueToast('Not enough cash!', '#e85d4a'); sfxFail(); return false; }
  game.cash -= cost;
  st.level = level + 1;
  game.maxMachineLevel = Math.max(game.maxMachineLevel, st.level);
  sfxUpgrade();
  queueToast(`${BLOCK_NAMES[id]} upgraded! (Lv ${st.level})`, '#4dca7c');
  // The player just used the mechanic the upgrade tip was teaching — no need
  // to keep showing it.
  if (UPGRADE_TIP.active) dismissUpgradeTip();
  saveGame();
  return true;
}
