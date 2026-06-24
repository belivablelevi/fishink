// Fish INK Factory — save/load (localStorage), separate from device audio prefs

const SAVE_KEY = 'fishink_save';
const SAVE_VERSION = 2;

// Each entry mutates `data` in place from its key's version to key+1.
const SAVE_MIGRATIONS = {
  1: (data) => {
    delete data.contracts;
    if (data.game) delete data.game.contractsClaimed;
    if (data.game?.unlockedAchievements) {
      data.game.unlockedAchievements = data.game.unlockedAchievements.filter(id => id !== 'contracts10');
    }
  },
};

function serializeGame() {
  return {
    version: SAVE_VERSION,
    game: {
      cash: game.cash,
      lifetimeEarned: game.lifetimeEarned,
      fishSold: game.fishSold,
      rareCatches: game.rareCatches,
      blocksPlaced: game.blocksPlaced,
      maxMachineLevel: game.maxMachineLevel,
      time: game.time,
      dayTime: game.dayTime,
      fishIndex: Array.from(game.fishIndex),
      fishIndexBonuses: Array.from(game.fishIndexBonuses),
      unlockedAchievements: Array.from(game.unlockedAchievements),
      tutorialDone: game.tutorialDone,
      upgradeTipDone: game.upgradeTipDone,
    },
    upgradeLevels,
    researchLevels,
    blueprintLibrary: blueprint.library, blueprintActiveId: blueprint.activeId, nextBlueprintId,
    heldFish,
    STARTER_C, STARTER_R,
    terrain: terrain.map(row => Array.from(row)),
    blocks: blocks.map(row => Array.from(row)),
    cellState,
    player: { wx: player.wx, wy: player.wy, facing: player.facing },
  };
}

function deserializeGame(data) {
  Object.assign(game, data.game);
  game.fishIndex = new Set(data.game.fishIndex);
  game.fishIndexBonuses = new Set(data.game.fishIndexBonuses);
  game.unlockedAchievements = new Set(data.game.unlockedAchievements || []);
  game.tutorialDone   = data.game.tutorialDone || false;
  game.upgradeTipDone = data.game.upgradeTipDone || false;
  game.rareCatches     = data.game.rareCatches || 0;
  game.blocksPlaced    = data.game.blocksPlaced || 0;
  game.maxMachineLevel = data.game.maxMachineLevel || 0;

  Object.assign(upgradeLevels, data.upgradeLevels);
  Object.assign(researchLevels, data.researchLevels || {});

  blueprint.library  = data.blueprintLibrary || [];
  blueprint.activeId = data.blueprintActiveId || null;
  nextBlueprintId     = data.nextBlueprintId || (blueprint.library.reduce((m, b) => Math.max(m, b.id), 0) + 1);
  blueprint.pasting   = false;
  blueprint.selecting = false;
  blueprint.pasteRotation = 0;

  heldFish.length = 0;
  heldFish.push(...data.heldFish);

  STARTER_C = data.STARTER_C;
  STARTER_R = data.STARTER_R;

  terrain   = data.terrain.map(row => Uint8Array.from(row));
  blocks    = data.blocks.map(row => Uint8Array.from(row));
  cellState = data.cellState;

  autoFisherCount = 0;
  for (const key in fisherTimers) delete fisherTimers[key];
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++) {
      if (IS_AUTO_FISHER(blocks[r][c])) autoFisherCount++;
      // fisherTimers only gets seeded when a Fisher is freshly placed
      // (buyAndPlace) — a loaded save needs it rebuilt here, or every
      // restored Fisher sits dead forever since simUpdate only iterates
      // keys already present in fisherTimers.
      if (blocks[r][c] === B_FISHER) fisherTimers[`${c},${r}`] = effectiveFisherInterval();
    }

  player.wx = data.player.wx;
  player.wy = data.player.wy;
  player.facing = data.player.facing;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame()));
  } catch (e) {
    console.warn('Save failed', e);
  }
}

function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.version > SAVE_VERSION) {
      localStorage.removeItem(SAVE_KEY);
      queueToast('Save was from a newer version — starting fresh', '#e8a030');
      return false;
    }
    for (let v = data.version; v < SAVE_VERSION; v++) SAVE_MIGRATIONS[v]?.(data);
    deserializeGame(data);
    return true;
  } catch (e) {
    console.warn('Load failed', e);
    localStorage.removeItem(SAVE_KEY);
    queueToast('Save was corrupted — starting fresh', '#e85d4a');
    return false;
  }
}

let restarting = false;

function restartGame() {
  restarting = true;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// Without the restarting guard, reload()'s beforeunload would re-save the
// (still in-memory, pre-wipe) game state right back into localStorage,
// undoing restartGame()'s removeItem before the page actually unloads.
window.addEventListener('beforeunload', () => { if (!restarting) saveGame(); });
