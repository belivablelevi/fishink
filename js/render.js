// Fish INK Factory — rendering

const FISH_CELL = 32;
const IMAGES = {};

const COLORS = {
  water:       '#1a4a6e',
  waterShimmer:'#2a6a9e',
  shore:       '#c8a87a',
  ground:      '#2a3a20',
  groundAlt:   '#253618',
  wall:        '#1a1a2a',
  gridLine:    'rgba(255,255,255,0.04)',
  belt:        '#2e2e3a',
  beltEdge:    '#484860',
  beltChevron: 'rgba(140,180,230,0.55)',
  fisher:      '#3a6a4a',
  washer:      '#2a5a8a',
  smoker:      '#5a3a2a',
  icer:        '#2a6a7a',
  stamper:     '#6a4a1a',
  seller:      '#2a8a3a',
  player:      '#e8c87a',
  playerShirt: '#4a7ac8',
  accent:      '#e8a030',
  mint:        '#4dca7c',
  red:         '#e85d4a',
};

const MACHINE_COLORS = {
  [B_WASHER]:  COLORS.washer,
  [B_SMOKER]:  COLORS.smoker,
  [B_ICER]:    COLORS.icer,
  [B_STAMPER]: COLORS.stamper,
};

let beltAnim = 0;

function draw(ctx, canvas, dt) {
  beltAnim = (beltAnim + dt * effectiveBeltSpeed() * TILE_SIZE) % TILE_SIZE;

  const cw = canvas.width, ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  const vw = cw / ZOOM, vh = ch / ZOOM;

  const c0 = Math.max(0, Math.floor(cam.x / TILE_SIZE));
  const r0 = Math.max(0, Math.floor(cam.y / TILE_SIZE));
  const c1 = Math.min(WORLD_COLS - 1, Math.ceil((cam.x + vw) / TILE_SIZE));
  const r1 = Math.min(WORLD_ROWS - 1, Math.ceil((cam.y + vh) / TILE_SIZE));

  // Ocean backdrop fills the whole viewport first — at low zoom the view can
  // be wider than the world itself, so without this the area past the map's
  // edge would show empty canvas instead of surrounding sea.
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, vw, vh);

  // Terrain
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      drawTile(ctx, tileAt(c, r), c * TILE_SIZE - cam.x, r * TILE_SIZE - cam.y, c, r);

  // Subtle grid
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;
  for (let c = c0; c <= c1 + 1; c++) {
    const sx = c * TILE_SIZE - cam.x;
    ctx.beginPath(); ctx.moveTo(sx, r0 * TILE_SIZE - cam.y);
    ctx.lineTo(sx, (r1 + 1) * TILE_SIZE - cam.y); ctx.stroke();
  }
  for (let r = r0; r <= r1 + 1; r++) {
    const sy = r * TILE_SIZE - cam.y;
    ctx.beginPath(); ctx.moveTo(c0 * TILE_SIZE - cam.x, sy);
    ctx.lineTo((c1 + 1) * TILE_SIZE - cam.x, sy); ctx.stroke();
  }

  // Blocks (no fish drawn here)
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const b = blockAt(c, r);
      if (b !== B_NONE) drawBlock(ctx, b, c * TILE_SIZE - cam.x, r * TILE_SIZE - cam.y, c, r);
    }

  // Fish — separate pass so they render above all blocks at interpolated positions
  drawAllFish(ctx, c0, c1, r0, r1);

  // Shipping boat — fixed dock the Drone Delivery network sends fish to
  drawBoat(ctx);

  // Fishing Drones in flight — not tied to a single tile, drawn world-wide
  drawDrones(ctx);

  // Delivery drones in flight toward the boat — cosmetic only
  drawDeliveryFlights(ctx);

  // Catch particles (splash/sparkle) — drawn last so they sit on top of everything else
  drawParticles(ctx);

  // Build ghost
  if (buildMode.active) {
    const { c, r } = tileFromMouse(mouseCanvas.x, mouseCanvas.y);

    if (buildMode.boxMode && boxDragStart) {
      // Dragging a box — highlight the whole pending rectangle instead of a
      // single tile, green for a place-drag, red for a remove-drag.
      const c0 = Math.min(boxDragStart.c, c), c1 = Math.max(boxDragStart.c, c);
      const r0 = Math.min(boxDragStart.r, r), r1 = Math.max(boxDragStart.r, r);
      const sx = c0 * TILE_SIZE - cam.x, sy = r0 * TILE_SIZE - cam.y;
      const w  = (c1 - c0 + 1) * TILE_SIZE, h = (r1 - r0 + 1) * TILE_SIZE;
      const removing = boxDragButton === 2;
      ctx.fillStyle   = removing ? 'rgba(232,93,74,0.18)' : 'rgba(77,202,124,0.18)';
      ctx.fillRect(sx, sy, w, h);
      ctx.strokeStyle = removing ? '#e85d4a' : '#4dca7c';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
    } else {
      const sx = c * TILE_SIZE - cam.x, sy = r * TILE_SIZE - cam.y;
      const ok = canPlaceBlock(buildMode.selectedId, c, r, buildMode.beltDir) && game.cash >= BLOCK_COSTS[buildMode.selectedId];
      ctx.globalAlpha = 0.5;
      // Any directional transport block (belt, splitter, sorter, recycler,
      // smart router) shows the pending rotation (buildMode.beltDir) rather
      // than whatever the actual tile underneath happens to have stored.
      if (IS_TRANSPORT(buildMode.selectedId)) drawBlock(ctx, buildMode.selectedId, sx, sy, c, r, buildMode.beltDir);
      else drawBlock(ctx, buildMode.selectedId, sx, sy, c, r);
      ctx.globalAlpha = 1;
      // Box mode tints the single-tile cursor sky-blue so it's clear dragging
      // will place/remove a rectangle, not just this tile.
      ctx.strokeStyle = buildMode.boxMode ? '#7ec8e3' : (ok ? '#4dca7c' : '#e85d4a');
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }

  // Blueprint copy/paste overlay — independent of buildMode, distinct color
  // from the box-drag ghost above so the two tools are never visually confused.
  if (blueprint.selecting && bpDragStart) {
    const { c, r } = tileFromMouse(mouseCanvas.x, mouseCanvas.y);
    const c0 = Math.min(bpDragStart.c, c), c1 = Math.max(bpDragStart.c, c);
    const r0 = Math.min(bpDragStart.r, r), r1 = Math.max(bpDragStart.r, r);
    const sx = c0 * TILE_SIZE - cam.x, sy = r0 * TILE_SIZE - cam.y;
    const w  = (c1 - c0 + 1) * TILE_SIZE, h = (r1 - r0 + 1) * TILE_SIZE;
    ctx.fillStyle = 'rgba(189,131,232,0.18)';
    ctx.fillRect(sx, sy, w, h);
    ctx.strokeStyle = '#bd83e8';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
  } else if (blueprint.pasting && activeBlueprint()) {
    const { c, r } = tileFromMouse(mouseCanvas.x, mouseCanvas.y);
    const sx = c * TILE_SIZE - cam.x, sy = r * TILE_SIZE - cam.y;
    // Preview reflects pasteRotation on top of the stored (always-unrotated)
    // clipboard — see getRotatedClipboard() in blueprint.js.
    const clip = getRotatedClipboard();
    const w = clip.w * TILE_SIZE, h = clip.h * TILE_SIZE;
    ctx.fillStyle = 'rgba(189,131,232,0.18)';
    ctx.fillRect(sx, sy, w, h);
    ctx.strokeStyle = '#bd83e8';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
    ctx.globalAlpha = 0.6;
    for (const t of clip.tiles) {
      if (t.id === B_NONE) continue;
      const tx = sx + t.dc * TILE_SIZE, ty = sy + t.dr * TILE_SIZE;
      drawBlock(ctx, t.id, tx, ty, c + t.dc, r + t.dr, t.dir);
    }
    ctx.globalAlpha = 1;
  }

  // Player (on top of everything)
  drawPlayer(ctx);

  // Fishing rod — drawn after (on top of) the player, anchored to the
  // casting hand position drawPlayer just computed, so it reads as actually
  // being held rather than floating behind the body.
  drawFishingRod(ctx);

  ctx.restore();

  // Atmosphere overlays (screen-space, drawn over the world but under the HUD)
  drawDayNightOverlay(ctx, canvas);

  // HUD (unscaled)
  drawHUD(ctx, canvas);
  if (!TUT.active) drawHeldFish(ctx, canvas);
  drawToasts(ctx, canvas, dt);
  drawHoverTooltip(ctx, canvas);
  drawTutorialArrow(ctx, canvas);
}

// ─── Tutorial arrow ──────────────────────────────────────────────────────────
// Points at whatever the active tutorial step wants the player to go to (the
// nearest water/belt/seller — see tutorialTargetWorldPos() in tutorial.js).
// Bobs in place above the target when it's on screen; otherwise clamps to the
// screen edge and rotates to point off toward it, like a quest-marker compass.
function drawTutorialArrow(ctx, canvas) {
  const target = tutorialTargetWorldPos();
  if (!target) return;
  const cw = canvas.width, ch = canvas.height;
  const sx = (target.wx - cam.x) * ZOOM;
  const sy = (target.wy - cam.y) * ZOOM;
  const margin = 40;
  const dx = sx - cw / 2, dy = sy - ch / 2;
  const scaleX = dx !== 0 ? (cw / 2 - margin) / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? (ch / 2 - margin) / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY, 1);
  const onScreen = scale >= 1;
  const ax = cw / 2 + dx * scale;
  const ay = ch / 2 + dy * scale;
  const bob = onScreen ? Math.sin(performance.now() / 200) * 6 : 0;

  ctx.save();
  ctx.translate(ax, onScreen ? ay - 30 + bob : ay);
  if (!onScreen) ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
  ctx.fillStyle = '#e8c43f';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 12); ctx.lineTo(-9, -6); ctx.lineTo(9, -6); ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ─── Hover tooltips ──────────────────────────────────────────────────────────
const HOVER_TOOLTIP_DELAY = 300; // ms — avoids flashing tooltips while panning the mouse across tiles

