// Fish INK Factory — game loop

const GAME_VERSION = '1.4.77';

let canvas, ctx;
let lastTime = 0;
let firstFrameDrawn = false;

function loadImages(cb, onProgress) {
  const srcs = {
    fishes: 'img/fishes.png', gear: 'img/fishing_gear.png',
    washer: 'img/washer.png', smoker: 'img/smoker.png',
    icer: 'img/icer.png', stamper: 'img/stamper.png',
    icerActive: 'img/icer_active.png', stamperActive: 'img/stamper_active.png',
    crate: 'img/crate.png', sellcrate: 'img/sellcrate.png',
    dronepad: 'img/dronepad.png', drone: 'img/drone.png',
    droneDeliveryBase: 'img/drone-deliv-base.png',
    droneDeliveryShip1: 'img/drone-deliv-ship1.png',
    droneDeliveryShip2: 'img/drone-deliv-ship2.png',
    packer: 'img/packer.png',
    smartRouterLeft: 'img/smart-router-left.png',
    smartRouterRight: 'img/smart-router-right.png',
    smartRouterStraight: 'img/smart-router-straight.png',
    smartRouterBase: 'img/smart-router-base.png',
    recycler0: 'img/recycler-0.png', recycler1: 'img/recycler-1.png',
    recycler2: 'img/recycler-2.png', recycler3: 'img/recycler-3.png',
    recycler4: 'img/recycler-4.png',
    belt0: 'img/belt-0.png', belt1: 'img/belt-1.png',
    belt2: 'img/belt-2.png', belt3: 'img/belt-3.png',
    belt4: 'img/belt-4.png', belt5: 'img/belt-5.png',
    teleporterBase0: 'img/teleporter-base-0.png', teleporterBase1: 'img/teleporter-base-1.png',
    teleporterBase2: 'img/teleporter-base-2.png', teleporterBase3: 'img/teleporter-base-3.png',
    teleporterBase4: 'img/teleporter-base-4.png', teleporterBase5: 'img/teleporter-base-5.png',
    teleporterActive0: 'img/teleporter-active-0.png', teleporterActive1: 'img/teleporter-active-1.png',
    teleporterActive2: 'img/teleporter-active-2.png', teleporterActive3: 'img/teleporter-active-3.png',
    teleporterActive4: 'img/teleporter-active-4.png', teleporterActive5: 'img/teleporter-active-5.png',
    splitter0: 'img/splitter-0.png', splitter1: 'img/splitter-1.png',
    splitter2: 'img/splitter-2.png', splitter3: 'img/splitter-3.png',
    sorter0: 'img/sorter-0.png', sorter1: 'img/sorter-1.png',
    sorter2: 'img/sorter-2.png', sorter3: 'img/sorter-3.png',
    sorter4: 'img/sorter-4.png', sorter5: 'img/sorter-5.png',
    iconMoney: 'img/icon-money.png', rod: 'img/rod.png',
    boatSheet: 'img/boat0001-sheet.png',
    // Axolotl pet spritesheets
    axo_pink:         'img/axolotl/pink.png',
    axo_albino:       'img/axolotl/albino.png',
    axo_brown:        'img/axolotl/brown.png',
    axo_tan:          'img/axolotl/tan.png',
    axo_yellow:       'img/axolotl/yellow.png',
    axo_blue00:       'img/axolotl/blue00.png',
    axo_blue01:       'img/axolotl/blue01.png',
    axo_red:          'img/axolotl/red.png',
    axo_dark_orange:  'img/axolotl/dark-orange.png',
    axo_yellow_green: 'img/axolotl/yellow-green.png',
    axo_black:        'img/axolotl/black.png',
    axo_greyscale:    'img/axolotl/greyscale.png',
    axo_swamp_green:  'img/axolotl/swamp-green.png',
    axo_rose_pink:    'img/axolotl/rose-pink.png',
    axo_dark_purple:  'img/axolotl/dark-purple.png',
    axo_retrogreen:   'img/axolotl/retrogreen.png',
    // Frog pet spritesheets
    frog_green:        'img/frogs/green.png',
    frog_blue:         'img/frogs/blue.png',
    frog_brown:        'img/frogs/brown.png',
    frog_purple:       'img/frogs/purple.png',
    frog_gameboy_green:'img/frogs/gameboy_green.png',
    frog_gameboy_bw:   'img/frogs/gameboy_bw.png',
  };
  const total = Object.keys(srcs).length;
  let loaded = 0;
  const tick = () => { loaded++; if (onProgress) onProgress(loaded, total); if (loaded === total) cb(); };
  for (const [key, src] of Object.entries(srcs)) {
    const img = new Image();
    img.onload  = () => { IMAGES[key] = img; tick(); };
    img.onerror = () => { console.warn('Could not load', src); tick(); };
    img.src = src;
  }
}

