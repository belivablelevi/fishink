# Fish Ink — Final Polish Summary

Written after a full codebase survey and targeted improvements. This is for you, not another programmer.

---

## What I Changed

**Bugs fixed:**
- The night ambient music was broken (the file didn't exist). Replaced with a synthesized night drone using Web Audio — three low oscillators at different frequencies with a slow tremolo. It fades in at dusk and fades out at dawn exactly like a real music track would.
- Tab key cycling in the build menu was skipping the Blueprints tab entirely. Added it to the tab rotation.
- A dead sound file (`sfx-placeholder.m4a`) was being loaded at startup but never played. Removed it.
- The last gacha pull result would stay visible every time you reopened the Pets panel. Now it clears when you close the build menu.
- Achievement unlocks were using the same generic green toast as buying a belt. Now they're gold-coloured, larger, stay visible for 3.5 seconds instead of 2.2, and have a border to stand out from the crowd.
- Research unlocks now show a purple toast (matching the research panel's colour) instead of the same green as everything else.

**Game feel improvements:**
- When you catch a Rare, Epic, or Legendary fish, a subtle gold vignette flashes around the screen edges for a split second. It's quick and not intrusive, but makes rare catches feel more exciting.
- Reaching lifetime-earning milestones ($1K, $5K, $10K, $25K, $50K, $100K, $250K, $500K, $1M, $5M) now triggers a gold toast with a slightly different visual treatment. These stack properly with other toasts and only fire once per session.
- The prestige reset now fades to black before reloading, instead of jumping instantly. 0.6 second fade — just long enough to feel intentional.

**Toast improvements:**
- All toasts now ease in from the left and ease out smoothly, instead of appearing and disappearing instantly. Entry takes about 120ms, exit starts 350ms before they expire.
- Toast spacing and padding are slightly tighter so more can fit on screen without cutting off.

**UI animations:**
- The Sound menu, Game menu, and Machines panel now animate when they open and close. They fade in and slide slightly from their origin point. Each takes about 130ms.
- All buttons (game menu, HUD buttons, upgrade buy buttons, build tabs, toggle buttons) now have a visible press state — they scale down and shift down slightly when clicked, making every press feel physical.

**Code fixes:**
- Research toast colour changed to purple (was identical green as a belt placement).
- Prestige upgrade toasts unchanged — they were already a clean green.

---

## Bugs I Fixed

1. **Night music never played** — no audio file existed. Replaced with synthesized ambient.
2. **Tab key skipped Blueprints panel** — one missing string in an array.
3. **Dead placeholder sound file** loaded at startup but never used — removed.
4. **Pull result persisted forever in Pets panel** — clears on menu close now.
5. **Duplicate sfxAchievement() call** I introduced — caught and removed.
6. **Achievement toast bypassed trackEarn()** — fixed to properly track earnings for the Stats panel's $/min metric.

---

## Things That Feel Better Now

If you play the game now vs before, you'll notice:

- **Night feels different** — there's now a soft, low hum during nighttime instead of silence. It's subtle but makes the world feel alive after dark.
- **Rare catches have a moment** — the gold edge flash is brief but unmistakable. Players will notice when something rare happens.
- **Hitting money milestones feels good** — the first time you hit $10K or $1M lifetime, you get a distinct gold notification. Gives the progression a rhythm.
- **Menus feel smoother** — opening the sound settings, gear menu, or machines panel no longer snaps open. It slides in.
- **Buttons feel clickable** — every button press has visual confirmation. It doesn't sound like much but it changes how the whole interface feels to use.
- **Achievements stand out** — the gold border and longer display time make them visible, not just another line in the toast stack.
- **Research purchases feel significant** — the purple toast distinguishes them clearly from routine actions.
- **Prestige has weight** — the black fade-out makes it feel like the game is actually resetting, not just glitching.

---

## Things You Should Still Improve

See `DEVELOPER_ACTIONS.md` for the full list. The most important ones:

1. **Change the dev password** (`js/cloud.js` line 126) — this is a real security issue before launch.
2. **Fix the Prestige Quick Start math** — at max level it allows 0ms cast time.
3. **Replace the icon images** — the top bar icons look blurry on modern screens.
4. **Add missing sound effects** — blueprint paste, undo, frog hops, and chest opens all have no audio.
5. **Add frog sell button to the Pets panel** — frogs are inconsistent with axolotls.

---

## Overall Thoughts

Fish Ink is genuinely fun and has a solid foundation. The core loop (cast, catch, sell, build, automate) works well. The art style is cohesive. The pet system adds charm.

**What feels polished:**
- The world rendering is surprisingly detailed — grass tiles have rocks, flowers, bush patches. The water gets rare sparkles. The boat animation is well done. These things add up.
- The machine "ding" sounds ascending as fish flow through the production line (Washer → Smoker → Icer → Stamper = C4 → D4 → E4 → F4) is a clever, satisfying audio design choice.
- The cash HUD is smooth and well-animated. The real-time lerp feels good.
- The fish index discovery system is a nice completionist hook.

**What still feels unfinished:**
- The loading screen has no identity. It's just a bar.
- Nighttime was silent (now it has synth ambience, but ideally you'd record a proper track).
- Achievement unlocks, while now better, still lack any visual celebration beyond a toast.
- Water is almost completely static. It's the biggest visual element in most factory layouts and it doesn't move.
- The day/night cycle is invisible to players who don't notice the screen getting slightly darker. There's no sun/moon indicator.

**The biggest room for improvement:**
The game needs a proper first impression — a title card, a logo, something that makes someone watching a stream think "I want to play that." Right now it boots directly into a loading bar on a dark background. That first 3 seconds matters a lot for player acquisition.

Second biggest: the icon quality gap between the pixel-art game world (intentionally retro) and the UI icons (unintentionally blurry) is jarring. The UI is otherwise clean and modern-feeling.

Overall: Fish Ink is in good shape and with a few more rounds of polish, especially on visual assets and audio, it would be ready for a proper release.
