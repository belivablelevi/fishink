// Fish INK Factory — achievements/milestones

const ACHIEVEMENTS = [
  { id: 'sell100',    name: 'Fish Monger',     desc: 'Sell 100 fish',                check: () => game.fishSold >= 100 },
  { id: 'sell1000',   name: 'Mass Distributor', desc: 'Sell 1,000 fish',             check: () => game.fishSold >= 1000 },
  { id: 'earn10k',    name: 'Small Business',  desc: 'Earn $10,000 lifetime',        check: () => game.lifetimeEarned >= 10000 },
  { id: 'earn100k',   name: 'Fish Tycoon',     desc: 'Earn $100,000 lifetime',       check: () => game.lifetimeEarned >= 100000 },
  { id: 'fullIndex',  name: 'Ichthyologist',   desc: 'Complete the Fish Index',      check: () => game.fishIndex.size >= FISH.length },
  { id: 'contracts10', name: 'Reliable Supplier', desc: 'Claim 10 contracts',        check: () => game.contractsClaimed >= 10 },
  { id: 'research1',   name: 'Innovator',       desc: 'Complete your first Research node', check: () => Object.values(researchLevels).some(v => v >= 1) },
  { id: 'researchAll', name: 'Mad Scientist',   desc: 'Complete all Research nodes', check: () => RESEARCH_NODES.every(n => researchLevels[n.id] >= 1) },
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
