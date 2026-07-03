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
    id: 'pickName',
    shouldShow: () => !getLeaderboardName(),
    render(card, done) {
      const render = (errMsg) => {
        card.innerHTML = `
          <div class="start-screen-title">Welcome to Fish INK!</div>
          <div class="start-screen-sub">Pick a name — names are unique across all players</div>
          <input type="text" id="startNameInput" class="start-screen-input" maxlength="20" placeholder="Your name">
          ${errMsg ? `<div id="startNameErr" style="color:#e05c5c;font-size:10px;margin-top:6px;">${errMsg}</div>` : ''}
          <button id="startNameBtn" class="start-screen-btn">Let's go</button>
        `;
        const input = card.querySelector('#startNameInput');
        const btn   = card.querySelector('#startNameBtn');

        const setErr = (msg) => {
          let el = card.querySelector('#startNameErr');
          if (!el) { el = document.createElement('div'); el.id = 'startNameErr'; el.style.cssText = 'color:#e05c5c;font-size:10px;margin-top:6px;'; btn.before(el); }
          el.textContent = msg;
          input.style.borderColor = '#e05c5c';
          input.value = '';
          input.focus();
        };

        const submit = async () => {
          const result = setLeaderboardName(input.value);
          if (result === 'fancy')         { setErr('Letters, numbers and punctuation only!'); return; }
          if (result === 'inappropriate') { setErr('Keep it clean!'); return; }
          if (!result) return;

          btn.disabled = true;
          btn.textContent = 'Checking…';
          input.disabled = true;

          // Check uniqueness in Supabase if cloud is configured
          if (typeof cloudUsernameAvailable === 'function' && isLeaderboardConfigured()) {
            const available = await cloudUsernameAvailable(input.value.trim());
            if (available === false) {
              // Name taken — reset leaderboard name so shouldShow() stays true
              localStorage.removeItem(LEADERBOARD_NAME_KEY);
              btn.disabled = false; btn.textContent = "Let's go"; input.disabled = false;
              setErr('That name is already taken — try another!');
              return;
            }
            // available === null means network error; allow through (will retry on next load)
            if (typeof cloudCreatePlayer === 'function') {
              await cloudCreatePlayer(input.value.trim());
            }
          }

          done();
        };

        btn.addEventListener('click', submit);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
        input.focus();
      };

      render();
    },
  },
];

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
