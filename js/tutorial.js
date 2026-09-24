// Fish INK Factory — two-phase tutorial
//
// Phase 1 (6 steps): manual fishing loop — intro, move, cast, catch, drop, sell.
// Phase 2 (7 steps): automation — earn the cash, open Build Mode, place a
//   Fisher, lay concrete, lay belts to the Seller, exit, wrap-up. Fires
//   automatically after Phase 1, only for players who have never placed a
//   block (game.blocksPlaced === 0), so returning players aren't re-tutorialed.
//
// A step is { id, text, why?, hint?, target?, targets?, ui?, manual?, advance?,
// onEnter? }. `text`/`why` may be strings or functions. Steps driven by a game
// event advance through tutorialNotify(id); steps with an `advance` predicate
// are polled from tutorialTick() every frame (funding, path built, ...).
// `targets` returns [{tile, label}] for the world arrow; `ui` is a CSS
// selector (or array) for a DOM element to ring + point at.

// Phones have no keyboard or right-click: the same steps say "tap" and point at
// the on-screen joystick/Interact/Build/Rotate/Exit buttons instead.
const onTouch = () => typeof IS_TOUCH !== 'undefined' && IS_TOUCH;
const keyBadge = k => `<span class="tutorial-key">${k}</span>`;

const GLYPH = ['→', '↓', '←', '↑'];
// Canvas label chips use a small sans font where the arrow glyphs render as
// unreadable slivers ("Belt |"), so spell the direction out there.
const DIR_WORD = ['RIGHT', 'DOWN', 'LEFT', 'UP'];

const TUTORIAL_PHASE1_STEPS = [
  {
    id: 'intro',
    manual: true,
    nextLabel: "Let's go",
    ui: '#cashHud',
    text: 'Welcome to <strong>Fish INK</strong>! You\'ll catch fish, sell them for cash, then build a factory that fishes for you.',
    why: 'This takes about two minutes. Your cash is shown bottom-left — it\'s what you\'ll spend on machines.',
  },
  {
    id: 'move',
    text: () => onTouch()
      ? 'Drag the <strong>joystick</strong> (bottom-left) to walk around.'
      : 'Use ' + keyBadge('WASD') + ' or the Arrow Keys to walk around.',
    why: 'The dark floor is your dock. The belt on it carries fish to the <strong>SELL</strong> box at its end.',
    targets: () => TUT.sandTile ? [{ tile: TUT.sandTile, label: 'Walk here' }] : [],
    onEnter() {
      TUT.startWx = player.wx; TUT.startWy = player.wy;
      TUT.sandTile = tileNear(player, (c, r) => tileAt(c, r) === T_SHORE, 3);
    },
  },
  {
    id: 'cast',
    text: () => (onTouch() ? 'Tap' : 'Left-click') + ' a <strong>water</strong> tile to cast your line.',
    why: 'You can only cast about 6 tiles from where you stand. If you see "Too far to cast!", walk closer to the water first.',
    hint: () => {
      const t = TUT.fishingTile;
      if (!t) return '';
      const d = Math.hypot((t.c + 0.5) * TILE_SIZE - player.wx, (t.r + 0.5) * TILE_SIZE - player.wy);
      return d > FISHING_ROD_RANGE ? 'A bit too far — walk toward the arrow.' : (onTouch() ? 'In range — tap the water!' : 'In range — click the water!');
    },
    targets: () => TUT.fishingTile ? [{ tile: TUT.fishingTile, label: onTouch() ? 'Tap here' : 'Click here' }] : [],
    onEnter() { TUT.fishingTile = tileNear(player, (c, r) => tileAt(c, r) === T_WATER, 0); },
  },
  {
    id: 'catch',
    text: 'Wait for it… you\'ll reel in a fish automatically!',
    why: () => `Casting takes a few seconds. Fish you catch are held in your hands (up to ${effectiveMaxHeld()}) until you drop them on a belt.`,
  },
  {
    id: 'drop',
    text: () => onTouch()
      ? 'Tap the belt to drop your fish on it.'
      : 'Walk to the belt, then press ' + keyBadge('E') + ' — or just click the belt — to drop your fish on it.',
    why: () => onTouch()
      ? 'Tapping the belt works from anywhere. (Or stand right next to it, tap it, then press <strong>Interact</strong>.)'
      : 'For <strong>E</strong> to work you must be standing right next to the belt (hover it with your mouse). Clicking the belt works from anywhere.',
    targets: () => TUT.beltTile ? [{ tile: TUT.beltTile, label: 'Belt' }] : [],
    onEnter() { TUT.beltTile = tileNear(player, (c, r) => IS_TRANSPORT(blockAt(c, r)), 0); },
  },
  {
    id: 'sell',
    ui: '#cashHud',
    text: 'Watch your fish ride the belt to the <strong>Seller</strong> and turn into cash!',
    why: 'The Seller buys any fish that reaches it — bigger and rarer fish sell for more. Watch your cash (bottom-left) go up.',
    targets: () => TUT.sellerTile ? [{ tile: TUT.sellerTile, label: 'Seller' }] : [],
    onEnter() { TUT.sellerTile = tileNear(player, (c, r) => blockAt(c, r) === B_SELLER, 0); },
  },
];