function tooltipLinesFor(id, c, r) {
  const lines = [BLOCK_NAMES[id]];
  if (BLOCK_DESCS[id]) lines.push(BLOCK_DESCS[id]);
  const st = stateAt(c, r);
  if (!st) return lines;
  if (IS_UPGRADABLE(id)) {
    const cost = machineUpgradeCost(id, st.level || 0);
    if (st.level > 0) lines.push(`Level ${st.level}`);
    lines.push(cost == null ? 'Max level' : `Press E to upgrade — $${cost}`);
  }
  if (id === B_SORTER) {
    lines.push(st.sortMode === 'size'
      ? `Mode: by size (${SIZES[st.sortThreshold].name})`
      : `Mode: by rarity (${st.sortCategory})`);
  }
  if (IS_CRATE(id)) lines.push(`Holding ${st.carrying.length}/20`);
  if (IS_PACKER(id)) lines.push(`Packing ${st.carrying.length}/${st.packTarget}`);
  if (id === B_RECYCLER && st.recycleRarities.length > 0) {
    lines.push(`Salvaging: ${st.recycleRarities.join(', ')}`);
  }
  return lines;
}

function drawHoverTooltip(ctx, canvas) {
  if (buildMode.active || blueprint.selecting || blueprint.pasting) return;
  if (!hoverTile || performance.now() - hoverStart < HOVER_TOOLTIP_DELAY) return;
  const { c, r } = hoverTile;
  const id = blockAt(c, r);
  if (id === B_NONE) return;
  const lines = tooltipLinesFor(id, c, r);

  ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  const lineH = 16, padX = 10, padY = 8;
  const boxW = w + padX * 2, boxH = lines.length * lineH + padY * 2;

  let x = mouseCanvas.x + 18, y = mouseCanvas.y + 4;
  x = Math.min(x, canvas.width - boxW - 8);
  y = Math.min(y, canvas.height - boxH - 8);

  ctx.fillStyle = 'rgba(8,16,8,0.88)';
  roundRect(ctx, x, y, boxW, boxH, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, boxW, boxH, 6); ctx.stroke();

  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#e8c43f' : '#cfe0cf';
    ctx.font = i === 0 ? 'bold 12px "Segoe UI", system-ui, sans-serif' : '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(line, x + padX, y + padY + i * lineH);
  });
}

