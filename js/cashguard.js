// Cash integrity guard — hidden closure so it can't be found or overridden
// from the browser console. Tracks every legitimate cash grant this session;
// if game.cash ever exceeds that running total, the gap is external injection
// (DevTools console, mods, etc.) and gets silently reverted.
const cashGuard = (() => {
  let _base    = 0;   // game.cash at session start (after all loading finishes)
  let _granted = 0;   // cumulative legitimate additions since init

  return {
    // Call once after the full game state is loaded and the loop is about
    // to start. All later legitimate additions must go through grant().
    init(baseCash) {
      _base    = baseCash;
      _granted = 0;
    },

    // Call alongside every game.cash += amount in game code.
    grant(amount) {
      if (amount > 0) _granted += amount;
    },

    // Called on each auto-save tick. Returns true when an injection was
    // detected and reverted. The caller can use this to skip the leaderboard
    // submit so a cheated score never reaches Supabase.
    check() {
      const expected = _base + _granted;
      if (game.cash > expected + 0.05) {
        game.cash = expected;
        return true;
      }
      return false;
    },
  };
})();
