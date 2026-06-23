// Fish INK Factory — undo/redo for build actions (placement grid + static config only)

const UNDO_MAX = 50;
const undoStack = [];
const redoStack = [];

let undoBatchActive = false;
let undoBatchActions = null;

function beginUndoBatch() {
  undoBatchActive = true;
  undoBatchActions = [];
}

function endUndoBatch() {
  undoBatchActive = false;
  if (undoBatchActions && undoBatchActions.length > 0) {
    pushUndoEntry({ type: 'batch', actions: undoBatchActions });
  }
  undoBatchActions = null;
}

function pushUndoEntry(entry) {
  if (undoBatchActive) { undoBatchActions.push(entry); return; }
  undoStack.push(entry);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
}

// The subset of cellState that undo/redo cares about — live sim state
// (item, carrying, processing, timer, dronePhase...) is intentionally excluded.
function captureConfig(c, r) {
  const st = stateAt(c, r);
  if (!st) return null;
  return {
    dir: st.dir, sortMode: st.sortMode, sortThreshold: st.sortThreshold,
    sortCategory: st.sortCategory, recycleRarities: [...st.recycleRarities],
    packTarget: st.packTarget, level: st.level,
    teleportTarget: st.teleportTarget ? { ...st.teleportTarget } : null,
  };
}

function applyConfig(c, r, cfg) {
  if (!cfg) return;
  Object.assign(stateAt(c, r), cfg);
}

// Called from buyAndPlace (sim.js) right after a successful placement.
function notifyPlaced(id, c, r, dir, cost) {
  pushUndoEntry({ type: 'place', id, c, r, dir, cost, config: null });
}

// Blueprint paste applies its captured config *after* buyAndPlace (and thus
// after notifyPlaced) has already pushed the 'place' entry — patch that
// entry in place so undo/redo of a pasted tile doesn't drop its
// settings/upgrades back to defaults. Always targets the entry buyAndPlace
// just pushed (top of whichever list — batch or top-level — is active).
function attachConfigToLastPlaced(config) {
  const list = undoBatchActive ? undoBatchActions : undoStack;
  const entry = list[list.length - 1];
  if (entry && entry.type === 'place') entry.config = config;
}

// Called from sellAndRemove (sim.js) right before the block is cleared, so
// the static config can be captured while it still exists.
function notifyRemoved(id, c, r, dir, refund, prevConfig) {
  pushUndoEntry({ type: 'remove', id, c, r, dir, refund, prevConfig });
}

function undoOneEntry(entry) {
  if (entry.type === 'place') {
    removeBlock(entry.c, entry.r);
    game.cash += entry.cost;
  } else if (entry.type === 'remove') {
    placeBlock(entry.id, entry.c, entry.r, entry.dir);
    applyConfig(entry.c, entry.r, entry.prevConfig);
    game.cash -= entry.refund;
  }
}

function redoOneEntry(entry) {
  if (entry.type === 'place') {
    placeBlock(entry.id, entry.c, entry.r, entry.dir);
    applyConfig(entry.c, entry.r, entry.config);
    game.cash -= entry.cost;
  } else if (entry.type === 'remove') {
    removeBlock(entry.c, entry.r);
    game.cash += entry.refund;
  }
}

function undo() {
  const entry = undoStack.pop();
  if (!entry) { queueToast('Nothing to undo', '#9aa0a8'); return; }
  if (entry.type === 'batch') {
    for (let i = entry.actions.length - 1; i >= 0; i--) undoOneEntry(entry.actions[i]);
  } else {
    undoOneEntry(entry);
  }
  redoStack.push(entry);
  saveGame();
}

function redo() {
  const entry = redoStack.pop();
  if (!entry) { queueToast('Nothing to redo', '#9aa0a8'); return; }
  if (entry.type === 'batch') {
    for (const action of entry.actions) redoOneEntry(action);
  } else {
    redoOneEntry(entry);
  }
  undoStack.push(entry);
  saveGame();
}
