// Fish INK Factory — achievements/milestones

const ACHIEVEMENTS = [
  { id: 'sell100',    name: 'Fish Monger',     desc: 'Sell 100 fish',                check: () => game.fishSold >= 100 },
  { id: 'sell1000',   name: 'Mass Distributor', desc: 'Sell 1,000 fish',             check: () => game.fishSold >= 1000 },
  { id: 'earn10k',    name: 'Small Business',  desc: 'Earn $10,000 lifetime',        check: () => game.lifetimeEarned >= 10000 },
  { id: 'earn100k',   name: 'Fish Tycoon',     desc: 'Earn $100,000 lifetime',       check: () => game.lifetimeEarned >= 100000 },
  { id: 'fullIndex',  name: 'Ichthyologist',   desc: 'Complete the Fish Index',      check: () => game.fishIndex.size >= FISH.length },
  { id: 'research1',   name: 'Innovator',       desc: 'Complete your first Research node', check: () => Object.values(researchLevels).some(v => v >= 1) },
  { id: 'researchAll', name: 'Mad Scientist',   desc: 'Complete all Research nodes', check: () => RESEARCH_NODES.every(n => researchLevels[n.id] >= 1) },
  { id: 'rareCatch1',   name: 'Lucky Catch',     desc: 'Catch your first rare fish',        check: () => game.rareCatches >= 1 },
  { id: 'rareCatch50',  name: 'Rare Hunter',      desc: 'Catch 50 rare fish',                check: () => game.rareCatches >= 50 },
  { id: 'builder50',    name: 'Foreman',          desc: 'Place 50 blocks total',             check: () => game.blocksPlaced >= 50 },
  { id: 'builder250',   name: 'Industrialist',    desc: 'Place 250 blocks total',            check: () => game.blocksPlaced >= 250 },
  { id: 'machineLv5',   name: 'Fully Tuned',      desc: 'Max a machine to level 5',          check: () => game.maxMachineLevel >= 5 },
  { id: 'machineLv10',  name: 'Peak Performance', desc: 'Max a machine to level 10 (Research)', check: () => game.maxMachineLevel >= 10 },
];

function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (game.unlockedAchievements.has(a.id)) continue;
    if (!a.check()) continue;
    game.unlockedAchievements.add(a.id);
    queueToast(`Achievement unlocked: ${a.name}`, '#f0c419');
    if (ZOOM > MACHINE_SFX_ZOOM_THRESHOLD) sfxAchievement();
  }
}
