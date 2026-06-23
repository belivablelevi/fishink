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

// Called once from main.js's init(), after the canvas element exists.
function initTouchControls(canvasEl) {
  if (!IS_TOUCH) return;
  createJoystick();
  initCanvasTouchPassthrough(canvasEl);
}