const TUTORIAL_PHASE2_STEPS = [
  {
    id: 'fund',
    ui: '#cashHud',
    text: 'Now let\'s <strong>automate</strong>! A <strong>Fisher</strong> catches fish for you — but first you need some cash.',
    why: () => {
      const p = TUT.plan;
      const tiles = p ? p.path.length : 0;
      return `You'll need about <strong>$${TUT.needed}</strong>: $${BLOCK_COSTS[B_FISHER]} for the Fisher, plus $5 per concrete tile and $10 per belt (${tiles} tile${tiles === 1 ? '' : 's'} to reach the Seller). Keep fishing by hand: cast, drop the fish on the belt, sell.`;
    },
    hint: () => `Cash: $${Math.floor(game.cash)} / $${TUT.needed}`,
    targets: () => heldFish.length > 0
      ? (TUT.beltTile ? [{ tile: TUT.beltTile, label: 'Drop fish here' }] : [])
      : (TUT.fishingTile ? [{ tile: TUT.fishingTile, label: 'Cast here' }] : []),
    advance: () => fisherExists() || game.cash >= TUT.needed,
    onEnter() {
      TUT.fishingTile = tileNear(player, (c, r) => tileAt(c, r) === T_WATER, 0);
      TUT.beltTile    = tileNear(player, (c, r) => IS_TRANSPORT(blockAt(c, r)), 0);
    },
  },
  {
    id: 'build_open',
    ui: '#buildHint',
    text: () => 'You can afford it! ' + (onTouch() ? 'Tap the <strong>Build</strong> button' : 'Press ' + keyBadge('B')) + ' to open Build Mode.',
    why: () => 'Build Mode is where you place machines. Everything you place costs cash' + (onTouch() ? '.' : ', and right-click removes things (you get half back).'),
    advance: () => fisherExists(),
  },
  {
    id: 'place_fisher',
    ui: () => cardSelector(B_FISHER),
    text: () => (onTouch() ? 'Tap' : 'Click') + ' the <strong>Fisher</strong> card, then ' + (onTouch() ? 'tap' : 'click') + ' the glowing <strong>shore</strong> tile.',
    why: () => 'Fishers only work on shore tiles (sand next to water). It catches fish forever and pushes them onto any belt beside it.'
      + (onTouch() ? '' : ' Tip: with the menu closed, press ' + keyBadge('1') + ' Concrete, ' + keyBadge('2') + ' Fisher, ' + keyBadge('3') + ' Belt.'),
    targets: () => TUT.plan ? [{ tile: TUT.plan.fisher, label: 'Place Fisher' }] : [],
    advance: () => fisherExists(),
  },
  {
    id: 'place_concrete',
    ui: () => cardSelector(B_CONCRETE),
    text: 'Now lay <strong>Concrete</strong> on the glowing tiles to make a path.',
    why: () => 'Belts can only be built on concrete floor ($5 a tile). Select Concrete (' + (onTouch() ? 'open <strong>Build</strong> and tap its card' : keyBadge('1') + ' or its card') + ') and ' + (onTouch() ? 'tap' : 'click') + ' each glowing tile.',
    hint: () => {
      const p = TUT.plan;
      if (!p) return '';
      const done = p.path.filter(t => tileAt(t.c, t.r) === T_CONCRETE).length;
      return shortCashNote() + `Concrete laid: ${done} / ${p.path.length}`;
    },
    targets: () => planTargets('concrete'),
    advance: () => floorReady(),
  },
  {
    id: 'place_belt',
    ui: () => cardSelector(B_BELT),
    text: 'Place <strong>Belts</strong> on those same tiles, each one facing the way fish should travel.',
    why: () => `Belts carry fish the way their arrows point. Select Belt (${onTouch() ? 'its card in Build' : keyBadge('3')}) and ${onTouch() ? 'tap <strong>Rotate</strong>' : 'press ' + keyBadge('R')} to turn it before placing. The last belt should point into the ${TUT.plan ? TUT.plan.goalName : 'Seller'}.`,
    hint: () => beltHint(),
    targets: () => planTargets('belt'),
    advance: () => pathConnected().ok,
  },
  {
    id: 'close_build',
    ui: ['#hudExitBtn', '#menuCloseBtn'], // the palette is closed here, so the HUD's Exit button is the visible one
    text: () => 'Path connected! ' + (onTouch() ? 'Tap <strong>Exit</strong>' : 'Press ' + keyBadge('B') + ' or ' + keyBadge('Esc')) + ' to leave Build Mode and watch it work.',
    why: 'Your Fisher now catches fish on its own and the belt carries every one to the Seller.',
  },
  {
    id: 'wrap',
    manual: true,
    nextLabel: 'Finish',
    text: 'Your factory is running! Fish sell automatically now.',
    why: () => onTouch()
      ? 'Next: tap your Fisher then <strong>Interact</strong> to upgrade it, check the <strong>Upgrades</strong> and <strong>Research</strong> tabs in the Build menu, and add more Fishers as your cash grows.'
      : 'Next: hover your Fisher and press <strong>E</strong> to upgrade it, check the <strong>Upgrades</strong> and <strong>Research</strong> tabs in the Build menu (<strong>B</strong>), and add more Fishers as your cash grows.',
    targets: () => TUT.fisher ? [{ tile: TUT.fisher, label: 'Your Fisher' }] : [],
  },
];

