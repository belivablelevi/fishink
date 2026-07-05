// Fish INK Factory — build/upgrades menu (DOM overlay, tabbed Godot-style)

let buildMenuEl, buildPanelEl, upgradesPanelEl, fishIndexPanelEl, statsPanelEl, controlsPanelEl, researchPanelEl, prestigePanelEl, blueprintsPanelEl, menuCashEl;
let leaderboardPanelEl;

// Category metadata for the Build tab's grouped item grid. Order here is the
// display order; BLOCK_CATS (grid.js) assigns each block id to one of these.
const BUILD_CATS = [
  { id: 'floor',      label: 'Floor & Belts', color: '#6a7a8a' },
  { id: 'fishing',    label: 'Fishing',       color: '#7ec8e3' },
  { id: 'processing', label: 'Processing',    color: '#e8a030' },
  { id: 'sales',      label: 'Sales',         color: '#a78bfa' },
  { id: 'pets',       label: 'Pets',          color: '#f472b6' },
];

// Per-block one-line quick stat shown on the Build tab's item cards, using
// real gameplay constants. Blocks with no single clean number (Sorter,
// Concrete, Seller, Teleporter) are omitted rather than fabricated.
const BLOCK_QUICK_STAT = {
  [B_FISHER]:         () => `Catches every ${FISHER_INTERVAL.toFixed(1)}s`,
  [B_DRONE_FISHER]:   () => `${DRONE_BATCH} fish/trip, lower quality`,
  [B_BELT]:           () => `${BELT_SPEED.toFixed(1)} tiles/s`,
  [B_SPLITTER]:       () => `${BELT_SPEED.toFixed(1)} tiles/s`,
  [B_SMART_ROUTER]:   () => `${BELT_SPEED.toFixed(1)} tiles/s`,
  [B_CRATE]:          () => `Holds ${CRATE_CAPACITY}`,
  [B_WASHER]:         () => `${MACHINE_DEFS.WASHER.processTime.toFixed(1)}s / fish`,
  [B_SMOKER]:         () => `${MACHINE_DEFS.SMOKER.processTime.toFixed(1)}s / fish`,
  [B_ICER]:           () => `${MACHINE_DEFS.ICER.processTime.toFixed(1)}s / fish`,
  [B_STAMPER]:        () => `${MACHINE_DEFS.STAMPER.processTime.toFixed(1)}s / fish`,
  [B_RECYCLER]:       () => `$${RECYCLE_FLAT_PAYOUT.toFixed(2)} flat / fish`,
  [B_PACKER]:         () => 'Bundles 5 fish',
  [B_DRONE_DELIVERY]: () => '+10% sell bonus',
};

// Visual rotation for the HUD's up-arrow glyph, indexed the same as
// BELT_DIRS ([right, down, left, up]) so it always points the placed direction.
const ARROW_DEG = [90, 180, 270, 0];

// Renders a mockup preview of a block using the same drawing code as the
// in-world renderer, so the build menu shows exactly what you're buying.
function makeBlockPreview(id) {
  const cnv = document.createElement('canvas');
  cnv.className = 'swatch';
  cnv.width = TILE_SIZE;
  cnv.height = TILE_SIZE;
  const pctx = cnv.getContext('2d');
  pctx.fillStyle = '#1a2018';
  pctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  drawBlock(pctx, id, 0, 0, -1, -1);
  return cnv;
}

// ─── Sound settings menu ────────────────────────────────────────────────────
function initSoundMenu() {
  const btn   = document.getElementById('soundToggleBtn');
  const panel = document.getElementById('soundPanel');
  const musicCheck = document.getElementById('soundMusicCheck');
  const sfxCheck   = document.getElementById('soundSfxCheck');
  const sellCheck  = document.getElementById('soundSellCheck');

  musicCheck.checked = !AUDIO.musicMuted;
  sfxCheck.checked   = !AUDIO.sfxMuted;
  sellCheck.checked  = !AUDIO.sellMuted;

  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  musicCheck.addEventListener('change', () => setMusicMuted(!musicCheck.checked));
  sfxCheck.addEventListener('change', () => setSfxMuted(!sfxCheck.checked));
  sellCheck.addEventListener('change', () => setSellMuted(!sellCheck.checked));

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

// ─── Game menu (save / restart) ─────────────────────────────────────────────
function initGameMenu() {
  const btn   = document.getElementById('gameMenuToggleBtn');
  const panel = document.getElementById('gameMenuPanel');
  const saveBtn    = document.getElementById('saveNowBtn');
const restartBtn = document.getElementById('restartGameBtn');
  const fullNumbersCheck = document.getElementById('fullNumbersCheck');
  const individualSellToastsCheck = document.getElementById('individualSellToastsCheck');
  const islandExpandBtn  = document.getElementById('islandExpandBtn');
  const islandExpandInfo = document.getElementById('islandExpandInfo');

  fullNumbersCheck.checked = settings.fullNumbers;
  individualSellToastsCheck.checked = settings.individualSellToasts;

  function refreshIslandUI() {
    const cost = islandExpandCost();
    islandExpandInfo.textContent = `Island Ring ${game.islandLevel} · Next: $${cost.toLocaleString()}`;
  }

  btn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) refreshIslandUI();
  });

  islandExpandBtn.addEventListener('click', () => {
    expandIsland();
    refreshIslandUI();
  });

  fullNumbersCheck.addEventListener('change', () => {
    if (fullNumbersCheck.checked !== settings.fullNumbers) toggleFullNumbers();
  });

  individualSellToastsCheck.addEventListener('change', () => {
    if (individualSellToastsCheck.checked !== settings.individualSellToasts) toggleIndividualSellToasts();
  });

  saveBtn.addEventListener('click', () => {
    saveGame();
    queueToast('Game saved', '#4dca7c');
    panel.classList.add('hidden');
  });

  let restartArmed = false, restartTimer = null;
  restartBtn.addEventListener('click', () => {
    if (!restartArmed) {
      restartArmed = true;
      restartBtn.textContent = 'Click again to confirm';
      restartTimer = setTimeout(() => {
        restartArmed = false;
        restartBtn.textContent = 'Restart Game';
      }, 3000);
    } else {
      clearTimeout(restartTimer);
      restartGame();
    }
  });

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

// ─── Machines overview (every placed upgradable block, grouped by type) ────
function initMachinesMenu() {
  const btn   = document.getElementById('machinesToggleBtn');
  const panel = document.getElementById('machinesPanel');

  // renderMachinesPanel() wipes/rebuilds panel.innerHTML on every Upgrade
  // click, detaching the clicked button before the click bubbles to the
  // document listener below — stopping propagation here keeps the outside
  // -click check from ever seeing that detached target.
  panel.addEventListener('click', e => e.stopPropagation());

  btn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      // The button docks beside the cash pill (bottom-left), so the panel
      // opens upward from the button's current position rather than the
      // fixed top-left spot it used before that move.
      const rect = btn.getBoundingClientRect();
      panel.style.left   = `${rect.left}px`;
      panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;
      renderMachinesPanel();
    }
  });

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

// Cached groups + currently selected machine type for the dropdown panel.
let _machineGroups = new Map();
let _machinesSelectedId = null;
let _highlightedMachineTile = null;