function startLoadingAnimation() {
  const fill = document.getElementById('loadingBarFill');
  return {
    setProgress(pct) {
      const clamped = Math.max(4, Math.min(100, pct * 100));
      if (fill) fill.style.width = `${clamped}%`;
    },
    stop() {},
  };
}

// Real asset loading finishes almost instantly off disk — hold the screen
// open just long enough to avoid a jarring instant flash.
const MIN_LOADING_MS = 350;

function init() {
  console.log(`%cFishInk Factory v${GAME_VERSION}`, 'color:#70cd18;font-weight:bold;font-size:14px');
  canvas = document.getElementById('canvas');
  ctx    = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  if (!loadGame()) { buildWorld(); resetPlayerSpawn(); }
  initMouseHandlers(canvas);
  initTouchControls(canvas);

  const loadingAnim = startLoadingAnimation();
  const loadStart = performance.now();

  const finishLoading = async () => {
    initBuildMenu();
    initBuildHud();
    initSoundMenu();
    initGameMenu();
    initMachinesMenu();
    initLeaderboardMenu();
    loadingAnim.setProgress(1);

    // Try to load a cloud save for returning players. We do this before
    // runStartScreens so the data is applied before any UI touches the game state.
    // Skip after a prestige reset: the stale pre-prestige cloud save must not
    // overwrite the intentionally fresh local start.
    const skipCloud = localStorage.getItem('fishink_skip_cloud');
    localStorage.removeItem('fishink_skip_cloud');
    if (!skipCloud && typeof cloudLoadSave === 'function' && cloudUsername() && isLeaderboardConfigured()) {
      try {
        const cloud = await cloudLoadSave();
        if (cloud?.save_data && Object.keys(cloud.save_data).length > 0) {
          try {
            const data = cloud.save_data;
            for (let v = (data.version || 1); v < SAVE_VERSION; v++) SAVE_MIGRATIONS[v]?.(data);
            deserializeGame(data);
            // Mirror to localStorage so offline loads stay current
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          } catch (e) { console.warn('Cloud save apply failed', e); }
        }
      } catch (e) { /* offline — local save already loaded */ }
    }

    setTimeout(() => {
      loadingAnim.stop();
      runStartScreens(() => {
        document.getElementById('loadingScreen')?.classList.add('hidden');
        cashGuard.init(game.cash);
        if (!game.tutorialDone) startTutorial();
        else if (!game.automationTutorialDone) startPhase2Tutorial();
        requestAnimationFrame(loop);
      });
    }, 200);
  };

  // Build menu's swatches snapshot drawBlock() into <canvas> previews, so it
  // must init after images load — otherwise the washer/smoker previews would
  // freeze on the procedural fallback drawn before the sprites were ready.
  loadImages(() => {
    const elapsed = performance.now() - loadStart;
    const remaining = MIN_LOADING_MS - elapsed;
    if (remaining > 0) setTimeout(finishLoading, remaining);
    else finishLoading();
  }, (loaded, total) => {
    // Cap real progress at 92% so the bar doesn't sit at 100% for the
    // remainder of the artificial minimum-duration wait.
    loadingAnim.setProgress(Math.min(loaded / total, 0.92));
  });

  window._dbg = {
    place: (id, c, r)  => placeBlock(id, c, r),
    procBelt: (on = true) => { DEBUG_FORCE_PROC_BELT = on; },
    resetLifetime: () => { game.lifetimeEarned = 0; saveGame(); submitLeaderboardScore(); console.log('lifetimeEarned reset and submitted'); },
  };
}

function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  CANVAS_W = canvas.width;
  CANVAS_H = canvas.height;
  // A bigger window raises the minimum zoom needed to keep the view inside
  // the map — re-clamp immediately so a resize while already zoomed out
  // doesn't leave you past the new, stricter limit until the next scroll.
  ZOOM = Math.min(ZOOM_MAX, Math.max(minZoomForViewport(), ZOOM));
}

function loop(ts) {
  if (!lastTime) { lastTime = ts; requestAnimationFrame(loop); return; }
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;

  // A thrown error inside any one frame must not kill the rAF chain — that
  // would permanently freeze updatePlayer/simUpdate too (e.g. stuck mid-cast
  // with movement locked out), not just stop rendering.
  try {
    updatePlayer(dt);
    simUpdate(dt);
    draw(ctx, canvas, dt);
    updateBuildMenuLive();
    updateMachinesPanelLive();
    tickSwimStates(dt);
    tickFrogStates(dt);
    updateBuildHud();
    updateBlockPopupLive();
  } catch (err) {
    console.error('Frame error (continuing):', err);
  }

  // The first frame after images/world finish loading already has real
  // pixels painted underneath, so this is when the loading screen can fade
  // out without revealing a blank canvas.
  if (!firstFrameDrawn) {
    firstFrameDrawn = true;
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
  }

  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