const TUT = {
  active: false,
  phase: 1,       // 1 = manual fishing, 2 = automation
  stepIndex: 0,
  skipAsk: false, // showing the "skip what?" choice
  sandTile: null, fishingTile: null, beltTile: null, sellerTile: null,
  plan: null,     // { fisher, path:[{c,r}], dirs:[0-3], goalName, cost }
  needed: 0,      // cash needed to finish phase 2 without grinding mid-build
  fisher: null,   // { c, r } of the player's placed Fisher
  startWx: 0, startWy: 0,
};

function currentSteps() { return TUT.phase === 2 ? TUTORIAL_PHASE2_STEPS : TUTORIAL_PHASE1_STEPS; }
function currentStep()  { return currentSteps()[TUT.stepIndex]; }
const _val = v => (typeof v === 'function' ? v() : v);

function cardSelector(id) { return `#buildPanel .item-card[data-id="${id}"]`; }

// ─── Tile helpers ────────────────────────────────────────────────────────────
// Nearest tile matching pred, searching outward from `from` (an object with
// wx/wy). minDist skips tiles closer than that many tiles.
function tileNear(from, pred, minDist) {
  const pc = Math.floor(from.wx / TILE_SIZE), pr = Math.floor(from.wy / TILE_SIZE);
  for (let radius = minDist; radius <= 30; radius++) {
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
function findFisher() {
  if (TUT.fisher && blockAt(TUT.fisher.c, TUT.fisher.r) === B_FISHER) return TUT.fisher;
  TUT.fisher = null;
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (blocks[r][c] === B_FISHER) return (TUT.fisher = { c, r });
  return null;
}
function fisherExists() { return !!findFisher(); }

// ─── Route planning ──────────────────────────────────────────────────────────
// Follows belts from (c,r) the way the sim does. ok=true once the chain ends
// in a Seller; otherwise says where it stopped and why.
function traceToSeller(c, r) {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const key = c + ',' + r;
    if (seen.has(key)) return { ok: false, reason: 'loop', c, r };
    seen.add(key);
    const d = BELT_DIRS[stateAt(c, r).dir || 0];
    const nc = c + d.dx, nr = r + d.dy, nb = blockAt(nc, nr);
    if (nb === B_SELLER) return { ok: true };
    if (IS_TRANSPORT(nb)) { c = nc; r = nr; continue; }
    return { ok: false, reason: nb === B_NONE ? 'empty' : 'blocked', c, r, nc, nr };
  }
  return { ok: false, reason: 'loop', c, r };
}

function pathConnected() {
  const f = findFisher();
  if (!f) return { ok: false, reason: 'nofisher' };
  let best = { ok: false, reason: 'nobelt' };
  for (const { dc, dr } of FISHER_DIRS) {
    const nc = f.c + dc, nr = f.r + dr;
    if (!IS_TRANSPORT(blockAt(nc, nr))) continue;
    const res = traceToSeller(nc, nr);
    if (res.ok) return res;
    best = res;
  }
  return best;
}

const _N4 = [{ dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 0, dr: -1 }];
const _dirIdx = (dc, dr) => _N4.findIndex(d => d.dc === dc && d.dr === dr);
const _routable = (c, r) => (tileAt(c, r) === T_EMPTY || tileAt(c, r) === T_CONCRETE) && blockAt(c, r) === B_NONE;

// Cheapest-by-steps route from a Fisher spot to the Seller (or to any existing
// belt that already leads there). Returns { fisher, path, dirs, goalName, cost }
// or null. If `fixed` is given the Fisher is already placed there.
function planRoute(fixed) {
  // Goal tiles: the Seller, and existing belts that already reach it.
  const goal = new Map(); // "c,r" -> name
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      const id = blocks[r][c];
      if (id === B_SELLER) goal.set(c + ',' + r, 'Seller');
      else if (IS_TRANSPORT(id) && traceToSeller(c, r).ok) goal.set(c + ',' + r, 'belt to the Seller');
    }
  }
  // Reverse BFS out from the goal through routable tiles; parent points toward the goal.
  const dist = new Map(), parent = new Map(), queue = [];
  for (const key of goal.keys()) {
    const [gc, gr] = key.split(',').map(Number);
    for (const { dc, dr } of _N4) {
      const c = gc + dc, r = gr + dr, k = c + ',' + r;
      if (_routable(c, r) && !dist.has(k)) { dist.set(k, 1); parent.set(k, { goalKey: key }); queue.push({ c, r }); }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const { c, r } = queue[i], d = dist.get(c + ',' + r);
    for (const { dc, dr } of _N4) {
      const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
      if (_routable(nc, nr) && !dist.has(k)) { dist.set(k, d + 1); parent.set(k, { c, r }); queue.push({ c: nc, r: nr }); }
    }
  }
  // Pick the Fisher spot with the shortest route.
  let bestSpot = null, bestStart = null, bestLen = Infinity;
  const spots = fixed ? [fixed] : [];
  if (!fixed) {
    for (let r = 0; r < WORLD_ROWS; r++)
      for (let c = 0; c < WORLD_COLS; c++)
        if (tileAt(c, r) === T_SHORE && canPlaceBlock(B_FISHER, c, r, 0)) spots.push({ c, r });
  }
  for (const s of spots) {
    let len = Infinity, start = null, touchesGoal = false;
    for (const { dc, dr } of _N4) {
      const k = (s.c + dc) + ',' + (s.r + dr);
      if (goal.has(k)) touchesGoal = true;
      if (dist.has(k) && dist.get(k) < len) { len = dist.get(k); start = { c: s.c + dc, r: s.r + dr }; }
    }
    if (touchesGoal) { len = 0; start = null; }
    if (len < bestLen || (len === bestLen && bestSpot && Math.hypot(s.c * TILE_SIZE - player.wx, s.r * TILE_SIZE - player.wy) < Math.hypot(bestSpot.c * TILE_SIZE - player.wx, bestSpot.r * TILE_SIZE - player.wy))) {
      bestLen = len; bestSpot = s; bestStart = start;
    }
  }
  if (!bestSpot || bestLen === Infinity) return null;
  const path = [], dirs = [];
  let goalName = 'Seller';
  if (bestStart) {
    let cur = bestStart;
    for (;;) {
      path.push({ c: cur.c, r: cur.r });
      const p = parent.get(cur.c + ',' + cur.r);
      if (p.goalKey) {
        const [gc, gr] = p.goalKey.split(',').map(Number);
        dirs.push(_dirIdx(gc - cur.c, gr - cur.r));
        goalName = goal.get(p.goalKey);
        break;
      }
      dirs.push(_dirIdx(p.c - cur.c, p.r - cur.r));
      cur = { c: p.c, r: p.r };
    }
  }
  const cost = path.reduce((sum, t) => sum + BLOCK_COSTS[B_BELT] + (tileAt(t.c, t.r) === T_EMPTY ? BLOCK_COSTS[B_CONCRETE] : 0), 0);
  return { fisher: bestSpot, path, dirs, goalName, cost };
}