// ─── Day/night lighting ──────────────────────────────────────────────────────
// dayTime 0 = dawn. Tint ramps warm at dawn/dusk, deep blue at night, clear at
// midday — all purely a function of the existing clock, no extra state.
function drawDayNightOverlay(ctx, canvas) {
  const p = game.dayTime / DAY_CYCLE_SECONDS; // 0..1 across one full day
  let color, alpha;
  if (p < 0.05 || p > 0.95) {           // deep night
    color = '20,30,60'; alpha = 0.35;
  } else if (p < 0.1) {                  // dawn
    const t = (p - 0.05) / 0.05;
    color = '230,150,80'; alpha = 0.22 * (1 - t);
  } else if (p < 0.4) {                  // day
    color = '0,0,0'; alpha = 0;
  } else if (p < 0.5) {                  // dusk approaching
    const t = (p - 0.4) / 0.1;
    color = '230,130,70'; alpha = 0.2 * t;
  } else if (p < 0.55) {                 // dusk peak
    color = '230,130,70'; alpha = 0.2;
  } else if (p < 0.9) {                  // evening fading to night
    const t = (p - 0.55) / 0.35;
    color = `${Math.round(230 - t * 210)},${Math.round(130 - t * 100)},${Math.round(70 + t * -10 + 60)}`;
    alpha = 0.2 + t * 0.15;
  } else {                                // ramp into deep night
    const t = (p - 0.9) / 0.05;
    color = '20,30,60'; alpha = 0.35 * t;
  }
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(${color},${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── Terrain ─────────────────────────────────────────────────────────────────

// Deterministic 0..1 hash from two ints — same tile always renders the same way
function tileHash(c, r, salt) {
  let x = Math.sin(c * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

// Hand-drawn sand tile: solid base + scattered grain speckles, no sprite assets.
function drawSandTile(ctx, sx, sy, S, c, r) {
  const shades = ['#cfa86f', '#d6b079', '#c8a065', '#dcb886'];
  ctx.fillStyle = shades[Math.floor(tileHash(c, r, 1) * shades.length)];
  ctx.fillRect(sx, sy, S, S);

  for (let i = 0; i < 7; i++) {
    const gx = sx + 2 + tileHash(c, r, i * 2 + 10) * (S - 4);
    const gy = sy + 2 + tileHash(c, r, i * 2 + 11) * (S - 4);
    const dark = tileHash(c, r, i * 2 + 12) > 0.5;
    ctx.fillStyle = dark ? 'rgba(110,80,45,0.35)' : 'rgba(255,235,195,0.4)';
    ctx.fillRect(gx, gy, 1.5, 1.5);
  }

  drawEdgeBlend(ctx, sx, sy, S, c, r, T_EMPTY, 'rgba(80,120,50,0.4)');
}

// Smooth continuous noise (sum of sines) — value at any real (x,y) is the same
// regardless of which tile reads it, so patches drawn from it never seam.
function fieldNoise(x, y) {
  const n = Math.sin(x * 1.3 + y * 2.1) +
            Math.sin(x * 2.7 - y * 1.7) * 0.5 +
            Math.sin(x * 0.6 + y * 0.9) * 0.7;
  return (n + 2.2) / 4.4; // ~0..1
}

// Scatters a few speckles of `color` near whichever edges border a tile of
// `neighborType`, so two adjacent terrain types dither into each other
// instead of meeting at a hard line. Deterministic per tile via tileHash.
function drawEdgeBlend(ctx, sx, sy, S, c, r, neighborType, color) {
  ctx.fillStyle = color;
  const band = 5;
  const edges = [
    { match: tileAt(c - 1, r) === neighborType, x0: 0, x1: band, y0: 0, y1: S },
    { match: tileAt(c + 1, r) === neighborType, x0: S - band, x1: S, y0: 0, y1: S },
    { match: tileAt(c, r - 1) === neighborType, x0: 0, x1: S, y0: 0, y1: band },
    { match: tileAt(c, r + 1) === neighborType, x0: 0, x1: S, y0: S - band, y1: S },
  ];
  let salt = 200;
  for (const e of edges) {
    if (!e.match) { salt += 6; continue; }
    for (let i = 0; i < 5; i++) {
      const px = sx + e.x0 + tileHash(c, r, salt + i * 2) * (e.x1 - e.x0);
      const py = sy + e.y0 + tileHash(c, r, salt + i * 2 + 1) * (e.y1 - e.y0);
      ctx.fillRect(px, py, 1.5, 1.5);
    }
    salt += 6;
  }
}

// Hand-drawn grass tile, styled after a reference pixel-art field: flat base +
// soft speckle dither + larger fuzzy bush patches (continuous noise, multi-tile,
// no per-tile seams) + occasional small flower clusters.
function drawGrassTile(ctx, sx, sy, S, c, r) {
  ctx.fillStyle = '#436b2c';
  ctx.fillRect(sx, sy, S, S);

  // Bush patch strength at this tile, from a low-frequency noise field so
  // patches span several tiles and fade in/out smoothly across borders.
  const bush = fieldNoise(c * 0.22, r * 0.22);
  const speckleCount = bush > 0.6 ? 14 : 6;
  const bushy = bush > 0.6;

  for (let i = 0; i < speckleCount; i++) {
    const px = sx + 1 + tileHash(c, r, i * 2 + 30) * (S - 2);
    const py = sy + 1 + tileHash(c, r, i * 2 + 31) * (S - 2);
    const toneRoll = tileHash(c, r, i * 2 + 32);
    let color;
    if (bushy && toneRoll > 0.35) {
      color = toneRoll > 0.7 ? 'rgba(30,55,60,0.55)' : 'rgba(45,75,55,0.5)';
    } else {
      color = toneRoll > 0.5 ? 'rgba(90,125,45,0.4)' : 'rgba(30,55,20,0.35)';
    }
    ctx.fillStyle = color;
    ctx.fillRect(px, py, 1.5, 1.5);
  }

  // Rare flower cluster, placed via the same hash so it's stable per tile.
  if (tileHash(c, r, 77) > 0.985) {
    const fx = sx + 5 + tileHash(c, r, 78) * (S - 10);
    const fy = sy + 5 + tileHash(c, r, 79) * (S - 10);
    const palette = ['#f3c98a', '#e8748a', '#fdf1d6'];
    for (let i = 0; i < 4; i++) {
      const ox = (tileHash(c, r, i * 2 + 80) - 0.5) * 5;
      const oy = (tileHash(c, r, i * 2 + 81) - 0.5) * 5;
      ctx.fillStyle = palette[Math.floor(tileHash(c, r, i + 85) * palette.length)];
      ctx.fillRect(fx + ox, fy + oy, 1.5, 1.5);
    }
  }

  // Sparse decorative rock cluster, drawn procedurally (small flat-shaded
  // pebble blocks + a shadow speckle + a highlight speckle) to match the
  // hand-drawn look of the speckles/flowers above rather than a sprite.
  if (tileHash(c, r, 140) > 0.96) {
    const cx = sx + 5 + tileHash(c, r, 141) * (S - 10);
    const cy = sy + 5 + tileHash(c, r, 142) * (S - 10);
    const pebbleCount = 2 + Math.floor(tileHash(c, r, 143) * 3); // 2-4 pebbles
    for (let i = 0; i < pebbleCount; i++) {
      const ox = (tileHash(c, r, i * 3 + 144) - 0.5) * 7;
      const oy = (tileHash(c, r, i * 3 + 145) - 0.5) * 5;
      const size = 2 + tileHash(c, r, i * 3 + 146) * 2;
      ctx.fillStyle = '#8a8378';
      ctx.fillRect(cx + ox - size / 2, cy + oy - size / 2, size, size);
      ctx.fillStyle = 'rgba(50,45,40,0.5)';
      ctx.fillRect(cx + ox - size / 2, cy + oy + size / 2 - 1, size, 1);
      ctx.fillStyle = 'rgba(210,205,195,0.6)';
      ctx.fillRect(cx + ox - size / 2, cy + oy - size / 2, 1, 1);
    }
  }

  drawEdgeBlend(ctx, sx, sy, S, c, r, T_SHORE, 'rgba(206,170,115,0.4)');
}

// Hand-drawn water tile: flat shade (no gradient — avoids per-tile seams) +
// a rare, dim sparkle (kept sparse so it doesn't read as "shimmer noise").
function drawWaterTile(ctx, sx, sy, S, c, r) {
  const shades = ['#1a4a6e', '#1b4c70', '#194869', '#1c4e72'];
  ctx.fillStyle = shades[Math.floor(tileHash(c, r, 41) * shades.length)];
  ctx.fillRect(sx, sy, S, S);

  if (tileHash(c, r, 90) > 0.85) {
    const px = sx + 4 + tileHash(c, r, 91) * (S - 8);
    const py = sy + 4 + tileHash(c, r, 92) * (S - 8);
    const twinkle = (Math.sin(game.time * 2.2 + tileHash(c, r, 93) * Math.PI * 2) + 1) / 2;
    if (twinkle > 0.75) {
      ctx.fillStyle = `rgba(255,255,255,${(twinkle - 0.75) * 2})`;
      ctx.fillRect(px, py, 1.5, 1.5);
    }
  }
}

function drawTile(ctx, t, sx, sy, c, r) {
  const S = TILE_SIZE;
  ctx.imageSmoothingEnabled = false;

  if (t === T_WATER) {
    drawWaterTile(ctx, sx, sy, S, c, r);

  } else if (t === T_SHORE) {
    drawSandTile(ctx, sx, sy, S, c, r);

  } else if (t === T_EMPTY) {
    drawGrassTile(ctx, sx, sy, S, c, r);

  } else if (t === T_CONCRETE) {
    ctx.fillStyle = (c + r) % 2 === 0 ? '#3c3c48' : '#363642';
    ctx.fillRect(sx, sy, S, S);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1);

  } else if (t === T_WALL) {
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(sx, sy, S, S);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, sy, S, 2);
  }
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

// Small "Lv N" tag in a block's top-right corner — shown once a placed
// instance has been upgraded at least once, so a stock block stays clean.
function drawLevelBadge(ctx, sx, sy, S, level) {
  if (!level) return;
  ctx.fillStyle = 'rgba(10,18,16,0.85)';
  ctx.fillRect(sx + S - 15, sy + 1, 14, 10);
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), sx + S - 8, sy + 6.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// forceDir overrides whatever dir is actually stored at (c, r) — used by the
// build ghost so a transport block's pending rotation (buildMode.beltDir)
// shows up before it's actually placed, since stateAt(c, r) for an empty
// tile has no dir of its own to read.
function drawBlock(ctx, id, sx, sy, c, r, forceDir) {
  const S = TILE_SIZE;
  const st = stateAt(c, r);

  if (IS_BELT(id)) {
    drawBelt(ctx, BELT_DIRS[forceDir != null ? forceDir : (st && st.dir) || 0], sx, sy, S);

  } else if (id === B_SPLITTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    drawSplitterBelt(ctx, BELT_DIRS[dirIdx], dirIdx, (st && st.altOut) || false, sx, sy, S);

  } else if (id === B_SORTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    drawSorterBelt(ctx, BELT_DIRS[dirIdx], dirIdx, sx, sy, S);

  } else if (id === B_TELEPORTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    const hasTarget = !!(st && st.teleportTarget && blockAt(st.teleportTarget.c, st.teleportTarget.r) === B_TELEPORTER);
    drawTeleporterBelt(ctx, BELT_DIRS[dirIdx], dirIdx, hasTarget, sx, sy, S);

  } else if (id === B_CRATE) {
    const fill = st ? st.carrying.length / researchCrateCapacity() : 0;
    if (IMAGES.crate) {
      ctx.drawImage(IMAGES.crate, sx + 1, sy + 1, S - 2, S - 2);
    } else {
      ctx.fillStyle = '#5a4226';
      ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
      ctx.fillStyle = '#7a5c38';
      ctx.fillRect(sx + 2, sy + 2, S - 4, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 2.5, sy + 2.5, S - 5, S - 5);
      // Slatted crate lines
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.5;
      for (const fx of [sx + S * 0.33, sx + S * 0.66]) {
        ctx.beginPath(); ctx.moveTo(fx, sy + 4); ctx.lineTo(fx, sy + S - 4); ctx.stroke();
      }
    }
    // Fill-level bar instead of a progress bar — this block isn't "processing"
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(sx + 3, sy + S - 6, S - 6, 3);
    ctx.fillStyle = fill >= 1 ? '#e85d4a' : '#e8a030';
    ctx.fillRect(sx + 3, sy + S - 6, (S - 6) * fill, 3);

  } else if (id === B_RECYCLER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    const pulse  = st && st.flashAnim > game.time;
    const rarities = (st && st.recycleRarities) || [];
    drawBelt(ctx, BELT_DIRS[dirIdx], sx, sy, S);
    // Sprite is a symmetric 8-point glyph with a gray dot per rarity slot
    // (sprite_0..4 = 0..4 dots lit) — no rotation needed, just pick by count.
    const recyclerSprite = IMAGES['recycler' + Math.min(rarities.length, 4)];
    if (recyclerSprite) {
      if (pulse) { ctx.fillStyle = 'rgba(216,240,160,0.25)'; ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4); }
      // Drawn a touch larger than the belt tile and recentered, so the
      // glyph (and its dots, scaled along with it) reads a little bigger.
      const boxSize = (S - 4) * 1.06;
      const boxX = sx + (S - boxSize) / 2;
      const boxY = sy + (S - boxSize) / 2;
      ctx.drawImage(recyclerSprite, boxX, boxY, boxSize, boxSize);
      drawRecyclerDots(ctx, boxX, boxY, boxSize, rarities);
    } else {
      drawRecyclerIcon(ctx, sx + S / 2, sy + S / 2, rarities, pulse, S);
    }
    drawLevelBadge(ctx, sx, sy, S, st && st.level);

  } else if (id === B_SMART_ROUTER) {
    const dirIdx = forceDir != null ? forceDir : (st && st.dir) || 0;
    // Plain plate, not drawBelt's single-direction scrolling chevrons — this
    // block can send a fish out any of 3 sides, so a one-way arrow stream
    // would misleadingly suggest it only ever flows one way.
    drawJunctionBase(ctx, sx, sy, S);
    // Pick the sprite matching the live route choice (straight/right/left of
    // facing, same relative scheme nextCellFor uses in sim.js: dir, dir+1 is
    // a right turn, dir+3 is a left turn), then rotate it from its drawn
    // orientation (forward = right, the engine's default facing) to match
    // the router's actual facing dir.
    // No fish has set a route yet, or it's been 0.8s since the last one did —
    // show the idle/base icon (highlights the input side) instead of leaving
    // a stale direction lit forever.
    const routeStale = !st || st.routeDir == null || game.time - (st.routeSetAt || 0) > 0.8;
    let sprite;
    if (routeStale) {
      sprite = IMAGES.smartRouterBase;
    } else if (st.routeDir === (dirIdx + 1) % 4) {
      sprite = IMAGES.smartRouterRight;
    } else if (st.routeDir === (dirIdx + 3) % 4) {
      sprite = IMAGES.smartRouterLeft;
    } else {
      sprite = IMAGES.smartRouterStraight;
    }
    if (sprite) {
      const d = BELT_DIRS[dirIdx];
      const angle = Math.atan2(d.dy, d.dx);
      ctx.save();
      ctx.translate(sx + S / 2, sy + S / 2);
      ctx.rotate(angle);
      ctx.drawImage(sprite, -(S - 4) / 2, -(S - 4) / 2, S - 4, S - 4);
      ctx.restore();
    } else {
      drawSmartRouterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, S);
    }

  } else if (IS_PACKER(id)) {
    const target = (st && st.packTarget) || 5;
    const fill = st ? st.carrying.length / target : 0;
    const pulse = st && st.processing;
    if (IMAGES.packer) {
      ctx.drawImage(IMAGES.packer, sx + 1, sy + 1, S - 2, S - 2);
      if (pulse) {
        ctx.fillStyle = 'rgba(232,160,48,0.25)';
        ctx.fillRect(sx + 1, sy + 1, S - 2, S - 2);
      }
    } else {
      ctx.fillStyle = pulse ? '#7a5c30' : '#5a4226';
      ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
      ctx.fillStyle = pulse ? 'rgba(232,160,48,0.5)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(sx + 2, sy + 2, S - 4, 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 2.5, sy + 2.5, S - 5, S - 5);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(sx + 3, sy + S - 6, S - 6, 3);
    ctx.fillStyle = pulse ? '#e8a030' : '#a78bfa';
    ctx.fillRect(sx + 3, sy + S - 6, (S - 6) * Math.min(1, fill), 3);
    drawLevelBadge(ctx, sx, sy, S, st && st.level);

  } else if (id === B_FISHER) {
    // Tile base
    ctx.fillStyle = COLORS.fisher;
    ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
    // Diagonal highlight
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(sx + 2, sy + 2, S - 4, 6);
    // Small wooden post base the rod is mounted on
    ctx.fillStyle = '#5a4226';
    ctx.fillRect(sx + 6, sy + S - 9, 5, 6);
    // Rod icon — cropped from the shared fishing_gear sheet. Its top row holds
    // 5 color variants left-to-right (wood/tan/gray/red/black); higher upgrade
    // levels step through them so a leveled-up Fisher visibly looks better.
    if (IMAGES.gear) {
      const GEAR_CELL = 32;
      const rodCol = Math.min((st && st.level) || 0, 4);
      ctx.drawImage(IMAGES.gear, rodCol * GEAR_CELL, 0, GEAR_CELL, GEAR_CELL, sx + 4, sy + 2, S - 8, S - 8);
    } else {
      ctx.strokeStyle = '#b08840';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx + 7, sy + S - 7); ctx.lineTo(sx + S - 5, sy + 7); ctx.stroke();
      ctx.strokeStyle = '#7ab8e8';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx + S - 5, sy + 7); ctx.lineTo(sx + S - 5, sy + 16); ctx.stroke();
      // Small fish silhouette dangling on the line
      ctx.fillStyle = '#c8d8a0';
      ctx.beginPath();
      ctx.ellipse(sx + S - 5, sy + 18, 2.5, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'butt';
    }
    // Progress bar
    if (st) {
      const t = fisherTimers[`${c},${r}`] || 0;
      const p = 1 - t / (effectiveFisherInterval() * machineSpeedMult(st.level || 0));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(sx + 3, sy + S - 6, S - 6, 3);
      ctx.fillStyle = '#4dca7c';
      ctx.fillRect(sx + 3, sy + S - 6, (S - 6) * p, 3);
    }
    drawLevelBadge(ctx, sx, sy, S, st && st.level);

  } else if (IS_MACHINE(id)) {
    // Icer/Stamper swap to an "active" sprite frame from the asset pack while
    // actually processing a fish, instead of just sitting on one static pose.
    const active = st && st.processing;
    const sprite = id === B_WASHER ? IMAGES.washer : id === B_SMOKER ? IMAGES.smoker
                 : id === B_ICER   ? (active ? IMAGES.icerActive    : IMAGES.icer)
                 : id === B_STAMPER ? (active ? IMAGES.stamperActive : IMAGES.stamper)
                 : null;
    if (sprite) {
      // Hand-supplied pixel-art sprite (tightly cropped to its content)
      // stands in for the procedural icon
      ctx.drawImage(sprite, sx + 1, sy + 1, S - 2, S - 2);
    } else {
      const col = MACHINE_COLORS[id] || '#444';
      ctx.fillStyle = col;
      ctx.fillRect(sx + 1, sy + 1, S - 2, S - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(sx + 1, sy + 1, S - 2, 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1.5, sy + 1.5, S - 3, S - 3);
      // Distinct per-machine icon instead of a shared gear glyph
      drawMachineIcon(ctx, id, sx + S / 2, sy + S / 2 - 2);
    }
    if (id === B_WASHER) {
      // Little conveyor nubs on whichever sides actually feed a real belt
      for (const [dc, dr, side] of [[-1,0,'left'],[1,0,'right'],[0,-1,'top'],[0,1,'bottom']]) {
        if (IS_TRANSPORT(blockAt(c + dc, r + dr))) drawConveyorStub(ctx, sx, sy, S, side);
      }
    }
    if (st && st.processing) {
      const def = machineDef(id);
      const p = 1 - st.timer / (def.processTime * machineSpeedMult(st.level || 0));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(sx + 3, sy + S - 6, S - 6, 3);
      ctx.fillStyle = COLORS.accent;
      ctx.fillRect(sx + 3, sy + S - 6, (S - 6) * p, 3);
    }
    drawLevelBadge(ctx, sx, sy, S, st && st.level);
    // Machine fish drawn in drawAllFish

  } else if (id === B_CONCRETE) {
    ctx.fillStyle = '#3c3c48';
    ctx.fillRect(sx + 1, sy + 1, S - 2, S - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx + 1.5, sy + 1.5, S - 3, S - 3);
    // Expansion-joint cross and corner bolts for an industrial-floor feel
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx + S / 2, sy + 1); ctx.lineTo(sx + S / 2, sy + S - 1);
    ctx.moveTo(sx + 1, sy + S / 2); ctx.lineTo(sx + S - 1, sy + S / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (const [ox, oy] of [[5,5],[S-5,5],[5,S-5],[S-5,S-5]]) {
      ctx.beginPath(); ctx.arc(sx + ox, sy + oy, 1, 0, Math.PI * 2); ctx.fill();
    }

  } else if (id === B_SELLER) {
    const pulse = st && st.flashAnim > game.time;

    if (IMAGES.sellcrate) {
      ctx.drawImage(IMAGES.sellcrate, sx + 1, sy + 1, S - 2, S - 2);
      if (pulse) {
        ctx.fillStyle = 'rgba(255,227,122,0.25)';
        ctx.fillRect(sx + 1, sy + 1, S - 2, S - 2);
      }
    } else {
      // Plain crate body
      ctx.fillStyle = '#1f6b34';
      ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx + 2, sy + 2, S - 4, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 2.5, sy + 2.5, S - 5, S - 5);
      // Corner strapping
      ctx.fillStyle = '#143d1e';
      ctx.fillRect(sx + 2, sy + 2, 3, S - 4);
      ctx.fillRect(sx + S - 5, sy + 2, 3, S - 4);

      // "SELL" label sticker on the front face, glowing while a sale is fresh
      ctx.fillStyle = pulse ? '#fff3c0' : '#eee6c8';
      ctx.fillRect(sx + 5, sy + S / 2 - 7, S - 10, 14);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 5.5, sy + S / 2 - 6.5, S - 11, 13);
      ctx.fillStyle = '#1f6b34';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SELL', sx + S / 2, sy + S / 2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Little conveyor nubs on whichever sides actually feed a real belt
    for (const [dc, dr, side] of [[-1,0,'left'],[1,0,'right'],[0,-1,'top'],[0,1,'bottom']]) {
      if (IS_TRANSPORT(blockAt(c + dc, r + dr))) drawConveyorStub(ctx, sx, sy, S, side);
    }

    // Coin pops up and fades out right after a sale lands
    if (pulse) {
      const k = 1 - (st.flashAnim - game.time) / 0.5; // 0..1 since the sale
      const cy = sy + S / 2 - 10 - k * 16;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(sx + S / 2, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a10';
      ctx.font = 'bold 5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('$', sx + S / 2, cy + 0.5);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

  } else if (id === B_DRONE_FISHER) {
    // The drone itself is drawn by drawDrones() while it's away on a trip;
    // here we just draw the landing pad (dimmed while the drone is out).
    const away  = st && st.dronePhase !== DRONE_UNLOAD;
    const pulse = st && st.flashAnim > game.time;
    if (IMAGES.dronepad) {
      ctx.globalAlpha = away ? 0.6 : 1;
      ctx.drawImage(IMAGES.dronepad, sx + 1, sy + 1, S - 2, S - 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#1e3a44';
      ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx + 2, sy + 2, S - 4, 6);
      drawHelipadMarking(ctx, sx + S / 2, sy + S / 2, away ? 'rgba(93,208,232,0.35)' : '#5ad0e8');
    }
    if (!away) drawDroneSprite(ctx, sx + S / 2, sy + S / 2, pulse);
    if (st && st.carrying.length > 0) {
      ctx.fillStyle = '#9fe8ff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`x${st.carrying.length}`, sx + S / 2, sy + 3);
    }
    drawLevelBadge(ctx, sx, sy, S, st && st.level);

  } else if (id === B_DRONE_DELIVERY) {
    const pulse = st && st.flashAnim > game.time;
    if (IMAGES.droneDeliveryBase) {
      // Liftoff animation plays once per sale: base -> ship1 -> ship2 -> ship1 -> base,
      // paced across the same 0.5s window the pulse flash uses (sim.js sets flashAnim = now + 0.5).
      let frame = IMAGES.droneDeliveryBase;
      if (pulse) {
        const k = 1 - (st.flashAnim - game.time) / 0.5;
        if (k < 0.25)      frame = IMAGES.droneDeliveryShip1;
        else if (k < 0.5)  frame = IMAGES.droneDeliveryShip2;
        else if (k < 0.75) frame = IMAGES.droneDeliveryShip1;
      }
      ctx.drawImage(frame, sx + 1, sy + 1, S - 2, S - 2);
    } else {
      ctx.fillStyle = '#3a2444';
      ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx + 2, sy + 2, S - 4, 6);
      drawHelipadMarking(ctx, sx + S / 2, sy + S / 2, pulse ? 'rgba(240,200,255,0.5)' : 'rgba(184,107,220,0.4)');
      ctx.strokeStyle = pulse ? '#f0c8ff' : '#b86bdc';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const cx = sx + S / 2, cy = sy + S / 2 + 3, lift = pulse ? 6 : 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6 - lift);
      ctx.lineTo(cx, cy - 6 - lift);
      ctx.lineTo(cx - 4, cy - 2 - lift);
      ctx.moveTo(cx, cy - 6 - lift);
      ctx.lineTo(cx + 4, cy - 2 - lift);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    drawLevelBadge(ctx, sx, sy, S, st && st.level);
  }
}

// Distinct icon per processing machine so the four no longer read as the
// same gear glyph in a different color.
function drawMachineIcon(ctx, id, cx, cy) {
  if (id === B_WASHER) {
    // Droplet + wave line
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.bezierCurveTo(cx + 5, cy - 1, cx + 5, cy + 5, cx, cy + 7);
    ctx.bezierCurveTo(cx - 5, cy + 5, cx - 5, cy - 1, cx, cy - 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,80,120,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 3, cy + 2); ctx.lineTo(cx + 3, cy + 2); ctx.stroke();

  } else if (id === B_SMOKER) {
    // Chimney stack + curling smoke wisps
    ctx.fillStyle = '#caa882';
    ctx.fillRect(cx - 3, cy + 1, 6, 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const off = i * 5 - 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + off, cy);
      ctx.quadraticCurveTo(cx + off + 3, cy - 5, cx + off - 1, cy - 9);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

  } else if (id === B_ICER) {
    // Six-armed snowflake
    ctx.strokeStyle = '#cdf3ff';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let a = 0; a < 6; a++) {
      const ang = a * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

  } else if (id === B_STAMPER) {
    // Round wax-seal stamp with a checkmark
    ctx.fillStyle = '#e8c060';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6a4a1a';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 2.5, cy);
    ctx.lineTo(cx - 0.5, cy + 2);
    ctx.lineTo(cx + 3, cy - 2.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}

// Small two-pronged fork glyph shared by Splitter/Sorter — visually marks a
// belt tile as "routes to one of two sides" instead of a plain straight run.
// Shared directional arrow (shaft + filled triangular head) used by the
// Splitter/Sorter icons below to show an actual outgoing direction instead
// of an abstract glyph — the arrow always points exactly where the fish goes.
function drawDirArrow(ctx, cx, cy, dir, len, color, lineWidth, headSize) {
  const ex = cx + dir.dx * len, ey = cy + dir.dy * len;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.lineCap = 'butt';
  drawArrowHead(ctx, ex, ey, dir, color, headSize);
}

// Filled triangular arrowhead pointing along `dir`, tip at (ex, ey) — split
// out of drawDirArrow so callers that draw their own shaft (e.g. the Smart
// Router's through-line) can still get a matching head.
function drawArrowHead(ctx, ex, ey, dir, color, headSize) {
  const ang = Math.atan2(dir.dy, dir.dx);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ex + Math.cos(ang) * headSize, ey + Math.sin(ang) * headSize);
  ctx.lineTo(ex - Math.cos(ang - 0.5) * headSize, ey - Math.sin(ang - 0.5) * headSize);
  ctx.lineTo(ex - Math.cos(ang + 0.5) * headSize, ey - Math.sin(ang + 0.5) * headSize);
  ctx.closePath();
  ctx.fill();
}

// Splitter: draws both possible exits (straight-ahead vs. one turn) as two
// distinctly colored arrows so the routing is obvious at a glance, and
// brightens whichever one the *next* item will actually take (altOut).
function drawSplitterIcon(ctx, cx, cy, dirIdx, altOut, S) {
  const straight = BELT_DIRS[dirIdx];
  const turn     = BELT_DIRS[(dirIdx + 1) % 4];
  const len = S * 0.32;
  drawDirArrow(ctx, cx, cy, straight, len, altOut ? 'rgba(232,196,63,0.35)' : '#e8c43f', altOut ? 1.5 : 2.5, altOut ? 2.5 : 4);
  drawDirArrow(ctx, cx, cy, turn,     len, altOut ? '#5ad0e8' : 'rgba(90,208,232,0.35)', altOut ? 2.5 : 1.5, altOut ? 4 : 2.5);
}

// Sorter: "big fish" exit one way (thick orange arrow), "small fish" exit
// the opposite way (thin blue arrow), split by a center divider line along
// the perpendicular axis — so each side visually owns one output direction.
function drawSorterIcon(ctx, cx, cy, dirIdx, S) {
  const big   = BELT_DIRS[dirIdx];
  const small = BELT_DIRS[(dirIdx + 2) % 4];
  const horizontal = big.dx !== 0;

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (horizontal) { ctx.moveTo(cx, cy - S / 2 + 3); ctx.lineTo(cx, cy + S / 2 - 3); }
  else            { ctx.moveTo(cx - S / 2 + 3, cy); ctx.lineTo(cx + S / 2 - 3, cy); }
  ctx.stroke();

  drawDirArrow(ctx, cx, cy, big,   S * 0.34, '#e8a030', 3,   4.5);
  drawDirArrow(ctx, cx, cy, small, S * 0.30, '#5aa8e8', 1.6, 2.5);
}

// Teleporter: two concentric rings (purple outer, sky-blue inner) with a
// slowly rotating inner swirl while it has a valid destination, plus the
// same output-direction arrow convention as Sorter/Smart Router. With no
// destination set (or one that was auto-cleared because the target tile
// stopped being a Teleporter), both rings desaturate to gray and the swirl
// stops, so a broken link reads as "broken" at a glance without opening
// the settings popup.
// Teleporter's own belt skin — drawn exactly like drawBelt (rotated per
// direction, frame chosen off the shared beltAnim clock) rather than as a
// separate icon overlay, swapping its whole 6-frame set between unlinked
// (dark) and linked (cyan-glow) instead of just recoloring a procedural icon.
const TELEPORTER_BASE_KEYS   = ['teleporterBase0', 'teleporterBase1', 'teleporterBase2', 'teleporterBase3', 'teleporterBase4', 'teleporterBase5'];
const TELEPORTER_ACTIVE_KEYS = ['teleporterActive0', 'teleporterActive1', 'teleporterActive2', 'teleporterActive3', 'teleporterActive4', 'teleporterActive5'];

function drawTeleporterBelt(ctx, dir, dirIdx, hasTarget, sx, sy, S) {
  const keys = hasTarget ? TELEPORTER_ACTIVE_KEYS : TELEPORTER_BASE_KEYS;
  const frameIdx = Math.floor((beltAnim / TILE_SIZE) * keys.length) % keys.length;
  const sprite = IMAGES[keys[frameIdx]];
  if (sprite) {
    const angle = Math.atan2(dir.dy, dir.dx);
    const drawSize = S + 2;
    ctx.save();
    ctx.translate(sx + S / 2, sy + S / 2);
    ctx.rotate(angle);
    ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
    return;
  }

  // Fallback: original belt + procedural ring icon, only reachable if the
  // teleporter sprites fail to load.
  drawBelt(ctx, dir, sx, sy, S);
  drawTeleporterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, hasTarget, S);
}

// Splitter: same treatment as the Teleporter above — a dedicated 4-frame
// animated skin replaces the belt-underneath + fork-icon-overlay combo
// entirely, sharing the same beltAnim clock and per-direction rotation. Only
// one art set was supplied (no separate altOut variant), so the "which exit
// is active" cue the procedural icon used to show is dropped along with it.
const SPLITTER_KEYS = ['splitter0', 'splitter1', 'splitter2', 'splitter3'];

function drawSplitterBelt(ctx, dir, dirIdx, altOut, sx, sy, S) {
  const frameIdx = Math.floor((beltAnim / TILE_SIZE) * SPLITTER_KEYS.length) % SPLITTER_KEYS.length;
  const sprite = IMAGES[SPLITTER_KEYS[frameIdx]];
  if (sprite) {
    const angle = Math.atan2(dir.dy, dir.dx);
    const drawSize = S + 2;
    ctx.save();
    ctx.translate(sx + S / 2, sy + S / 2);
    ctx.rotate(angle);
    ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
    return;
  }

  // Fallback: original belt + procedural fork icon, only reachable if the
  // splitter sprites fail to load.
  drawBelt(ctx, dir, sx, sy, S);
  drawSplitterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, altOut, S);
}

// Sorter: same treatment as the Splitter/Teleporter above — a dedicated
// 6-frame animated skin (matching belt-0..5's frame count) replaces the
// belt-underneath + orange/blue-arrow-icon-overlay combo entirely. The new
// art has no per-output color distinction, so (like the Splitter) the
// "which side is matching vs. non-matching" cue the procedural icon used to
// show is dropped along with it.
const SORTER_KEYS = ['sorter0', 'sorter1', 'sorter2', 'sorter3', 'sorter4', 'sorter5'];

function drawSorterBelt(ctx, dir, dirIdx, sx, sy, S) {
  const frameIdx = Math.floor((beltAnim / TILE_SIZE) * SORTER_KEYS.length) % SORTER_KEYS.length;
  const sprite = IMAGES[SORTER_KEYS[frameIdx]];
  if (sprite) {
    const angle = Math.atan2(dir.dy, dir.dx);
    const drawSize = S + 2;
    ctx.save();
    ctx.translate(sx + S / 2, sy + S / 2);
    ctx.rotate(angle);
    ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
    return;
  }

  // Fallback: original belt + procedural orange/blue arrow icon, only
  // reachable if the sorter sprites fail to load.
  drawBelt(ctx, dir, sx, sy, S);
  drawSorterIcon(ctx, sx + S / 2, sy + S / 2, dirIdx, S);
}

// Teleporter: two concentric rings (purple outer, sky-blue inner) with a
// slowly rotating inner swirl while it has a valid destination, plus the
// same output-direction arrow convention as Sorter/Smart Router. With no
// destination set (or one that was auto-cleared because the target tile
// stopped being a Teleporter), both rings desaturate to gray and the swirl
// stops, so a broken link reads as "broken" at a glance without opening
// the settings popup.
function drawTeleporterIcon(ctx, cx, cy, dirIdx, hasTarget, S) {
  const outerColor = hasTarget ? '#a78bfa' : '#6b6b78';
  const innerColor = hasTarget ? '#7ec8e3' : '#888892';

  ctx.strokeStyle = outerColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.22, 0, Math.PI * 2);
  ctx.stroke();

  if (hasTarget) {
    const spin = game.time * 2.2;
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const a0 = spin + i * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, S * 0.14, a0, a0 + Math.PI * 0.7);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  drawDirArrow(ctx, cx, cy, BELT_DIRS[dirIdx], S * 0.3, outerColor, 2, 3.5);
}

// Pixel positions (fraction of the 32x32 recycler sprite) of each baked-in
// gray dot, keyed by which arm tip it sits on — reverse-engineered from the
// sprite_1..4 source PNGs since each dot count uses a different fixed
// arrangement (count 3 swaps one diagonal for the top arm) rather than
// simply adding one more dot to the previous arrangement.
const RECYCLER_DOT_POS = {
  N:  [0.517, 0.221], NE: [0.746, 0.287], SE: [0.718, 0.718],
  SW: [0.287, 0.71], NW: [0.287, 0.287],
};
// Which arm tips light up for each rarity count, in clockwise-from-top
// order — this is the order rarities[] maps onto when recoloring the dots.
const RECYCLER_DOT_ORDER = {
  1: ['NE'], 2: ['NE', 'SW'], 3: ['N', 'SE', 'SW'], 4: ['NE', 'SE', 'SW', 'NW'],
};

// Paints over the recycler sprite's baked-in gray dots with the actual
// CATEGORY_COLOR of each selected rarity, in the fixed arm-tip layout that
// matching sprite (sprite_1..4) uses for that dot count.
function drawRecyclerDots(ctx, boxX, boxY, boxSize, rarities) {
  const count = Math.min(rarities.length, 4);
  if (count === 0) return;
  const order = RECYCLER_DOT_ORDER[count];
  const dotRad = boxSize * 0.0735;
  for (let i = 0; i < count; i++) {
    const pos = RECYCLER_DOT_POS[order[i]];
    ctx.fillStyle = CATEGORY_COLOR[rarities[i]] || '#fff';
    ctx.beginPath();
    ctx.arc(boxX + pos[0] * boxSize, boxY + pos[1] * boxSize, dotRad, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Recycler: a small recycling-arrows glyph, ringed by one dot per rarity
// currently set to be salvaged (CATEGORY_COLOR) — empty selection (default,
// nothing chosen yet) shows no dots, so it visually reads as a plain belt
// until configured via the E-key popup.
function drawRecyclerIcon(ctx, cx, cy, rarities, pulse, S) {
  ctx.strokeStyle = pulse ? '#d8f0a0' : '#9aca5a';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  const rad = S * 0.19;
  for (let i = 0; i < 3; i++) {
    const a0 = i * (Math.PI * 2 / 3) + game.time * (pulse ? 1.5 : 0);
    const a1 = a0 + Math.PI * 2 / 3 - 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, a0, a1);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  if (rarities.length === 0) return;
  const dotRad = S * 0.36;
  rarities.forEach((cat, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / Math.max(rarities.length, 1));
    ctx.fillStyle = CATEGORY_COLOR[cat] || '#fff';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * dotRad, cy + Math.sin(a) * dotRad, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Smart Router's plate — same footprint as a belt (filled square, dark
// outline) but with no directional chevrons, since this block isn't a
// one-way belt; see drawSmartRouterIcon below for the actual flow glyph.
function drawJunctionBase(ctx, sx, sy, S) {
  ctx.fillStyle = COLORS.belt;
  ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 2.5, sy + 2.5, S - 5, S - 5);
}

// Smart Router: a 3-pronged junction glyph (forward/right/left of its facing)
// reading as "this belt can bail out to either side", unlike the Splitter's
// fixed two-way alternation or the Sorter's fixed size split.
function drawSmartRouterIcon(ctx, cx, cy, dirIdx, S) {
  const dirs = [dirIdx, (dirIdx + 1) % 4, (dirIdx + 3) % 4];
  const len = S * 0.3;
  for (const d of dirs) {
    drawDirArrow(ctx, cx, cy, BELT_DIRS[d], len, '#5ad0e8', 2, 3.5);
  }
  ctx.fillStyle = '#5ad0e8';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();
}

// Helipad-style ring + cross marking shared by both drone pads.
function drawHelipadMarking(ctx, cx, cy, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
  ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
  ctx.stroke();
}

// Small conveyor nub drawn just inside a machine's own tile edge, hinting at
// a physical link wherever a real belt sits on that side — kept within the
// tile's own bounds so the neighboring belt (drawn separately) never has to
// overdraw it.
function drawConveyorStub(ctx, sx, sy, S, side) {
  const stub = 5, w = 8;
  let x, y, rw, rh;
  if (side === 'left')   { x = sx + 1;         y = sy + S / 2 - w / 2; rw = stub; rh = w; }
  if (side === 'right')  { x = sx + S - 1 - stub; y = sy + S / 2 - w / 2; rw = stub; rh = w; }
  if (side === 'top')    { x = sx + S / 2 - w / 2; y = sy + 1;         rw = w; rh = stub; }
  if (side === 'bottom') { x = sx + S / 2 - w / 2; y = sy + S - 1 - stub; rw = w; rh = stub; }

  ctx.fillStyle = COLORS.belt;
  ctx.fillRect(x, y, rw, rh);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x + 0.5, y + 0.5, rw - 1, rh - 1);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.arc(x + rw / 2, y + rh / 2, 1, 0, Math.PI * 2);
  ctx.fill();
}

// One drawn-moving-right orientation, 4-frame loop — rotated per direction
// the same way the Smart Router icon is, instead of needing 4 sprites per
// direction. Frame choice rides the existing beltAnim clock so the animation
// speed/cycle matches the procedural fallback below exactly.
const BELT_FRAME_KEYS = ['belt0', 'belt1', 'belt2', 'belt3', 'belt4', 'belt5'];

// TEMP DEV TOGGLE — set via window.cheat.procBelt(true) in the console to see
// the original procedural fallback for comparison against the sprite. Remove
// once no longer needed.
let DEBUG_FORCE_PROC_BELT = false;

function drawBelt(ctx, dir, sx, sy, S) {
  const frameIdx = Math.floor((beltAnim / TILE_SIZE) * BELT_FRAME_KEYS.length) % BELT_FRAME_KEYS.length;
  const sprite = DEBUG_FORCE_PROC_BELT ? null : IMAGES[BELT_FRAME_KEYS[frameIdx]];
  if (sprite) {
    const angle = Math.atan2(dir.dy, dir.dx);
    ctx.save();
    ctx.translate(sx + S / 2, sy + S / 2);
    ctx.rotate(angle);
    const drawSize = S + 2;
    ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
    return;
  }

  // Base
  ctx.fillStyle = COLORS.belt;
  ctx.fillRect(sx + 2, sy + 2, S - 4, S - 4);

  // Raised edge (slight 3-D feel)
  ctx.fillStyle = COLORS.beltEdge;
  if (dir.dx !== 0) {
    ctx.fillRect(sx + 2, sy + 2,     S - 4, 2);
    ctx.fillRect(sx + 2, sy + S - 4, S - 4, 2);
  } else {
    ctx.fillRect(sx + 2,     sy + 2, 2, S - 4);
    ctx.fillRect(sx + S - 4, sy + 2, 2, S - 4);
  }

  // Roller bolts at the entry/exit edges for a more mechanical look
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  if (dir.dx !== 0) {
    ctx.beginPath(); ctx.arc(sx + 5, sy + S / 2, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + S - 5, sy + S / 2, 1.3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(sx + S / 2, sy + 5, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + S / 2, sy + S - 5, 1.3, 0, Math.PI * 2); ctx.fill();
  }

  // Scrolling chevrons
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx + 3, sy + 3, S - 6, S - 6);
  ctx.clip();

  ctx.strokeStyle = COLORS.beltChevron;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  const step = 11;
  const chevSize = 4; // half-width of chevron arms

  if (dir.dx !== 0) {
    const off = (dir.dx > 0 ? beltAnim : TILE_SIZE - beltAnim) % step;
    const cy = sy + S / 2;
    for (let x = sx - step + off; x < sx + S + step; x += step) {
      const tip = x + 4 * dir.dx;
      ctx.beginPath();
      ctx.moveTo(x, cy - chevSize);
      ctx.lineTo(tip, cy);
      ctx.lineTo(x, cy + chevSize);
      ctx.stroke();
    }
  } else {
    const off = (dir.dy > 0 ? beltAnim : TILE_SIZE - beltAnim) % step;
    const cx = sx + S / 2;
    for (let y = sy - step + off; y < sy + S + step; y += step) {
      const tip = y + 4 * dir.dy;
      ctx.beginPath();
      ctx.moveTo(cx - chevSize, y);
      ctx.lineTo(cx, tip);
      ctx.lineTo(cx + chevSize, y);
      ctx.stroke();
    }
  }

  ctx.lineCap = 'butt';
  ctx.restore();
}

// ─── Fish rendering (interpolated positions) ──────────────────────────────────

function drawAllFish(ctx, c0, c1, r0, r1) {
  // Draw fish on belts at their smooth interpolated world position
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = blockAt(c, r);
      if (!IS_TRANSPORT(id)) continue;
      const st = stateAt(c, r);
      if (!st || !st.item) continue;

      const fish = st.item;
      const p    = fish.progress || 0;
      const { nc, nr } = nextCellFor(c, r, id, st, fish);
      const dir  = { dx: nc - c, dy: nr - r };
      const wx   = (c + 0.5 + dir.dx * p) * TILE_SIZE - cam.x;
      const wy   = (r + 0.5 + dir.dy * p) * TILE_SIZE - cam.y;
      // Idle wiggle gives each belt fish a bit of personality — out of phase
      // with every other fish via its own randomized wigglePhase.
      const wob  = Math.sin(game.time * 4 + (fish.wigglePhase || 0)) * 1.5;
      drawFishSprite(ctx, fish, wx, wy + wob, 22);
    }
  }

  // Machine fish (fixed positions, no interpolation needed)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = blockAt(c, r);
      if (!IS_MACHINE(id)) continue;
      const st = stateAt(c, r);
      if (!st) continue;
      const sx = c * TILE_SIZE - cam.x, sy = r * TILE_SIZE - cam.y;
      const S  = TILE_SIZE;
      if (st.inputItem) drawFishSprite(ctx, st.inputItem, sx + 10,     sy + S / 2, 18);
      if (st.item)      drawFishSprite(ctx, st.item,      sx + S - 10, sy + S / 2, 18);
    }
  }
}

