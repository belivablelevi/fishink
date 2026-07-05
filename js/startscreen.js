// Fish INK Factory — start-of-game screen queue
//
// A generic, extensible sequence of one-time screens shown before gameplay
// begins (after assets load, before the loading screen fades). To add your
// own screen later, just push another entry onto START_SCREENS:
//
//   START_SCREENS.push({
//     id: 'myScreen',
//     shouldShow: () => /* return true when this screen should appear */,
//     render(card, done) {
//       card.innerHTML = '...';
//       // call done() once the player has completed this screen
//     },
//   });
//
// Screens run in array order; each one's shouldShow() is checked at game
// start, and only screens that return true are shown, one at a time.

const START_SCREENS = [
  {
    id: 'accountSetup',
    shouldShow: () => !getLeaderboardName(),
    render(card, done) {
      showAccountChoice(card, done);
    },
  },
];

// ── Screen renderers ───────────────────────────────────────────────────────────

function showAccountChoice(card, done) {
  card.innerHTML = `
    <div class="start-screen-title">Welcome to Fish INK!</div>
    <div class="start-screen-sub">Create an account to save your progress across devices.</div>
    <button id="ssBtnNew" class="start-screen-btn">New Player</button>
    <div class="start-screen-divider"></div>
    <button id="ssBtnSignIn" class="start-screen-btn-ghost">Sign In — Returning Player</button>
  `;
  card.querySelector('#ssBtnNew').addEventListener('click', () => showPickName(card, done));
  card.querySelector('#ssBtnSignIn').addEventListener('click', () => showSignIn(card, done));
}

function showPickName(card, done) {
  const render = (errMsg) => {
    card.innerHTML = `
      <button id="ssBtnBack" class="start-screen-back">&#8592; Back</button>
      <div class="start-screen-title">Choose your name</div>
      <div class="start-screen-sub">Names are unique across all players.</div>
      <input type="text" id="startNameInput" class="start-screen-input" maxlength="20" placeholder="Your name" autocomplete="off">
      ${errMsg ? `<div class="start-screen-error">${errMsg}</div>` : ''}
      <button id="startNameBtn" class="start-screen-btn">Let's go</button>
    `;
    const input = card.querySelector('#startNameInput');
    const btn   = card.querySelector('#startNameBtn');
    card.querySelector('#ssBtnBack').addEventListener('click', () => showAccountChoice(card, done));

    const setErr = (msg) => {
      let el = card.querySelector('.start-screen-error');
      if (!el) {
        el = document.createElement('div');
        el.className = 'start-screen-error';
        btn.before(el);
      }
      el.textContent = msg;
      input.style.borderColor = 'var(--c-red)';
      input.value = '';
      input.focus();
    };

    const submit = async () => {
      const result = _setLeaderboardNameInternal(input.value);
      if (result === 'fancy')         { setErr('Letters, numbers and punctuation only!'); return; }
      if (result === 'inappropriate') { setErr('Keep it clean!'); return; }
      if (!result) return;

      btn.disabled = true;
      btn.textContent = 'Checking…';
      input.disabled = true;

      if (isLeaderboardConfigured()) {
        const available = await cloudUsernameAvailable(input.value.trim());
        if (available === false) {
          localStorage.removeItem(LEADERBOARD_NAME_KEY);
          btn.disabled = false; btn.textContent = "Let's go"; input.disabled = false;
          setErr('That name is already taken — try another!');
          return;
        }
        const createResult = await cloudCreatePlayer(input.value.trim());
        if (createResult.ok) {
          showRecoveryCode(card, done, createResult.code);
          return;
        }
        // Cloud failed — proceed anyway, will retry on next load
      }

      done();
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  };

  render();
}

function showRecoveryCode(card, done, code) {
  const display = code.slice(0, 4) + '-' + code.slice(4);
  card.innerHTML = `
    <div class="start-screen-title">Save your recovery code</div>
    <div class="start-screen-sub">You'll need this to sign in on a new device.<br>Write it down — it won't be shown again.</div>
    <div class="recovery-code-box">${display}</div>
    <div class="start-screen-hint">You can also find it later in the game menu under <strong>Cloud</strong>.</div>
    <button id="ssCodeDone" class="start-screen-btn">I've saved it — Continue</button>
  `;
  card.querySelector('#ssCodeDone').addEventListener('click', done);
}

function showSignIn(card, done) {
  const render = (errMsg) => {
    card.innerHTML = `
      <button id="ssBtnBack" class="start-screen-back">&#8592; Back</button>
      <div class="start-screen-title">Sign In</div>
      <div class="start-screen-sub">Enter your username and recovery code to restore your save.</div>
      <input type="text" id="ssSignInName" class="start-screen-input" maxlength="20" placeholder="Username" autocomplete="off">
      <input type="text" id="ssSignInCode" class="start-screen-input ss-code-input" maxlength="9" placeholder="XXXX-XXXX" autocomplete="off" autocorrect="off" spellcheck="false">
      ${errMsg ? `<div class="start-screen-error">${errMsg}</div>` : ''}
      <button id="ssSignInBtn" class="start-screen-btn">Sign In</button>
    `;
    const nameInput = card.querySelector('#ssSignInName');
    const codeInput = card.querySelector('#ssSignInCode');
    const btn = card.querySelector('#ssSignInBtn');
    card.querySelector('#ssBtnBack').addEventListener('click', () => showAccountChoice(card, done));

    const submit = async () => {
      const username = nameInput.value.trim();
      const code = codeInput.value.replace(/-/g, '').trim().toUpperCase();
      if (!username || code.length < 8) { render('Please fill in both fields.'); return; }

      btn.disabled = true;
      btn.textContent = 'Signing in…';

      const res = await cloudLogin(username, code);
      if (res.error === 'network') { render("Couldn't reach the server — check your connection."); return; }
      if (res.error === 'invalid')  { render('Wrong username or recovery code.'); return; }

      if (res.saveData && Object.keys(res.saveData).length > 0) {
        try {
          const data = res.saveData;
          for (let v = (data.version || 1); v < SAVE_VERSION; v++) SAVE_MIGRATIONS[v]?.(data);
          deserializeGame(data);
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { console.warn('Failed to apply cloud save after sign-in', e); }
      }

      done();
    };

    btn.addEventListener('click', submit);
    codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    nameInput.focus();
  };

  render();
}

// ── Screen runner ──────────────────────────────────────────────────────────────

function runStartScreens(onAllDone) {
  const pending = START_SCREENS.filter(s => s.shouldShow());
  if (pending.length === 0) { onAllDone(); return; }

  const overlay = document.getElementById('startScreenOverlay');
  const card    = document.getElementById('startScreenCard');
  overlay.classList.remove('hidden');

  let i = 0;
  const showNext = () => {
    if (i >= pending.length) {
      overlay.classList.add('hidden');
      onAllDone();
      return;
    }
    const screen = pending[i++];
    card.innerHTML = '';
    screen.render(card, showNext);
  };
  showNext();
}
