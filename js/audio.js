// Fish INK Factory — procedural audio (Web Audio API, no asset files)

const AUDIO = {
  ctx: null, master: null, ambientStarted: false,
  musicMuted: false, sfxMuted: false, sellMuted: false,
  buffers: {},
};

const SFX_FILES = {
  cast:      'audio/sfx-cast.wav',
  catch:     'audio/sfx-catch.wav',
  catchRare: 'audio/sfx-catch-rare.wav',
  fail:      'audio/sfx-fail.wav',
  coin:      'audio/sfx-coin.mp3',
  place:     'audio/sfx-place.wav',
  drop:      'audio/sfx-drop.wav',
  achievement: 'audio/sfx-achievement.wav',
  teleport:  'audio/sfx-teleport.wav',
};

// Plain <audio> elements, not fetch()+decodeAudioData — fetch() of local
// files is blocked by Chromium's file:// CORS policy, so this needs to load
// the same way the birds-song music does to work without a local server.
function loadSfxBuffers() {
  for (const [key, url] of Object.entries(SFX_FILES)) {
    const el = new Audio(url);
    el.preload = 'auto';
    AUDIO.buffers[key] = el;
  }
}

// fadeIn/fadeOut (seconds) ease the volume in/out instead of snapping
// straight to it — used for sfxCast so the cast doesn't pop in/out abruptly.
// pitchVariance randomizes playbackRate by up to ±that fraction each call,
// so repeated plays of the same clip (e.g. casting) don't sound identical.
function playBuffer(key, vol = 1, fadeIn = 0, fadeOut = 0, pitchVariance = 0) {
  if (AUDIO.sfxMuted) return;
  const base = AUDIO.buffers[key];
  if (!base) return;
  const target = vol * 0.5;
  // <audio>.volume tops out at 1.0 — once a request wants louder than that
  // (e.g. the doubled-up placeholder SFX), stack extra overlapping copies of
  // the clip instead of silently clamping. A Web Audio gain boost would be
  // cleaner, but routing a file:// <audio> element through
  // createMediaElementSource mutes it outright (cross-origin tainting, same
  // reason startAmbient avoids the Web Audio graph entirely).
  const layers = Math.max(1, Math.ceil(target));
  for (let i = 0; i < layers; i++) {
    playBufferLayer(base, Math.min(1, target - i), fadeIn, fadeOut, pitchVariance);
  }
}