function replan(fixed) {
  TUT.plan = planRoute(fixed);
  TUT.needed = BLOCK_COSTS[B_FISHER] + (TUT.plan ? TUT.plan.cost : 60);
}

function floorReady() {
  if (!TUT.plan) return pathConnected().ok;
  return TUT.plan.path.every(t => tileAt(t.c, t.r) === T_CONCRETE) || pathConnected().ok;
}

// Glowing tiles for the concrete / belt steps: the next couple still missing.
function planTargets(kind) {
  const p = TUT.plan;
  if (!p) return [];
  const out = [];
  for (let i = 0; i < p.path.length && out.length < 3; i++) {
    const t = p.path[i];
    if (kind === 'concrete') {
      if (tileAt(t.c, t.r) !== T_CONCRETE) out.push({ tile: t, label: out.length === 0 ? 'Concrete' : '' });
    } else {
      const ok = IS_TRANSPORT(blockAt(t.c, t.r)) && (stateAt(t.c, t.r).dir || 0) === p.dirs[i];
      // Only the first pending tile gets a chip — stacked chips overlap.
      if (!ok) out.push({ tile: t, label: out.length === 0 ? `Belt: face ${DIR_WORD[p.dirs[i]]}` : '' });
    }
  }
  return out;
}

// Cash still needed for whatever part of the planned path isn't built yet.
// Placing with too little cash only ever produced a "Not enough cash!" toast.
function shortCashNote() {
  const p = TUT.plan;
  if (!p) return '';
  let need = 0;
  for (const t of p.path) {
    if (!IS_TRANSPORT(blockAt(t.c, t.r))) need += BLOCK_COSTS[B_BELT];
    if (tileAt(t.c, t.r) !== T_CONCRETE) need += BLOCK_COSTS[B_CONCRETE];
  }
  return game.cash < need ? `Not enough cash — you need $${Math.ceil(need - game.cash)} more. Keep fishing by hand. ` : '';
}