function drawDroneSprite(ctx, cx, cy, pulse) {
  if (IMAGES.drone) {
    const size = pulse ? 30 : 28;
    ctx.drawImage(IMAGES.drone, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  } else {
    ctx.fillStyle = pulse ? '#9fe8ff' : '#5ad0e8';
    ctx.beginPath(); ctx.arc(cx, cy, pulse ? 6 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pulse ? '#dffaff' : '#bdeeff';
    ctx.lineWidth = 1.5;
    for (const [dx, dy] of [[-8,-8],[8,-8],[-8,8],[8,8]]) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 0.7, cy + dy * 0.7); ctx.stroke();
    }
  }
}

// Fixed shipping boat that the Drone Delivery network sends fish to — sits
// at BOAT_C/BOAT_R, a corner of open ocean carveIslandBlob() never reaches.
// Hand-drawn cargo ship — bow points right, stern (with the bridge + drone
// pad) sits at the left so the pad reads as the "delivery window" facing
// back toward the mainland.
function drawBoat(ctx) {
  const cx = (BOAT_C + 0.5) * TILE_SIZE - cam.x;
  const cy = (BOAT_R + 0.5) * TILE_SIZE - cam.y;
  const L = TILE_SIZE * 3.1;   // bow-to-stern length
  const Hh = TILE_SIZE * 0.62; // hull half-height at midship

  const bowX  = cx + L / 2;
  const sternX = cx - L / 2;

  // Gentle wake ripples ahead of the bow — purely decorative, sits under everything
  const t = game.time;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.6 + i * 0.7) % 1;
    const rx = bowX + 6 + phase * 22;
    const ry = cy + Math.sin(i * 2) * 3;
    ctx.globalAlpha = 1 - phase;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 5 + phase * 7, 2 + phase * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ── Hull ──────────────────────────────────────────────────────────────────
  // White upper hull, pointed bow, flat stern, red boot-stripe along the waterline
  ctx.fillStyle = '#d8dce0';
  ctx.beginPath();
  ctx.moveTo(sternX,         cy - Hh);
  ctx.lineTo(bowX - Hh * 0.9, cy - Hh);
  ctx.quadraticCurveTo(bowX + 4, cy - Hh * 0.3, bowX, cy);
  ctx.quadraticCurveTo(bowX + 4, cy + Hh * 0.3, bowX - Hh * 0.9, cy + Hh);
  ctx.lineTo(sternX, cy + Hh);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Red boot-stripe (lower hull band)
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#b8392f';
  ctx.fillRect(sternX, cy + Hh * 0.45, L, Hh);
  ctx.restore();

  // Re-stroke the hull outline on top of the stripe fill for a crisp edge
  ctx.beginPath();
  ctx.moveTo(sternX,         cy - Hh);
  ctx.lineTo(bowX - Hh * 0.9, cy - Hh);
  ctx.quadraticCurveTo(bowX + 4, cy - Hh * 0.3, bowX, cy);
  ctx.quadraticCurveTo(bowX + 4, cy + Hh * 0.3, bowX - Hh * 0.9, cy + Hh);
  ctx.lineTo(sternX, cy + Hh);
  ctx.closePath();
  ctx.stroke();

  // Deck plating, slightly inset from the hull top edge
  ctx.fillStyle = '#9098a0';
  ctx.fillRect(sternX + 2, cy - Hh + 2, L - Hh * 1.3, Hh * 0.4);

  // ── Cargo containers (the "cargo" in cargo ship) ───────────────────────────
  const containerColors = ['#3a7ab8', '#c47a2a', '#4a9a5a', '#b85a8a'];
  const cw = TILE_SIZE * 0.42, ch = Hh * 0.62;
  const containerStartX = cx - L * 0.06;
  for (let i = 0; i < containerColors.length; i++) {
    const bx = containerStartX + i * (cw + 2);
    ctx.fillStyle = containerColors[i];
    ctx.fillRect(bx, cy - Hh + 4, cw, ch);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(bx, cy - Hh + 4, cw, ch);
    // corrugation lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    for (let lx = bx + 3; lx < bx + cw - 1; lx += 4) {
      ctx.beginPath(); ctx.moveTo(lx, cy - Hh + 5); ctx.lineTo(lx, cy - Hh + 3 + ch); ctx.stroke();
    }
  }

  // ── Bridge / wheelhouse at the stern ────────────────────────────────────────
  const bw = TILE_SIZE * 0.66, bh = Hh * 1.5;
  const bx = sternX + 4;
  ctx.fillStyle = '#e8eaec';
  ctx.fillRect(bx, cy - bh / 2, bw, bh);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, cy - bh / 2, bw, bh);
  // bridge windows
  ctx.fillStyle = '#5ad0e8';
  ctx.fillRect(bx + 3, cy - bh / 2 + 3, bw - 6, 5);
  // mast + antenna
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bx + bw / 2, cy - bh / 2);
  ctx.lineTo(bx + bw / 2, cy - bh / 2 - 12);
  ctx.stroke();
  const blink = (Math.sin(t * 5) + 1) / 2 > 0.5;
  ctx.fillStyle = blink ? '#ff5a4a' : '#7a2a22';
  ctx.beginPath(); ctx.arc(bx + bw / 2, cy - bh / 2 - 12, 1.4, 0, Math.PI * 2); ctx.fill();

  // ── Drone pad — clear deck space just forward of the bridge ────────────────
  const padX = bx + bw + TILE_SIZE * 0.55;
  if (IMAGES.dronepad) {
    ctx.drawImage(IMAGES.dronepad, padX - 16, cy - 16, 32, 32);
  } else {
    drawHelipadMarking(ctx, padX, cy, '#5ad0e8');
  }
}