function renderMachinesPanel() {
  const panel = document.getElementById('machinesPanel');
  panel.innerHTML = '';

  const groups = new Map();
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      const id = blockAt(c, r);
      if (!IS_UPGRADABLE(id)) continue;
      const st = stateAt(c, r);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ c, r, level: st.level || 0 });
    }
  }
  _machineGroups = groups;

  if (groups.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No upgradable machines placed yet.';
    panel.appendChild(empty);
    return;
  }

  // Keep selection valid; default to first type
  const ids = [...groups.keys()];
  if (!ids.includes(_machinesSelectedId)) _machinesSelectedId = ids[0];

  // ── Dropdown ────────────────────────────────────────────────────────────
  const sel = document.createElement('select');
  sel.className = 'machines-dropdown';
  for (const id of ids) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${BLOCK_NAMES[id]} (${groups.get(id).length})`;
    if (id === _machinesSelectedId) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    _machinesSelectedId = Number(sel.value);
    _renderMachinesDetail(panel, detail);
  });
  panel.appendChild(sel);

  // ── Detail area (Upgrade All + individual rows) ─────────────────────────
  const detail = document.createElement('div');
  detail.id = 'machinesDetail';
  panel.appendChild(detail);
  _renderMachinesDetail(panel, detail);
}

function _renderMachinesDetail(panel, detail) {
  detail.innerHTML = '';
  const id = _machinesSelectedId;
  const instances = (_machineGroups.get(id) || []).slice().sort((a, b) => a.level - b.level);
  if (!instances.length) return;

  // ── Upgrade All button ──────────────────────────────────────────────────
  if (instances.length > 1) {
    const { count, total } = calcBulkUpgrade(id, instances);
    const allBtn = document.createElement('button');
    allBtn.className = 'upgrade-buy upgrade-all-btn';
    allBtn.dataset.blockId = id;
    allBtn.disabled = count === 0;
    allBtn.textContent = count > 0
      ? `Upgrade All ×${count} ($${formatMoney(total)})`
      : 'Upgrade All';
    allBtn.addEventListener('click', () => {
      const fresh = [];
      for (let rr = 0; rr < WORLD_ROWS; rr++)
        for (let cc = 0; cc < WORLD_COLS; cc++)
          if (blockAt(cc, rr) === id) fresh.push({ c: cc, r: rr });
      fresh.sort((a, b) => (stateAt(a.c, a.r).level || 0) - (stateAt(b.c, b.r).level || 0));
      let upgraded = 0;
      for (const inst of fresh) { if (buyMachineUpgrade(inst.c, inst.r, true)) upgraded++; }
      if (upgraded > 0) {
        sfxUpgrade();
        if (UPGRADE_TIP.active) dismissUpgradeTip();
        queueToast(`Upgraded ${upgraded}× ${BLOCK_NAMES[id]}`, '#4dca7c');
        saveGame();
      }
      renderMachinesPanel();
    });
    detail.appendChild(allBtn);
  }

  // ── Individual rows ─────────────────────────────────────────────────────
  for (const inst of instances) {
    const cost = machineUpgradeCost(id, inst.level);
    const maxed = cost == null;

    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.addEventListener('mouseenter', () => { _highlightedMachineTile = { c: inst.c, r: inst.r }; });
    row.addEventListener('mouseleave', () => { _highlightedMachineTile = null; });

    const info = document.createElement('div');
    info.className = 'upgrade-info';
    info.innerHTML = `<div class="name">LV ${inst.level}</div>`;

    const buyBtn = document.createElement('button');
    buyBtn.className = 'upgrade-buy';
    buyBtn.textContent = maxed ? 'MAXED' : `$${formatMoney(cost)}`;
    if (!maxed) buyBtn.dataset.cost = cost;
    buyBtn.disabled = maxed || game.cash < cost;
    buyBtn.addEventListener('click', () => {
      if (buyMachineUpgrade(inst.c, inst.r)) renderMachinesPanel();
    });

    row.appendChild(info);
    row.appendChild(buyBtn);
    detail.appendChild(row);
  }
}

// How many machines of `id` can be upgraded given current cash (cheapest first).
function calcBulkUpgrade(id, instances) {
  const costs = instances
    .map(inst => machineUpgradeCost(id, inst.level))
    .filter(c => c != null)
    .sort((a, b) => a - b);
  let tempCash = game.cash, count = 0, total = 0;
  for (const cost of costs) {
    if (tempCash < cost) continue;
    tempCash -= cost; total += cost; count++;
  }
  return { count, total };
}

// Called every frame — patches button states without rebuilding DOM.
function updateMachinesPanelLive() {
  const panel = document.getElementById('machinesPanel');
  if (!panel || panel.classList.contains('hidden')) return;

  // Individual upgrade buttons
  panel.querySelectorAll('.upgrade-buy[data-cost]').forEach(btn => {
    btn.disabled = game.cash < Number(btn.dataset.cost);
  });

  // Upgrade All button — update count/cost text live
  const allBtn = panel.querySelector('.upgrade-all-btn[data-block-id]');
  if (allBtn) {
    const id = Number(allBtn.dataset.blockId);
    const instances = _machineGroups.get(id) || [];
    const { count, total } = calcBulkUpgrade(id, instances);
    allBtn.disabled = count === 0;
    allBtn.textContent = count > 0
      ? `Upgrade All ×${count} ($${formatMoney(total)})`
      : 'Upgrade All';
  }
}

function initBuildMenu() {
  buildMenuEl      = document.getElementById('buildMenu');
  buildPanelEl     = document.getElementById('buildPanel');
  upgradesPanelEl  = document.getElementById('upgradesPanel');
  fishIndexPanelEl = document.getElementById('fishIndexPanel');
  statsPanelEl     = document.getElementById('statsPanel');
  controlsPanelEl  = document.getElementById('controlsPanel');
  researchPanelEl  = document.getElementById('researchPanel');
  prestigePanelEl  = document.getElementById('prestigePanel');
  blueprintsPanelEl = document.getElementById('blueprintsPanel');
  menuCashEl       = document.getElementById('menuCash');

  buildMenuEl.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchMenuTab(tab.dataset.tab));
  });

  document.getElementById('menuCloseBtn').addEventListener('click', exitBuildMode);

  renderBuildPanel();
  renderUpgradesPanel();
  renderFishIndexPanel();
  renderControlsPanel();
  renderResearchPanel();
  renderPrestigePanel();
  renderBlueprintsPanel();
}

function switchMenuTab(name) {
  buildMenuEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  buildMenuEl.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
  if (name === 'stats') renderStatsPanel();
  if (name === 'prestige') renderPrestigePanel();
  if (name === 'pets') renderPetsPanel();
}

function setBuildMenuOpen(open) {
  if (!buildMenuEl) return;
  buildMenuEl.classList.toggle('hidden', !open);
  // The full-screen build menu's bottom corners sit right where the touch
  // joystick/Interact button float on a phone — hide them while the menu
  // covers them so they don't block taps on the menu underneath. Build
  // stays visible/reachable (see style.css) since it's the only way to
  // close the panel while staying in placement mode.
  document.body.classList.toggle('build-menu-open', open);
  if (!open) _petsPullResult = null; // clear stale pull result on menu close
  if (open) {
    resetJoystick();
    refreshBuildPanel();
    renderUpgradesPanel();
    renderFishIndexPanel();
    renderStatsPanel();
    renderResearchPanel();
    renderPrestigePanel();
    renderPetsPanel();
    renderBlueprintsPanel();
    menuCashEl.textContent = `$${formatMoney(game.cash)}`;
  }
  if (typeof updateBuildHintUI === 'function') updateBuildHintUI();
}

// ─── Leaderboard — standalone top-left icon button + dropdown panel ────────
function initLeaderboardMenu() {
  const btn   = document.getElementById('leaderboardToggleBtn');
  const panel = document.getElementById('leaderboardPanel');
  const closeBtn = document.getElementById('leaderboardCloseBtn');
  leaderboardPanelEl = document.getElementById('leaderboardContent');

  btn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderLeaderboardPanel();
  });

  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

// ─── Build tab ─────────────────────────────────────────────────────────────
function renderBuildPanel() {
  buildPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Q/E to cycle  |  R to rotate belts  |  Left-click place  |  Right-click remove  |  X for multi mode';
  buildPanelEl.appendChild(hint);

  const nav = document.createElement('div');
  nav.className = 'cat-nav';
  for (const cat of BUILD_CATS) {
    if (!PLACEABLE_IDS.some(id => BLOCK_CATS[id] === cat.id)) continue;
    const navBtn = document.createElement('button');
    navBtn.className = 'cat-nav-btn';
    navBtn.style.setProperty('--cat-color', cat.color);
    navBtn.textContent = cat.label;
    navBtn.addEventListener('click', () => {
      buildPanelEl.querySelector(`.cat-divider[data-cat="${cat.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.appendChild(navBtn);
  }
  buildPanelEl.appendChild(nav);

  const grid = document.createElement('div');
  grid.className = 'item-grid';

  for (const cat of BUILD_CATS) {
    const ids = PLACEABLE_IDS.filter(id => BLOCK_CATS[id] === cat.id);
    if (ids.length === 0) continue;

    const divider = document.createElement('div');
    divider.className = 'cat-divider';
    divider.dataset.cat = cat.id;
    divider.style.setProperty('--cat-color', cat.color);
    divider.innerHTML = `<span class="cat-dot"></span>${cat.label}`;
    grid.appendChild(divider);

    const row = document.createElement('div');
    row.className = 'cat-row';

    for (const id of ids) {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.id = id;
      card.style.setProperty('--cat-color', cat.color);
      card.title = BLOCK_DESCS[id];

      const swatch = makeBlockPreview(id);

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = BLOCK_NAMES[id];

      const cost = document.createElement('div');
      cost.className = 'cost';
      cost.textContent = isBlockUnlocked(id) ? `$${BLOCK_COSTS[id]}` : BLOCK_UNLOCK_REQ[id].label;

      const stat = document.createElement('div');
      stat.className = 'stat';
      const statFn = BLOCK_QUICK_STAT[id];
      if (statFn) stat.textContent = statFn();

      const lock = document.createElement('div');
      lock.className = 'lock-badge';
      lock.textContent = '🔒';

      const pip = document.createElement('div');
      pip.className = 'corner-pip';

      card.classList.toggle('locked', !isBlockUnlocked(id));
      card.appendChild(pip);

      const slotIdx = PLACEABLE_IDS.indexOf(id);
      if (slotIdx < 9) {
        const slot = document.createElement('div');
        slot.className = 'slot-badge';
        slot.textContent = String(slotIdx + 1);
        card.appendChild(slot);
      }

      card.appendChild(swatch);
      card.appendChild(name);
      card.appendChild(cost);
      card.appendChild(stat);
      card.appendChild(lock);
      card.addEventListener('click', () => {
        buildMode.selectedId = id;
        buildMode.menuOpen = false;
        setBuildMenuOpen(false);
        refreshBuildPanel();
      });

      row.appendChild(card);
    }
    grid.appendChild(row);
  }

  buildPanelEl.appendChild(grid);

  const action = document.createElement('div');
  action.className = 'action-bar';
  action.innerHTML = `
    <div class="action-preview" id="actionPreview"></div>
    <div class="action-info">
      <div class="action-name" id="actionName"></div>
      <div class="action-desc" id="actionDesc"></div>
    </div>
    <div class="action-cost" id="actionCost"></div>
  `;
  buildPanelEl.appendChild(action);

  refreshBuildPanel();
}

// Lightweight update (selection highlight + afford state) without a full rebuild
function refreshBuildPanel() {
  if (!buildPanelEl) return;
  buildPanelEl.querySelectorAll('.item-card').forEach(card => {
    const id = Number(card.dataset.id);
    const cost = BLOCK_COSTS[id];
    const unlocked = isBlockUnlocked(id);
    const afford = unlocked && game.cash >= cost;
    card.classList.toggle('selected', id === buildMode.selectedId);
    card.classList.toggle('disabled', !afford && unlocked);
    card.classList.toggle('locked', !unlocked);
    const costEl = card.querySelector('.cost');
    costEl.textContent = unlocked ? `$${cost}` : BLOCK_UNLOCK_REQ[id].label;
    costEl.classList.toggle('afford', afford);
  });

  const id = buildMode.selectedId;
  const previewEl = document.getElementById('actionPreview');
  const nameEl = document.getElementById('actionName');
  const descEl = document.getElementById('actionDesc');
  const costEl = document.getElementById('actionCost');
  if (previewEl) {
    // Only rebuild the preview canvas when the selection actually changed —
    // this runs every frame via updateBuildMenuLive, no need to reallocate a
    // canvas+2D context 60x/second for an unchanged selection.
    if (previewEl.dataset.id !== String(id)) {
      previewEl.innerHTML = '';
      previewEl.appendChild(makeBlockPreview(id));
      previewEl.dataset.id = String(id);
      nameEl.textContent = BLOCK_NAMES[id];
      descEl.textContent = BLOCK_DESCS[id];
    }
    const afford = game.cash >= BLOCK_COSTS[id];
    costEl.textContent = `$${BLOCK_COSTS[id]}`;
    costEl.classList.toggle('afford', afford);
  }
}

// ─── Upgrades tab ──────────────────────────────────────────────────────────
function renderUpgradesPanel() {
  upgradesPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Spend cash on permanent stat boosts';
  upgradesPanelEl.appendChild(hint);

  for (const def of UPGRADES) {
    const lvl  = upgradeLevels[def.id];
    const cost = upgradeCost(def);
    const maxed = cost == null;
    const fx = upgradeEffectParts(def);

    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.title = def.desc;

    const info = document.createElement('div');
    info.className = 'upgrade-info';
    info.innerHTML = `
      <div class="name">
        ${def.name}
        <span class="level-pair">
          <span class="level-badge">LV ${lvl}</span>
          ${maxed ? '' : `<span class="level-arrow">&rarr;</span><span class="level-badge next">LV ${lvl + 1}</span>`}
        </span>
      </div>
      <div class="desc">${def.desc}</div>
      <div class="effect">
        ${maxed ? '<span class="maxed">Maxed out</span>' :
          `<span class="fx-current">${fx.current}</span><span class="fx-arrow">&rarr;</span><span class="fx-next">${fx.next}</span>`}
      </div>
    `;

    const buyBtn = document.createElement('button');
    buyBtn.className = 'upgrade-buy';
    buyBtn.textContent = maxed ? 'MAXED' : `$${cost}`;
    buyBtn.disabled = maxed || game.cash < cost;
    buyBtn.addEventListener('click', () => {
      if (buyUpgrade(def.id)) renderUpgradesPanel();
    });

    row.appendChild(info);
    row.appendChild(buyBtn);
    upgradesPanelEl.appendChild(row);
  }
}

