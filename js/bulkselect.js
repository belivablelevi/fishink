// Fish INK Factory — bulk config editor

const bulkSelect = {
  active:      false,
  dragging:    false,
  startScreen: null,
  endScreen:   null,
  startTile:   null,
  endTile:     null,
  tiles:       [],    // [{c, r, id}] confirmed selection
  focusType:   null,  // block ID currently shown in panel config
};

// Pending config state mutated by the panel UI, applied on confirm
let _bc = {};

// ── DOM refs (populated in initBulkSelect) ────────────────────────────────────

let _bsOverlay, _bsRect, _bsPanel, _bsBtn, _hlCanvas, _hlCtx;

// ── Init ──────────────────────────────────────────────────────────────────────

function initBulkSelect() {
  _bsOverlay = document.getElementById('bsOverlay');
  _bsRect    = document.getElementById('bsRect');
  _bsPanel   = document.getElementById('bsPanel');
  _bsBtn     = document.getElementById('bulkSelectBtn');
  _hlCanvas  = document.getElementById('bsHighlightCanvas');
  _hlCtx     = _hlCanvas.getContext('2d');

  _bsOverlay.addEventListener('mousedown', _bsOnDown);
  window.addEventListener('mousemove', _bsOnMove);
  window.addEventListener('mouseup',   _bsOnUp);

  _bsBtn.addEventListener('click', toggleBulkSelectMode);

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (bulkSelect.active || _bsPanel.classList.contains('bs-open')))
      exitBulkSelectMode();
  });

  _hlLoop();
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

function toggleBulkSelectMode() {
  if (bulkSelect.active || _bsPanel.classList.contains('bs-open')) {
    exitBulkSelectMode();
  } else {
    enterBulkSelectMode();
  }
}

function enterBulkSelectMode() {
  if (typeof petPlaceMode !== 'undefined' && petPlaceMode.active) {
    queueToast('Exit pet placement first', '#e8a030');
    return;
  }
  if (typeof blueprint !== 'undefined' && (blueprint.pasting || blueprint.selecting)) {
    queueToast('Exit blueprint mode first', '#e8a030');
    return;
  }
  closeBlockPopup();
  bulkSelect.active   = true;
  bulkSelect.dragging = false;
  bulkSelect.tiles    = [];
  window._bsHighlights = [];
  _bsOverlay.style.display = '';
  _bsRect.style.display    = 'none';
  _bsPanel.classList.remove('bs-open');
  _bsBtn.classList.add('active');
}

function exitBulkSelectMode() {
  bulkSelect.active   = false;
  bulkSelect.dragging = false;
  bulkSelect.tiles    = [];
  window._bsHighlights = [];
  _bsOverlay.style.display = 'none';
  _bsRect.style.display    = 'none';
  _bsPanel.classList.remove('bs-open');
  _bsBtn.classList.remove('active');
}

// ── Drag ──────────────────────────────────────────────────────────────────────

function _bsOnDown(e) {
  if (!bulkSelect.active || e.button !== 0) return;
  e.stopPropagation();
  bulkSelect.dragging    = true;
  bulkSelect.startScreen = { x: e.clientX, y: e.clientY };
  bulkSelect.endScreen   = { x: e.clientX, y: e.clientY };
  bulkSelect.startTile   = _screenToTile(e.clientX, e.clientY);
  _bsRect.style.display  = '';
  _updateRect();
}

function _bsOnMove(e) {
  if (!bulkSelect.dragging) return;
  bulkSelect.endScreen = { x: e.clientX, y: e.clientY };
  _updateRect();
}

function _bsOnUp(e) {
  if (!bulkSelect.dragging || e.button !== 0) return;
  bulkSelect.dragging   = false;
  bulkSelect.endTile    = _screenToTile(e.clientX, e.clientY);
  _bsRect.style.display = 'none';
  _finalizeSelection();
}

