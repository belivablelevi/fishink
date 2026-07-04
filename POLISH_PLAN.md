# Fish Ink — Professional Polish Plan

Written after a full codebase survey. This plan covers everything I intend to change, why, and how much impact it will have. Items are ordered from highest impact to lowest.

---

## Bug Fixes (must do first)

---

### BUG 1 — Night music is permanently broken
**What:** The game tries to play `audio/night-song.wav` when night falls, but that file doesn't exist. It fails silently, so the game goes completely quiet at night.

**Fix:** Replace with a synthesized ambient using Web Audio oscillators — same approach already used for machine "dings". A soft, low drone with gentle movement will fill the night ambience without needing a file.

**Impact:** High — night currently has no sound at all, which feels obviously unfinished.
**Difficulty:** Medium.

---

### BUG 2 — Tab key skips the Blueprints panel
**What:** Pressing Tab while the build menu is open cycles through panels. The Blueprints tab is missing from the cycle list, so keyboard players can never reach it by tabbing.

**Fix:** Add `'blueprints'` to `MENU_TAB_ORDER` in `player.js`.

**Impact:** Low — most players use mouse. But still a real bug.
**Difficulty:** Trivial — one word added to an array.

---

### BUG 3 — Dead placeholder sound file wastes resources
**What:** `sfx-placeholder.m4a` is loaded at startup and holds a DOM `<audio>` element, but is never actually played anywhere in the game.

**Fix:** Remove it from the `SFX_FILES` table in `audio.js`.

**Impact:** Low — tiny performance win and cleaner code.
**Difficulty:** Trivial.

---

### BUG 4 — Pet gacha odds display is wrong
**What:** The Pets panel shows "Common 60%, Uncommon 27%, Rare 10%, Legendary 3.3%" but those are the odds if only axolotls existed. Frogs share the same pool and take up 16.7% of pulls. Actual common axolotl odds are about 50%, not 60%.

**Fix:** Either update the displayed numbers to match reality, or recalculate them dynamically from the actual pool weights.

**Impact:** Medium — this is a honesty/trust issue for players who care about gacha rates.
**Difficulty:** Easy.

---

### BUG 5 — Last gacha pull result stays visible after leaving the Pets tab
**What:** The result carousel from your last pull stays visible every time you reopen the Pets panel, even days later. It's confusing and looks like a bug.

**Fix:** Clear the stored pull result when the Pets panel is closed or when the build menu is closed.

**Impact:** Low — minor confusion.
**Difficulty:** Easy.

---

### BUG 6 — You can only sell frogs by interacting with them in the world
**What:** Axolotls have a sell button right in the Pets panel carousel. Frogs don't — you have to find the frog on the map, walk up to it, and interact with it. This is inconsistent and frustrating.

**Fix:** Add a sell button to each frog entry in the Pets panel, matching how axolotls work.

**Impact:** Medium — inconsistent UX is annoying.
**Difficulty:** Easy.

---

### BUG 7 — Dev password is visible in production code
**What:** `cloud.js` contains the string `'fishink_dev'` with a comment saying "change this before shipping". Anyone who opens DevTools can unlock admin commands including wiping other players' saves.

**Fix:** At minimum, document this in DEVELOPER_ACTIONS.md as a critical pre-launch task. Ideally move the password to a Supabase RLS policy so the client never holds it.

**Impact:** High for security — this is a real risk before launch.
**Difficulty:** Medium.

---

## UI Polish

---

### UI 1 — All panels open and close instantly with no animation
**What:** Every panel in the game (game menu, leaderboard, machines, sound settings, etc.) just snaps on and off using `display:none`. This feels abrupt and cheap compared to how polished games feel.

**Fix:** Add CSS `opacity` + `transform` transitions. Panels fade and slide in over about 120ms. This is fast enough not to feel slow but removes the "snap".

**Impact:** High — this alone makes the game feel noticeably more professional.
**Difficulty:** Medium — need to change all panels from `display:none` to `opacity/pointer-events` approach.

---

### UI 2 — Buttons have no press feedback
**What:** Most buttons in the game have hover states (background colour change) but no "pressed" state. When you click, nothing happens visually until the action fires. A tiny downward press animation makes clicking feel satisfying.

**Fix:** Add `transform: scale(0.95) translateY(1px)` on `:active` for all game buttons. One CSS rule touches all of them.

**Impact:** Medium — small change, noticeable improvement to how the game "feels".
**Difficulty:** Trivial.

---

### UI 3 — Toast notifications pop in/out without easing
**What:** The canvas toast messages (the "+$X fish sold" messages) slide in from the left at a constant speed and fade out linearly. Eased motion feels more natural.

**Fix:** Apply an ease-out entry and ease-in exit to toast position and opacity. Requires a small change to `drawToasts()` in `render.js`.

**Impact:** Medium — toasts appear constantly while playing, so improving them improves the whole game session.
**Difficulty:** Easy.

---

### UI 4 — Research unlocks feel identical to buying a belt
**What:** Buying a research node produces the same generic green toast as placing a concrete block. Research nodes are significant milestones that should feel special.