function playBufferLayer(base, layerTarget, fadeIn, fadeOut, pitchVariance) {
  const inst = base.cloneNode();
  if (pitchVariance > 0) inst.playbackRate = 1 + (Math.random() * 2 - 1) * pitchVariance;
  inst.volume = fadeIn > 0 ? 0 : layerTarget;
  inst.play().catch(() => {});
  if (fadeIn <= 0 && fadeOut <= 0) return;

  const start = performance.now();
  const tick = () => {
    if (inst.paused || inst.ended) return;
    const elapsed = (performance.now() - start) / 1000;
    let v = layerTarget;
    if (fadeIn > 0 && elapsed < fadeIn) v = layerTarget * (elapsed / fadeIn);
    const dur = inst.duration;
    if (fadeOut > 0 && !isNaN(dur) && dur > 0) {
      const remaining = dur - inst.currentTime;
      if (remaining < fadeOut) v = Math.min(v, layerTarget * Math.max(0, remaining / fadeOut));
    }
    inst.volume = Math.max(0, Math.min(1, v));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function audioInit() {
  if (AUDIO.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AUDIO.ctx = new Ctx();
  AUDIO.master = AUDIO.ctx.createGain();
  AUDIO.master.gain.value = 0.5;
  AUDIO.master.connect(AUDIO.ctx.destination);
  // Some browsers (Firefox/Safari) still hand back a 'suspended' context
  // even when created inside a user-gesture handler — resume it explicitly.
  if (AUDIO.ctx.state !== 'running') AUDIO.ctx.resume();
  loadSfxBuffers();
  startAmbient();
}

// Browsers block audio until a user gesture — unlock/resume on first input.
function audioUnlock() {
  if (!AUDIO.ctx) { audioInit(); return; }
  if (AUDIO.ctx.state !== 'running') AUDIO.ctx.resume();
  if (AUDIO.music && AUDIO.music.paused) AUDIO.music.play().catch(() => {});
  // Night synth is Web Audio oscillators — they resume when ctx resumes, no action needed.
}
window.addEventListener('pointerdown', audioUnlock);
window.addEventListener('keydown', audioUnlock);

// ─── Ambient bed: looping background track ──────────────────────────────────
// Plays directly through the <audio> element's own volume rather than via
// createMediaElementSource into the Web Audio graph — routing a file:// media
// element through Web Audio can end up silently muted (opaque-origin
// tainting), so this keeps playback independent of AUDIO.ctx entirely.
function startAmbient() {
  if (AUDIO.ambientStarted) return;
  AUDIO.ambientStarted = true;

  const music = new Audio('audio/birds-song.wav');
  music.loop = true;
  music.preload = 'auto';
  music.volume = 0.4;
  music.muted = AUDIO.musicMuted;
  AUDIO.music = music;
  music.play().catch(() => {}); // resumed by audioUnlock if this is blocked

  // Night ambient — synthesized drone using Web Audio so no file is needed.
  // A pair of detuned oscillators (fundamental + fifth) at very low volume
  // create a soft, atmospheric hum. A slow LFO drifts the gain for gentle
  // movement. The "nightMusic" volume property is repurposed as a gain target
  // so updateMusicForTimeOfDay() crossfades it exactly like a real track.
  AUDIO.nightSynthGain = null;
  AUDIO.nightSynthVol = 0; // mirrors what nightMusic.volume would be
  _startNightSynth();
}

// ─── Synthesized night ambient ───────────────────────────────────────────────
// Two detuned oscillators (root + perfect fifth) through a slow tremolo LFO,
// creating a soft atmospheric hum without needing a file on disk.
function _startNightSynth() {
  if (!AUDIO.ctx) return;
  const ctx = AUDIO.ctx;
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0; // starts silent; crossfaded by updateMusicForTimeOfDay
  masterGain.connect(AUDIO.master);
  AUDIO.nightSynthGain = masterGain;

  // Slow LFO for gentle volume tremolo (0.08 Hz, ±15%)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain);
  lfoGain.connect(masterGain.gain);
  lfo.start();

  // Two detuned oscillators — fundamental (55 Hz, A1) + fifth (82.5 Hz)
  const freqs = [55, 82.5, 110];
  const vols  = [0.08, 0.05, 0.03];
  for (let i = 0; i < freqs.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqs[i] + (Math.random() - 0.5) * 0.6; // slight detune
    const g = ctx.createGain();
    g.gain.value = vols[i];
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
  }
}

// Called each sim frame — crossfades between day/night tracks based on dayTime
// fraction p (0–1). Night range: p < 0.18 (pre-dawn) or p > 0.65 (dusk onward).
function updateMusicForTimeOfDay(p, dt) {
  if (AUDIO.musicMuted) return;
  const isNight     = p < 0.18 || p > 0.65;
  const targetDay   = isNight ? 0   : 0.4;
  const targetNight = isNight ? 0.22 : 0;
  const rate = dt * 0.12; // full crossfade ≈ 3 s
  const lerp = (cur, tgt) => Math.abs(cur - tgt) < rate ? tgt : cur + Math.sign(tgt - cur) * rate;

  if (AUDIO.music) {
    AUDIO.music.volume = lerp(AUDIO.music.volume, targetDay);
  }

  // Night synth: drive the gain node directly
  if (AUDIO.nightSynthGain) {
    AUDIO.nightSynthVol = lerp(AUDIO.nightSynthVol, targetNight);
    AUDIO.nightSynthGain.gain.value = AUDIO.musicMuted ? 0 : AUDIO.nightSynthVol;
  }
}

// ─── Sound settings (toggled from the speaker menu, see ui.js) ─────────────────
function setMusicMuted(v) {
  AUDIO.musicMuted = v;
  if (AUDIO.music) AUDIO.music.muted = v;
  if (AUDIO.nightSynthGain) AUDIO.nightSynthGain.gain.value = v ? 0 : AUDIO.nightSynthVol;
}
function setSfxMuted(v)  { AUDIO.sfxMuted  = v; }
function setSellMuted(v) { AUDIO.sellMuted = v; }

// ─── SFX helpers ───────────────────────────────────────────────────────────────
function playTone({ freq = 440, dur = 0.15, type = 'sine', vol = 0.2, slideTo = null, delay = 0 }) {
  if (!AUDIO.ctx || AUDIO.sfxMuted) return;
  const ctx = AUDIO.ctx;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(AUDIO.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sfxCast() {
  playBuffer('cast', 0.25, 0.22, 0.12, 0.08);
}

function sfxCatch(rare) {
  playBuffer(rare ? 'catchRare' : 'catch');
}

function sfxFail() {
  playBuffer('fail');
}

// force=true bypasses both the Selling Sound mute and the auto-fisher
// quieting — used for manually caught fish placed on a belt, which should
// always confirm with the sell sound regardless of that setting.
function sfxCoin(volMult = 1, force = false) {
  if (!force) {
    if (AUDIO.sellMuted) return;
    // Past 3 auto-fishers, sales happen too fast for a per-sale coin sound to
    // be pleasant — automation has taken over, so let it sell quietly.
    if (countAutoFishers() >= 3) return;
  }
  playBuffer('coin', volMult);
}

function sfxPlace() {
  playBuffer('place');
}

function sfxDrop() {
  playBuffer('drop');
}

// ─── Per-machine "processing done" SFX ──────────────────────────────────────
// All four share one shape — root note + perfect fourth, triangle wave — so
// they read as one family rather than four unrelated chimes. The root pitch
// climbs in the same order fish actually flow through a full line (Washer ->
// Smoker -> Icer -> Stamper), so a multi-stage setup processing top-to-bottom
// sounds like an ascending scale.
function machineDing(rootFreq, volMult = 1) {
  playTone({ freq: rootFreq, dur: 0.12, type: 'triangle', vol: 0.18 * volMult });
  playTone({ freq: rootFreq * 4 / 3, dur: 0.14, type: 'triangle', vol: 0.16 * volMult, delay: 0.05 });
}

function sfxWasher(volMult = 1) {
  machineDing(261.63, volMult); // C4
}

function sfxSmoker(volMult = 1) {
  machineDing(293.66, volMult); // D4
}

function sfxIcer(volMult = 1) {
  machineDing(329.63, volMult); // E4
}

function sfxStamper(volMult = 1) {
  machineDing(349.23, volMult); // F4
}

// ─── Event SFX ──────────────────────────────────────────────────────────────
function sfxAchievement() {
  playBuffer('achievement');
}

function sfxTeleport(volMult = 1) {
  playBuffer('teleport', volMult);
}

// Permanent level-up confirmation — global upgrades, per-instance machine
// upgrades, and Research nodes all play this instead of sfxCoin, so a
// level-up reads as distinct from a fish sale. Square wave to read distinct
// from the triangle-wave machineDing family.
function sfxUpgrade() {
  playTone({ freq: 523.25, dur: 0.08, type: 'square', vol: 0.2 });
  playTone({ freq: 659.25, dur: 0.08, type: 'square', vol: 0.2, delay: 0.07 });
  playTone({ freq: 784.00, dur: 0.14, type: 'square', vol: 0.22, delay: 0.14 });
}