function _updateRect() {
  const a = bulkSelect.startScreen, b = bulkSelect.endScreen;
  if (!a || !b) return;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x),  h = Math.abs(b.y - a.y);
  Object.assign(_bsRect.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function _screenToTile(sx, sy) {
  const cvs = document.getElementById('canvas');
  const r   = cvs.getBoundingClientRect();
  return {
    c: Math.floor((cam.x + (sx - r.left) / ZOOM) / TILE_SIZE),
    r: Math.floor((cam.y + (sy - r.top)  / ZOOM) / TILE_SIZE),
  };
}

// Block types that have shareable config
const _BULK_EDITABLE = new Set([B_SORTER, B_RECYCLER, B_PACKER]);

// ── Selection finalization ────────────────────────────────────────────────────

function _finalizeSelection() {
  const st = bulkSelect.startTile || _screenToTile(bulkSelect.startScreen.x, bulkSelect.startScreen.y);
  const et = bulkSelect.endTile   || st;

  const c0 = Math.max(0,             Math.min(st.c, et.c));
  const c1 = Math.min(WORLD_COLS - 1, Math.max(st.c, et.c));
  const r0 = Math.max(0,             Math.min(st.r, et.r));
  const r1 = Math.min(WORLD_ROWS - 1, Math.max(st.r, et.r));

  const found = [];
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const id = blockAt(c, r);
      if (_BULK_EDITABLE.has(id)) found.push({ c, r, id });
    }

  bulkSelect.tiles     = found;
  window._bsHighlights = found.map(t => ({ c: t.c, r: t.r }));

  if (found.length === 0) {
    queueToast('No configurable machines in selection', '#6a7a8a');
    return;
  }

  // Focus the most common type
  const counts = {};
  for (const t of found) counts[t.id] = (counts[t.id] || 0) + 1;
  bulkSelect.focusType = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);

  _initBcFromSelection();
  _renderPanel();
  _bsPanel.classList.add('bs-open');
  _bsOverlay.style.display = 'none'; // overlay not needed while panel is open
}

// ── Config state ──────────────────────────────────────────────────────────────

function _initBcFromSelection() {
  const first = bulkSelect.tiles.find(t => t.id === bulkSelect.focusType);
  if (!first) return;
  const st = stateAt(first.c, first.r);
  const id = bulkSelect.focusType;
  if (id === B_SORTER) {
    _bc = {
      sortMode:      st.sortMode      || 'size',
      sortThreshold: st.sortThreshold != null ? st.sortThreshold : 2,
      sortCategory:  st.sortCategory  || CATEGORY_NAMES[0],
    };
  } else if (id === B_RECYCLER) {
    _bc = { recycleRarities: [...(st.recycleRarities || [])] };
  } else if (id === B_PACKER) {
    _bc = { packTarget: st.packTarget || 5 };
  }
}

// ── Panel rendering ───────────────────────────────────────────────────────────

function _typeName(id) { return BLOCK_NAMES[id] || `Block ${id}`; }

function _typeCounts() {
  const m = {};
  for (const t of bulkSelect.tiles) m[t.id] = (m[t.id] || 0) + 1;
  return m;
}

function _countAllOnMap(id) {
  let n = 0;
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (blockAt(c, r) === id) n++;
  return n;
}

