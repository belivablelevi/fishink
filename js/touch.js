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
