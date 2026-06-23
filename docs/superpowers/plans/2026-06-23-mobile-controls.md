# Mobile Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fish INK Factory playable on touch devices — a virtual joystick for movement plus two action buttons (Interact, Build) — without altering any existing mouse/keyboard behavior.

**Architecture:** A new `js/touch.js` is purely additive: it detects touch capability once, and (only on touch devices) creates a joystick that feeds the existing movement vector, synthesizes mouse events from canvas touches so all existing click/hover-based targeting (casting, fish-dropping, build-painting) works unmodified, and adds two buttons that call two small functions extracted from the existing E-key and B-key handlers in `js/player.js`.

**Tech Stack:** Plain JS, no build step, no framework. No automated test harness exists in this codebase — verification is `node -c` syntax checks plus manual in-browser testing, matching the existing project convention (see recent leaderboard/start-screen work).

## Global Constraints

- No build step — plain `<script>` tags loaded in a fixed order in `index.html`.
- Desktop mouse/keyboard behavior must be 100% unaffected — every new code path is gated behind `IS_TOUCH` or is a behavior-preserving refactor.
- Touch scope is movement + core actions only: no pinch-zoom, no two-finger gestures, no touch-specific rework of the existing DOM build menu (taps on `<button>` elements already work).
- Reuse existing targeting logic (`handleMouseMove`, `handleClick`, `handleMouseUp`, `hoverTile`) via synthesized events — do not build a parallel touch-aim/targeting system.
- Match existing visual style: dark translucent panels using `var(--c-border)`, `rgba(10,18,16, 0.7–0.97)` backgrounds, `var(--font-ui)` font, consistent with `.sound-toggle-btn`/`.machines-panel` in `style.css`.
- After each task: run `node -c` on every changed `.js` file, then do the manual browser check listed in that task.

---

## File Structure

- **Modify `js/player.js`** — extract `triggerInteract()` and `triggerBuildToggle()` from inline key-handler blocks (Task 1); add the joystick fallback to `updatePlayer`'s movement vector (Task 2).
- **Create `js/touch.js`** — `IS_TOUCH` detection, `joystickVector`, `initTouchControls(canvasEl)`, joystick creation/drag logic, action-button creation/wiring, canvas touch-event passthrough. Loaded after `js/ui.js` (needs `triggerInteract`/`triggerBuildToggle` and the mouse handlers from `player.js`, plus DOM helpers conceptually grouped with `ui.js`), before `js/undo.js`.
- **Modify `index.html`** — add `<script src="js/touch.js"></script>`; no other markup changes (joystick/buttons are created at runtime by `touch.js`).
- **Modify `js/main.js`** — call `initTouchControls(canvas);` in `init()`, right after `initMouseHandlers(canvas);`.
- **Modify `style.css`** — `.touch-joystick-base`, `.touch-joystick-knob`, `.touch-action-btn` (+ per-button position rules), and `touch-action: none` on `#canvas`.

---

### Task 1: Extract `triggerInteract()` and `triggerBuildToggle()` in player.js

Pure refactor — moves two existing inline blocks into named functions called from their original call sites. No behavior change for keyboard play. This must land first so Task 5's buttons have something to call.

**Files:**
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\player.js:96-182` (`handleBuildKey`, the `'b'`/`'B'` branch at lines 123-134)
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\player.js:240-292` (`updatePlayer`, the E-key block at lines 276-291)

**Interfaces:**
- Produces: `triggerInteract()` — no params, no return. Runs the popup-open/fish-drop logic against the current `hoverTile`.
- Produces: `triggerBuildToggle()` — no params, no return. Toggles `buildMode.active`/`buildMode.menuOpen` exactly like pressing B.

- [ ] **Step 1: Extract the B-key block into `triggerBuildToggle()`**

In `js/player.js`, find this block inside `handleBuildKey` (currently lines 123-134):

```javascript
  if (e.key === 'b' || e.key === 'B') {
    // First press enters build mode and opens the menu. While still active,
    // B just toggles the menu panel — placing stays usable with it closed.
    if (!buildMode.active) {
      buildMode.active = true;
      buildMode.menuOpen = true;
    } else {
      buildMode.menuOpen = !buildMode.menuOpen;
    }
    setBuildMenuOpen(buildMode.menuOpen);
    closeBlockPopup();
    return;
  }
```