function beltHint() {
  const p = TUT.plan;
  if (!p) return '';
  const short = shortCashNote();
  if (short) return short;
  let placed = 0, wrong = null, next = null;
  for (let i = 0; i < p.path.length; i++) {
    const t = p.path[i];
    if (IS_TRANSPORT(blockAt(t.c, t.r))) {
      if ((stateAt(t.c, t.r).dir || 0) === p.dirs[i]) placed++; else if (!wrong) wrong = i;
    } else if (next === null) next = i;
  }
  if (wrong !== null) return `A belt is facing the wrong way — the glowing tile needs ${GLYPH[p.dirs[wrong]]}. Right-click it and place it again.`;
  if (next !== null) {
    const rot = (buildMode.beltDir % 4) === p.dirs[next] ? ' (facing is right!)' : (onTouch() ? ' — tap Rotate' : ' — press R to rotate');
    return `Belts placed: ${placed} / ${p.path.length} · next belt should face ${GLYPH[p.dirs[next]]}${rot}`;
  }
  const res = pathConnected();
  return res.ok ? '' : 'Almost — make sure every belt faces along the path.';
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
function enterStep() {
  const step = currentStep();
  if (step && step.onEnter) step.onEnter();
  renderTutorialOverlay();
  updateBuildHintUI();
}

function startTutorial() {
  TUT.active = true;
  TUT.phase = 1;
  TUT.stepIndex = 0;
  TUT.skipAsk = false;
  enterStep();
}

function startPhase2Tutorial() {
  if (game.automationTutorialDone) return;
  // Skip Phase 2 for players who already know how to build
  if (game.blocksPlaced > 0) {
    game.automationTutorialDone = true;
    saveGame();
    return;
  }
  TUT.active = true;
  TUT.phase = 2;
  TUT.stepIndex = 0;
  TUT.skipAsk = false;
  TUT.fisher = null;
  replan(null);
  enterStep();
}

function replayTutorial() {
  if (buildMode.active) exitBuildMode();
  game.tutorialDone = false;
  game.automationTutorialDone = true; // replay covers the manual basics only
  startTutorial();
}

function advanceStep() {
  const steps = currentSteps();
  if (TUT.stepIndex >= steps.length - 1) {
    TUT.phase === 2 ? finishPhase2Tutorial() : finishTutorial();
  } else {
    TUT.stepIndex++;
    enterStep();
  }
}

// Event-driven steps (cast/catch/drop/sell/close_build/...) advance here.
function tutorialNotify(actionType) {
  if (!TUT.active) return;
  const step = currentStep();
  if (!step || step.id !== actionType) return;
  advanceStep();
}

// "Got it" button / Enter key for manual steps.
function tutorialNext() {
  if (!TUT.active) return;
  const step = currentStep();
  if (step && step.manual) advanceStep();
}
window.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !TUT.active || TUT.skipAsk) return;
  if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  tutorialNext();
});

