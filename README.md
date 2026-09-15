# Fish INK

**[Play Fish INK now →](https://belivablelevi.github.io/fishink/)**

A free, no-download browser idle game. Start as a lone fisherman on a tiny dock and grow into an automated fish-processing factory empire — conveyor belts, washers, smokers, sorters, drones, and a whole ocean to expand into.

## Features

- Manual river/ocean fishing that scales into fully automated Auto Fishers and Drone Fishers
- A factory-builder core loop: belts, splitters, sorters, washers, smokers, icers, stampers, packers, recyclers, smart routers, and teleporters
- Day/night cycle, an expanding island and ocean, offshore islands, and a prestige system with permanent upgrades
- A research tree, achievements, blueprints (copy/paste your factory layouts), and a global leaderboard
- Cloud save via optional player accounts, so progress can follow you across devices

## Run it locally

No build step needed.

- Double-click `index.html` to open it directly in a browser, **or**
- From this folder: `npx serve .` and open the printed localhost URL.

## Structure

Vanilla HTML5/Canvas/JS — no framework, no bundler:

- `index.html`, `style.css` — page shell and UI chrome
- `js/data.js`, `js/grid.js` — fish species, machines, world/terrain data
- `js/sim.js` — tick loop: spawning, fishing, belt movement, machines, selling
- `js/render.js` — canvas drawing
- `js/ui.js`, `js/startscreen.js` — build/upgrade menus, account screens
- `js/save.js`, `js/cloud.js`, `js/leaderboard.js` — local save, cloud sync, leaderboard (Supabase backend — see `leaderboard/SETUP.md`)
- `js/main.js` — bootstraps the game and the render/sim loop

## Backend setup (optional)

Cloud saves and the leaderboard run on Supabase. See [`leaderboard/SETUP.md`](leaderboard/SETUP.md) for the 5-minute setup, including optional Google Sign-In.