Replace it with:

```javascript
  if (e.key === 'b' || e.key === 'B') {
    triggerBuildToggle();
    return;
  }
```

Then add the new function directly above `function handleBuildKey(e) {`:

```javascript
// Enters build mode and opens the menu on first call; while build mode is
// already active, just toggles the menu panel — placing stays usable with
// it closed. Shared by the B key and the mobile Build button.
function triggerBuildToggle() {
  if (!buildMode.active) {
    buildMode.active = true;
    buildMode.menuOpen = true;
  } else {
    buildMode.menuOpen = !buildMode.menuOpen;
  }
  setBuildMenuOpen(buildMode.menuOpen);
  closeBlockPopup();
}

```

- [ ] **Step 2: Extract the E-key block into `triggerInteract()`**

In `js/player.js`, find this block inside `updatePlayer` (currently lines 269-291):

```javascript
  // E key — interacts with whatever block the mouse is hovering: opens its
  // popup (settings/upgrade), or drops held fish if hovering a belt. Popups
  // (including the per-instance upgrade buy) open from anywhere on the map,
  // no need to stand next to the block — only fish-dropping still requires
  // being in reach, since that's physically handing fish to a belt. Falls
  // back to a small player-radius search for fish-dropping only, so you
  // don't need pixel-precise aim just to unload.
  const eDown = !!(KEYS['e'] || KEYS['E']);
  if (eDown && !player._eWas && !buildMode.active) {
    const pc = Math.floor(player.wx / TILE_SIZE);
    const pr = Math.floor(player.wy / TILE_SIZE);
    const inReach = hoverTile && Math.abs(hoverTile.c - pc) <= 1 && Math.abs(hoverTile.r - pr) <= 1;
    const hoveredId = hoverTile ? blockAt(hoverTile.c, hoverTile.r) : B_NONE;
    const kind = interactionKindFor(hoveredId);
    if (kind) {
      toggleBlockPopupAtMouse(kind, hoverTile.c, hoverTile.r);
    } else if (inReach && IS_TRANSPORT(hoveredId) && heldFish.length > 0) {
      dropHeldFishOnBelt(hoverTile.c, hoverTile.r);
    } else if (heldFish.length > 0) {
      dropNearestBelt();
    }
  }
  player._eWas = eDown;
```

Replace it with:

```javascript
  // E key — interacts with whatever block the mouse is hovering. See
  // triggerInteract() for the full behavior; shared with the mobile
  // Interact button.
  const eDown = !!(KEYS['e'] || KEYS['E']);
  if (eDown && !player._eWas && !buildMode.active) {
    triggerInteract();
  }
  player._eWas = eDown;
```

Then add the new function directly above `function updatePlayer(dt) {`:

```javascript
// Interacts with whatever block hoverTile currently points at: opens its
// popup (settings/upgrade), or drops held fish if hovering a belt. Popups
// (including the per-instance upgrade buy) open from anywhere on the map,
// no need to stand next to the block — only fish-dropping still requires
// being in reach, since that's physically handing fish to a belt. Falls
// back to a small player-radius search for fish-dropping only, so you
// don't need pixel-precise aim just to unload. Shared by the E key and the
// mobile Interact button.
function triggerInteract() {
  const pc = Math.floor(player.wx / TILE_SIZE);
  const pr = Math.floor(player.wy / TILE_SIZE);
  const inReach = hoverTile && Math.abs(hoverTile.c - pc) <= 1 && Math.abs(hoverTile.r - pr) <= 1;
  const hoveredId = hoverTile ? blockAt(hoverTile.c, hoverTile.r) : B_NONE;
  const kind = interactionKindFor(hoveredId);
  if (kind) {
    toggleBlockPopupAtMouse(kind, hoverTile.c, hoverTile.r);
  } else if (inReach && IS_TRANSPORT(hoveredId) && heldFish.length > 0) {
    dropHeldFishOnBelt(hoverTile.c, hoverTile.r);
  } else if (heldFish.length > 0) {
    dropNearestBelt();
  }
}

```