**Fix:** Use a different toast colour (purple, matching the research panel's accent) and trigger `sfxUpgrade()` instead of `sfxCoin()`.

**Impact:** Medium — players should feel research is important.
**Difficulty:** Trivial.

---

### UI 5 — Achievement unlocks get a small toast, easily missed
**What:** Unlocking an achievement currently shows a standard green toast at the bottom of the screen. Achievements are major milestones and deserve more prominent feedback.

**Fix:** Add a distinct achievement toast — different icon or border, slightly larger, longer display time. Canvas-rendered so no DOM changes needed.

**Impact:** Medium — players should feel rewarded when hitting milestones.
**Difficulty:** Easy.

---

### UI 6 — The stats snapshot card text is too small to read on Discord
**What:** The `renderSnapshotCard()` function renders a 640×320 canvas at the base font size. Text is hard to read when shared as an image.

**Fix:** Scale the canvas 2× and set font sizes accordingly so the exported image reads clearly at Discord's preview size.

**Impact:** Low (marketing/sharing feature).
**Difficulty:** Easy.

---

## Game Feel

---

### FEEL 1 — Night ambient is completely silent
Covered in Bug 1. The fix is synthesized ambient sound, which is also a game-feel improvement.

---

### FEEL 2 — Rare fish catches have no extra screen feedback
**What:** When you catch a Rare or Legendary fish, the game plays a different sound, but there's no visual difference beyond the toast colour. Rare catches should feel exciting.

**Fix:** A brief, subtle screen-edge vignette flash (white or gold, 200ms) when a rare catch lands. Canvas-rendered, purely visual.

**Impact:** Medium — makes rare fish feel exciting to catch.
**Difficulty:** Easy.

---

### FEEL 3 — Prestige reset has no ceremony
**What:** Clicking "Prestige" immediately reloads the page. It's abrupt and anticlimactic for what's supposed to be a major milestone.

**Fix:** Add a brief full-screen fade-out (0.5s) before the reload. The visual pause makes it feel intentional.

**Impact:** Medium — players should feel the weight of a prestige reset.
**Difficulty:** Easy.

---

### FEEL 4 — Cash milestones go unnoticed
**What:** The game tracks `lifetimeEarned` and has an achievement for it, but hitting round numbers like $10,000 or $1,000,000 lifetime earned has no in-game acknowledgement.

**Fix:** Trigger a celebration toast at specific lifetime earning milestones. Simple to implement with a `Set` of already-celebrated amounts checked on each earn.

**Impact:** Medium — gives players moments to feel progress.
**Difficulty:** Easy.

---

## Audio

---

### AUDIO 1 — Machine sounds play on every machine, every cycle
**What:** The `machineDing()` tone fires every time a machine processes a fish. With many machines running, this creates a wall of noise. There's already a suppression system for coin sounds — machines need something similar.

**Fix:** Rate-limit machine dings per machine type, not globally. Each machine type can ding at most once per second. This preserves the rhythm feel without noise overload.

**Impact:** Medium — important for late-game players with lots of machines.
**Difficulty:** Easy.

---

### AUDIO 2 — The coin sound still plays for every auto-fish in some conditions
**What:** There's already a system that suppresses coin sounds when ≥3 auto-fishers are running. But belt auto-sales from auto-fishers with no manual override still produce coin sounds because `sfxCoin()` is called from the machine processing path.

**Fix:** Review all `sfxCoin()` call sites and ensure the suppression logic (`autoFisherCount >= 3`) is consistently applied.

**Impact:** Low — minor audio polish.
**Difficulty:** Easy.

---

## Code Quality

---

### CODE 1 — `getBoundingClientRect()` called every frame
**What:** `drawHUD()` in `render.js` calls `cashHudEl.getBoundingClientRect()` every single frame (60fps) to track the cash pill's position. This forces a layout recalculation each frame.

**Fix:** Cache the rect and only update it when the window resizes. A `ResizeObserver` or a flag on the `resize` event handles this.

**Impact:** Low for performance (browsers batch these well), but it's good practice.
**Difficulty:** Easy.

---

### CODE 2 — `TODO.txt` has stale items
**What:** References features that were already removed (contracts, uncapped delivery flights) or already fixed (save migrations). Outdated docs create confusion.

**Fix:** Clear the outdated items and replace with current open work.

**Impact:** Developer quality of life.
**Difficulty:** Trivial.

---

### CODE 3 — Inline styles in the pet carousel make it hard to maintain
**What:** The pet panel carousel is built entirely from `style.cssText` strings in JavaScript. Changing any visual aspect requires editing JS strings instead of CSS.

**Fix:** Move carousel styles to CSS classes. Low risk — purely aesthetic change.

**Impact:** Developer experience only.
**Difficulty:** Medium (careful — lots of inline styles to move).

---

## Performance

---

### PERF 1 — Belt fish array is iterated multiple times per frame
**What:** `updateBeltFish()` sorts fish twice per frame (positive and negative direction sweeps). With many fish, this is `O(n log n)` per sweep. The fish array is also scanned by `drawAllFish()` and other draw functions.

**Fix:** No immediate concern at current scale, but document for future. Belt fish count typically stays under 200.

**Impact:** Currently negligible.
**Difficulty:** N/A for now.

---

## What I'll Put in DEVELOPER_ACTIONS.md

These are things the code cannot fix without new assets or design decisions:

- Replace/create `night-song.wav` (or keep the synthesized version)
- Replace the icon set (current icons are low-res PNG files)
- Create proper achievement artwork/badges
- Balance review: Prestige Quick Start + cast speed can reach 0ms
- Missing sound effects for several actions (blueprint paste, undo, frog hop, chest open)
- Better water animation (currently just rare single-tile sparkles)
- Consider adding a proper main menu before the loading screen
- dev password must be changed before public launch