// ─── Research tab ──────────────────────────────────────────────────────────
function renderResearchPanel() {
  researchPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';

  if (!isResearchUnlocked()) {
    hint.textContent = `Unlocks at $${researchUnlockLifetime().toLocaleString()} lifetime earned`;
    researchPanelEl.appendChild(hint);
    return;
  }

  hint.textContent = 'One-time cash purchases for late-game upgrades';
  researchPanelEl.appendChild(hint);

  for (const def of RESEARCH_NODES) {
    const owned  = researchLevels[def.id] >= 1;
    const locked = !owned && def.requires && researchLevels[def.requires] < 1;
    const cost   = researchCost(def);

    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.title = def.desc;

    const info = document.createElement('div');
    info.className = 'upgrade-info';
    info.innerHTML = `
      <div class="name">
        ${def.name}
        ${owned ? '<span class="level-badge">OWNED</span>' : ''}
      </div>
      <div class="desc">${def.desc}</div>
      <div class="effect">
        ${owned ? '<span class="maxed">Researched</span>' :
          locked ? '<span class="maxed">Requires prior research</span>' : ''}
      </div>
    `;

    const buyBtn = document.createElement('button');
    buyBtn.className = 'upgrade-buy';
    buyBtn.textContent = owned ? 'OWNED' : locked ? 'LOCKED' : `$${cost}`;
    buyBtn.disabled = owned || locked || game.cash < cost;
    buyBtn.addEventListener('click', () => {
      if (buyResearch(def.id)) renderResearchPanel();
    });

    row.appendChild(info);
    row.appendChild(buyBtn);
    researchPanelEl.appendChild(row);
  }
}

// ─── Prestige tab ──────────────────────────────────────────────────────────
function renderPrestigePanel() {
  prestigePanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  const available = tokensAvailableOnReset();
  hint.textContent = `Reset your run for Fish Tokens (permanent bonuses). $${PRESTIGE_TOKEN_DIVISOR.toLocaleString()} lifetime earned = 1 token`;
  prestigePanelEl.appendChild(hint);

  const summary = document.createElement('div');
  summary.className = 'upgrade-row';
  summary.innerHTML = `
    <div class="upgrade-info">
      <div class="name">Fish Tokens: <span class="level-badge">${prestigeTokens.total}</span></div>
      <div class="desc">Available on prestige now: ${available}</div>
    </div>
  `;
  const prestigeBtn = document.createElement('button');
  prestigeBtn.className = 'upgrade-buy';
  prestigeBtn.textContent = 'Prestige Now';
  prestigeBtn.disabled = available < 1;
  prestigeBtn.addEventListener('click', () => {
    if (confirm(`Prestige now for ${available} Fish Token(s)? This wipes your current run (cash, machines, layout) but keeps Fish Tokens and any prestige upgrades you've bought.`)) {
      doPrestige();
    }
  });
  summary.appendChild(prestigeBtn);
  prestigePanelEl.appendChild(summary);

  for (const def of PRESTIGE_UPGRADES) {
    const lvl  = prestigeLevels[def.id];
    const cost = prestigeUpgradeCost(def);
    const maxed = cost == null;

    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.title = def.desc;

    const info = document.createElement('div');
    info.className = 'upgrade-info';
    info.innerHTML = `
      <div class="name">
        ${def.name}
        <span class="level-pair">
          <span class="level-badge">LV ${lvl}</span>
          ${maxed ? '' : `<span class="level-arrow">&rarr;</span><span class="level-badge next">LV ${lvl + 1}</span>`}
        </span>
      </div>
      <div class="desc">${def.desc}</div>
      <div class="effect">${maxed ? '<span class="maxed">Maxed out</span>' : ''}</div>
    `;

    const buyBtn = document.createElement('button');
    buyBtn.className = 'upgrade-buy';
    buyBtn.textContent = maxed ? 'MAXED' : `${cost} token${cost === 1 ? '' : 's'}`;
    buyBtn.disabled = maxed || prestigeTokens.total < cost;
    buyBtn.addEventListener('click', () => {
      if (buyPrestigeUpgrade(def.id)) {
        renderPrestigePanel();
        // Industry Contacts changes the Research tab's unlock-threshold hint,
        // but that panel only re-renders on tab switch — refresh it here too
        // so the discount is visible immediately, matching Seed Capital's
        // instant-effect fix.
        if (def.id === 'unlockGate') renderResearchPanel();
      }
    });

    row.appendChild(info);
    row.appendChild(buyBtn);
    prestigePanelEl.appendChild(row);
  }
}