- [ ] **Step 3: Syntax check**

Run: `node -c js/player.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Manual regression check in browser**

Open `index.html` in a browser (or `npx serve .` and open the served URL).
- Press `B` — build mode and menu open exactly as before; press `B` again — menu closes (build mode stays active, matching existing behavior); press `Escape` — fully exits build mode.
- Hover a placed machine and press `E` — its popup opens exactly as before.
- Hold fish, hover a belt, press `E` — fish drops onto the belt as before.

- [ ] **Step 5: Commit**

```bash
git add js/player.js
git commit -m "Extract triggerInteract/triggerBuildToggle for reuse by mobile controls"
```

---

### Task 2: Touch detection + joystick movement fallback

Adds `js/touch.js` with `IS_TOUCH` detection and `joystickVector`, wires the file into `index.html` and `main.js`, and gives `updatePlayer`'s movement vector a joystick fallback. On desktop this is a no-op (`joystickVector` stays `{x:0,y:0}`).

**Files:**
- Create: `C:\Users\Jacob\Documents\FishInk\factory\js\touch.js`
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\player.js:241-242` (inside `updatePlayer`)
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\index.html` (script tag)
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\main.js` (call `initTouchControls`)

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `IS_TOUCH` (boolean), `joystickVector` (`{x: number, y: number}`, each in `[-1, 1]`), `initTouchControls(canvasEl)` — called once from `main.js`'s `init()`; no-ops entirely when `!IS_TOUCH`. Task 3 and Task 4 will extend `initTouchControls` and add more functions to this same file.

- [ ] **Step 1: Create `js/touch.js`**

```javascript
// Fish INK Factory — touch controls (joystick + action buttons + canvas
// passthrough).
//
// Entirely additive: when IS_TOUCH is false (desktop), this file creates
// nothing and wires nothing. Movement reuses the same dx/dy vector the
// keyboard already drives in updatePlayer (js/player.js); canvas taps
// synthesize the existing mouse handlers so casting, build-mode painting,
// and fish-dropping need no new targeting logic.

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Normalized movement input from the joystick, each axis in [-1, 1].
// Read by updatePlayer() in player.js as a fallback when no movement key
// is held. Stays {0,0} forever on desktop.
let joystickVector = { x: 0, y: 0 };

// Called once from main.js's init(), after the canvas element exists.
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
}
```

- [ ] **Step 2: Add the joystick fallback to `updatePlayer`'s movement vector**

In `js/player.js`, find these two lines (currently lines 241-242):

```javascript
  const dx = manualCast.active ? 0 : ((KEYS['d'] || KEYS['D'] || KEYS['ArrowRight']) ? 1 : 0) - ((KEYS['a'] || KEYS['A'] || KEYS['ArrowLeft'])  ? 1 : 0);
  const dy = manualCast.active ? 0 : ((KEYS['s'] || KEYS['S'] || KEYS['ArrowDown'])  ? 1 : 0) - ((KEYS['w'] || KEYS['W'] || KEYS['ArrowUp'])    ? 1 : 0);
```

Replace them with:

```javascript
  const kx = ((KEYS['d'] || KEYS['D'] || KEYS['ArrowRight']) ? 1 : 0) - ((KEYS['a'] || KEYS['A'] || KEYS['ArrowLeft'])  ? 1 : 0);
  const ky = ((KEYS['s'] || KEYS['S'] || KEYS['ArrowDown'])  ? 1 : 0) - ((KEYS['w'] || KEYS['W'] || KEYS['ArrowUp'])    ? 1 : 0);
  // On touch devices joystickVector carries movement instead of key state;
  // it stays {0,0} on desktop, so keyboard input always wins when present
  // and this is a no-op there.
  const dx = manualCast.active ? 0 : (kx !== 0 ? kx : joystickVector.x);
  const dy = manualCast.active ? 0 : (ky !== 0 ? ky : joystickVector.y);
```

