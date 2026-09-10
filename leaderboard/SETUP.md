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

The `players` table (used by `js/cloud.js` for the New Player / Sign In flow
and, as of the Google Sign-In addition below, Google-linked accounts) has the
same tradeoff for its recovery-code path, but isn't defined in `schema.sql`
above — it was created directly in the Supabase dashboard and never checked
into source. Pull its current definition from Database > Tables before
changing anything on it.

## Google Sign-In setup

Optional, additive on top of the username + recovery-code flow above — it
doesn't require or replace anything from steps 1-5. Uses Supabase Auth's
Google provider, so no server/backend component is needed beyond Supabase
itself.

1. **Google Cloud Console** (https://console.cloud.google.com/apis/credentials):
   create an OAuth 2.0 Client ID, application type **Web application**.
   Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (find `<your-project-ref>` in your Supabase project URL).
2. **Supabase Dashboard -> Authentication -> Providers**: enable **Google**,
   paste in the Client ID and Client Secret from step 1.
3. **Supabase Dashboard -> Authentication -> URL Configuration**: set **Site
   URL** to your production URL (e.g. your GitHub Pages URL), and add every
   origin you test from — including `http://localhost:<port>` for local dev
   — to **Additional Redirect URLs**.
4. **Supabase SQL Editor**: run `leaderboard/players_google_auth_migration.sql`.
   Read the comments in that file before running Step 4 of it — it walks
   through checking your `players` table's actual existing RLS policies
   before narrowing them, since blindly guessing policy names risks either a
   no-op or breaking the existing recovery-code flow.
5. **Supabase SQL Editor**: also run `leaderboard/link_google_account_rpc.sql`.
   This is a separate file — `cloudLinkGoogleAccount()` (the "Link Google
   Account?" prompt existing recovery-code players see) depends on the
   `link_google_account` function it defines, and won't work without it even
   if step 4 above is done.
6. Reload the game. The welcome screen gains a "Continue with Google" option
   alongside New Player / Sign In — Returning Player.
