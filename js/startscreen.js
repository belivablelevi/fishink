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

// Set by main.js during boot, before runStartScreens(), when a Google OAuth
// session exists but has no players row linked to it yet — i.e. this is the
// first time this Google identity has signed in. Consumed by the googleName
// screen below, then cleared.
let _pendingGoogleSession = null;

// Set by main.js during boot: whether the current EXISTING recovery-code
// account (if any) already has a Google identity linked to it. Drives the
// linkGooglePrompt screen below.
let _existingAccountAuthLinked = false;

function _googleLinkDismissKey() {
  return `fishink_google_link_dismissed_${cloudId()}`;
}

const START_SCREENS = [
  {
    id: 'googleName',
    shouldShow: () => !!_pendingGoogleSession && !getLeaderboardName(),
    render(card, done) {
      showPickNameForGoogle(card, done, _pendingGoogleSession);
    },
  },
  {
    id: 'accountSetup',
    shouldShow: () => !getLeaderboardName() && !_pendingGoogleSession,
    render(card, done) {
      showAccountChoice(card, done);
    },
  },
  {
    id: 'linkGooglePrompt',
    shouldShow: () => !!getLeaderboardName() && isLeaderboardConfigured()
      && !_existingAccountAuthLinked && !localStorage.getItem(_googleLinkDismissKey()),
    render(card, done) {
      showLinkGooglePrompt(card, done);
    },
  },
];

// ── Screen renderers ───────────────────────────────────────────────────────────

function showAccountChoice(card, done) {
  card.innerHTML = `
    <div class="start-screen-title">Welcome to Fish INK!</div>
    <div class="start-screen-sub">Create an account to save your progress across devices.</div>
    <button id="ssBtnSignUp" class="start-screen-btn">Sign Up</button>
    <div class="start-screen-divider"></div>
    <button id="ssBtnSignIn" class="start-screen-btn-ghost">Sign In — Returning Player</button>
  `;
  card.querySelector('#ssBtnSignUp').addEventListener('click', () => showSignUp(card, done));
  card.querySelector('#ssBtnSignIn').addEventListener('click', () => showSignIn(card, done));
}

// Wires a "Continue with Google" button already present in `card` — shared by
// showSignUp and showSignIn since cloudSignInWithGoogle() behaves identically
// either way (the boot-time resolution in main.js figures out whether this is
// a new or returning Google identity once the redirect comes back).
function _wireGoogleButton(card, selector) {
  const btn = card.querySelector(selector);
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Redirecting…';
    cloudSignInWithGoogle(); // navigates away; flow resumes after the redirect back
  });
}

// Google is the only way to create a NEW account — recovery codes are being
// phased out for new sign-ups (existing recovery-code accounts keep working
// unchanged via Sign In). If there's no backend configured at all, cloud
// accounts of any kind are impossible, so fall back to local-only play
// (a plain name, no recovery code, no cloud sync) same as always.
function showSignUp(card, done) {
  if (!isLeaderboardConfigured()) {
    showPickName(card, done);
    return;
  }
  card.innerHTML = `
    <button id="ssBtnBack" class="start-screen-back">&#8592; Back</button>
    <div class="start-screen-title">Sign Up</div>
    <div class="start-screen-sub">Sign up with Google to save your progress across devices.</div>
    <button id="ssBtnGoogle" class="start-screen-btn">Continue with Google</button>
  `;
  card.querySelector('#ssBtnBack').addEventListener('click', () => showAccountChoice(card, done));
  _wireGoogleButton(card, '#ssBtnGoogle');
}

// One-time (dismissible) nudge for an existing recovery-code player to also
// link Google to their SAME account. Accepting sets the "this OAuth redirect
// is a link, not a fresh sign-up" flag (consumed by main.js on the next
// boot) then reuses the normal cloudSignInWithGoogle() redirect.
function showLinkGooglePrompt(card, done) {
  card.innerHTML = `
    <div class="start-screen-title">Link Google Account?</div>
    <div class="start-screen-sub">Sign in with Google so you can get back into your save without typing a recovery code.</div>
    <button id="ssBtnLinkGoogle" class="start-screen-btn">Continue with Google</button>
    <button id="ssBtnLinkSkip" class="start-screen-btn-ghost">Not now</button>
  `;
  const linkBtn = card.querySelector('#ssBtnLinkGoogle');
  linkBtn.addEventListener('click', () => {
    linkBtn.disabled = true;
    linkBtn.textContent = 'Redirecting…';
    localStorage.setItem(GOOGLE_LINK_PENDING_KEY, '1');
    cloudSignInWithGoogle(); // navigates away; main.js picks up the link on the redirect back
  });
  card.querySelector('#ssBtnLinkSkip').addEventListener('click', () => {
    localStorage.setItem(_googleLinkDismissKey(), '1');
    done();
  });
}