// Called by buyAndPlace after every placement.
function tutorialOnPlaced(id, c, r) {
  if (!TUT.active || TUT.phase !== 2) return;
  if (id === B_FISHER) { TUT.fisher = { c, r }; replan({ c, r }); }
  tutorialTick();
}

// Phones have no right-click, so a wrongly-faced belt in the planned path
// couldn't be removed and re-placed — the touch player would be stuck. Turn it
// for them instead.
function fixWrongBelts() {
  const p = TUT.plan;
  if (!p) return;
  for (let i = 0; i < p.path.length; i++) {
    const t = p.path[i];
    if (!IS_TRANSPORT(blockAt(t.c, t.r))) continue;
    const st = stateAt(t.c, t.r);
    if ((st.dir || 0) === p.dirs[i]) continue;
    st.dir = p.dirs[i];
    st.routeLockedFor = null;
    queueToast('Turned that belt to face the right way.', '#4dca7c');
  }
}

// Polled every sim frame: advance predicate steps, refresh hint text and the
// DOM pointer.
let _lastHint = null;
function tutorialTick() {
  if (!TUT.active) { _syncUiPointer(null); return; }
  if (onTouch() && TUT.phase === 2 && currentStep()?.id === 'place_belt') fixWrongBelts();
  for (let guard = 0; guard < 8; guard++) {
    const s = currentStep();
    if (!TUT.active || !s || !s.advance || !s.advance()) break;
    advanceStep();
  }
  if (!TUT.active) { _syncUiPointer(null); return; }
  const step = currentStep();
  const hint = step && step.hint ? step.hint() : '';
  if (hint !== _lastHint) {
    _lastHint = hint;
    const el = document.getElementById('tutorialStepHint');
    if (el) el.textContent = hint;
  }
  _syncUiPointer(step && !UPGRADE_TIP.active ? step.ui : null);
}

function skipTutorial() {
  if (UPGRADE_TIP.active) { dismissUpgradeTip(); return; }
  // In phase 1, skipping used to silently skip the automation lessons too —
  // ask which one the player means.
  if (TUT.phase === 1 && !TUT.skipAsk) {
    TUT.skipAsk = true;
    renderTutorialOverlay();
    return;
  }
  skipTutorialChoice('all');
}

