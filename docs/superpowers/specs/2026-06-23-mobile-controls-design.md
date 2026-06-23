# Mobile Touch Controls — Design

## Context

Fish INK Factory's input model is 100% mouse + keyboard: `KEYS{}` (keydown/keyup)
drives movement in `updatePlayer(dt)` (`js/player.js`), and all canvas
interaction (casting the rod, dropping fish on belts, build-mode placement,
opening machine popups via E) goes through `initMouseHandlers` (`mousemove`,
`mousedown`, `mouseup`, `wheel`) plus a continuously-updated `hoverTile`.
There are zero touch event listeners anywhere in the codebase. The user asked
to make the game playable on mobile, scoped explicitly to **movement + core
actions only** (not full touch parity — no pinch-zoom, no touch-specific
rework of the existing DOM build menu, which already works fine with taps).

## Goal

Add touch controls — a virtual joystick for movement plus two action
buttons — without altering any existing mouse/keyboard behavior, by reusing
the existing targeting logic (cast-at-clicked-tile, hover-then-E-interact)
through synthesized mouse events rather than building a parallel touch-aim
system.

## Architecture

A new file, `js/touch.js`, loaded after `js/player.js` and `js/ui.js`. It is
purely additive:

1. Detects touch capability once at load (`IS_TOUCH`) and only creates/shows
   the joystick + button DOM elements when true. Desktop play is untouched.
2. Drives an existing movement vector (`updatePlayer`'s `dx`/`dy`) via a new
   `joystickVector`, requiring a 2-line change in `player.js`.
3. Synthesizes `mousemove`/`mousedown`/`mouseup` calls from canvas touch
   events, so casting, fish-dropping on belts, and build-mode tile-painting
   work exactly as they do today, with no duplicated targeting code.
4. Extracts the bodies of the existing E-interact and B (build-toggle) key
   handlers into standalone functions so both keyboard and the new touch
   buttons call the identical code path.

## Mobile detection

```javascript
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
```

All touch UI creation/wiring in `touch.js` is gated behind `if (IS_TOUCH)`.
If false, `touch.js` does nothing at all.

## Component 1 — Joystick (movement)

- Fixed-position circular base + draggable knob, bottom-left corner, ~110px
  diameter, semi-transparent styling consistent with the existing icon
  buttons (`.machines-toggle-btn` etc. in `style.css`).
- `touchstart` on the joystick base captures that touch's `identifier` and
  calls `e.stopPropagation()` so it never reaches the canvas passthrough.
- `touchmove` for that same identifier computes the offset from the base's
  center, clamps the magnitude to the base radius, and normalizes it into
  `joystickVector = {x, y}` (each in `[-1, 1]`).
- `touchend`/`touchcancel` for that identifier resets `joystickVector = {x:
  0, y: 0}`.
- **`js/player.js` change** (`updatePlayer`, lines 241-242): the `dx`/`dy`
  computation falls back to `joystickVector` when it is non-zero:
  ```javascript
  const kx = ((KEYS['d'] || KEYS['D'] || KEYS['ArrowRight']) ? 1 : 0) - ((KEYS['a'] || KEYS['A'] || KEYS['ArrowLeft']) ? 1 : 0);
  const ky = ((KEYS['s'] || KEYS['S'] || KEYS['ArrowDown'])  ? 1 : 0) - ((KEYS['w'] || KEYS['W'] || KEYS['ArrowUp'])   ? 1 : 0);
  const dx = manualCast.active ? 0 : (kx !== 0 ? kx : joystickVector.x);
  const dy = manualCast.active ? 0 : (ky !== 0 ? ky : joystickVector.y);
  ```
  `joystickVector` defaults to `{x: 0, y: 0}` in `touch.js`, declared with
  `var` (or attached to `window`) so it's safely readable even when
  `touch.js` hasn't run any touch logic yet (always defined, since the file
  always loads — only the DOM/listeners are gated by `IS_TOUCH`).

## Component 2 — Canvas touch passthrough (aiming/casting/build)

On `canvas`, `touch.js` adds (only when `IS_TOUCH`):

- `touchstart`: for a touch starting on the canvas (not already claimed by
  the joystick or buttons), build a synthetic event `{ clientX, clientY,
  target: canvas, button: 0, preventDefault(){} }` from
  `e.touches[0]` (or the relevant `e.changedTouches[0]`), then call
  `handleMouseMove(synthetic)` followed by `handleClick(synthetic)`. Call
  `e.preventDefault()` on the real touch event to suppress scrolling.
