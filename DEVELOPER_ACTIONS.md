# Fish Ink — Developer Actions Required

These are things the code alone cannot fix. Each one needs artwork, a design decision, or manual work from you.

---

## CRITICAL

---

### Change the dev password before launch

**Where:** `js/cloud.js`, line 126

**What's wrong:** The string `'fishink_dev'` is visible to anyone who opens DevTools. They can call `dev.auth('fishink_dev')` and then `dev.wipe('username')` to erase any player's save.

**What to do:** Change the password to something that isn't in the public repository, and ideally move the admin tools to a private backend endpoint that only you can call. At minimum, change the string and do not commit the new value to a public repo.

**Why it matters:** This is a real moderation risk. Any user can become an admin.

**Priority:** Critical (before public launch)

---

## HIGH

---

### Fix the Prestige Quick Start balance issue

**Where:** `js/prestige.js` — `prestigeSpeedMult()`

**What's wrong:** The formula is `1 - prestigeLevels.fasterStart * 0.10`. At max level 10, this returns `0.0`, which means catch time and machine processing time become `0ms` — instant catches forever.

**What to do:** Either cap the speed multiplier at a minimum (e.g. `0.05` = 95% faster) or reduce the per-level gain so the theoretical minimum stays above zero. Suggested fix: change `0.10` to `0.08` so max gives 80% faster (0.2 multiplier).

**Why it matters:** Currently a max-prestige player gets instant fish — breaks game balance.

**Priority:** High

---

### Replace the icon set with higher-resolution versions

**Where:** `img/icon-cog.png`, `img/icon-volume.png`, `img/icon-machines.png`, `img/icon-money.png`

**What's wrong:** The current icons are very small pixel-art PNGs. On Retina/high-DPI screens they look blurry or pixelated in an unintentional way (the UI is not pixel-art, only the game world is).

**What to do:** Create or source clean SVG icons, or 2× PNG icons for:
- Sound/volume toggle
- Settings/gear
- Machines overview
- Dollar/money badge

Recommended style: simple, clean line icons matching the dark UI aesthetic. The existing color scheme uses `#6a7a8a` for inactive and `#e0e8f0` for active.

**Why it matters:** First impressions — the top bar buttons look low quality on modern screens.

**Priority:** High

---

### Create proper achievement artwork or badges

**Where:** Achievement cards in the Stats panel (`js/ui.js` — `renderStatsPanel()`)

**What's wrong:** Achievements display as text-only rows with colored bullets. There are no icons or badge graphics.

**What to do:** Create 14 small icon images (32×32 or 48×48 px) — one per achievement. Suggested categories: fishing rod (catch), fish pile (sell), rare fish (rare catch), factory gears (automation), microscope (research), star (prestige). These would be displayed beside each achievement card.

**Why it matters:** Achievements are a main progression pillar and currently feel flat.

**Priority:** High

---

## MEDIUM

---

### Add missing sound effects

**Where:** Several actions fire with no sound. Code has no SFX for:

- **Blueprint paste** — placing an entire factory layout should have a satisfying thunk or burst
- **Undo/redo** — no feedback sound when reversing a placement
- **Frog hop** — frogs hop silently; a small wet bounce sound would add life
- **Treasure chest open** — currently uses `sfxCoin()` which is too subtle for a chest opening

**What to do:** Record or source short WAV or MP3 files for each. Place in `audio/` and add them to the `SFX_FILES` table in `audio.js`. Suggested names: `sfx-paste.wav`, `sfx-undo.wav`, `sfx-frog-hop.wav`, `sfx-chest.wav`.

**Why it matters:** Sound design greatly contributes to how satisfying a game feels.

**Priority:** Medium

---

### The water animation is very subtle

**Where:** `js/render.js` — `drawWaterTile()`

**What's wrong:** Water only sparkles on ~0.3% of tiles per frame with a 1-in-4 chance. Most of the time, water looks completely static.

**What to do:** Consider adding a slow animated wave pattern — either a tiling sine-wave shader approach on the canvas, or a simple frame-by-frame tile animation. Even adding 3–4 animated water tile frames to the sprite sheet and cycling through them at ~4 FPS would be a huge visual improvement.

**Why it matters:** Water is a dominant visual element in the game. Static water makes the world feel lifeless.

**Priority:** Medium

---

### Add a proper loading/title screen

**Where:** `index.html` — the loading bar is the first thing players see

**What's wrong:** The loading screen is a plain dark background with a green progress bar and "Fish Ink Factory" text. There's no artwork, logo, or visual identity.

**What to do:** Design a proper loading screen with:
- The Fish Ink Factory logo (or at least polished text treatment)
- A piece of concept art in the background
- The version number shown somewhere subtle

**Why it matters:** First impressions matter enormously for player retention.

**Priority:** Medium

---

### The fish sprite sheet needs more variety

**Where:** `img/fishes.png` — 144 fish species all drawn from the same small cell size

**What's wrong:** Many fish species use very similar or hard-to-distinguish sprites because of the limited resolution. Rare and Legendary fish don't look noticeably more impressive than Commons.

**What to do:** Consider making Rare, Epic, and Legendary fish sprites slightly larger or visually more distinct — glowing outlines, more detailed art, or a different color treatment on the cell itself in the HUD.

**Why it matters:** Visual distinction between rarities makes rare catches feel exciting.

**Priority:** Medium

---

## LOW

---

### Global Tooling research description is misleading

**Where:** `js/research.js` — the `globalTier2` node description

**What's wrong:** The description says "Raises the level cap on 6 global upgrades (not Belt Motors)". Players don't know which 6 upgrades are affected without trial and error.

**What to do:** List the 6 upgrades by name in the tooltip: Quick Cast, Tackle Bag, Auto-Fisher Tuning, Market Contacts, Drone Engine Tuning, and Lucky Lure.

**Why it matters:** Clarity removes frustration.

**Priority:** Low

---

### The day/night cycle is invisible to new players

**Where:** `js/render.js` — `drawDayNightOverlay()`

**What's wrong:** The day/night transition changes the screen overlay gradually, but there's no clock, sun/moon indicator, or other feedback that tells players a 10-minute day cycle exists.

**What to do:** Add a small sun/moon icon to the HUD that animates position across an arc showing the current time of day. Even a tiny icon in the top bar next to the settings buttons would help.

**Why it matters:** Players may never notice the day/night cycle exists.

**Priority:** Low

---

### The start screen name entry has no visible character limit

**Where:** `js/startscreen.js` — the username input field

**What's wrong:** The input accepts any length but the leaderboard likely truncates long names. Players may type long usernames and be confused.

**What to do:** Add `maxlength="20"` to the input element and show a character counter beneath it.

**Priority:** Low

---

### Frog sell is only accessible from world interaction

**Where:** `js/ui.js` — `renderPetsPanel()`

**What's wrong:** Axolotls have a sell button right in the Pets panel. Frogs do not — you must find the frog on the map and interact with it. This is inconsistent.

**What to do:** Add a sell button to each frog slide in the `renderPetsPanel()` frog section, mirroring the axolotl sell button logic.

**Priority:** Low

---

### Camera and zoom position are not saved

**Where:** `js/save.js` — `serializeGame()`

**What's wrong:** `cam.x`, `cam.y`, and `ZOOM` are never saved. Every time players reload they start with the camera at the default position and zoom level, which can be disorienting in a large factory layout.

**What to do:** Add `cam: { x: cam.x, y: cam.y }` and `zoom: ZOOM` to `serializeGame()`, and restore them in `deserializeGame()` with bounds-clamping.

**Priority:** Low