- [ ] **Step 3: Wire the script tag into `index.html`**

In `index.html`, find:

```html
  <script src="js/ui.js"></script>
  <script src="js/undo.js"></script>
```

Replace with:

```html
  <script src="js/ui.js"></script>
  <script src="js/touch.js"></script>
  <script src="js/undo.js"></script>
```

- [ ] **Step 4: Call `initTouchControls` from `main.js`**

In `js/main.js`, find (inside `init()`):

```javascript
  if (hasSave()) { loadGame(); } else { buildWorld(); resetPlayerSpawn(); }
  initMouseHandlers(canvas);
```

Replace with:

```javascript
  if (hasSave()) { loadGame(); } else { buildWorld(); resetPlayerSpawn(); }
  initMouseHandlers(canvas);
  initTouchControls(canvas);
```

- [ ] **Step 5: Syntax check**

Run: `node -c js/touch.js && node -c js/player.js && node -c js/main.js`
Expected: no output (syntax OK for all three).

- [ ] **Step 6: Manual regression check in browser**

Open `index.html` in a desktop browser. Confirm: the game loads with no console errors, and WASD/arrow-key movement works exactly as before (since `joystickVector` is always `{0,0}` on desktop, this change must be invisible there).

- [ ] **Step 7: Commit**

```bash
git add js/touch.js js/player.js index.html js/main.js
git commit -m "Add touch detection and joystick fallback to movement vector"
```

---

### Task 3: Joystick UI and drag handling

Adds the visible joystick (only on touch devices) that drives `joystickVector` from Task 2.

**Files:**
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\touch.js`
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\style.css`

**Interfaces:**
- Consumes: `joystickVector` (Task 2, read-write — this task writes to it), `IS_TOUCH` (Task 2).
- Produces: `createJoystick()`, called from `initTouchControls`.

- [ ] **Step 1: Add joystick styles to `style.css`**

Append to the end of `style.css`:

```css
.touch-joystick-base {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 40;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: rgba(10,18,16,0.7);
  border: 1px solid var(--c-border);
  touch-action: none;
}
.touch-joystick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48px;
  height: 48px;
  margin: -24px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
  border: 1px solid var(--c-border);
  pointer-events: none;
}
```

- [ ] **Step 2: Implement `createJoystick()` in `js/touch.js`**

Add to `js/touch.js`, above `initTouchControls`:

```javascript
let joystickTouchId = null;
const JOYSTICK_RADIUS = 55; // px — must match half of .touch-joystick-base's width/height

function createJoystick() {
  const base = document.createElement('div');
  base.className = 'touch-joystick-base';
  const knob = document.createElement('div');
  knob.className = 'touch-joystick-knob';
  base.appendChild(knob);
  document.body.appendChild(base);

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function findOwnTouch(touchList) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === joystickTouchId) return touchList[i];
    }
    return null;
  }

  base.addEventListener('touchstart', e => {
    if (joystickTouchId !== null) return;
    joystickTouchId = e.changedTouches[0].identifier;
    e.preventDefault();
  }, { passive: false });

  base.addEventListener('touchmove', e => {
    const t = findOwnTouch(e.changedTouches);
    if (!t) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(dist, JOYSTICK_RADIUS);
    dx = (dx / dist) * clamped;
    dy = (dy / dist) * clamped;
    setKnob(dx, dy);
    joystickVector = { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS };
    e.preventDefault();
  }, { passive: false });

  function endTouch(e) {
    const t = findOwnTouch(e.changedTouches);
    if (!t) return;
    joystickTouchId = null;
    joystickVector = { x: 0, y: 0 };
    setKnob(0, 0);
  }
  base.addEventListener('touchend', endTouch);
  base.addEventListener('touchcancel', endTouch);
}
```

- [ ] **Step 3: Call `createJoystick()` from `initTouchControls`**

In `js/touch.js`, change:

```javascript
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
}
```

to:

```javascript
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
  createJoystick();
}
```

- [ ] **Step 4: Syntax check**

Run: `node -c js/touch.js`
Expected: no output.

- [ ] **Step 5: Manual check using touch emulation**