// ─── Blueprints tab ────────────────────────────────────────────────────────
function renderBlueprintsPanel() {
  blueprintsPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Copy (C) saves a layout here. Pick one Active, then Paste (V) to stamp it.';
  blueprintsPanelEl.appendChild(hint);

  const importRow = document.createElement('div');
  importRow.className = 'upgrade-row';
  importRow.innerHTML = `<div class="upgrade-info"><div class="name">Import a shared layout</div><div class="desc">Paste a blueprint code someone shared on Discord</div></div>`;
  const importBtn = document.createElement('button');
  importBtn.className = 'upgrade-buy';
  importBtn.textContent = 'Paste Code';
  importBtn.addEventListener('click', () => {
    const code = prompt('Paste blueprint code:');
    if (code && importBlueprintCode(code)) { renderBlueprintsPanel(); updateBuildHud(); }
  });
  importRow.appendChild(importBtn);
  blueprintsPanelEl.appendChild(importRow);

  if (blueprint.library.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No blueprints yet. Drag-select an area with Copy (C) to save one.';
    blueprintsPanelEl.appendChild(empty);
    return;
  }

  for (const entry of blueprint.library) {
    const isActive = blueprint.activeId === entry.id;

    const row = document.createElement('div');
    row.className = 'upgrade-row';

    const info = document.createElement('div');
    info.className = 'upgrade-info';
    info.innerHTML = `
      <div class="name">
        <input class="bp-name-input" type="text" value="${entry.name}" maxlength="40">
        ${isActive ? '<span class="level-badge">ACTIVE</span>' : ''}
      </div>
      <div class="desc">${entry.w}&times;${entry.h} tiles &middot; ${entry.tiles.length} cell(s)</div>
    `;
    const nameInput = info.querySelector('.bp-name-input');
    nameInput.addEventListener('change', () => {
      renameBlueprint(entry.id, nameInput.value);
      renderBlueprintsPanel();
      updateBuildHud();
    });

    const btnGroup = document.createElement('div');
    btnGroup.className = 'level-pair';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'upgrade-buy';
    loadBtn.textContent = isActive ? 'Active' : 'Load';
    loadBtn.disabled = isActive;
    loadBtn.addEventListener('click', () => {
      selectBlueprint(entry.id);
      renderBlueprintsPanel();
      updateBuildHud();
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'upgrade-buy';
    copyBtn.textContent = 'Copy Code';
    copyBtn.addEventListener('click', () => {
      const code = exportBlueprintCode(entry.id);
      if (code) navigator.clipboard.writeText(code).then(() => queueToast('Blueprint code copied to clipboard', '#4dca7c'));
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'upgrade-buy bp-delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      deleteBlueprint(entry.id);
      renderBlueprintsPanel();
      updateBuildHud();
    });

    btnGroup.appendChild(loadBtn);
    btnGroup.appendChild(copyBtn);
    btnGroup.appendChild(deleteBtn);

    row.appendChild(info);
    row.appendChild(btnGroup);
    blueprintsPanelEl.appendChild(row);
  }
}

// ─── Leaderboard tab ───────────────────────────────────────────────────────
// Leaderboard names can come from any client (open-write table, no auth) —
// escape before interpolating into innerHTML so a hostile name can't inject markup.
function escapeLeaderboardName(name) {
  const div = document.createElement('div');
  div.textContent = name;
  return div.innerHTML;
}

function renderLeaderboardPanel() {
  leaderboardPanelEl.innerHTML = '';

  if (!isLeaderboardConfigured()) {
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'Leaderboard not set up yet. See leaderboard/SETUP.md';
    leaderboardPanelEl.appendChild(hint);
    return;
  }

  if (!getLeaderboardName()) {
    renderLeaderboardNamePrompt();
    return;
  }

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.innerHTML = `Playing as <strong>${escapeLeaderboardName(getLeaderboardName())}</strong>`;
  leaderboardPanelEl.appendChild(hint);

  const loading = document.createElement('div');
  loading.className = 'panel-hint';
  loading.textContent = 'Loading leaderboard…';
  leaderboardPanelEl.appendChild(loading);

  fetchLeaderboard().then(result => {
    if (loading.parentNode === leaderboardPanelEl) leaderboardPanelEl.removeChild(loading);
    if (result.error) {
      const err = document.createElement('div');
      err.className = 'panel-hint';
      err.textContent = 'Leaderboard is temporarily unavailable — the server may be down. Try again in a moment.';
      leaderboardPanelEl.appendChild(err);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'upgrade-buy';
      retryBtn.textContent = 'Retry';
      retryBtn.style.cssText = 'margin-top:8px;display:block;';
      retryBtn.addEventListener('click', renderLeaderboardPanel);
      leaderboardPanelEl.appendChild(retryBtn);
      return;
    }
    renderLeaderboardList(result);
  });
}

function renderLeaderboardNamePrompt() {
  leaderboardPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Pick a name to join the leaderboard';
  leaderboardPanelEl.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'upgrade-row';

  const input = document.createElement('input');
  input.className = 'bp-name-input';
  input.type = 'text';
  input.maxLength = 20;
  input.placeholder = 'Your name';
  input.value = getLeaderboardName();

  const joinBtn = document.createElement('button');
  joinBtn.className = 'upgrade-buy';
  joinBtn.textContent = 'Join leaderboard';
  joinBtn.addEventListener('click', async () => {
    const result = _setLeaderboardNameInternal(input.value);
    if (result === 'fancy') {
      input.style.borderColor = '#e05c5c';
      input.value = '';
      input.placeholder = 'Letters & numbers only!';
    } else if (result === 'inappropriate') {
      input.style.borderColor = '#e05c5c';
      input.value = '';
      input.placeholder = 'Keep it clean!';
    } else if (result) {
      joinBtn.disabled = true;
      joinBtn.textContent = 'Joining…';
      await submitLeaderboardScore();
      renderLeaderboardPanel();
    }
  });

  row.appendChild(input);
  row.appendChild(joinBtn);
  leaderboardPanelEl.appendChild(row);
}

function renderLeaderboardList(result) {
  const { top, me, myRank, clientId } = result;

  const list = document.createElement('div');
  list.className = 'lb-list';

  if (!top.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No scores yet — be the first!';
    leaderboardPanelEl.appendChild(empty);
  }

  top.forEach((row, i) => {
    const rankRow = document.createElement('div');
    rankRow.className = 'upgrade-row lb-row';
    if (row.client_id === clientId) rankRow.classList.add('lb-self');
    rankRow.innerHTML = `
      <div class="upgrade-info">
        <div class="name">#${i + 1} ${escapeLeaderboardName(row.name)}</div>
      </div>
      <div class="lb-score">$${formatMoney(Number(row.lifetime_earned))}</div>
    `;
    list.appendChild(rankRow);
  });

  leaderboardPanelEl.appendChild(list);

  const alreadyVisible = top.some(row => row.client_id === clientId);
  if (me && !alreadyVisible) {
    const footer = document.createElement('div');
    footer.className = 'upgrade-row lb-row lb-own-row';
    footer.innerHTML = `
      <div class="upgrade-info">
        <div class="name">#${myRank != null ? myRank : '?'} ${escapeLeaderboardName(me.name)} <span class="level-badge">YOU</span></div>
      </div>
      <div class="lb-score">$${formatMoney(Number(me.lifetime_earned))}</div>
    `;
    leaderboardPanelEl.appendChild(footer);
  }
}

// ─── Fish Index tab ──────────────────────────────────────────────────────────
// A species unlocks the moment it's caught (randomFish() in data.js adds it
// to game.fishIndex) — selling isn't required, so this reads as "fish you've
// seen" rather than "fish you've sold".
function makeFishPreview(spec) {
  const cnv = document.createElement('canvas');
  cnv.className = 'swatch';
  cnv.width = TILE_SIZE;
  cnv.height = TILE_SIZE;
  const pctx = cnv.getContext('2d');
  pctx.fillStyle = '#1a2018';
  pctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  drawFishSprite(pctx, spec, TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE - 6);
  return cnv;
}

function renderFishIndexPanel() {
  if (!fishIndexPanelEl) return;
  fishIndexPanelEl.innerHTML = '';

  const caughtCount = FISH.filter(f => game.fishIndex.has(f.species)).length;
  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = `${caughtCount} / ${FISH.length} species discovered. Catch one to reveal it.`;
  fishIndexPanelEl.appendChild(hint);

  const grid = document.createElement('div');
  grid.className = 'item-grid';

  for (const catName of CATEGORY_NAMES) {
    const specs = FISH.filter(f => f.category === catName);
    if (specs.length === 0) continue;
    const catColor = CATEGORY_COLOR[catName];

    const bonus = FISH_INDEX_CATEGORY_BONUS[catName];
    const claimed = game.fishIndexBonuses.has(catName);
    const catCaught = specs.filter(f => game.fishIndex.has(f.species)).length;

    const divider = document.createElement('div');
    divider.className = 'cat-divider';
    divider.style.setProperty('--cat-color', catColor);
    divider.innerHTML = `<span class="cat-dot"></span>${catName}` +
      (claimed ? ` <span class="panel-hint" style="display:inline;margin:0 0 0 6px;color:#4dca7c;">✓ +$${bonus} claimed</span>`
               : ` <span class="panel-hint" style="display:inline;margin:0 0 0 6px;">${catCaught}/${specs.length} (complete for +$${bonus})</span>`);
    grid.appendChild(divider);

    const row = document.createElement('div');
    row.className = 'cat-row';

    for (const spec of specs) {
      const caught = game.fishIndex.has(spec.species);

      const card = document.createElement('div');
      card.className = 'item-card fish-card' + (caught ? '' : ' disabled');
      card.style.setProperty('--cat-color', catColor);

      const swatch = makeFishPreview(spec);

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = caught ? spec.species : '???';

      const value = document.createElement('div');
      value.className = 'cost' + (caught ? ' afford' : '');
      value.textContent = caught ? `$${spec.value.toFixed(1)} base` : 'Not yet caught';

      const lock = document.createElement('div');
      lock.className = 'lock-badge';
      lock.textContent = '🔒';

      card.appendChild(lock);
      card.appendChild(swatch);
      card.appendChild(name);
      card.appendChild(value);
      row.appendChild(card);
    }
    grid.appendChild(row);
  }

  fishIndexPanelEl.appendChild(grid);
}

// ─── Stats tab ───────────────────────────────────────────────────────────────
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderStatsPanel() {
  if (!statsPanelEl) return;
  statsPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Lifetime progress across this save';
  statsPanelEl.appendChild(hint);

  const rows = [
    ['Lifetime earnings', `$${formatMoney(game.lifetimeEarned)}`],
    ['Fish sold', game.fishSold],
    ['Uptime', formatUptime(game.time)],
    ['Fish Index discovered', `${game.fishIndex.size} / ${FISH.length}`],
    ['Achievements unlocked', `${game.unlockedAchievements.size} / ${ACHIEVEMENTS.length}`],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    row.innerHTML = `<div class="upgrade-info"><div class="name">${label}</div></div><div class="cost afford">${value}</div>`;
    statsPanelEl.appendChild(row);
  }

  const divider = document.createElement('div');
  divider.className = 'cat-divider';
  divider.style.setProperty('--cat-color', '#f0c419');
  divider.innerHTML = `<span class="cat-dot"></span>Achievements`;
  statsPanelEl.appendChild(divider);

  const row = document.createElement('div');
  row.className = 'cat-row';
  for (const a of ACHIEVEMENTS) {
    const unlocked = game.unlockedAchievements.has(a.id);
    const card = document.createElement('div');
    card.className = 'item-card' + (unlocked ? '' : ' disabled');
    card.style.setProperty('--cat-color', '#f0c419');
    card.innerHTML = `
      <div class="name">${unlocked ? a.name : '???'}</div>
      <div class="cost${unlocked ? ' afford' : ''}">${unlocked ? a.desc : 'Locked'}</div>
    `;
    row.appendChild(card);
  }
  statsPanelEl.appendChild(row);
}


// ─── Controls tab — full keybind cheat-sheet ───────────────────────────────
// Static reference content (rendered once at init, see initBuildMenu) — none
// of this depends on live game state, unlike the other tabs.
// Each row's `combo` is a list of chords; keys within a chord are pressed
// together ("+"), separate chords are alternatives ("or") — e.g.
// [['Ctrl','Shift','Z']] renders "Ctrl + Shift + Z", while [['Q'],['E']]
// renders "Q  or  E".
const CONTROL_GROUPS = [
  {
    label: 'Movement & Fishing', color: '#7ec8e3',
    rows: [
      [[['W'], ['A'], ['S'], ['D']], 'Walk around (arrow keys work too)'],
      [[['Left Click']], 'Cast your line at water in range. Click again to reel in.'],
      [[['Left Click']], 'Drop a held fish onto a belt you’re hovering'],
      [[['E']], 'Hovering a Sorter / Recycler / Packer / Crate / Teleporter / Machine: open its settings popup (works from anywhere on the map)'],
      [[['E']], 'Holding fish, hovering a belt in reach: drop them on it'],
    ],
  },
  {
    label: 'Build Mode', color: '#e8a030',
    rows: [
      [[['B']], 'Enter build mode (opens the menu). Press again to show/hide the menu while staying in build mode.'],
      [[['Esc']], 'Exit build mode entirely'],
      [[['1'], ['…'], ['9']], 'Select a block by its slot number'],
      [[['Q']], 'Cycle to the previous block'],
      [[['E']], 'Cycle to the next block'],
      [[['R']], 'Rotate the selected belt-type block’s facing'],
      [[['X']], 'Toggle multi mode. Drag a rectangle to place/remove over the whole area at once.'],
      [[['Left Click']], 'Place the selected block (drag to paint, or drag a box in multi mode)'],
      [[['Right Click']], 'Remove/sell whatever\'s on that tile. On empty ground, exits build mode.'],
    ],
  },
  {
    label: 'Blueprints (copy/paste layouts)', color: '#a78bfa',
    rows: [
      [[['C']], 'Toggle copy mode, then drag a rectangle to copy that area (settings & upgrades included)'],
      [[['V']], 'Toggle paste mode, then click to stamp the copied layout. Pasting over existing blocks replaces them.'],
      [[['Esc']], 'Cancel copy/paste mode'],
    ],
  },
  {
    label: 'Editing', color: '#4dca7c',
    rows: [
      [[['Ctrl', 'Z']], 'Undo the last build action'],
      [[['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']], 'Redo'],
    ],
  },
  {
    label: 'Menus & Camera', color: '#e05c5c',
    rows: [
      [[['Tab']], 'Switch between menu tabs while the menu is open'],
      [[['Esc']], 'Close the menu, or close an open settings popup'],
      [[['Scroll Wheel']], 'Zoom the camera in/out'],
    ],
  },
];

function renderControlsPanel() {
  if (!controlsPanelEl) return;
  controlsPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Every keybind and combo, grouped by what you’re doing';
  controlsPanelEl.appendChild(hint);

  for (const group of CONTROL_GROUPS) {
    const divider = document.createElement('div');
    divider.className = 'cat-divider';
    divider.style.setProperty('--cat-color', group.color);
    divider.innerHTML = `<span class="cat-dot"></span>${group.label}`;
    controlsPanelEl.appendChild(divider);

    for (const [combo, desc] of group.rows) {
      const row = document.createElement('div');
      row.className = 'control-row';
      const keysEl = document.createElement('div');
      keysEl.className = 'control-keys';
      keysEl.innerHTML = combo
        .map(chord => chord.map(k => `<span class="key-badge">${k}</span>`).join('<span class="key-plus">+</span>'))
        .join('<span class="key-or">or</span>');
      const descEl = document.createElement('div');
      descEl.className = 'control-desc';
      descEl.textContent = desc;
      row.appendChild(keysEl);
      row.appendChild(descEl);
      controlsPanelEl.appendChild(row);
    }
  }
}

// ─── Frog interaction popup (walk up + E) ────────────────────────────────────
let _frogPopupEl = null;
let _frogPopupUid = null;

function openFrogPopup(uid) {
  closeFrogPopup();
  const frog = (game.frogs || []).find(f => f.uid === uid);
  if (!frog) return;
  const v = getFrogVariant(frog.variant) || {};
  const refund = frogSellPrice(uid);
  const s = _frogStates[uid];
  if (!s) return;

  const canvasEl = document.getElementById('canvas');
  const rect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 };
  const sx = rect.left + (s.wx - cam.x) * ZOOM;
  const sy = rect.top  + (s.wy - cam.y) * ZOOM;

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;z-index:900;background:rgba(12,22,20,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px 14px;min-width:130px;pointer-events:all;';
  el.style.left = Math.min(sx, window.innerWidth - 160) + 'px';
  el.style.top  = Math.max(10, sy - 90) + 'px';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:8px;font-weight:bold;';
  nameEl.textContent = (v.name || frog.variant) + ' Frog';
  el.appendChild(nameEl);

  const pickBtn = document.createElement('button');
  pickBtn.className = 'upgrade-buy';
  pickBtn.style.cssText = 'width:100%;margin-bottom:6px;display:block;';
  pickBtn.textContent = 'Pick Up';
  pickBtn.addEventListener('click', () => { pickUpFrog(uid); closeFrogPopup(); if (typeof renderPetsPanel === 'function') renderPetsPanel(); });
  el.appendChild(pickBtn);

  const sellBtn = document.createElement('button');
  sellBtn.className = 'upgrade-buy pet-sell-btn';
  sellBtn.style.cssText = 'width:100%;display:block;';
  sellBtn.textContent = `Sell ($${refund})`;
  sellBtn.addEventListener('click', () => { sellFrog(uid); closeFrogPopup(); if (typeof renderPetsPanel === 'function') renderPetsPanel(); });
  el.appendChild(sellBtn);

  document.body.appendChild(el);
  _frogPopupEl = el;
  _frogPopupUid = uid;
}

function closeFrogPopup() {
  if (_frogPopupEl) { _frogPopupEl.remove(); _frogPopupEl = null; }
  _frogPopupUid = null;
}

// ─── Per-block popup (machine upgrade / sorter settings / crate contents) ──
let blockPopupEl;

function openBlockPopup(kind, c, r, screenX, screenY) {
  if (!blockPopupEl) blockPopupEl = document.getElementById('blockPopup');
  blockPopup.open = true;
  blockPopup.kind = kind;
  blockPopup.c = c;
  blockPopup.r = r;
  blockPopup.x = screenX;
  blockPopup.y = screenY;
  blockPopupEl.style.left = `${screenX}px`;
  blockPopupEl.style.top  = `${screenY}px`;
  blockPopupEl.classList.remove('hidden');
  renderBlockPopup();
  clampBlockPopupToViewport();
}

// The popup is centered horizontally and anchored above (screenX, screenY)
// purely via CSS transform, with no awareness of viewport edges — tapping a
// machine near a screen edge (common on a small phone viewport, but also
// reachable on desktop with a narrow window) can render it partly or fully
// off-screen. Nudges it back on-screen using its actual rendered size,
// which is only known after layout.
function clampBlockPopupToViewport() {
  const margin = 8;
  const rect = blockPopupEl.getBoundingClientRect();
  let dx = 0, dy = 0;
  if (rect.left < margin) dx = margin - rect.left;
  else if (rect.right > window.innerWidth - margin) dx = (window.innerWidth - margin) - rect.right;
  if (rect.top < margin) dy = margin - rect.top;
  else if (rect.bottom > window.innerHeight - margin) dy = (window.innerHeight - margin) - rect.bottom;
  if (!dx && !dy) return;
  blockPopup.x += dx;
  blockPopup.y += dy;
  blockPopupEl.style.left = `${blockPopup.x}px`;
  blockPopupEl.style.top  = `${blockPopup.y}px`;
}

function closeBlockPopup() {
  blockPopup.open = false;
  if (blockPopupEl) blockPopupEl.classList.add('hidden');
}

// E-key entry point while hovering a tile — toggles closed if already open
// on the same tile/kind, otherwise opens anchored at the cursor.
function toggleBlockPopupAtMouse(kind, c, r) {
  if (blockPopup.open && blockPopup.kind === kind && blockPopup.c === c && blockPopup.r === r) {
    closeBlockPopup();
    return;
  }
  openBlockPopup(kind, c, r, mouseCanvas.x, mouseCanvas.y);
}

function renderBlockPopup() {
  const { kind, c, r } = blockPopup;
  if (kind === 'machine')        renderMachinePopupContent(c, r);
  else if (kind === 'sorter')    renderSorterPopupContent(c, r);
  else if (kind === 'crate')     renderCratePopupContent(c, r);
  else if (kind === 'recycler')  renderRecyclerPopupContent(c, r);
  else if (kind === 'packer')    renderPackerPopupContent(c, r);
  else if (kind === 'teleporter') renderTeleporterPopupContent(c, r);
  else if (kind === 'pond')       renderPondPopupContent(c, r);
  else if (kind === 'water_pond') renderWaterPondPopupContent(c, r);
  else if (kind === 'worker_dock') renderWorkerDockContent(c, r);
  // "Move" button appended to block popups (not for terrain-based or island popups)
  if (kind !== 'water_pond' && kind !== 'worker_dock') {
    const moveBtn = document.createElement('button');
    moveBtn.className = 'mp-move';
    moveBtn.textContent = 'Move (free)';
    moveBtn.addEventListener('click', () => movePickUpBlock(c, r));
    if (blockPopupEl) blockPopupEl.appendChild(moveBtn);
  }
}

function _workerDepotState() {
  const isl = offshoreIslands && offshoreIslands[0];
  if (!isl || isl.depotC === undefined) return null;
  return stateAt(isl.depotC, isl.depotR);
}

function renderWorkerDockContent() {
  if (!blockPopupEl) return;
  const count = game.workers ? game.workers.length : 0;
  const cost  = workerHireCost();
  const depotSt = _workerDepotState();
  const carry   = depotSt ? depotSt.carrying : [];
  const depotVal = carry.reduce((s, f) => s + (f.value || 0), 0);

  blockPopupEl.innerHTML = `
    <div class="mp-title">Worker Island</div>
    <div class="mp-stats">
      <div>Fishermen: ${count} / ${WORKER_MAX}</div>
      <div style="margin-top:4px">Fish depot: <b>${carry.length}</b> / ${DEPOT_CAPACITY} fish
        ${carry.length ? `<span style="color:#f0c030"> (~$${depotVal.toFixed(1)})</span>` : ''}
      </div>
      <div style="color:#9aa0a8;font-size:0.82em;margin-top:3px">
        Workers catch fish and drop them in the depot.<br>Place a <b>Belt</b> next to the depot to move fish out.
      </div>
    </div>
    <div class="mp-effect">${count >= WORKER_MAX ? '<span class="maxed">All fishermen hired</span>' : `Next hire: $${cost.toLocaleString()}`}</div>
    <button class="mp-buy" ${count >= WORKER_MAX ? 'disabled' : ''}>${count >= WORKER_MAX ? 'MAXED' : `Hire Fisherman ($${cost.toLocaleString()})`}</button>
  `;
  const buyBtn = blockPopupEl.querySelector('.mp-buy');
  if (buyBtn && count < WORKER_MAX) {
    buyBtn.disabled = game.cash < cost;
    buyBtn.addEventListener('click', () => hireWorker());
  }
}

// Shared "Lv N+1: -X% time, +Y% value" + buy button block, used both as the
// whole popup body (machines, Fisher, Drone Fisher, Drone Delivery) and
// appended below another block's own settings UI (Recycler, Packer).
function upgradeSectionHTML(id, level, cost) {
  const fx    = UPGRADABLE_EFFECTS[id] || { speed: true, value: true };
  const maxed = cost == null;
  const parts = [];
  if (fx.speed) parts.push(`<span class="fx-next">-${Math.round(MACHINE_UPGRADE_SPEED_PER_LV * 100)}% time</span>`);
  if (fx.value) parts.push(`<span class="fx-next">+${Math.round(MACHINE_UPGRADE_VALUE_PER_LV * 100)}% value</span>`);
  if (fx.luck === true) parts.push(`<span class="fx-next">+${Math.round(MACHINE_UPGRADE_LUCK_PER_LV * 100)}% rare luck</span>`);
  if (fx.luck === 'penalty') parts.push('<span class="fx-next">+6% rare luck (recovers penalty)</span>');
  return `
    <div class="mp-effect">
      ${maxed ? '<span class="maxed">Maxed out</span>' : `Lv ${level + 1}: ${parts.join(', ')}`}
    </div>
    <button class="mp-buy" ${maxed ? 'disabled' : ''}>${maxed ? 'MAXED' : `Upgrade ($${cost})`}</button>
  `;
}

// Wires the `.mp-buy` button rendered by upgradeSectionHTML — call after
// setting innerHTML so the listener attaches to the fresh DOM node.
function wireUpgradeSection(c, r, cost) {
  const buyBtn = blockPopupEl.querySelector('.mp-buy');
  if (!buyBtn || cost == null) return;
  buyBtn.disabled = game.cash < cost;
  buyBtn.addEventListener('click', () => {
    if (buyMachineUpgrade(c, r)) renderBlockPopup();
  });
}

// Static per-machine processing stats — replaces the old per-fish "Washer +$x"
// toast spam with a fixed reference baked into the popup instead.
function machineStatsHTML(id, level) {
  const def = machineDef(id);
  if (!def) return '';
  const valueMult = machineValueMult(level || 0);
  return `
    <div class="mp-stats">
      <div>Good for: ${def.goodFor.join(', ')}</div>
      <div>+${Math.round(def.goodMult * valueMult * 100 - 100)}% value (good) / +${Math.round(def.badMult * valueMult * 100 - 100)}% value (other)</div>
      <div>${def.processTime.toFixed(1)}s per fish</div>
    </div>
  `;
}

function renderMachinePopupContent(c, r) {
  const id = blockAt(c, r);
  if (!IS_UPGRADABLE(id)) { closeBlockPopup(); return; }
  const st    = stateAt(c, r);
  const level = st.level || 0;
  const cost  = machineUpgradeCost(id, level);

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">${BLOCK_NAMES[id]} <span class="level-badge">LV ${level}</span></div>
      <button class="mp-close">&times;</button>
    </div>
    ${machineStatsHTML(id, level)}
    ${upgradeSectionHTML(id, level, cost)}
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  wireUpgradeSection(c, r, cost);
}

function renderSorterPopupContent(c, r) {
  if (blockAt(c, r) !== B_SORTER) { closeBlockPopup(); return; }
  const st        = stateAt(c, r);
  const threshold = st.sortThreshold != null ? st.sortThreshold : 2;
  const mode      = st.sortMode || 'size';

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">Sorter Settings</div>
      <button class="mp-close">&times;</button>
    </div>
    <div class="mp-size-row">
      <button class="mp-size-btn ${mode === 'size'   ? 'active' : ''}" data-mode="size">By Size</button>
      <button class="mp-size-btn ${mode === 'rarity' ? 'active' : ''}" data-mode="rarity">By Rarity</button>
    </div>
    ${mode === 'size' ? `
      <div class="mp-effect">Fish at or above the selected size exit the front side; smaller fish exit the back side.</div>
      <div class="mp-size-row">
        ${SIZES.map((s, i) => `<button class="mp-size-btn ${i === threshold ? 'active' : ''}" data-idx="${i}">${s.name}</button>`).join('')}
      </div>
    ` : `
      <div class="mp-effect">Fish of the selected category exit the front side; everything else exits the back side.</div>
      <div class="mp-size-row">
        ${CATEGORY_NAMES.map(cat => `<button class="mp-size-btn ${cat === st.sortCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>`).join('')}
      </div>
    `}
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  blockPopupEl.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      stateAt(c, r).sortMode = btn.dataset.mode;
      renderBlockPopup();
    });
  });
  blockPopupEl.querySelectorAll('[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      stateAt(c, r).sortThreshold = Number(btn.dataset.idx);
      renderBlockPopup();
    });
  });
  blockPopupEl.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      stateAt(c, r).sortCategory = btn.dataset.cat;
      renderBlockPopup();
    });
  });
}

function renderPackerPopupContent(c, r) {
  const id = blockAt(c, r);
  if (!IS_PACKER(id)) { closeBlockPopup(); return; }
  const st = stateAt(c, r);
  const targets = [3, 5, 8, 12];
  const level = st.level || 0;
  const cost  = machineUpgradeCost(id, level);

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">Packer <span class="level-badge">${st.carrying.length}/${st.packTarget}</span></div>
      <button class="mp-close">&times;</button>
    </div>
    <div class="mp-effect">Bundles incoming fish into one box worth more than the sum of its parts.</div>
    <div class="mp-size-row">
      ${targets.map(t => `<button class="mp-size-btn ${t === st.packTarget ? 'active' : ''}" data-target="${t}">${t}</button>`).join('')}
    </div>
    ${upgradeSectionHTML(id, level, cost)}
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  blockPopupEl.querySelectorAll('[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      stateAt(c, r).packTarget = Number(btn.dataset.target);
      renderBlockPopup();
    });
  });
  wireUpgradeSection(c, r, cost);
  blockPopup._lastPackerLen = st.carrying.length;
}

function renderRecyclerPopupContent(c, r) {
  const id = blockAt(c, r);
  if (id !== B_RECYCLER) { closeBlockPopup(); return; }
  const st    = stateAt(c, r);
  const level = st.level || 0;
  const cost  = machineUpgradeCost(id, level);

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">Recycler Settings <span class="level-badge">LV ${level}</span></div>
      <button class="mp-close">&times;</button>
    </div>
    <div class="mp-effect">Selected rarities are salvaged for a flat fee the moment they ride onto this belt. Everything else passes straight through.</div>
    <div class="mp-size-row">
      ${CATEGORY_NAMES.map(cat => `<button class="mp-size-btn ${st.recycleRarities.includes(cat) ? 'active' : ''}" data-cat="${cat}">${cat}</button>`).join('')}
    </div>
    ${upgradeSectionHTML(id, level, cost)}
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  blockPopupEl.querySelectorAll('.mp-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      const i = st.recycleRarities.indexOf(cat);
      if (i === -1) st.recycleRarities.push(cat); else st.recycleRarities.splice(i, 1);
      renderBlockPopup();
    });
  });
  wireUpgradeSection(c, r, cost);
}

// Teleporter settings: pick which other Teleporter on the map this one sends
// fish to. The list is rebuilt fresh every render (cheap — the map is small
// and this only runs when the popup is opened or a button inside it is
// clicked, never per-frame; see updateBlockPopupLive for the per-frame path).
// Compass direction + distance from (fc,fr) to (tc,tr).
function teleporterHint(fc, fr, tc, tr) {
  const dc = tc - fc, dr = tr - fr;
  const dist = Math.round(Math.hypot(dc, dr));
  const deg = Math.atan2(dr, dc) * 180 / Math.PI;
  const dirs = ['E','SE','S','SW','W','NW','N','NE'];
  const compass = dirs[Math.round(((deg + 360) % 360) / 45) % 8];
  return `${compass} · ${dist} tile${dist !== 1 ? 's' : ''}`;
}

// 1-based display number for teleporter at (tc,tr) in row-major order.
function teleporterDisplayNumUI(tc, tr) {
  let n = 1;
  for (let rr = 0; rr < WORLD_ROWS; rr++)
    for (let cc = 0; cc < WORLD_COLS; cc++) {
      if (blockAt(cc, rr) !== B_TELEPORTER) continue;
      if (cc === tc && rr === tr) return n;
      n++;
    }
  return n;
}

function renderTeleporterPopupContent(c, r) {
  if (blockAt(c, r) !== B_TELEPORTER) { closeBlockPopup(); return; }
  const st = stateAt(c, r);
  const others = teleporterTiles(c, r);
  const thisNum = teleporterDisplayNumUI(c, r);

  // Linked-destination summary shown above the list
  let linkedLabel = '';
  if (st.teleportTarget) {
    const { c: tc, r: tr } = st.teleportTarget;
    const destNum = teleporterDisplayNumUI(tc, tr);
    linkedLabel = `<div class="mp-effect" style="color:#7ee8fa">Linked → T${destNum} (${teleporterHint(c, r, tc, tr)})</div>`;
  }

  const targetRows = others.length === 0
    ? `<div class="mp-target-empty">No other Teleporters placed yet.</div>`
    : others.map(({ c: tc, r: tr }) => {
        const active = st.teleportTarget && st.teleportTarget.c === tc && st.teleportTarget.r === tr;
        const destNum = teleporterDisplayNumUI(tc, tr);
        const hint = teleporterHint(c, r, tc, tr);
        return `<button class="mp-target-btn ${active ? 'active' : ''}" data-c="${tc}" data-r="${tr}">T${destNum}: ${hint}</button>`;
      }).join('');

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">T${thisNum}: Teleporter</div>
      <button class="mp-close">&times;</button>
    </div>
    <div class="mp-effect">Fish landing here are instantly sent to the linked Teleporter, then exit in that block's facing direction.</div>
    ${linkedLabel}
    <div class="mp-target-list">
      <button class="mp-target-btn mp-target-clear ${!st.teleportTarget ? 'active' : ''}" data-clear="1">Unlinked</button>
      ${targetRows}
    </div>
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  const clearBtn = blockPopupEl.querySelector('.mp-target-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      st.teleportTarget = null;
      renderBlockPopup();
    });
  }
  blockPopupEl.querySelectorAll('.mp-target-btn:not(.mp-target-clear)').forEach(btn => {
    btn.addEventListener('click', () => {
      st.teleportTarget = { c: Number(btn.dataset.c), r: Number(btn.dataset.r) };
      renderBlockPopup();
    });
  });
}

function renderCratePopupContent(c, r) {
  if (blockAt(c, r) !== B_CRATE) { closeBlockPopup(); return; }
  const st = stateAt(c, r);

  const groups = {};
  for (const fish of st.carrying) {
    const key = `${fish.species}|${fish.size}`;
    if (!groups[key]) groups[key] = { species: fish.species, size: fish.size, color: fish.color, count: 0, value: 0 };
    groups[key].count++;
    groups[key].value += fish.value;
  }
  const rows = Object.values(groups);

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">Storage Crate <span class="level-badge">${st.carrying.length}/${CRATE_CAPACITY}</span></div>
      <button class="mp-close">&times;</button>
    </div>
    ${rows.length === 0
      ? '<div class="mp-effect">Empty</div>'
      : `<div class="mp-crate-list">${rows.map(g => `
          <div class="mp-crate-row">
            <span class="mp-crate-dot" style="background:${g.color}"></span>
            <span class="mp-crate-name">${g.species} <span class="mp-crate-size">(${g.size})</span></span>
            <span class="mp-crate-count">x${g.count}</span>
            <span class="mp-crate-value">$${g.value.toFixed(1)}</span>
          </div>`).join('')}</div>`}
  `;
  blockPopupEl.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  blockPopup._lastCrateLen = st.carrying.length;
}

// Closes itself if the underlying block got sold/removed/changed out from
// under it, and otherwise patches live bits *in place* rather than calling
// renderBlockPopup() every frame — a full innerHTML rebuild on every tick
// would tear the close/buy/size buttons out of the DOM mid-click, which is
// why none of them registered clicks before.
function updateBlockPopupLive() {
  if (!blockPopup.open) return;
  const { kind, c, r } = blockPopup;
  const id = kind === 'worker_dock' ? B_NONE : blockAt(c, r);
  const stillValid = kind === 'machine'     ? IS_UPGRADABLE(id)
                    : kind === 'sorter'     ? id === B_SORTER
                    : kind === 'crate'      ? id === B_CRATE
                    : kind === 'recycler'   ? id === B_RECYCLER
                    : kind === 'packer'     ? IS_PACKER(id)
                    : kind === 'teleporter' ? id === B_TELEPORTER
                    : kind === 'worker_dock' ? true
                    : false;
  if (!stillValid) { closeBlockPopup(); return; }

  if (kind === 'worker_dock') {
    // Rebuild popup when depot count changes so fish count stays current
    const depotSt = _workerDepotState();
    const depotLen = depotSt ? depotSt.carrying.length : 0;
    if (blockPopup._lastDepotLen !== depotLen) {
      blockPopup._lastDepotLen = depotLen;
      renderWorkerDockContent();
    } else {
      const btn = blockPopupEl && blockPopupEl.querySelector('.mp-buy');
      if (btn) btn.disabled = game.cash < workerHireCost() || game.workers.length >= WORKER_MAX;
    }
    return;
  }

  // Any popup with an upgrade section needs its buy button's disabled state
  // refreshed every frame as cash changes, without a full innerHTML rebuild.
  if (kind === 'machine' || kind === 'recycler' || kind === 'packer') {
    const st   = stateAt(c, r);
    const cost = machineUpgradeCost(id, st.level || 0);
    const buyBtn = blockPopupEl.querySelector('.mp-buy');
    if (buyBtn && cost != null) buyBtn.disabled = game.cash < cost;
  }

  if (kind === 'crate') {
    const len = stateAt(c, r).carrying.length;
    if (len !== blockPopup._lastCrateLen) renderBlockPopup();
  } else if (kind === 'packer') {
    const len = stateAt(c, r).carrying.length;
    if (len !== blockPopup._lastPackerLen) renderBlockPopup();
  }
}

// Cheap per-frame refresh: patches progress text in place on the existing
// Refresh affordability/levels each frame while the menu is open (cheap: only DOM attr toggles)
function updateBuildMenuLive() {
  if (!buildMenuEl || buildMenuEl.classList.contains('hidden')) return;
  refreshBuildPanel();
  upgradesPanelEl.querySelectorAll('.upgrade-buy').forEach((btn, i) => {
    const def = UPGRADES[i];
    const cost = upgradeCost(def);
    if (cost != null) btn.disabled = game.cash < cost;
  });
  menuCashEl.textContent = `$${formatMoney(game.cash)}`;
}

// ─── Bottom-right build HUD ─────────────────────────────────────────────────
let buildHudEl, hudPreviewEl, hudNameEl, hudArrowEl,
    hudBoxBtnEl, hudCopyBtnEl, hudPasteBtnEl, hudBpRotateBtnEl, hudBpStatusEl;

function initBuildHud() {
  buildHudEl       = document.getElementById('buildHud');
  hudPreviewEl     = document.getElementById('hudPreview');
  hudNameEl        = document.getElementById('hudName');
  hudArrowEl       = document.getElementById('hudArrow');
  hudBoxBtnEl      = document.getElementById('hudBoxBtn');
  hudCopyBtnEl     = document.getElementById('hudCopyBtn');
  hudPasteBtnEl    = document.getElementById('hudPasteBtn');
  hudBpRotateBtnEl = document.getElementById('hudBpRotateBtn');
  hudBpStatusEl    = document.getElementById('hudBpStatus');

  document.getElementById('hudRotateBtn').addEventListener('click', rotateBeltDir);
  hudBoxBtnEl.addEventListener('click', toggleBoxMode);
  document.getElementById('hudExitBtn').addEventListener('click', exitBuildMode);
  hudCopyBtnEl.addEventListener('click', toggleBlueprintSelect);
  hudPasteBtnEl.addEventListener('click', toggleBlueprintPaste);
  hudBpRotateBtnEl.addEventListener('click', rotateBlueprintClipboard);
}

// Called every frame from the game loop, independent of whether the big
// build menu modal is open — this is the whole point of the HUD.
function updateMachinesBtnPos() {
  const btn = document.getElementById('machinesToggleBtn');
  if (!btn) return;
  btn.style.left = `${cashPillRect.right + 10}px`;
  btn.style.top  = `${(cashPillRect.top + cashPillRect.bottom) / 2 - 19}px`;
}

function updateBuildHud() {
  updateMachinesBtnPos();
  if (!buildHudEl) return;
  buildHudEl.classList.toggle('hidden', !buildMode.active);
  if (!buildMode.active) return;

  const id = buildMode.selectedId;
  if (hudPreviewEl.dataset.id !== String(id)) {
    hudPreviewEl.innerHTML = '';
    hudPreviewEl.appendChild(makeBlockPreview(id));
    hudPreviewEl.dataset.id = String(id);
    hudNameEl.textContent = BLOCK_NAMES[id];
  }
  hudArrowEl.style.transform = `rotate(${ARROW_DEG[buildMode.beltDir]}deg)`;
  hudBoxBtnEl.classList.toggle('active', buildMode.boxMode);

  const active = activeBlueprint();
  hudCopyBtnEl.classList.toggle('active', blueprint.selecting);
  hudPasteBtnEl.classList.toggle('active', blueprint.pasting);
  hudPasteBtnEl.classList.toggle('disabled', !active);
  hudBpRotateBtnEl.classList.toggle('disabled', !blueprint.pasting);

  hudBpStatusEl.textContent = blueprint.selecting
    ? 'Drag a box to copy'
    : blueprint.pasting
      ? `Pasting "${active.name}" (${active.w}×${active.h}). Click to stamp.`
      : active
        ? `Active: "${active.name}" (${active.w}×${active.h})`
        : 'No blueprint active. Press C to copy a selection.';
}

// ── Axolotl Pond popup ────────────────────────────────────────────────────────

function renderPondPopupContent(c, r) {
  if (blockAt(c, r) !== B_POND) { closeBlockPopup(); return; }
  const st = stateAt(c, r);
  blockPopupEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'mp-header';
  header.innerHTML = `<div class="mp-name">Tank</div><button class="mp-close">&times;</button>`;
  header.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  blockPopupEl.appendChild(header);

  // Current occupants
  const slots = document.createElement('div');
  slots.className = 'pond-slots';
  for (let i = 0; i < effectivePondCapacity(); i++) {
    const uid = st.pondPets[i];
    const slot = document.createElement('div');
    slot.className = 'pond-slot';
    if (uid != null) {
      const pet = game.pets.find(p => p.uid === uid);
      const v   = pet ? getPetVariant(pet.variant) : null;
      if (pet && v) {
        slot.innerHTML = `
          <div class="pond-slot-sprite" style="background-image:url('img/axolotl/${pet.variant}.png')" title="${v.name}"></div>
          <span class="pond-slot-name" style="color:${RARITY_COLOR[v.rarity]}">${v.name}</span>
          <button class="pond-slot-remove" data-uid="${uid}">✕</button>`;
        slot.querySelector('.pond-slot-remove').addEventListener('click', e => {
          unassignPet(Number(e.target.dataset.uid));
          renderBlockPopup();
        });
      } else {
        slot.innerHTML = `<span class="pond-slot-name" style="color:var(--c-muted)">Unknown pet</span>`;
      }
    } else {
      slot.innerHTML = `<span class="pond-slot-empty">Empty slot</span>`;
    }
    slots.appendChild(slot);
  }
  blockPopupEl.appendChild(slots);

  // Available pets to assign (not already in any pond)
  const available = game.pets.filter(p => !petCurrentPond(p.uid));
  if (available.length === 0 && st.pondPets.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'mp-effect';
    hint.style.marginTop = '8px';
    hint.textContent = 'No axolotls yet. Pull some from the Pets tab!';
    blockPopupEl.appendChild(hint);
    return;
  }
  if (available.length > 0 && st.pondPets.length < effectivePondCapacity()) {
    const label = document.createElement('div');
    label.className = 'mp-effect';
    label.style.cssText = 'margin-top:10px;margin-bottom:4px;';
    label.textContent = 'Assign a pet:';
    blockPopupEl.appendChild(label);
    const list = document.createElement('div');
    list.className = 'pond-assign-list';
    for (const pet of available) {
      const v = getPetVariant(pet.variant);
      if (!v) continue;
      const btn = document.createElement('button');
      btn.className = 'mp-target-btn';
      btn.innerHTML = `<span class="pond-mini-sprite" style="background-image:url('img/axolotl/${pet.variant}.png')"></span> <span style="color:${RARITY_COLOR[v.rarity]}">${v.name}</span>`;
      btn.addEventListener('click', () => {
        assignPetToPond(pet.uid, c, r);
        renderBlockPopup();
      });
      list.appendChild(btn);
    }
    blockPopupEl.appendChild(list);
  }
}

// ── Natural water pond popup ──────────────────────────────────────────────────

function renderWaterPondPopupContent(c, r) {
  const anchor = waterBodyAnchor(c, r);
  blockPopupEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'mp-header';
  header.innerHTML = `<div class="mp-name">Natural Pond</div><button class="mp-close">&times;</button>`;
  header.querySelector('.mp-close').addEventListener('click', closeBlockPopup);
  blockPopupEl.appendChild(header);

  const uids = game.waterPonds[anchor] || [];

  const slots = document.createElement('div');
  slots.className = 'pond-slots';
  for (let i = 0; i < effectivePondCapacity(); i++) {
    const uid = uids[i];
    const slot = document.createElement('div');
    slot.className = 'pond-slot';
    if (uid != null) {
      const pet = game.pets.find(p => p.uid === uid);
      const v   = pet ? getPetVariant(pet.variant) : null;
      if (pet && v) {
        slot.innerHTML = `
          <div class="pond-slot-sprite" style="background-image:url('img/axolotl/${pet.variant}.png')"></div>
          <span class="pond-slot-name" style="color:${RARITY_COLOR[v.rarity]}">${v.name}</span>
          <button class="pond-slot-remove" data-uid="${uid}">✕</button>`;
        slot.querySelector('.pond-slot-remove').addEventListener('click', e => {
          unassignPet(Number(e.target.dataset.uid));
          renderBlockPopup();
        });
      } else {
        slot.innerHTML = `<span class="pond-slot-name" style="color:var(--c-muted)">Unknown pet</span>`;
      }
    } else {
      slot.innerHTML = `<span class="pond-slot-empty">Empty slot</span>`;
    }
    slots.appendChild(slot);
  }
  blockPopupEl.appendChild(slots);

  const available = game.pets.filter(p => !petCurrentPond(p.uid));
  if (available.length === 0 && uids.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'mp-effect';
    hint.style.marginTop = '8px';
    hint.textContent = 'No axolotls yet. Pull some from the Pets tab!';
    blockPopupEl.appendChild(hint);
    return;
  }
  if (available.length > 0 && uids.length < effectivePondCapacity()) {
    const label = document.createElement('div');
    label.className = 'mp-effect';
    label.style.cssText = 'margin-top:10px;margin-bottom:4px;';
    label.textContent = 'Assign a pet:';
    blockPopupEl.appendChild(label);
    const list = document.createElement('div');
    list.className = 'pond-assign-list';
    for (const pet of available) {
      const v = getPetVariant(pet.variant);
      if (!v) continue;
      const btn = document.createElement('button');
      btn.className = 'mp-target-btn';
      btn.innerHTML = `<span class="pond-mini-sprite" style="background-image:url('img/axolotl/${pet.variant}.png')"></span> <span style="color:${RARITY_COLOR[v.rarity]}">${v.name}</span>`;
      btn.addEventListener('click', () => {
        assignPetToWaterPond(pet.uid, anchor);
        renderBlockPopup();
      });
      list.appendChild(btn);
    }
    blockPopupEl.appendChild(list);
  }
}

// ── Pets tab (gacha + collection) ─────────────────────────────────────────────

let _petsPullResult = null;

// Builds a horizontally scrollable carousel from an array of slide elements.
// Returns the outer wrapper; handles arrows, dots, and CSS slide transition.
function _buildPetCarousel(slides) {
  const outer = document.createElement('div');
  outer.style.cssText = 'margin:6px 0 4px;';
  if (!slides.length) return outer;

  let cur = 0;

  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:relative;overflow:hidden;';

  const track = document.createElement('div');
  track.style.cssText = 'display:flex;transition:transform 0.22s cubic-bezier(.4,0,.2,1);';
  slides.forEach(s => {
    s.style.flex = '0 0 100%';
    s.style.boxSizing = 'border-box';
    s.style.padding = '0 28px';
    track.appendChild(s);
  });
  viewport.appendChild(track);

  const mkArrow = (ch, side) => {
    const btn = document.createElement('button');
    btn.textContent = ch;
    btn.style.cssText = `position:absolute;${side}:0;top:0;bottom:0;background:none;border:none;color:rgba(255,255,255,0.6);font-size:20px;line-height:1;cursor:pointer;padding:0 6px;z-index:2;transition:color 0.12s;`;
    btn.addEventListener('mouseenter', () => { btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = 'rgba(255,255,255,0.6)'; });
    return btn;
  };

  let dotEls = [];
  const go = n => {
    cur = Math.max(0, Math.min(n, slides.length - 1));
    track.style.transform = `translateX(${-cur * 100}%)`;
    dotEls.forEach((d, i) => { d.style.opacity = i === cur ? '1' : '0.28'; });
    prevBtn.style.opacity = cur === 0 ? '0.2' : '0.8';
    nextBtn.style.opacity = cur === slides.length - 1 ? '0.2' : '0.8';
  };

  const prevBtn = mkArrow('‹', 'left');
  prevBtn.addEventListener('click', () => go(cur - 1));
  viewport.appendChild(prevBtn);

  const nextBtn = mkArrow('›', 'right');
  nextBtn.addEventListener('click', () => go(cur + 1));
  viewport.appendChild(nextBtn);

  outer.appendChild(viewport);

  if (slides.length > 1) {
    const dotsRow = document.createElement('div');
    dotsRow.style.cssText = 'display:flex;justify-content:center;gap:5px;padding-top:7px;';
    dotEls = slides.map((_, i) => {
      const d = document.createElement('div');
      d.style.cssText = 'width:5px;height:5px;border-radius:50%;background:#fff;cursor:pointer;transition:opacity 0.12s;';
      d.addEventListener('click', () => go(i));
      dotsRow.appendChild(d);
      return d;
    });
    outer.appendChild(dotsRow);
  }

  go(0);
  return outer;
}

// Builds one carousel slide for an axolotl variant group.
function _buildAxoSlide(variantId, pets, freePonds) {
  const v = getPetVariant(variantId);
  if (!v) return document.createElement('div');
  const count   = pets.length;
  const placed  = pets.filter(p => petCurrentPond(p.uid));
  const unplaced = pets.filter(p => !petCurrentPond(p.uid));

  const slide = document.createElement('div');
  slide.style.cssText = 'text-align:center;padding-bottom:10px;';

  // Sprite: 128×256 sheet, 16×16 px/frame → 4× = 64×64 display. Row 9 = facing camera.
  const sprite = document.createElement('div');
  sprite.style.cssText = `width:64px;height:64px;margin:0 auto 8px;image-rendering:pixelated;background:url('img/axolotl/${variantId}.png') no-repeat 0 -576px/512px 1024px;`;
  slide.appendChild(sprite);

  const rEl = document.createElement('div');
  rEl.style.cssText = `font-size:10px;color:${RARITY_COLOR[v.rarity]};text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;`;
  rEl.textContent = RARITY_LABEL[v.rarity];
  slide.appendChild(rEl);

  const nEl = document.createElement('div');
  nEl.style.cssText = 'font-size:13px;font-weight:bold;color:#e8e8e8;margin-bottom:3px;';
  nEl.textContent = count > 1 ? `${v.name}  ×${count}` : v.name;
  slide.appendChild(nEl);

  const stEl = document.createElement('div');
  stEl.style.cssText = 'font-size:10px;color:var(--c-muted);margin-bottom:10px;';
  stEl.textContent = placed.length
    ? `${placed.length} in pond${unplaced.length ? ` · ${unplaced.length} in bag` : ''}`
    : `${unplaced.length} in bag`;
  slide.appendChild(stEl);

  const acts = document.createElement('div');
  acts.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-wrap:wrap;';

  if (unplaced.length && freePonds.length) {
    const b = document.createElement('button');
    b.className = 'upgrade-buy pet-card-btn';
    b.textContent = 'Place';
    b.addEventListener('click', () => enterPetPlaceMode(unplaced[0].uid));
    acts.appendChild(b);
  } else if (unplaced.length) {
    const b = document.createElement('button');
    b.className = 'upgrade-buy pet-card-btn';
    b.textContent = 'No tank';
    b.disabled = true;
    b.title = 'Walk to a pond and press E, or build a Tank';
    acts.appendChild(b);
  }
  if (placed.length) {
    const b = document.createElement('button');
    b.className = 'upgrade-buy pet-card-btn';
    b.textContent = 'Remove';
    b.addEventListener('click', () => { unassignPet(placed[0].uid); renderPetsPanel(); });
    acts.appendChild(b);
  }
  const sellUid = (unplaced[0] || placed[0]).uid;
  const sb = document.createElement('button');
  sb.className = 'upgrade-buy pet-card-btn pet-sell-btn';
  sb.textContent = `Sell $${PET_SELL_PRICE[v.rarity]}`;
  sb.addEventListener('click', () => { sellPet(sellUid); renderPetsPanel(); });
  acts.appendChild(sb);

  slide.appendChild(acts);
  return slide;
}

// Builds one carousel slide for a frog variant group.
function _buildFrogSlide(variantId, frogs) {
  const v = getFrogVariant(variantId) || { name: variantId, rarity: 'common' };
  const count   = frogs.length;
  const placed  = frogs.filter(f => f.wx !== -9999);
  const unplaced = frogs.filter(f => f.wx === -9999);

  const slide = document.createElement('div');
  slide.style.cssText = 'text-align:center;padding-bottom:10px;';

  // Sprite: 512×512 sheet, 32×32 px/frame → 2× = 64×64. Row 0 col 0 = facing camera idle.
  const sprite = document.createElement('div');
  sprite.style.cssText = `width:64px;height:64px;margin:0 auto 8px;image-rendering:pixelated;background:url('img/frogs/${variantId}.png') no-repeat 0 0/1024px 1024px;`;
  slide.appendChild(sprite);

  const rEl = document.createElement('div');
  rEl.style.cssText = `font-size:10px;color:${RARITY_COLOR[v.rarity]};text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;`;
  rEl.textContent = RARITY_LABEL[v.rarity];
  slide.appendChild(rEl);

  const nEl = document.createElement('div');
  nEl.style.cssText = 'font-size:13px;font-weight:bold;color:#e8e8e8;margin-bottom:3px;';
  nEl.textContent = count > 1 ? `${v.name} Frog  ×${count}` : `${v.name} Frog`;
  slide.appendChild(nEl);

  const stEl = document.createElement('div');
  stEl.style.cssText = 'font-size:10px;color:var(--c-muted);margin-bottom:10px;';
  stEl.textContent = placed.length
    ? `${placed.length} on island${unplaced.length ? ` · ${unplaced.length} in bag` : ''}`
    : `${unplaced.length} in bag`;
  slide.appendChild(stEl);

  const acts = document.createElement('div');
  acts.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-wrap:wrap;align-items:center;';

  if (unplaced.length) {
    const b = document.createElement('button');
    b.className = 'upgrade-buy pet-card-btn';
    b.textContent = 'Place';
    b.addEventListener('click', () => { enterFrogPlaceMode(unplaced[0].uid); setBuildMenuOpen(false); });
    acts.appendChild(b);
  }
  if (placed.length) {
    const h = document.createElement('span');
    h.style.cssText = 'font-size:10px;color:var(--c-muted);';
    h.textContent = 'Walk up & press E';
    acts.appendChild(h);
  }

  // Sell button for unplaced frogs — mirrors axolotl sell so you don't have
  // to find the frog in the world just to sell it.
  if (unplaced.length) {
    const sellUid = unplaced[0].uid;
    const price = frogSellPrice(sellUid);
    const sb = document.createElement('button');
    sb.className = 'upgrade-buy pet-card-btn pet-sell-btn';
    sb.textContent = `Sell $${price}`;
    sb.addEventListener('click', () => { sellFrog(sellUid); renderPetsPanel(); });
    acts.appendChild(sb);
  }

  slide.appendChild(acts);
  return slide;
}

function renderPetsPanel() {
  const panel = document.getElementById('petsPanel');
  if (!panel) return;
  panel.innerHTML = '';

  // ── Gacha section ──
  const gacha = document.createElement('div');
  gacha.className = 'pets-gacha';

  const title = document.createElement('div');
  title.className = 'pets-gacha-title';
  title.textContent = 'Pet Gacha';
  gacha.appendChild(title);

  const costs = document.createElement('div');
  costs.className = 'pets-gacha-costs';
  costs.innerHTML = `
    <span>Pull x1: $${PET_PULL_COST.toLocaleString()}</span>
    <span style="color:var(--c-muted)">  ·  </span>
    <span>Pull x10: $${PET_BULK_COST.toLocaleString()} <span style="color:var(--c-mint);font-size:10px">(10% off)</span></span>`;
  gacha.appendChild(costs);

  const btnRow = document.createElement('div');
  btnRow.className = 'pets-btn-row';

  const pull1 = document.createElement('button');
  pull1.className = 'upgrade-buy';
  pull1.textContent = `Pull ×1  ($${PET_PULL_COST.toLocaleString()})`;
  pull1.addEventListener('click', () => {
    const res = pullPets(1);
    if (res) { _petsPullResult = res; renderPetsPanel(); sfxUpgrade(); }
  });

  const pull10 = document.createElement('button');
  pull10.className = 'upgrade-buy';
  pull10.textContent = `Pull ×10 ($${PET_BULK_COST.toLocaleString()})`;
  pull10.addEventListener('click', () => {
    const res = pullPets(10);
    if (res) { _petsPullResult = res; renderPetsPanel(); sfxUpgrade(); }
  });

  btnRow.appendChild(pull1);
  btnRow.appendChild(pull10);
  gacha.appendChild(btnRow);

  // Pull result reveal
  if (_petsPullResult && _petsPullResult.length > 0) {
    const reveal = document.createElement('div');
    reveal.className = 'pets-reveal';
    for (const item of _petsPullResult) {
      const v = item.variant;
      const card = document.createElement('div');
      card.className = 'pets-reveal-card';
      if (item.type === 'frog') {
        card.innerHTML = `
          <div style="width:32px;height:32px;background:url('img/frogs/${v.id}.png') no-repeat 0 0/512px 512px;image-rendering:pixelated;margin:0 auto 4px"></div>
          <div class="pet-rarity-label" style="color:${RARITY_COLOR[v.rarity]}">${RARITY_LABEL[v.rarity]}</div>
          <div class="pet-variant-name">${v.name} Frog</div>`;
      } else {
        card.innerHTML = `
          <div class="pet-sprite-lg" style="background-image:url('img/axolotl/${item.pet.variant}.png')"></div>
          <div class="pet-rarity-label" style="color:${RARITY_COLOR[v.rarity]}">${RARITY_LABEL[v.rarity]}</div>
          <div class="pet-variant-name">${v.name}</div>`;
      }
      reveal.appendChild(card);
    }
    gacha.appendChild(reveal);
  }

  panel.appendChild(gacha);

  // ── Odds + auto-sell ──
  const oddsRow = document.createElement('div');
  oddsRow.className = 'pets-odds';
  oddsRow.innerHTML = `
    <span style="color:${RARITY_COLOR.common}">Common 60%</span>
    <span style="color:${RARITY_COLOR.uncommon}">Uncommon 27%</span>
    <span style="color:${RARITY_COLOR.rare}">Rare 10%</span>
    <span style="color:${RARITY_COLOR.legendary}">Legendary 3.3%</span>`;
  panel.appendChild(oddsRow);

  const autoSell = game.petAutoSell || {};
  const autoSellSection = document.createElement('div');
  autoSellSection.className = 'pets-autosell';
  const autoSellTitle = document.createElement('div');
  autoSellTitle.className = 'pets-section-title';
  autoSellTitle.style.marginBottom = '6px';
  autoSellTitle.textContent = 'Auto-sell on pull';
  autoSellSection.appendChild(autoSellTitle);
  const rarityRow = document.createElement('div');
  rarityRow.className = 'pets-autosell-row';
  for (const rarity of ['common', 'uncommon', 'rare', 'legendary']) {
    const lbl = document.createElement('label');
    lbl.className = 'pets-autosell-toggle';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!autoSell[rarity];
    chk.addEventListener('change', () => {
      game.petAutoSell[rarity] = chk.checked;
      saveGame();
    });
    lbl.appendChild(chk);
    const span = document.createElement('span');
    span.style.color = RARITY_COLOR[rarity];
    span.textContent = RARITY_LABEL[rarity];
    lbl.appendChild(span);
    const price = document.createElement('span');
    price.className = 'pets-autosell-price';
    price.textContent = ` $${PET_SELL_PRICE[rarity]}`;
    lbl.appendChild(price);
    rarityRow.appendChild(lbl);
  }
  autoSellSection.appendChild(rarityRow);
  panel.appendChild(autoSellSection);

  // ── Collection ──
  const collTitle = document.createElement('div');
  collTitle.className = 'pets-section-title';
  collTitle.style.marginTop = '10px';
  const totalOwned = game.pets.length + (game.frogs || []).length;
  collTitle.textContent = `Collection (${totalOwned} owned · ${game.petPullsTotal} pulls)`;
  panel.appendChild(collTitle);

  // ── Axolotl carousel ──
  if (game.pets.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'Pull from the gacha to start your collection!';
    panel.appendChild(hint);
  } else {
    const allPonds  = listAvailablePonds();
    const freePonds = allPonds.filter(p => p.count < p.capacity);
    const axoByVariant = {};
    for (const pet of game.pets) {
      if (!axoByVariant[pet.variant]) axoByVariant[pet.variant] = [];
      axoByVariant[pet.variant].push(pet);
    }
    const axoSlides = Object.entries(axoByVariant)
      .map(([id, pets]) => _buildAxoSlide(id, pets, freePonds))
      .filter(Boolean);
    panel.appendChild(_buildPetCarousel(axoSlides));
  }

  // ── Frogs section ──────────────────────────────────────────────────────────
  const frogSep = document.createElement('hr');
  frogSep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.08);margin:14px 0 10px';
  panel.appendChild(frogSep);

  const frogHeader = document.createElement('div');
  frogHeader.className = 'pets-gacha-title';
  frogHeader.textContent = 'Frogs';
  panel.appendChild(frogHeader);

  const frogDesc = document.createElement('div');
  frogDesc.style.cssText = 'font-size:11px;color:var(--c-muted);margin-bottom:6px;line-height:1.4';
  frogDesc.textContent = 'Pull from the gacha above! Place on any land tile. They hop around and react to rare catches nearby.';
  panel.appendChild(frogDesc);

  const ownedFrogs = (game.frogs || []);
  if (ownedFrogs.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = 'No frogs yet. Try your luck in the gacha!';
    panel.appendChild(hint);
  } else {
    const byVariant = {};
    for (const frog of ownedFrogs) {
      if (!byVariant[frog.variant]) byVariant[frog.variant] = [];
      byVariant[frog.variant].push(frog);
    }
    const frogSlides = Object.entries(byVariant)
      .map(([id, frogs]) => _buildFrogSlide(id, frogs))
      .filter(Boolean);
    panel.appendChild(_buildPetCarousel(frogSlides));
  }
}
