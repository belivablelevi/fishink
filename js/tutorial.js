// Fish INK Factory — two-phase tutorial
//
// Phase 1 (5 steps): manual fishing loop — move, cast, catch, drop, sell.
// Phase 2 (5 steps): automation tutorial — fires automatically after Phase 1,
//   only for players who have never placed a block (game.blocksPlaced === 0),
//   so returning/mid-game players aren't re-tutorialed.
//
// Arrow targets are locked once at phase start (nearestTileMatching calls), not
// recomputed per frame, so they don't jump around as the player walks.

const TUTORIAL_PHASE1_STEPS = [
  {
    id: 'move',
    text: 'Use <span class="tutorial-key">WASD</span> or Arrow Keys to walk around the dock.',
    target: () => TUT.sandTile,
  },
  {
    id: 'cast',
    text: 'Left-click on the water within range to cast your line.',
    target: () => TUT.fishingTile,
  },
  {
    id: 'catch',
    text: 'Wait for it… you\'ll automatically reel in a fish!',
    target: () => null,
  },
  {
    id: 'drop',
    text: 'Hover the conveyor belt and press <span class="tutorial-key">E</span> — or click it — to drop your fish on.',
    target: () => TUT.beltTile,
  },
  {
    id: 'sell',
    text: 'Watch your fish ride the belt to the Seller and cash in!',
    target: () => TUT.sellerTile,
  },
];

const TUTORIAL_PHASE2_STEPS = [
  {
    id: 'build_open',
    text: 'Nice work! Now let\'s automate. Press <span class="tutorial-key">B</span> to open Build Mode.',
    target: () => null,
  },
  {
    id: 'place_concrete',
    text: 'Select <strong>Concrete</strong> (Floor &amp; Belts tab), then click any land tile to lay a foundation. <em>Right-click removes buildings.</em>',
    target: () => TUT.landTile,
  },
  {
    id: 'place_fisher',
    text: 'Select <strong>Fisher</strong> (Fishing tab) and place it on a shore tile next to water. It\'ll catch fish automatically.',
    target: () => TUT.shoreTile,
  },
  {
    id: 'place_belt',
    text: 'Select <strong>Belt</strong> and connect your Fisher toward a Seller. Belts carry fish automatically — rotate with <span class="tutorial-key">R</span>.',
    target: () => null,
  },
  {
    id: 'close_build',
    text: 'Great setup! Press <span class="tutorial-key">Esc</span> to exit Build Mode and watch your factory run.',
    target: () => null,
  },
];

const TUT = {
  active: false,
  phase: 1,       // 1 = manual fishing, 2 = automation
  stepIndex: 0,
  // Phase 1 targets (locked at startTutorial)
  sandTile: null, fishingTile: null, beltTile: null, sellerTile: null,
  // Phase 2 targets (locked at startPhase2Tutorial)
  landTile: null, shoreTile: null,
};

function startTutorial() {
  TUT.active    = true;
  TUT.phase     = 1;
  TUT.stepIndex = 0;
  TUT.startWx   = player.wx;
  TUT.startWy   = player.wy;

  TUT.sandTile    = nearestTileMatching((c, r) => tileAt(c, r) === T_SHORE, 20);
  TUT.fishingTile = nearestTileMatching((c, r) => tileAt(c, r) === T_WATER, 20);
  TUT.beltTile    = nearestTileMatching((c, r) => IS_TRANSPORT(blockAt(c, r)), 20);
  TUT.sellerTile  = nearestTileMatching((c, r) => blockAt(c, r) === B_SELLER, 20);

  renderTutorialOverlay();
  updateBuildHintUI();
}

function startPhase2Tutorial() {
  if (game.automationTutorialDone) return;
  // Skip Phase 2 for players who already know how to build
  if (game.blocksPlaced > 0) {
    game.automationTutorialDone = true;
    saveGame();
    return;
  }
  TUT.active    = true;
  TUT.phase     = 2;
  TUT.stepIndex = 0;
  TUT.landTile  = nearestTileMatching((c, r) => tileAt(c, r) === T_EMPTY, 20);
  TUT.shoreTile = nearestTileMatching((c, r) => tileAt(c, r) === T_SHORE, 20);

  renderTutorialOverlay();
  updateBuildHintUI();
}