In Chrome DevTools, open device-mode (Ctrl+Shift+M) and pick a touch-capable device preset, then reload the page.
- A circular joystick appears bottom-left.
- Dragging the knob in each of the 8 directions moves the player correctly on screen and updates which way the player sprite faces.
- Releasing the touch snaps the knob back to center and stops player movement.
- Resize the browser back to a normal desktop window (no device emulation) and confirm the joystick does not appear and keyboard movement still works.

- [ ] **Step 6: Commit**

```bash
git add js/touch.js style.css
git commit -m "Add joystick UI and drag handling for touch movement"
```

---

### Task 4: Canvas touch passthrough (casting, fish-dropping, build-painting)

Synthesizes the existing mouse handlers from canvas touch events so all existing tap-based interactions work without new targeting logic.

**Files:**
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\touch.js`
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\style.css`

**Interfaces:**
- Consumes: `handleMouseMove(e)`, `handleClick(e)`, `handleMouseUp(e)` (all `js/player.js`, each reading `e.clientX`/`e.clientY`/`e.target`/`e.button`), `IS_TOUCH` (Task 2).
- Produces: `initCanvasTouchPassthrough(canvasEl)`, called from `initTouchControls`.

- [ ] **Step 1: Add `touch-action: none` to `#canvas` in `style.css`**

In `style.css`, find:

```css
#canvas {
  display: block;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  image-rendering: pixelated;
}
```

Replace with:

```css
#canvas {
  display: block;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  image-rendering: pixelated;
  touch-action: none;
}
```

- [ ] **Step 2: Implement `initCanvasTouchPassthrough()` in `js/touch.js`**

Add to `js/touch.js`, above `initTouchControls`:

```javascript
// Converts a Touch into the {clientX, clientY, target, button, preventDefault}
// shape handleMouseMove/handleClick/handleMouseUp already expect from a
// MouseEvent, so canvas taps reuse all existing targeting logic untouched.
function synthesizeMouseEvent(touch, canvasEl) {
  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: canvasEl,
    button: 0,
    preventDefault() {},
  };
}

function initCanvasTouchPassthrough(canvasEl) {
  canvasEl.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    handleMouseMove(synthesizeMouseEvent(t, canvasEl));
    handleClick(synthesizeMouseEvent(t, canvasEl));
    e.preventDefault();
  }, { passive: false });

  canvasEl.addEventListener('touchmove', e => {
    const t = e.changedTouches[0];
    handleMouseMove(synthesizeMouseEvent(t, canvasEl));
    e.preventDefault();
  }, { passive: false });

  canvasEl.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    handleMouseUp(synthesizeMouseEvent(t, canvasEl));
    e.preventDefault();
  }, { passive: false });
}
```

- [ ] **Step 3: Call `initCanvasTouchPassthrough()` from `initTouchControls`**

In `js/touch.js`, change:

```javascript
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
  createJoystick();
}
```

to:

```javascript
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
  createJoystick();
  initCanvasTouchPassthrough(canvasEl);
}
```

- [ ] **Step 4: Syntax check**

Run: `node -c js/touch.js`
Expected: no output.

- [ ] **Step 5: Manual check using touch emulation**

In Chrome DevTools device-mode (touch emulation enabled):
- Tap a water tile within rod range (not in build mode) — the rod casts, identical to a desktop mouse click.
- Tap a water tile out of range — the "Too far to cast!" toast appears, identical to desktop.
- Catch a fish, then tap a belt tile — the fish drops onto the belt.
- Enter build mode (still via keyboard `B`, or DevTools-injected click on the existing build button — the mobile Build button itself is Task 5), then tap-and-drag across several tiles — each tile gets the selected block placed, identical to mouse drag-painting.
- Confirm the page does not scroll/zoom while tapping/dragging on the canvas.
- Switch off device emulation (plain desktop) and confirm mouse clicking/casting/dragging all still work exactly as before.

- [ ] **Step 6: Commit**

```bash
git add js/touch.js style.css
git commit -m "Add canvas touch passthrough for casting, fish-dropping, and build-painting"
```

---

### Task 5: Interact and Build action buttons

