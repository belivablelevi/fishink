// Fish INK Factory — build/upgrades menu (DOM overlay, tabbed Godot-style)

let buildMenuEl, buildPanelEl, upgradesPanelEl, contractsPanelEl, fishIndexPanelEl, statsPanelEl, controlsPanelEl, researchPanelEl, blueprintsPanelEl, menuCashEl;
let leaderboardPanelEl;

// Category metadata for the Build tab's grouped item grid. Order here is the
// display order; BLOCK_CATS (grid.js) assigns each block id to one of these.
const BUILD_CATS = [
  { id: 'floor',      label: 'Floor & Belts', color: '#6a7a8a' },
  { id: 'fishing',    label: 'Fishing',       color: '#7ec8e3' },
  { id: 'processing', label: 'Processing',    color: '#e8a030' },
  { id: 'sales',      label: 'Sales',         color: '#a78bfa' },
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
  [B_CRATE]:          () => `Holds ${researchCrateCapacity()}`,
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

  fullNumbersCheck.checked = settings.fullNumbers;
  individualSellToastsCheck.checked = settings.individualSellToasts;

  btn.addEventListener('click', () => panel.classList.toggle('hidden'));

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

  restartBtn.addEventListener('click', () => {
    if (confirm('Restart the game? This wipes your current save and starts a brand new world.')) {
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

function renderMachinesPanel() {
  const panel = document.getElementById('machinesPanel');
  panel.innerHTML = '';

  const groups = new Map(); // block id -> [{c, r, level}]
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      const id = blockAt(c, r);
      if (!IS_UPGRADABLE(id)) continue;
      const st = stateAt(c, r);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ c, r, level: st.level || 0 });
    }
  }

  if (groups.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No upgradable machines placed yet.';
    panel.appendChild(empty);
    return;
  }

  for (const [id, instances] of groups) {
    instances.sort((a, b) => a.level - b.level);

    const title = document.createElement('div');
    title.className = 'machines-group-title';
    title.textContent = `${BLOCK_NAMES[id]} (${instances.length})`;
    panel.appendChild(title);

    for (const inst of instances) {
      const cost = machineUpgradeCost(id, inst.level);
      const maxed = cost == null;

      const row = document.createElement('div');
      row.className = 'upgrade-row';

      const info = document.createElement('div');
      info.className = 'upgrade-info';
      info.innerHTML = `<div class="name">LV ${inst.level}</div>`;

      const buyBtn = document.createElement('button');
      buyBtn.className = 'upgrade-buy';
      buyBtn.textContent = maxed ? 'MAXED' : `$${cost}`;
      buyBtn.disabled = maxed || game.cash < cost;
      buyBtn.addEventListener('click', () => {
        if (buyMachineUpgrade(inst.c, inst.r)) renderMachinesPanel();
      });

      row.appendChild(info);
      row.appendChild(buyBtn);
      panel.appendChild(row);
    }
  }
}

function initBuildMenu() {
  buildMenuEl      = document.getElementById('buildMenu');
  buildPanelEl     = document.getElementById('buildPanel');
  upgradesPanelEl  = document.getElementById('upgradesPanel');
  contractsPanelEl = document.getElementById('contractsPanel');
  fishIndexPanelEl = document.getElementById('fishIndexPanel');
  statsPanelEl     = document.getElementById('statsPanel');
  controlsPanelEl  = document.getElementById('controlsPanel');
  researchPanelEl  = document.getElementById('researchPanel');
  blueprintsPanelEl = document.getElementById('blueprintsPanel');
  menuCashEl       = document.getElementById('menuCash');

  buildMenuEl.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchMenuTab(tab.dataset.tab));
  });

  document.getElementById('menuCloseBtn').addEventListener('click', exitBuildMode);

  renderBuildPanel();
  renderUpgradesPanel();
  renderContractsPanel();
  renderFishIndexPanel();
  renderControlsPanel();
  renderResearchPanel();
  renderBlueprintsPanel();
}

function switchMenuTab(name) {
  buildMenuEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  buildMenuEl.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
  if (name === 'stats') renderStatsPanel();
}

function setBuildMenuOpen(open) {
  buildMenuEl.classList.toggle('hidden', !open);
  if (open) {
    refreshBuildPanel();
    renderUpgradesPanel();
    renderContractsPanel();
    renderFishIndexPanel();
    renderStatsPanel();
    renderResearchPanel();
    renderBlueprintsPanel();
    menuCashEl.textContent = `$${formatMoney(game.cash)}`;
  }
}

// ─── Leaderboard — standalone top-left icon button + dropdown panel ────────
function initLeaderboardMenu() {
  const btn   = document.getElementById('leaderboardToggleBtn');
  const panel = document.getElementById('leaderboardPanel');
  leaderboardPanelEl = panel;

  btn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderLeaderboardPanel();
  });

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
    hint.textContent = 'Unlocks at $50,000 lifetime earned';
    researchPanelEl.appendChild(hint);
    return;
  }

  hint.textContent = 'One-time purchases — spend cash on late-game upgrades';
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