function _renderPanel() {
  const counts       = _typeCounts();
  const focused      = bulkSelect.focusType;
  const focusedCount = counts[focused] || 0;
  const totalOnMap   = _countAllOnMap(focused);
  const notInSel     = totalOnMap - focusedCount;

  const pillsHTML = Object.entries(counts).map(([idStr, n]) => {
    const id  = Number(idStr);
    const act = id === focused;
    return `<button class="bs-pill${act ? ' active' : ''}" data-type="${id}">
      <span class="bs-pill-dot"></span>${_typeName(id)}<span class="bs-pill-count">${n}</span>
    </button>`;
  }).join('');

  const cfgHTML = _buildCfgHTML(focused);

  const selectAllHTML = notInSel > 0
    ? `<button class="bs-add-all" id="bsAddAll">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><line x1="6.5" y1="3.5" x2="6.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3.5" y1="6.5" x2="9.5" y2="6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Select all ${_typeName(focused)}s on map
        <span class="bs-add-badge">+${notInSel}</span>
      </button>`
    : `<div class="bs-add-all-done">All ${_typeName(focused)}s on map are selected</div>`;

  _bsPanel.innerHTML = `
    <div class="bs-header">
      <div class="bs-title-row">
        <svg class="bs-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 1.5"/>
          <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 1.5"/>
          <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 1.5"/>
        </svg>
        <span class="bs-title">Bulk Edit</span>
      </div>
      <button class="bs-x" id="bsPanelX">&times;</button>
    </div>

    <div class="bs-section-label">In selection</div>
    <div class="bs-pills">${pillsHTML}</div>

    <div class="bs-sep"></div>

    <div class="bs-section-label">${_typeName(focused)} settings</div>
    <div class="bs-cfg">${cfgHTML}</div>

    <div class="bs-sep"></div>

    <div class="bs-select-all-wrap">${selectAllHTML}</div>

    <div class="bs-footer">
      <button class="bs-btn-cancel" id="bsCancel">Cancel</button>
      <button class="bs-btn-apply" id="bsApply">
        Apply to ${focusedCount} ${_typeName(focused)}${focusedCount !== 1 ? 's' : ''}
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5h7M6 2.5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;

  _bsPanel.querySelector('#bsPanelX').addEventListener('click', exitBulkSelectMode);
  _bsPanel.querySelector('#bsCancel').addEventListener('click', exitBulkSelectMode);
  _bsPanel.querySelector('#bsApply').addEventListener('click', _applyConfig);

  const addAllBtn = _bsPanel.querySelector('#bsAddAll');
  if (addAllBtn) addAllBtn.addEventListener('click', _addAllOfType);

  _bsPanel.querySelectorAll('.bs-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      bulkSelect.focusType = Number(btn.dataset.type);
      _initBcFromSelection();
      _renderPanel();
    });
  });

  _wireCfg();
}

function _buildCfgHTML(id) {
  if (id === B_SORTER) {
    const mode = _bc.sortMode || 'size';
    const thr  = _bc.sortThreshold != null ? _bc.sortThreshold : 2;
    const cat  = _bc.sortCategory || CATEGORY_NAMES[0];
    return `
      <div class="bs-row-label">Mode</div>
      <div class="bs-toggle-row">
        <button class="bs-toggle${mode === 'size'   ? ' active' : ''}" data-mode="size">By Size</button>
        <button class="bs-toggle${mode === 'rarity' ? ' active' : ''}" data-mode="rarity">By Rarity</button>
      </div>
      ${mode === 'size' ? `
        <div class="bs-row-label" style="margin-top:12px">Threshold <span class="bs-row-hint">≥ this size exits front</span></div>
        <div class="bs-toggle-row">
          ${SIZES.map((s, i) => `<button class="bs-toggle${i === thr ? ' active' : ''}" data-idx="${i}">${s.name}</button>`).join('')}
        </div>
      ` : `
        <div class="bs-row-label" style="margin-top:12px">Category <span class="bs-row-hint">this rarity exits front</span></div>
        <div class="bs-toggle-row">
          ${CATEGORY_NAMES.map(c => `<button class="bs-toggle${c === cat ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('')}
        </div>
      `}
    `;
  }
  if (id === B_RECYCLER) {
    const sel = _bc.recycleRarities || [];
    return `
      <div class="bs-row-label">Salvage these rarities <span class="bs-row-hint">passes others through</span></div>
      <div class="bs-toggle-row">
        ${CATEGORY_NAMES.map(c => `<button class="bs-toggle${sel.includes(c) ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('')}
      </div>
    `;
  }
  if (id === B_PACKER) {
    const targets = [3, 5, 8, 12];
    const cur = _bc.packTarget || 5;
    return `
      <div class="bs-row-label">Bundle size</div>
      <div class="bs-toggle-row">
        ${targets.map(t => `<button class="bs-toggle${t === cur ? ' active' : ''}" data-target="${t}">${t} fish</button>`).join('')}
      </div>
    `;
  }
  return '';
}

function _wireCfg() {
  const id = bulkSelect.focusType;
  if (id === B_SORTER) {
    _bsPanel.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      _bc.sortMode = b.dataset.mode; _renderPanel();
    }));
    _bsPanel.querySelectorAll('[data-idx]').forEach(b => b.addEventListener('click', () => {
      _bc.sortThreshold = Number(b.dataset.idx); _renderPanel();
    }));
    _bsPanel.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      _bc.sortCategory = b.dataset.cat; _renderPanel();
    }));
  } else if (id === B_RECYCLER) {
    _bsPanel.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      const cat = b.dataset.cat, i = _bc.recycleRarities.indexOf(cat);
      if (i === -1) _bc.recycleRarities.push(cat); else _bc.recycleRarities.splice(i, 1);
      _renderPanel();
    }));
  } else if (id === B_PACKER) {
    _bsPanel.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => {
      _bc.packTarget = Number(b.dataset.target); _renderPanel();
    }));
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function _addAllOfType() {
  const id = bulkSelect.focusType;
  for (let r = 0; r < WORLD_ROWS; r++)
    for (let c = 0; c < WORLD_COLS; c++)
      if (blockAt(c, r) === id && !bulkSelect.tiles.some(t => t.c === c && t.r === r))
        bulkSelect.tiles.push({ c, r, id });
  window._bsHighlights = bulkSelect.tiles.map(t => ({ c: t.c, r: t.r }));
  _renderPanel();
}

function _applyConfig() {
  const id   = bulkSelect.focusType;
  const mine = bulkSelect.tiles.filter(t => t.id === id);
  for (const { c, r } of mine) {
    const st = stateAt(c, r);
    if (id === B_SORTER) {
      st.sortMode      = _bc.sortMode;
      st.sortThreshold = _bc.sortThreshold;
      st.sortCategory  = _bc.sortCategory;
    } else if (id === B_RECYCLER) {
      st.recycleRarities = [..._bc.recycleRarities];
    } else if (id === B_PACKER) {
      st.packTarget = _bc.packTarget;
    }
  }
  saveGame();
  queueToast(`Applied to ${mine.length} ${_typeName(id)}${mine.length !== 1 ? 's' : ''}`, '#4dca7c');
  exitBulkSelectMode();
}

// ── Highlight canvas loop ─────────────────────────────────────────────────────

function _hlLoop() {
  _hlCanvas.width  = window.innerWidth;
  _hlCanvas.height = window.innerHeight;
  _hlCtx.clearRect(0, 0, _hlCanvas.width, _hlCanvas.height);

  const tiles = window._bsHighlights;
  if (tiles && tiles.length && typeof cam !== 'undefined') {
    const S = TILE_SIZE * ZOOM;
    _hlCtx.save();
    _hlCtx.fillStyle   = 'rgba(77,202,124,0.15)';
    _hlCtx.strokeStyle = 'rgba(77,202,124,0.72)';
    _hlCtx.lineWidth   = 1.5;
    for (const { c, r } of tiles) {
      const sx = (c * TILE_SIZE - cam.x) * ZOOM;
      const sy = (r * TILE_SIZE - cam.y) * ZOOM;
      _hlCtx.fillRect(sx, sy, S, S);
      _hlCtx.strokeRect(sx + 1, sy + 1, S - 2, S - 2);
    }
    _hlCtx.restore();
  }

  requestAnimationFrame(_hlLoop);
}
