// Fish INK Factory — achievements/milestones

const ACHIEVEMENTS = [
  { id: 'catch1',      name: 'First Catch',     desc: 'Catch your first fish',        reward: 50,    check: () => game.fishIndex.size >= 1 },
  { id: 'sell100',    name: 'Fish Monger',     desc: 'Sell 100 fish',                reward: 250,   check: () => game.fishSold >= 100 },
  { id: 'sell1000',   name: 'Mass Distributor', desc: 'Sell 1,000 fish',             reward: 1500,  check: () => game.fishSold >= 1000 },
  { id: 'earn10k',    name: 'Small Business',  desc: 'Earn $10,000 lifetime',        reward: 500,   check: () => game.lifetimeEarned >= 10000 },
  { id: 'earn100k',   name: 'Fish Tycoon',     desc: 'Earn $100,000 lifetime',       reward: 5000,  check: () => game.lifetimeEarned >= 100000 },
  { id: 'fullIndex',  name: 'Ichthyologist',   desc: 'Complete the Fish Index',      reward: 2000,  check: () => game.fishIndex.size >= FISH.length },
  { id: 'research1',   name: 'Innovator',       desc: 'Complete your first Research node', reward: 500,  check: () => Object.values(researchLevels).some(v => v >= 1) },
  { id: 'researchAll', name: 'Mad Scientist',   desc: 'Complete all Research nodes', reward: 5000, check: () => RESEARCH_NODES.every(n => researchLevels[n.id] >= 1) },
  { id: 'rareCatch1',   name: 'Lucky Catch',     desc: 'Catch your first rare fish',        reward: 250,  check: () => game.rareCatches >= 1 },
  { id: 'rareCatch50',  name: 'Rare Hunter',      desc: 'Catch 50 rare fish',                reward: 1500, check: () => game.rareCatches >= 50 },
  { id: 'builder50',    name: 'Foreman',          desc: 'Place 50 blocks total',             reward: 500,  check: () => game.blocksPlaced >= 50 },
  { id: 'builder250',   name: 'Industrialist',    desc: 'Place 250 blocks total',            reward: 2000, check: () => game.blocksPlaced >= 250 },
  { id: 'machineLv5',   name: 'Fully Tuned',      desc: 'Max a machine to level 5',          reward: 1000, check: () => game.maxMachineLevel >= 5 },
  { id: 'machineLv10',  name: 'Peak Performance', desc: 'Max a machine to level 10 (Research)', reward: 5000, check: () => game.maxMachineLevel >= 10 },
];

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (game.unlockedAchievements.has(a.id)) continue;
    if (!a.check()) continue;
    game.unlockedAchievements.add(a.id);
    game.cash += a.reward;
    game.lifetimeEarned += a.reward;
    cashGuard.grant(a.reward);
    trackEarn(a.reward);
    toasts.push({ msg: `Achievement: ${a.name}  +$${a.reward}`, color: '#f0c419', life: 3.5, type: 'achievement' });
    if (ZOOM > MACHINE_SFX_ZOOM_THRESHOLD) sfxAchievement();
  }
}