// ─── Blueprints tab ────────────────────────────────────────────────────────
function renderBlueprintsPanel() {
  blueprintsPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Copy (C) saves a new entry here — pick one Active, then Paste (V) to stamp it';
  blueprintsPanelEl.appendChild(hint);

  if (blueprint.library.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No blueprints yet — drag-select an area with Copy (C) to save one.';
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

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'upgrade-buy bp-delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      deleteBlueprint(entry.id);
      renderBlueprintsPanel();
      updateBuildHud();
    });

    btnGroup.appendChild(loadBtn);
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
    hint.textContent = 'Leaderboard not set up yet — see leaderboard/SETUP.md';
    leaderboardPanelEl.appendChild(hint);
    return;
  }

  if (!getLeaderboardName()) {
    renderLeaderboardNamePrompt();
    return;
  }

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.innerHTML = `Playing as <strong>${escapeLeaderboardName(getLeaderboardName())}</strong> — <a href="#" id="lbChangeName">change name</a>`;
  leaderboardPanelEl.appendChild(hint);
  hint.querySelector('#lbChangeName').addEventListener('click', (e) => {
    e.preventDefault();
    renderLeaderboardNamePrompt();
  });

  const loading = document.createElement('div');
  loading.className = 'panel-hint';
  loading.textContent = 'Loading leaderboard…';
  leaderboardPanelEl.appendChild(loading);

  fetchLeaderboard().then(result => {
    if (loading.parentNode === leaderboardPanelEl) leaderboardPanelEl.removeChild(loading);
    if (result.error) {
      const err = document.createElement('div');
      err.className = 'panel-hint';
      err.textContent = 'Could not reach the leaderboard — check your connection.';
      leaderboardPanelEl.appendChild(err);
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
  joinBtn.addEventListener('click', () => {
    if (setLeaderboardName(input.value)) {
      submitLeaderboardScore();
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

  if (me) {
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

// ─── Contracts tab ─────────────────────────────────────────────────────────
function renderContractsPanel() {
  contractsPanelEl.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'panel-hint';
  hint.textContent = 'Sell matching fish to fill orders, then claim the reward — new contracts won’t appear until every current one is claimed';
  contractsPanelEl.appendChild(hint);

  if (activeContracts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No active contracts — check back soon.';
    contractsPanelEl.appendChild(empty);
    return;
  }

  for (const c of activeContracts) {
    const row = document.createElement('div');
    row.className = 'upgrade-row contract-row';
    row.dataset.id = c.id;

    const pct = Math.min(100, (c.have / c.qty) * 100);
    const info = document.createElement('div');
    info.className = 'upgrade-info';
    info.innerHTML = `
      <div class="name">${c.category} Fish <span class="level-badge">${c.have}/${c.qty}</span></div>
      <div class="desc">${c.completed ? 'Ready to claim' : 'In progress'}</div>
      <div class="contract-bar"><div class="contract-bar-fill" style="width:${pct}%"></div></div>
    `;

    const reward = document.createElement('button');
    reward.className = 'upgrade-buy reward-pill';
    reward.textContent = c.completed ? `Claim $${c.reward}` : `$${c.reward}`;
    reward.disabled = !c.completed;
    if (c.completed) {
      reward.addEventListener('click', () => {
        claimContract(c.id);
        renderContractsPanel();
      });
    }

    row.appendChild(info);
    row.appendChild(reward);
    contractsPanelEl.appendChild(row);
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
  hint.textContent = `${caughtCount} / ${FISH.length} species discovered — catch one to reveal it`;
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
               : ` <span class="panel-hint" style="display:inline;margin:0 0 0 6px;">${catCaught}/${specs.length} — complete for +$${bonus}</span>`);
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
    ['Contracts claimed', game.contractsClaimed],
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
      [[['Left Click']], 'Cast your line at water in range — click again to reel in'],
      [[['Left Click']], 'Drop a held fish onto a belt you’re hovering'],
      [[['E']], 'Hovering a Sorter / Recycler / Packer / Crate / Teleporter / Machine: open its settings popup (works from anywhere on the map)'],
      [[['E']], 'Holding fish, hovering a belt in reach: drop them on it'],
    ],
  },
  {
    label: 'Build Mode', color: '#e8a030',
    rows: [
      [[['B']], 'Enter build mode (opens the menu) — press again to show/hide the menu while staying in build mode'],
      [[['Esc']], 'Exit build mode entirely'],
      [[['1'], ['…'], ['9']], 'Select a block by its slot number'],
      [[['Q']], 'Cycle to the previous block'],
      [[['E']], 'Cycle to the next block'],
      [[['R']], 'Rotate the selected belt-type block’s facing'],
      [[['X']], 'Toggle multi mode — drag a rectangle to place/remove over the whole area at once'],
      [[['Left Click']], 'Place the selected block (drag to paint, or drag a box in multi mode)'],
      [[['Right Click']], 'Remove/sell whatever’s on that tile — on empty ground, exits build mode'],
    ],
  },
  {
    label: 'Blueprints (copy/paste layouts)', color: '#a78bfa',
    rows: [
      [[['C']], 'Toggle copy mode, then drag a rectangle to copy that area (settings & upgrades included)'],
      [[['V']], 'Toggle paste mode, then click to stamp the copied layout — pasting over existing blocks replaces them'],
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
    <button class="mp-buy" ${maxed ? 'disabled' : ''}>${maxed ? 'MAXED' : `Upgrade — $${cost}`}</button>
  `;
}

// Wires the `.mp-buy` button rendered by upgradeSectionHTML — call after
// setting innerHTML so the listener attaches to the fresh DOM node.
function wireUpgradeSection(c, r, cost) {
  const buyBtn = blockPopupEl.querySelector('.mp-buy');
  if (!buyBtn || cost == null) return;
  buyBtn.disabled = game.cash < cost;
  buyBtn.addEventListener('click', () => {
    if (buyMachineUpgrade(c, r)) {
      if (ZOOM > MACHINE_SFX_ZOOM_THRESHOLD) sfxUpgrade();
      renderBlockPopup();
    }
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
function renderTeleporterPopupContent(c, r) {
  if (blockAt(c, r) !== B_TELEPORTER) { closeBlockPopup(); return; }
  const st = stateAt(c, r);
  const others = teleporterTiles(c, r);

  const targetRows = others.length === 0
    ? `<div class="mp-target-empty">No other Teleporters placed yet.</div>`
    : others.map(({ c: tc, r: tr }) => {
        const active = st.teleportTarget && st.teleportTarget.c === tc && st.teleportTarget.r === tr;
        return `<button class="mp-target-btn ${active ? 'active' : ''}" data-c="${tc}" data-r="${tr}">Teleporter @ (${tc}, ${tr})</button>`;
      }).join('');

  blockPopupEl.innerHTML = `
    <div class="mp-header">
      <div class="mp-name">Teleporter Settings</div>
      <button class="mp-close">&times;</button>
    </div>
    <div class="mp-effect">Fish landing here are instantly sent to the linked Teleporter, then exit it in that block's own facing direction.</div>
    <div class="mp-target-list">
      <button class="mp-target-btn mp-target-clear ${!st.teleportTarget ? 'active' : ''}" data-clear="1">No destination</button>
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
      <div class="mp-name">Storage Crate <span class="level-badge">${st.carrying.length}/${researchCrateCapacity()}</span></div>
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
  const id = blockAt(c, r);
  const stillValid = kind === 'machine'     ? IS_UPGRADABLE(id)
                    : kind === 'sorter'     ? id === B_SORTER
                    : kind === 'crate'      ? id === B_CRATE
                    : kind === 'recycler'   ? id === B_RECYCLER
                    : kind === 'packer'     ? IS_PACKER(id)
                    : kind === 'teleporter' ? id === B_TELEPORTER
                    : false;
  if (!stillValid) { closeBlockPopup(); return; }

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
// rows instead of tearing down and rebuilding the whole panel. Falls back to
// a full renderContractsPanel() when the contract set itself changed
// (added/removed/reordered) or a contract just became claimable, since that
// needs the Claim button swapped in.
function updateContractsPanelLive() {
  const ids = activeContracts.map(c => String(c.id));
  const existingIds = [...contractsPanelEl.querySelectorAll('.contract-row')].map(r => r.dataset.id);
  const setChanged = ids.length !== existingIds.length || ids.some((id, i) => id !== existingIds[i]);
  const justCompleted = activeContracts.some(c => c.completed &&
    contractsPanelEl.querySelector(`.contract-row[data-id="${c.id}"] .desc`)?.textContent !== 'Ready to claim');
  if (setChanged || justCompleted) {
    renderContractsPanel();
    return;
  }
  for (const c of activeContracts) {
    const row = contractsPanelEl.querySelector(`.contract-row[data-id="${c.id}"]`);
    if (!row) continue;
    const pct = Math.min(100, (c.have / c.qty) * 100);
    row.querySelector('.name').innerHTML = `${c.category} Fish <span class="level-badge">${c.have}/${c.qty}</span>`;
    row.querySelector('.contract-bar-fill').style.width = `${pct}%`;
  }
}

// Refresh affordability/levels each frame while the menu is open (cheap: only DOM attr toggles)
function updateBuildMenuLive() {
  if (!buildMenuEl || buildMenuEl.classList.contains('hidden')) return;
  refreshBuildPanel();
  upgradesPanelEl.querySelectorAll('.upgrade-buy').forEach((btn, i) => {
    const def = UPGRADES[i];
    const cost = upgradeCost(def);
    if (cost != null) btn.disabled = game.cash < cost;
  });
  updateContractsPanelLive();
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
      ? `Pasting "${active.name}" (${active.w}×${active.h}) — click to stamp`
      : active
        ? `Active: "${active.name}" (${active.w}×${active.h})`
        : 'No blueprint active — open Blueprints tab';
}