Adds the two on-screen buttons and wires them to the functions extracted in Task 1.

**Files:**
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\js\touch.js`
- Modify: `C:\Users\Jacob\Documents\FishInk\factory\style.css`

**Interfaces:**
- Consumes: `triggerInteract()`, `triggerBuildToggle()` (both `js/player.js`, Task 1), `IS_TOUCH` (Task 2).
- Produces: `createActionButtons()`, called from `initTouchControls`. This is the final piece of the feature — no later task depends on it.

- [ ] **Step 1: Add action-button styles to `style.css`**

Append to the end of `style.css`:

```css
.touch-action-btn {
  position: fixed;
  z-index: 40;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  appearance: none;
  border: 1px solid var(--c-border);
  background: rgba(10,18,16,0.85);
  color: var(--c-text);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
}
.touch-action-btn:active { background: rgba(255,255,255,0.15); }
#touchInteractBtn { right: 24px; bottom: 100px; }
#touchBuildBtn    { right: 24px; bottom: 24px; }
```

- [ ] **Step 2: Implement `createActionButtons()` in `js/touch.js`**

Add to `js/touch.js`, above `initTouchControls`:

```javascript
function createActionButtons() {
  const interactBtn = document.createElement('button');
  interactBtn.id = 'touchInteractBtn';
  interactBtn.className = 'touch-action-btn';
  interactBtn.textContent = 'Interact';
  interactBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    triggerInteract();
  });
  document.body.appendChild(interactBtn);

  const buildBtn = document.createElement('button');
  buildBtn.id = 'touchBuildBtn';
  buildBtn.className = 'touch-action-btn';
  buildBtn.textContent = 'Build';
  buildBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    triggerBuildToggle();
  });
  document.body.appendChild(buildBtn);
}
```

- [ ] **Step 3: Call `createActionButtons()` from `initTouchControls`**

In `js/touch.js`, change:

```javascript
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
  createJoystick();
  initCanvasTouchPassthrough(canvasEl);
}
```

to:

```javascript
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
  createJoystick();
  initCanvasTouchPassthrough(canvasEl);
  createActionButtons();
}
```

- [ ] **Step 4: Syntax check**

Run: `node -c js/touch.js`
Expected: no output.

- [ ] **Step 5: Manual check using touch emulation**

In Chrome DevTools device-mode (touch emulation enabled):
- Two round buttons ("Interact", "Build") appear bottom-right, stacked, not overlapping the joystick or each other.
- Tap a machine tile (sets `hoverTile` via the Task 4 passthrough), then tap the Interact button — its popup opens, identical to hover+E on desktop.
- Tap the Build button — build mode and its menu open, identical to pressing B; tap it again — the menu closes (build mode stays active), matching existing B-key behavior.
- Tapping either button does not also trigger a canvas tap underneath it (the buttons sit outside the canvas in the DOM, so this should already hold — confirm visually that nothing gets placed/cast at the button's screen position).
- Switch off device emulation and confirm the buttons do not appear on desktop, and keyboard E/B still work exactly as before.

- [ ] **Step 6: Commit**

```bash
git add js/touch.js style.css
git commit -m "Add Interact and Build action buttons for touch controls"
```

---

## Self-Review Notes

- **Spec coverage:** Mobile detection (Task 2) ✓, joystick (Task 2 vector + Task 3 UI) ✓, canvas touch passthrough for cast/drop/build-paint (Task 4) ✓, Interact/Build buttons via extracted functions (Task 1 + Task 5) ✓, `touch-action: none` (Task 4) ✓, desktop-untouched guarantee (every task's manual check includes a desktop regression pass) ✓.
- **Placeholder scan:** no TBD/TODO; every step has complete code.
- **Type consistency:** `joystickVector` is `{x, y}` everywhere it's introduced (Task 2) and consumed (Task 3); `initTouchControls(canvasEl)` keeps the same single-parameter signature across Tasks 2-5 as functions are added to its body; `triggerInteract`/`triggerBuildToggle` (Task 1) take no arguments and are called identically from both the keyboard handlers and the Task 5 buttons.
