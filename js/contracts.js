// Fish INK Factory — contracts: standing orders that pay a premium for specific fish

const CONTRACT_REWARD_PER_UNIT = { Common: 4, Uncommon: 14, Rare: 60, Epic: 260 };

const activeContracts = [];
let contractSpawnTimer = 20;
let nextContractId = 1;

// Contracts never expire, but a new one won't appear until every current
// contract has been claimed — finishing the queue, not the clock, is what
// gates fresh work.
function updateContracts(dt) {
  contractSpawnTimer -= dt;
  if (contractSpawnTimer <= 0 && activeContracts.length === 0) {
    spawnContract();
    contractSpawnTimer = 35 + Math.random() * 25;
  }
}

function spawnContract() {
  const category = CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
  const qty    = 3 + Math.floor(Math.random() * 6);
  const reward = Math.round(qty * CONTRACT_REWARD_PER_UNIT[category] * (1 + Math.random() * 0.4));
  const contract = {
    id: nextContractId++,
    category,
    qty,
    have: 0,
    reward,
    completed: false,
  };
  activeContracts.push(contract);
  queueToast(`New contract: ${qty}× ${category} fish for $${reward}`, '#e8a030');
}

// Credits a sold fish toward a matching contract on top of its normal sale —
// selling into a contract is strictly better than selling elsewhere, never worse.
// Among multiple matching contracts, fills whichever is closest to completion
// first, so a near-finished order isn't left to languish behind an older one.
// Returns true if the fish counted toward a contract, so callers can flag the sale.
function tryFulfillContract(fish) {
  let best = null;
  for (const c of activeContracts) {
    if (c.completed || c.category !== fish.category) continue;
    if (!best || (c.qty - c.have) < (best.qty - best.have)) best = c;
  }
  if (!best) return false;

  best.have++;
  if (best.have >= best.qty) {
    best.completed = true;
    queueToast(`Contract ready to claim: ${best.category} fish (+$${best.reward})`, '#4dca7c');
    if (ZOOM > MACHINE_SFX_ZOOM_THRESHOLD) sfxContractReady();
  } else {
    // A bank of sellers/drones can all feed the same contract within the same
    // second — coalesce into one updating line per contract instead of one
    // toast per matching fish.
    const existing = toasts.find(t => t.key === `contract:${best.id}` && t.life > 0);
    if (existing) {
      existing.msg = `${fish.species} → contract (${best.have}/${best.qty})`;
      existing.life = 2.2;
    } else {
      toasts.push({ key: `contract:${best.id}`, msg: `${fish.species} → contract (${best.have}/${best.qty})`, color: '#7ab8e8', life: 2.2 });
    }
  }
  return true;
}

// Pays out a completed contract's reward and frees its slot — called from the
// Contracts panel's Claim button, never automatically.
function claimContract(id) {
  const idx = activeContracts.findIndex(c => c.id === id);
  if (idx === -1) return;
  const c = activeContracts[idx];
  if (!c.completed) return;
  activeContracts.splice(idx, 1);
  game.contractsClaimed++;
  awardCash(c.reward, `Contract claimed! +$${c.reward}`, '#4dca7c');
  saveGame();
}