- `touchmove`: same synthesis, calling only `handleMouseMove(synthetic)` —
  this is what makes build-mode drag-painting (`paintBuildTile`) work under
  touch, identical to a mouse drag.
- `touchend`: synthesize and call `handleMouseUp(synthetic)`.
- `canvas` gets `touch-action: none` in `style.css` (only matters on touch
  devices) so the browser doesn't intercept these as native scroll/zoom
  gestures.

No changes to `handleClick`, `handleMouseMove`, `handleMouseUp`, or
`hoverTile` themselves — they already work off plain `{clientX, clientY,
button}`-shaped input.

## Component 3 — Action buttons

Two buttons, bottom-right, stacked above the existing corner icon buttons,
styled like `.machines-toggle-btn`:

- **Interact button** — calls `triggerInteract()`, a new function in
  `js/player.js` containing exactly the body currently inside
  `updatePlayer`'s `if (eDown && !player._eWas && !buildMode.active)` block
  (lines 277-289), so it operates on whatever `hoverTile` currently is
  (set by the most recent canvas tap from Component 2). The keydown-driven
  E logic in `updatePlayer` calls the same `triggerInteract()` instead of
  inlining the block.
- **Build button** — calls `triggerBuildToggle()`, a new function in
  `js/player.js` containing exactly the body of `handleBuildKey`'s `'b'`/`'B'`
  branch (lines 123-134). The `'b'`/`'B'` branch in `handleBuildKey` calls
  this same function instead of inlining the logic.

Both extractions are pure refactors (move code into a named function, call
it from the original site) — behavior for keyboard users is unchanged.

## Data flow summary

```
Touch on joystick      → joystickVector{x,y} → updatePlayer() dx/dy fallback
Touch on canvas        → synthetic mouse events → existing handleClick / handleMouseMove / handleMouseUp (cast, drop fish, build-paint)
Tap Interact button    → triggerInteract() → existing E-interact logic (using last-set hoverTile)
Tap Build button       → triggerBuildToggle() → existing B-key build-mode-toggle logic
```

## Edge cases / out of scope

- Multi-touch is handled only to the extent that the joystick claims one
  `identifier` and ignores others — simultaneous joystick + canvas-tap is
  supported (e.g., walk while also tapping to interact), but no gestures
  beyond single-finger-per-control are implemented.
- No pinch-zoom or two-finger pan — explicitly out of scope per the agreed
  "movement + core actions only" boundary. `wheel`-based zoom remains
  desktop-only.
- No special tap hit-radius widening for small tiles — at the default zoom
  (2.0x) tiles should be tappable; revisit only if testing shows otherwise.
- The existing DOM build menu (tabs, swatches, buttons) needs no touch-
  specific work — taps on `<button>` elements already work natively.

## Files touched

- **New:** `js/touch.js` — joystick, buttons, canvas touch passthrough, all
  gated behind `IS_TOUCH`.
- **Modify:** `js/player.js` — `updatePlayer`'s `dx`/`dy` joystick fallback;
  extract `triggerInteract()` and `triggerBuildToggle()` from existing
  inline blocks in `updatePlayer` and `handleBuildKey` respectively (pure
  refactor, both original call sites updated to call the new functions).
- **Modify:** `index.html` — add the script tag for `js/touch.js` (after
  `player.js`/`ui.js`), and the joystick/button DOM markup (created by
  `touch.js` at runtime is also acceptable — implementation plan decides
  which, consistent with how other overlays like the sound/machines panels
  are currently declared statically in `index.html`).
- **Modify:** `style.css` — joystick base/knob styles, action button styles
  (reusing existing icon-button visual language), `touch-action: none` on
  `#canvas`.

## Testing (manual, in-browser — no test harness in this codebase)

1. `node -c` every changed/new `.js` file.
2. On a touch device (or Chrome DevTools device-mode touch emulation):
   joystick drag in each of the 8 directions moves the player correctly and
   updates `facing`; releasing the joystick stops movement.
3. Tap a water tile within rod range while not in build mode — casts, same
   as a mouse click; tap one out of range — "Too far to cast!" toast, same
   as desktop.
4. Tap a belt tile while holding fish — drops fish on the belt.
5. Enable build mode (Build button), tap-drag across several tiles — places
   the selected block on each (same as mouse drag-painting); tap the Build
   button again — exits build mode (same as pressing B twice).
6. Tap a machine, then tap the Interact button — opens its popup, same as
   hover+E on desktop.
7. Confirm desktop mouse/keyboard play is unaffected (no regressions) by
   testing the same flows with a mouse on a non-touch browser window.