// First-time Google sign-in with no players row yet — same name validation as
// showPickName, but creates the row via cloudCreatePlayerWithGoogle and skips
// the recovery-code screen (Google is the credential now; a code is still
// generated as a fallback and surfaced later in the Cloud menu).
function showPickNameForGoogle(card, done, session) {
  const render = (errMsg) => {
    const emailHint = session.user?.email ? ` as ${session.user.email}` : '';
    card.innerHTML = `
      <div class="start-screen-title">Choose your name</div>
      <div class="start-screen-sub">Signed in with Google${emailHint}. Names are unique across all players.</div>
      <input type="text" id="startGoogleNameInput" class="start-screen-input" maxlength="20" placeholder="Your name" autocomplete="off">
      ${errMsg ? `<div class="start-screen-error">${errMsg}</div>` : ''}
      <button id="startGoogleNameBtn" class="start-screen-btn">Let's go</button>
    `;
    const input = card.querySelector('#startGoogleNameInput');
    const btn   = card.querySelector('#startGoogleNameBtn');

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

      const available = await cloudUsernameAvailable(input.value.trim());
      if (available === false) {
        localStorage.removeItem(LEADERBOARD_NAME_KEY);
        btn.disabled = false; btn.textContent = "Let's go"; input.disabled = false;
        setErr('That name is already taken — try another!');
        return;
      }

      const createResult = await cloudCreatePlayerWithGoogle(input.value.trim(), session);
      if (!createResult.ok) {
        // Don't silently proceed into a broken local-only state that looks
        // signed up but has no matching row — surface it and let them retry.
        localStorage.removeItem(LEADERBOARD_NAME_KEY);
        btn.disabled = false; btn.textContent = "Let's go"; input.disabled = false;
        setErr(`Couldn't create your account (${createResult.error || 'unknown error'}) — try again.`);
        return;
      }
      // This account is created WITH auth_user_id already set — without this,
      // linkGooglePrompt's shouldShow() (which defaults to false) would think
      // a brand-new Google account still needs linking and re-show itself
      // immediately after signup.
      _existingAccountAuthLinked = true;
      _pendingGoogleSession = null;
      done();
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  };

  render();
}

// Local-only fallback used exclusively when no backend is configured at all
// (see showSignUp) — no cloud account, no recovery code, just a display name.
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
    card.querySelector('#ssBtnBack').addEventListener('click', () => showSignUp(card, done));

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

    const submit = () => {
      const result = _setLeaderboardNameInternal(input.value);
      if (result === 'fancy')         { setErr('Letters, numbers and punctuation only!'); return; }
      if (result === 'inappropriate') { setErr('Keep it clean!'); return; }
      if (!result) return;
      done();
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  };

  render();
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
      <div class="start-screen-divider"></div>
      <button id="ssBtnGoogleSignIn" class="start-screen-btn-ghost">Continue with Google</button>
    `;
    const nameInput = card.querySelector('#ssSignInName');
    const codeInput = card.querySelector('#ssSignInCode');
    const btn = card.querySelector('#ssSignInBtn');
    card.querySelector('#ssBtnBack').addEventListener('click', () => showAccountChoice(card, done));
    _wireGoogleButton(card, '#ssBtnGoogleSignIn');

    const submit = async () => {
      const username = nameInput.value.trim();
      const code = codeInput.value.replace(/-/g, '').trim().toUpperCase();
      if (!username || code.length < 8) { render('Please fill in both fields.'); return; }

      btn.disabled = true;
      btn.textContent = 'Signing in…';

      const res = await cloudLogin(username, code);
      if (res.error === 'network') { render("Couldn't reach the server — check your connection."); return; }
      if (res.error === 'invalid')  { render('Wrong username or recovery code.'); return; }

      // Sync the signed-in username as the leaderboard display name.
      // Account creation always sets this, but sign-in never did, so
      // returning players had an empty name and every leaderboard submit
      // silently bailed.
      _setLeaderboardNameInternal(username);
      _existingAccountAuthLinked = !!res.authUserId;

      if (res.saveData && Object.keys(res.saveData).length > 0) {
        try {
          const data = res.saveData;
          for (let v = (data.version || 1); v < SAVE_VERSION; v++) SAVE_MIGRATIONS[v]?.(data);
          deserializeGame(data);
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { console.warn('Failed to apply cloud save after sign-in', e); }
      }

      // Push whatever lifetimeEarned was loaded from the cloud save
      // now that the name is set.
      submitLeaderboardScore();

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
  const overlay = document.getElementById('startScreenOverlay');
  const card    = document.getElementById('startScreenCard');

  // Re-checks shouldShow() fresh each time, rather than freezing a list up
  // front — a screen like linkGooglePrompt only becomes eligible as a side
  // effect of an earlier screen (Sign In setting the player's name), so it
  // must be picked up on the next round, not decided before that happened.
  const showNext = () => {
    const screen = START_SCREENS.find(s => s.shouldShow());
    if (!screen) {
      overlay.classList.add('hidden');
      onAllDone();
      return;
    }
    overlay.classList.remove('hidden');
    card.innerHTML = '';
    screen.render(card, showNext);
  };
  showNext();
}
