// Fish INK Factory — prestige: permanent meta-progression that survives a reset

const PRESTIGE_KEY = 'fishink_prestige';
const PRESTIGE_TOKEN_DIVISOR = 50000; // $50k lifetime earned ≈ 1 Fish Token
const STARTCASH_PER_LEVEL = 200;

const PRESTIGE_UPGRADES = [
  { id: 'startCash',   name: 'Seed Capital',      desc: '+$200 starting cash per level',                     baseCost: 1, costMult: 1.5, maxLevel: 10 },
  { id: 'globalSell',  name: 'Veteran Trader',    desc: '+2% sell price per level (all sales)',               baseCost: 1, costMult: 1.6, maxLevel: 15 },
  { id: 'fasterStart', name: 'Quick Start',       desc: '+10% catch/process speed per level',                 baseCost: 1, costMult: 1.6, maxLevel: 10 },
  { id: 'unlockGate',  name: 'Industry Contacts', desc: 'Research unlock threshold lowered by $5,000/level',  baseCost: 1, costMult: 1.7, maxLevel: 8 },
];

const prestigeTokens = { total: 0 };
const prestigeLevels = { startCash: 0, globalSell: 0, fasterStart: 0, unlockGate: 0 };

// Separate localStorage key from the run save — must survive restartGame()'s
// removeItem(SAVE_KEY) wipe, so prestige progress isn't lost on reset.
(function loadPrestige() {
  try {
    const raw = localStorage.getItem(PRESTIGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.total === 'number') prestigeTokens.total = data.total;
    Object.assign(prestigeLevels, data.levels || {});
  } catch (e) {
    console.warn('Prestige load failed', e);
  }
})();

function savePrestige() {
  try {
    localStorage.setItem(PRESTIGE_KEY, JSON.stringify({ total: prestigeTokens.total, levels: prestigeLevels }));
  } catch (e) {
    console.warn('Prestige save failed', e);
  }
}

function tokensAvailableOnReset() { return Math.floor(game.lifetimeEarned / PRESTIGE_TOKEN_DIVISOR); }

function prestigeUpgradeCost(def) {
  const lvl = prestigeLevels[def.id];
  if (lvl >= def.maxLevel) return null;
  return Math.round(def.baseCost * Math.pow(def.costMult, lvl));
}

function buyPrestigeUpgrade(id) {
  const def = PRESTIGE_UPGRADES.find(u => u.id === id);
  if (!def) return false;
  const cost = prestigeUpgradeCost(def);
  if (cost == null) { queueToast('Already maxed!', '#e8a030'); return false; }
  if (prestigeTokens.total < cost) { queueToast('Not enough Fish Tokens!', '#e85d4a'); return false; }
  prestigeTokens.total -= cost;
  prestigeLevels[id]++;
  savePrestige();
  // Other prestige upgrades (sell/speed/unlock-gate) apply live every frame
  // via their effective* getters, so buying them is felt immediately.
  // Seed Capital only feeds game.cash at sim init, so without this the
  // purchase would do nothing until the player actually prestiges.
  if (id === 'startCash') { game.cash += STARTCASH_PER_LEVEL; cashGuard.grant(STARTCASH_PER_LEVEL); }
  queueToast(`${def.name} upgraded! (Lv ${prestigeLevels[id]})`, '#4dca7c');
  return true;
}

function prestigeSellMult()  { return 1 + prestigeLevels.globalSell * 0.02; }
function prestigeSpeedMult() { return Math.max(0.08, 1 - prestigeLevels.fasterStart * 0.10); }
function prestigeStartCash() { return 50 + prestigeLevels.startCash * STARTCASH_PER_LEVEL; }
function prestigeUnlockDiscount() { return prestigeLevels.unlockGate * 5000; }

let _prestigeInProgress = false;

function doPrestige() {
  if (_prestigeInProgress) return false;
  const earned = tokensAvailableOnReset();
  if (earned < 1) { queueToast('Need more lifetime earnings to prestige', '#9aa0a8'); return false; }
  _prestigeInProgress = true;
  prestigeTokens.total += earned;
  savePrestige();
  // Fade out to black before the reset so it feels like a deliberate moment
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.6s ease';
  document.body.appendChild(veil);
  requestAnimationFrame(() => { veil.style.opacity = '1'; });
  setTimeout(() => {
    resetRun(); // soft reset — keeps the tokens just banked; PRESTIGE_KEY is untouched
  }, 650);
  return true;
}