function skipTutorialChoice(which) {
  TUT.skipAsk = false;
  if (which === 'keep') { renderTutorialOverlay(); return; }
  if (which === 'fishing') {
    game.tutorialDone = true;
    TUT.active = false;
    renderTutorialOverlay();
    startPhase2Tutorial(); // still teaches building if they haven't built yet
    saveGame();
    return;
  }
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
function _setOverlayParts(count, text, why, showNext, nextLabel) {
  document.getElementById('tutorialStepCount').textContent = count;
  document.getElementById('tutorialStepText').innerHTML = text;
  document.getElementById('tutorialStepWhy').innerHTML = why || '';
  const next = document.getElementById('tutorialNextBtn');
  next.classList.toggle('hidden', !showNext);
  next.textContent = nextLabel || 'Got it';
}

function renderTutorialOverlay() {
  const el = document.getElementById('tutorialOverlay');
  if (!el) return;
  _lastHint = null;
  const hintEl = document.getElementById('tutorialStepHint');
  if (hintEl) hintEl.textContent = '';
  const choice = document.getElementById('tutorialSkipChoice');
  if (choice) choice.classList.add('hidden');
  document.getElementById('tutorialSkipBtn').classList.remove('hidden');

  if (UPGRADE_TIP.active) {
    el.classList.remove('hidden');
    _setOverlayParts('Tip',
      onTouch()
        ? 'You can afford to upgrade your Fisher! Tap it, press <strong>Interact</strong>, then tap Upgrade.'
        : 'You can afford to upgrade your Fisher! Hover it and press <span class="tutorial-key">E</span>, then click Upgrade.',
      'Upgrades make a machine catch or process faster and worth more.', false);
    document.getElementById('tutorialSkipBtn').textContent = 'Got it';
    return;
  }

  if (!TUT.active) { el.classList.add('hidden'); _syncUiPointer(null); return; }
  document.getElementById('tutorialSkipBtn').textContent = 'Skip tutorial';

  const steps      = currentSteps();
  const step       = steps[TUT.stepIndex];
  const phaseLabel = TUT.phase === 2 ? 'Automation Tutorial' : 'Fishing Tutorial';

  el.classList.remove('hidden');
  _setOverlayParts(`${phaseLabel} — Step ${TUT.stepIndex + 1} of ${steps.length}`,
    _val(step.text), _val(step.why), !!step.manual, step.nextLabel);

  if (TUT.skipAsk && choice) {
    document.getElementById('tutorialSkipBtn').classList.add('hidden');
    document.getElementById('tutorialNextBtn').classList.add('hidden');
    choice.classList.remove('hidden');
    choice.innerHTML = `
      <div class="tutorial-skip-q">Skip which part?</div>
      <button class="tutorial-skip-btn" onclick="skipTutorialChoice('fishing')">Just the fishing lessons</button>
      <button class="tutorial-skip-btn" onclick="skipTutorialChoice('all')">Everything</button>
      <button class="tutorial-next-btn" onclick="skipTutorialChoice('keep')">Keep going</button>`;
  }
  tutorialTick();
}

// ─── Build hint button ───────────────────────────────────────────────────────
// A persistent "B — Build" button visible when not in build mode. Pulses
// during the build_open tutorial step so players know exactly what to press.
function updateBuildHintUI() {
  const el = document.getElementById('buildHint');
  if (!el) return;
  el.classList.toggle('hidden', buildMode.active);
  const waitingForB = TUT.active && TUT.phase === 2 && currentStep()?.id === 'build_open';
  el.classList.toggle('build-hint-pulse', waitingForB);
}

// ─── DOM pointer ─────────────────────────────────────────────────────────────
// Rings the element(s) a step points at and floats a bobbing arrow over the
// first visible one. Re-applied every tick because the build panel rebuilds
// its cards (dropping any class we added).
const _ringed = new Set();
function _syncUiPointer(spec) {
  const arrow = document.getElementById('tutorialUiArrow');
  const sels = spec ? [].concat(_val(spec)) : [];
  const want = new Set();
  let first = null;
  for (const sel of sels) {
    const node = document.querySelector(sel);
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    want.add(node);
    if (!first) first = rect;
  }
  for (const node of _ringed) if (!want.has(node)) { node.classList.remove('tutorial-ui-highlight'); _ringed.delete(node); }
  for (const node of want) if (!_ringed.has(node) || !node.classList.contains('tutorial-ui-highlight')) { node.classList.add('tutorial-ui-highlight'); _ringed.add(node); }
  if (!arrow) return;
  if (!first) { arrow.classList.add('hidden'); return; }
  const below = first.top < 44;
  arrow.textContent = below ? '▲' : '▼';
  arrow.style.left = (first.left + first.width / 2) + 'px';
  arrow.style.top  = (below ? first.bottom + 4 : first.top - 30) + 'px';
  arrow.classList.remove('hidden');
}

// ─── World arrows ────────────────────────────────────────────────────────────
// [{ wx, wy, label }] for the current step's world targets.
function tutorialTargets() {
  if (UPGRADE_TIP.active) {
    const f = findFisher();
    return f ? [{ wx: (f.c + 0.5) * TILE_SIZE, wy: (f.r + 0.5) * TILE_SIZE, label: onTouch() ? 'Tap + Interact' : 'Hover + E' }] : [];
  }
  if (!TUT.active) return [];
  const step = currentStep();
  if (!step || !step.targets) return [];
  return step.targets().map(t => ({ wx: (t.tile.c + 0.5) * TILE_SIZE, wy: (t.tile.r + 0.5) * TILE_SIZE, label: t.label || '' }));
}