// Single integration point — cheap no-op unless we're waiting on this action.
function tutorialNotify(actionType) {
  if (!TUT.active) return;
  const steps = TUT.phase === 2 ? TUTORIAL_PHASE2_STEPS : TUTORIAL_PHASE1_STEPS;
  const step  = steps[TUT.stepIndex];
  if (!step || step.id !== actionType) return;
  if (TUT.stepIndex >= steps.length - 1) {
    TUT.phase === 2 ? finishPhase2Tutorial() : finishTutorial();
  } else {
    TUT.stepIndex++;
    renderTutorialOverlay();
    updateBuildHintUI();
  }
}

function skipTutorial() {
  if (UPGRADE_TIP.active) { dismissUpgradeTip(); return; }
  TUT.active = false;
  if (TUT.phase === 2) {
    game.automationTutorialDone = true;
  } else {
    game.tutorialDone           = true;
    game.automationTutorialDone = true;
  }
  saveGame();
  renderTutorialOverlay();
  updateBuildHintUI();
}

function finishTutorial() {
  TUT.active = false;
  game.tutorialDone = true;
  renderTutorialOverlay();
  updateBuildHintUI();
  // Transition directly into the automation tutorial
  startPhase2Tutorial();
}

function finishPhase2Tutorial() {
  TUT.active = false;
  TUT.phase  = 1;
  game.automationTutorialDone = true;
  saveGame();
  renderTutorialOverlay();
  updateBuildHintUI();
  queueToast('Factory is running! Fish sell automatically now.', '#4dca7c');
}

// ─── Upgrade tip ─────────────────────────────────────────────────────────────
// Separate one-shot: fires once the player has placed a Fisher AND can afford
// to upgrade it. Reuses the same overlay since only one tip shows at a time.
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
  UPGRADE_TIP.active  = false;
  game.upgradeTipDone = true;
  renderTutorialOverlay();
}

// ─── Overlay rendering ───────────────────────────────────────────────────────
function renderTutorialOverlay() {
  const el = document.getElementById('tutorialOverlay');
  if (!el) return;

  if (UPGRADE_TIP.active) {
    el.classList.remove('hidden');
    document.getElementById('tutorialStepCount').textContent = 'Tip';
    document.getElementById('tutorialStepText').innerHTML =
      'You can afford to upgrade your Fisher! Hover it and press <span class="tutorial-key">E</span>, then click Upgrade.';
    return;
  }

  if (!TUT.active) { el.classList.add('hidden'); return; }

  const steps     = TUT.phase === 2 ? TUTORIAL_PHASE2_STEPS : TUTORIAL_PHASE1_STEPS;
  const step      = steps[TUT.stepIndex];
  const phaseLabel = TUT.phase === 2 ? 'Automation Tutorial' : 'Fishing Tutorial';

  el.classList.remove('hidden');
  document.getElementById('tutorialStepCount').textContent =
    `${phaseLabel} — Step ${TUT.stepIndex + 1} of ${steps.length}`;
  document.getElementById('tutorialStepText').innerHTML = step.text;
}

// ─── Build hint button ───────────────────────────────────────────────────────
// A persistent "B — Build" button visible when not in build mode. Pulses
// during the build_open tutorial step so players know exactly what to press.
function updateBuildHintUI() {
  const el = document.getElementById('buildHint');
  if (!el) return;
  el.classList.toggle('hidden', buildMode.active);
  const waitingForB = TUT.active && TUT.phase === 2 &&
    TUTORIAL_PHASE2_STEPS[TUT.stepIndex]?.id === 'build_open';
  el.classList.toggle('build-hint-pulse', waitingForB);
}

// ─── Arrow target ────────────────────────────────────────────────────────────
// World-pixel center of the current step's arrow target, or null if the step
// doesn't point at a world tile (e.g. "wait for catch", "press Escape").
function tutorialTargetWorldPos() {
  if (!TUT.active) return null;
  const steps = TUT.phase === 2 ? TUTORIAL_PHASE2_STEPS : TUTORIAL_PHASE1_STEPS;
  const step  = steps[TUT.stepIndex];
  if (!step) return null;
  const tile = step.target();
  if (!tile) return null;
  return { wx: (tile.c + 0.5) * TILE_SIZE, wy: (tile.r + 0.5) * TILE_SIZE };
}

// ─── Nearest tile search ─────────────────────────────────────────────────────
// Outward ring search from the player's spawn tile — called once at phase
// start, not per frame (see file-header comment).
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
