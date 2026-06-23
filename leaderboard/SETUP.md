# Leaderboard Setup

Takes about 5 minutes.

1. Create a free project at https://supabase.com.
2. Open the SQL Editor in your new project and run the contents of `leaderboard/schema.sql`.
3. Go to Settings -> API and copy your **Project URL** and **anon public key**.
4. Open `js/leaderboard.js` and replace the two placeholder values near the top:
   ```javascript
   var SUPABASE_URL  = 'YOUR_SUPABASE_URL';
   var SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
   ```
5. Reload the game. The Leaderboard tab will switch from "not set up yet" to a name-entry prompt.

## Known limitation

There is no login for this leaderboard — identity is just a random ID stored
in your browser. That means the Row Level Security policies in `schema.sql`
can't actually verify a request is updating *its own* row, only that some
row is being read/written. Anyone with the public anon key (which is, by
design, public — it ships in the page source) could write an arbitrary score
to an arbitrary row via the browser console. This is an accepted tradeoff
for a casual feedback-gathering demo, not an oversight. Closing this gap
later would mean adding real Supabase Auth accounts and scoping the
`insert`/`update` policies to `auth.uid()`.
