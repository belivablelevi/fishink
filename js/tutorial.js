// Fish INK Factory — first-time player tutorial: a skippable, one-time,
// action-driven walkthrough of the core loop (move, fish, drop, sell). The
// player already starts with a pre-built belt chain + Seller on the dock
// (see buildWorld() in grid.js), so this only teaches using what's already
// there — it never asks them to open the build menu or place anything.
//
// Each step's arrow target is locked once, at spawn (see startTutorial()'s
// nearestTileMatching() calls below) — not recomputed every frame. Otherwise
// "nearest" would keep re-evaluating as the player walks around and the
// arrow would visibly jump between equally-close belt/water/sand tiles.
const TUTORIAL_STEPS = [
  {
    id: 'move', text: 'Use WASD or the Arrow Keys to move around the dock.',
    target: () => TUT.sandTile,
  },
  {
    id: 'cast', text: 'Left-click on the water within range to cast your line.',
    target: () => TUT.fishingTile,
  },
  {
    id: 'catch', text: 'Wait for it… you’ll automatically catch a fish.',
    target: () => null,
  },
  {
    id: 'drop', text: 'Hover over the conveyor belt and press E (or click it) to drop your fish on.',
    target: () => TUT.beltTile,
  },
  {
    id: 'sell', text: 'Watch your fish ride the belt to the Seller and cash in!',
    target: () => TUT.sellerTile,
  },
];

const TUT = {
  active: false, stepIndex: 0, startWx: 0, startWy: 0,
  sandTile: null, fishingTile: null, beltTile: null, sellerTile: null,
};

function startTutorial() {
  TUT.active = true;
  TUT.stepIndex = 0;
  TUT.startWx = player.wx;
  TUT.startWy = player.wy;

  // Locked once here, at spawn — see the file-header comment above.
  TUT.sandTile    = nearestTileMatching((c, r) => tileAt(c, r) === T_SHORE, 20);
  TUT.fishingTile = nearestTileMatching((c, r) => tileAt(c, r) === T_WATER, 20);
  TUT.beltTile    = nearestTileMatching((c, r) => IS_TRANSPORT(blockAt(c, r)), 20);
  TUT.sellerTile  = nearestTileMatching((c, r) => blockAt(c, r) === B_SELLER, 20);

  renderTutorialOverlay();
}

// Single integration point gameplay code calls when a tutorial-relevant
// action happens — a no-op unless it matches the step currently shown, so
// call sites stay cheap and order-independent.
function tutorialNotify(actionType) {
  if (!TUT.active) return;
  const step = TUTORIAL_STEPS[TUT.stepIndex];
  if (!step || step.id !== actionType) return;
  if (TUT.stepIndex >= TUTORIAL_STEPS.length - 1) {
    finishTutorial();
  } else {
    TUT.stepIndex++;
    renderTutorialOverlay();
  }
}

function skipTutorial() {
  // The overlay is shared with the upgrade tip below — route the dismissal
  // to whichever one is actually showing.
  if (UPGRADE_TIP.active) { dismissUpgradeTip(); return; }
  TUT.active = false;
  game.tutorialDone = true;
  renderTutorialOverlay();
}

function finishTutorial() {
  TUT.active = false;
  game.tutorialDone = true;
  renderTutorialOverlay();
}

// Second, independent one-shot tip: the main tutorial above never mentions
// upgrading, since it only walks through gear that's already pre-built on
// the dock at spawn. So once the player has built their first auto-fisher
// AND has actually saved up enough cash to upgrade it, resurface the same
// overlay with a single pointer at the mechanic.
const UPGRADE_TIP = { active: false };

function maybeShowUpgradeTip() {
  if (TUT.active || game.upgradeTipDone || UPGRADE_TIP.active) return;
  if (autoFisherCount <= 0) return;
  const cost = machineUpgradeCost(B_FISHER, 0);
  if (game.cash < cost) return;
  UPGRADE_TIP.active = true;
  renderTutorialOverlay();
}

function dismissUpgradeTip() {
  UPGRADE_TIP.active = false;
  game.upgradeTipDone = true;
  renderTutorialOverlay();
}

function renderTutorialOverlay() {
  const el = document.getElementById('tutorialOverlay');
  if (!el) return;
  if (UPGRADE_TIP.active) {
    el.classList.remove('hidden');
    document.getElementById('tutorialStepCount').textContent = 'Tip';
    document.getElementById('tutorialStepText').textContent =
      'You can afford to upgrade your Fisher — hover it and press E, then click Upgrade.';
    return;
  }
  if (!TUT.active) { el.classList.add('hidden'); return; }
  const step = TUTORIAL_STEPS[TUT.stepIndex];
  el.classList.remove('hidden');
  document.getElementById('tutorialStepCount').textContent =
    `Step ${TUT.stepIndex + 1} of ${TUTORIAL_STEPS.length}`;
  document.getElementById('tutorialStepText').textContent = step.text;
}

// Outward ring search from the player's spawn tile for the nearest tile
// matching `pred(c, r)` — called once per target in startTutorial(), not
// per frame (see file-header comment).
function nearestTileMatching(pred, maxRadius) {
  const pc = Math.floor(player.wx / TILE_SIZE);
  const pr = Math.floor(player.wy / TILE_SIZE);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const c = pc + dc, r = pr + dr;
        if (pred(c, r)) return { c, r };
      }
    }
  }
  return null;
}

// World-pixel center of the current step's locked arrow target, or null if
// this step doesn't point at anything (e.g. "wait for a catch").
function tutorialTargetWorldPos() {
  if (!TUT.active) return null;
  const step = TUTORIAL_STEPS[TUT.stepIndex];
  if (!step) return null;
  const tile = step.target();
  if (!tile) return null;
  return { wx: (tile.c + 0.5) * TILE_SIZE, wy: (tile.r + 0.5) * TILE_SIZE };
}