// Cosmetic-only flight: a small drone glyph gliding from a Drone Delivery
// station to the boat right after a sale lands — the payout already
// happened in droneSellFish, so nothing here can affect game state.
function drawDeliveryFlights(ctx) {
  for (const f of deliveryFlights) {
    const dx = BOAT_C - f.fromC, dy = BOAT_R - f.fromR;
    const len = Math.hypot(dx, dy) || 1;
    // Unit vector perpendicular to the flight path, scaled by the flight's
    // fixed random offset — keeps each drone on its own parallel lane.
    const px = -dy / len, py = dx / len;
    const wx = f.fromC + 0.5 + (BOAT_C + 0.5 - f.fromC - 0.5) * f.t;
    const wy = f.fromR + 0.5 + (BOAT_R + 0.5 - f.fromR - 0.5) * f.t;
    const sx = wx * TILE_SIZE - cam.x + px * f.offset;
    const sy = wy * TILE_SIZE - cam.y + py * f.offset;
    drawDroneSprite(ctx, sx, sy, false);
  }
}

// Catch particles — splash (blue/white circles) and sparkle (gold diamonds),
// both fading out over their lifetime. `particles` is the shared array
// maintained by sim.js's spawnParticles/tickParticles.
function drawParticles(ctx) {
  for (const p of particles) {
    const sx = p.x - cam.x, sy = p.y - cam.y;
    const alpha = Math.max(0, 1 - p.life / p.maxLife);
    if (p.kind === 'sparkle') {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(255,215,80,${alpha})`;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    } else {
      ctx.fillStyle = `rgba(180,220,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Drones in flight aren't tied to a single tile, so they're drawn in their
// own full-grid pass rather than from drawBlock (which only fires for the
// tile the pad sits on).
function drawDrones(ctx) {
  for (let r = 0; r < WORLD_ROWS; r++) {
    for (let c = 0; c < WORLD_COLS; c++) {
      if (blockAt(c, r) !== B_DRONE_FISHER) continue;
      const st = stateAt(c, r);
      if (!st || st.waterC === null) continue;

      let wx, wy;
      if (st.dronePhase === DRONE_OUT) {
        wx = c + (st.waterC - c) * st.droneT;
        wy = r + (st.waterR - r) * st.droneT;
      } else if (st.dronePhase === DRONE_FISHING) {
        wx = st.waterC;
        wy = st.waterR + Math.sin(game.time * 6) * 0.08;
      } else if (st.dronePhase === DRONE_BACK) {
        wx = st.waterC + (c - st.waterC) * st.droneT;
        wy = st.waterR + (r - st.waterR) * st.droneT;
      } else {
        continue; // unloading — drawn sitting on the pad in drawBlock
      }

      const sx = (wx + 0.5) * TILE_SIZE - cam.x;
      const sy = (wy + 0.5) * TILE_SIZE - cam.y;
      drawDroneSprite(ctx, sx, sy, false);
    }
  }
}

function drawFishSprite(ctx, fish, cx, cy, size) {
  const img = IMAGES.fishes;
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img,
      fish.sx * FISH_CELL, fish.sy * FISH_CELL, FISH_CELL, FISH_CELL,
      Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  } else {
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size / 2, size / 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Fishing rod ──────────────────────────────────────────────────────────────

// Hand anchor for the rod sprite — set by drawPlayer (called just before
// this) each frame a cast is active, so the rod tracks the actual casting
// hand instead of a separate facing-based guess.
let playerRodHand = null;

function drawFishingRod(ctx) {
  if (!manualCast.active) return;

  // Rod stays anchored to the player (locked in place during a cast).
  const px = player.wx - cam.x;
  const py = player.wy - cam.y;

  // Handle sits at the casting hand; tip extends further out along the same
  // shoulder→hand direction. Falls back to a facing-based guess on the off
  // chance drawPlayer hasn't run yet this frame.
  let rx0, ry0, rx1, ry1;
  if (playerRodHand) {
    rx0 = playerRodHand.x; ry0 = playerRodHand.y;
    const dlen = Math.sqrt(playerRodHand.dirX ** 2 + playerRodHand.dirY ** 2) || 1;
    const ROD_REACH = 40;
    rx1 = rx0 + (playerRodHand.dirX / dlen) * ROD_REACH;
    ry1 = ry0 + (playerRodHand.dirY / dlen) * ROD_REACH;
  } else {
    rx0 = px + 5;  ry0 = py - 6;
    rx1 = px + 20; ry1 = py - 44;
    if (player.facing === 'left') {
      rx0 = px - 5;  ry0 = py - 6;
      rx1 = px - 20; ry1 = py - 44;
    } else if (player.facing === 'up') {
      rx0 = px + 2;  ry0 = py - 8;
      rx1 = px + 6;  ry1 = py - 46;
    } else if (player.facing === 'down') {
      rx0 = px + 5;  ry0 = py - 4;
      rx1 = px + 16; ry1 = py - 28;
    }
  }

  // Bobber sits at the world position that was clicked, not at a fixed
  // offset from the player — bobbing gently in place there.
  const bob = Math.sin(game.time * 5) * 2;
  const bx = manualCast.wx - cam.x + Math.sin(game.time * 1.5) * 1;
  const by = manualCast.wy - cam.y + bob;

  // Line from rod tip → control point → bobber (slight arc). Drawn before the
  // rod sprite below so the rod's art renders on top of it near the tip,
  // instead of the thin line floating visibly over the rod.
  const cpx = (rx1 + bx) / 2 + 6;
  const cpy = (ry1 + by) / 2 - 8;
  ctx.strokeStyle = 'rgba(200,225,255,0.65)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(rx1, ry1);
  ctx.quadraticCurveTo(cpx, cpy, bx, by);
  ctx.stroke();

  // Rod body — drawn from img/rod.png. The sprite's own handle/tip pixel
  // coords (measured directly off the source art) define its intrinsic
  // angle/length, which we rotate+scale to match the handle→tip vector above.
  // The art is shaded as if lit from one side, so facing left also mirrors
  // it horizontally (not just rotates) — a plain rotation would point it the
  // right way but with its shading backwards, reading as flipped on its face.
  const rdx = rx1 - rx0, rdy = ry1 - ry0;
  const rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
  if (IMAGES.rod) {
    const ROD_HANDLE = { x: 10, y: 148 };
    const ROD_TIP    = { x: 55, y: 5 };
    const sdx = ROD_TIP.x - ROD_HANDLE.x, sdy = ROD_TIP.y - ROD_HANDLE.y;
    const spriteLen = Math.sqrt(sdx * sdx + sdy * sdy);
    const scale = rlen / spriteLen;
    const targetAngle = Math.atan2(rdy, rdx);
    const spriteAngle = Math.atan2(sdy, sdx);
    const mirror = player.facing === 'left';
    const angle = mirror ? (Math.PI - spriteAngle - targetAngle) : (targetAngle - spriteAngle);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(rx0, ry0);
    if (mirror) ctx.scale(-1, 1);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(IMAGES.rod, -ROD_HANDLE.x, -ROD_HANDLE.y);
    ctx.restore();
  }

  // Bobber
  ctx.fillStyle = '#cc2222';
  ctx.beginPath(); ctx.arc(bx, by + 1.5, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(bx, by - 1.5, 3, 0, Math.PI * 2); ctx.fill();
  // Bobber reflection
  ctx.fillStyle = 'rgba(150,200,255,0.3)';
  ctx.beginPath(); ctx.ellipse(bx, by + 3, 3, 1, 0, 0, Math.PI * 2); ctx.fill();

  // Cast progress arc around bobber
  const progress = 1 - manualCast.timer / (manualCast.duration || effectiveCastTime());
  ctx.strokeStyle = '#4dca7c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();

  ctx.lineCap = 'butt';
}

// ─── Player ───────────────────────────────────────────────────────────────────

function drawPlayer(ctx) {
  const px  = player.wx - cam.x;
  const py  = player.wy - cam.y;

  // Continuous stride: phase advances smoothly while moving (set in
  // updatePlayer), and walkAmp eases toward 0 on stopping so the motion fades
  // out instead of snapping back to a neutral pose.
  const swing   = Math.sin(player.walkPhase) * player.walkAmp;
  const bob     = Math.abs(Math.sin(player.walkPhase)) * player.walkAmp * 1.2;
  const legSwing = swing * 2.0;
  const armSwing = swing * 1.4;
  const legLift  = Math.max(0, Math.sin(player.walkPhase)) * player.walkAmp; // forward leg lifts slightly off the ground
  const legLiftB = Math.max(0, -Math.sin(player.walkPhase)) * player.walkAmp;

  // Shadow — shrinks a touch on the lift to sell the foot leaving the ground
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(px, py + 10, 8 - player.walkAmp * 0.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — rubber fishing boots (dark olive body, mustard cuff, darker sole),
  // swung from a hip pivot so each leg actually rotates forward/back rather
  // than just stretching in place.
  function drawLeg(hipX, angle, lift) {
    ctx.save();
    ctx.translate(hipX, py + 1 + bob);
    ctx.rotate(angle * 0.06);
    ctx.fillStyle = '#3e4a28';
    ctx.fillRect(-2, -lift, 4, 8);
    ctx.fillStyle = '#7a8a3a';
    ctx.fillRect(-2, -lift, 4, 2);
    ctx.fillStyle = '#1f1f14';
    ctx.fillRect(-2, 6 - lift, 4, 2);
    ctx.restore();
  }
  drawLeg(px - 4, legSwing, legLift);
  drawLeg(px + 4, -legSwing, legLiftB);

  // Body — teal shirt with a khaki fishing vest + chest pockets over top
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(px - 7, py - 14 + bob - 1, 14, 16);
  ctx.fillStyle = '#2a6a78';
  ctx.fillRect(px - 6, py - 14 + bob,    12, 14);
  ctx.fillStyle = '#a8916a';
  ctx.fillRect(px - 6, py - 14 + bob,    12, 14 - 3);
  ctx.fillStyle = '#8a7550';
  ctx.fillRect(px - 5, py - 11 + bob,  3, 3);
  ctx.fillRect(px + 2, py - 11 + bob,  3, 3);

  // Arms — teal sleeves with rolled khaki cuffs, skin below, rotated from the
  // shoulder. Walking uses a subtle swing; casting locks into a fixed
  // two-handed grip-the-rod pose instead of just hanging dead at the sides.
  function drawArm(shoulderX, rot) {
    ctx.save();
    ctx.translate(shoulderX, py - 12 + bob);
    ctx.rotate(rot);
    ctx.fillStyle = '#2a6a78';
    ctx.fillRect(-1.5, 0, 3, 4);
    ctx.fillStyle = '#f0c880';
    ctx.fillRect(-1.5, 4, 3, 4);
    ctx.restore();
  }
  if (manualCast.active) {
    const rodSide = player.facing === 'left' ? -1 : 1;
    const castShoulderX = px + 7.5 * rodSide;
    const castShoulderY = py - 12 + bob;
    const rot = -2.0 * rodSide;
    drawArm(castShoulderX, rot);
    drawArm(px - 7.5 * rodSide, -0.8 * rodSide);
    // Hand (forearm tip, local point (0,8)) in world space, plus the
    // shoulder→hand direction — drawFishingRod anchors the rod sprite here
    // instead of re-deriving its own facing-based offset.
    const hdx = -8 * Math.sin(rot), hdy = 8 * Math.cos(rot);
    playerRodHand = {
      x: castShoulderX + hdx, y: castShoulderY + hdy,
      dirX: hdx, dirY: hdy,
    };
  } else {
    drawArm(px - 7.5, armSwing * 0.3);
    drawArm(px + 7.5, -armSwing * 0.3);
    playerRodHand = null;
  }

  // Head outline + skin
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(px - 5, py - 23 + bob - 1, 10, 10);
  ctx.fillStyle = '#f0d090';
  ctx.fillRect(px - 4, py - 22 + bob,      8,  8);

  // Eyes
  ctx.fillStyle = '#1a1a2a';
  if      (player.facing === 'right') { ctx.fillRect(px + 2, py - 20 + bob, 2, 2); }
  else if (player.facing === 'left')  { ctx.fillRect(px - 4, py - 20 + bob, 2, 2); }
  else if (player.facing === 'up')    {
    ctx.fillRect(px - 2, py - 21 + bob, 2, 2);
    ctx.fillRect(px + 1, py - 21 + bob, 2, 2);
  } else {
    ctx.fillRect(px - 2, py - 19 + bob, 2, 2);
    ctx.fillRect(px + 1, py - 19 + bob, 2, 2);
  }

  // Hat — wide-brim khaki bucket hat with a dark band
  ctx.fillStyle = '#8a7550';
  ctx.fillRect(px - 6, py - 25 + bob, 12, 2);
  ctx.fillStyle = '#a8916a';
  ctx.fillRect(px - 4, py - 28 + bob,  8, 4);
  ctx.fillStyle = '#6e5c3e';
  ctx.fillRect(px - 4, py - 25 + bob,  8, 1.5);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

const cashAnim = { displayed: 0 };
// Screen-space rect of the cash pill, refreshed every frame in drawHUD —
// lets the DOM machines button dock immediately beside it instead of using
// a fixed offset that would drift whenever the cash label's width changes.
const cashPillRect = { right: 0, top: 0, bottom: 0 };

function drawHUD(ctx, canvas) {
  const cw = canvas.width, ch = canvas.height;

  // Smooth cash
  cashAnim.displayed += (game.cash - cashAnim.displayed) * 0.12;
  if (Math.abs(game.cash - cashAnim.displayed) < 0.01) cashAnim.displayed = game.cash;

  // Cash pill
  ctx.font = '13px "Press Start 2P", "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const cashLabel = formatMoney(cashAnim.displayed);
  const tw = ctx.measureText(cashLabel).width;
  const bx = 16, by = ch - 24;
  ctx.fillStyle = 'rgba(8,14,8,0.85)';
  roundRect(ctx, bx - 10, by - 18, tw + 43, 36, 8); ctx.fill();
  cashPillRect.right  = bx - 10 + tw + 43;
  cashPillRect.top    = by - 18;
  cashPillRect.bottom = by + 18;
  if (IMAGES.iconMoney) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMAGES.iconMoney, bx - 6, by - 15, 34, 34);
  } else {
    ctx.fillStyle = '#e8c43f'; ctx.fillText('$', bx, by);
  }
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = '#000000';
  ctx.lineJoin = 'round';
  ctx.strokeText(cashLabel, bx + 19, by);
  ctx.fillStyle = '#70cd18';
  ctx.fillText(cashLabel, bx + 19, by);

  // Corner hints
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(
    buildMode.active
      ? 'Left-click place  |  Right-click remove/cancel  |  [B] Toggle menu'
      : '[B] Build  |  Click water to fish',
    cw - 14, ch - 10
  );

  // Stats pill
  ctx.fillStyle = 'rgba(8,14,8,0.75)';
  roundRect(ctx, cw - 164, 10, 152, 54, 8); ctx.fill();
  ctx.fillStyle = '#8a9a8a';
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`Sold: ${game.fishSold} fish`, cw - 18, 18);
  ctx.fillText(`Lifetime: $${formatMoney(game.lifetimeEarned)}`, cw - 18, 33);
  ctx.fillText(formatTime(game.dayTime), cw - 18, 48);
}

function formatTime(s) {
  const h = Math.floor(s / (DAY_CYCLE_SECONDS / 24));
  return `Day ${Math.floor(game.time / DAY_CYCLE_SECONDS) + 1}  ${String(6 + h % 24).padStart(2, '0')}:00`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,   x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Held fish panel ─────────────────────────────────────────────────────────

function drawHeldFish(ctx, canvas) {
  const count  = heldFish.length;
  const size   = 40, pad = 6;
  const cw = canvas.width, ch = canvas.height;
  const panelW = count > 0 ? count * (size + pad) + pad : 180;
  const panelH = size + 28;
  const px = (cw - panelW) / 2;
  const py = ch - panelH - 14;

  const nearBelt = nearbyBeltTile();

  ctx.fillStyle = 'rgba(8,14,8,0.85)';
  roundRect(ctx, px, py, panelW, panelH, 10); ctx.fill();
  ctx.strokeStyle = count > 0 && nearBelt ? 'rgba(77,202,124,0.7)' : 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, px, py, panelW, panelH, 10); ctx.stroke();

  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = nearBelt && count > 0 ? '#4dca7c' : '#6a8a6a';
  const maxHeld = effectiveMaxHeld();
  ctx.fillText(
    count === 0        ? 'Click water to fish' :
    nearBelt           ? `Hover belt + [E], or click belt to place  (${count}/${maxHeld})` :
                         `Walk to a belt  (${count}/${maxHeld})`,
    px + panelW / 2, py + 5
  );

  for (let i = 0; i < count; i++) {
    drawFishSprite(ctx, heldFish[i], px + pad + i * (size + pad) + size / 2, py + 18 + size / 2, size);
  }
}

// ─── Toasts ──────────────────────────────────────────────────────────────────

function drawToasts(ctx, canvas, dt) {
  let y = canvas.height - 76;
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = toasts[i];
    t.life -= dt;
    if (t.life <= 0) { toasts.splice(i, 1); continue; }
    const alpha = Math.min(1, t.life * 2.5);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(t.msg).width;
    ctx.fillStyle = 'rgba(8,16,8,0.82)';
    roundRect(ctx, 16, y - 14, tw + 22, 28, 6); ctx.fill();
    ctx.fillStyle = t.color;
    ctx.fillText(t.msg, 27, y);
    y -= 34;
    ctx.globalAlpha = 1;
  }
}
