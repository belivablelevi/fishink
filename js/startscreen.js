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
      card.innerHTML = `
        <div class="start-screen-title">Welcome to Fish INK!</div>
        <div class="start-screen-sub">Pick a name to play as</div>
        <input type="text" id="startNameInput" class="start-screen-input" maxlength="20" placeholder="Your name">
        <button id="startNameBtn" class="start-screen-btn">Let's go</button>
      `;
      const input = card.querySelector('#startNameInput');
      const btn   = card.querySelector('#startNameBtn');
      const submit = () => { if (setLeaderboardName(input.value)) done(); };
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      input.focus();
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
