# SpicetifyDedup

A Spicetify Custom App that will (eventually) deduplicate your Spotify saved tracks from inside the Spotify desktop client — avoiding the `502 Bad Gateway` that the public `GET /v1/me/tracks` endpoint returns for large libraries.

## Current state

The Dedup page (registered in the Spotify sidebar as **Dedup**) renders an
idle landing surface with a single **Load** button. Clicking the button
fetches the user's library and lists their dedup-eligible collections:

- Playlists the user owns
- Collaborative playlists the user can edit
- Liked Songs (always pinned first)

Followed playlists, Spotify-curated playlists, and other users' playlists
the user cannot mutate are excluded.

The page is **idle until the user clicks Load** — no Spotify Platform
calls are issued before the click. A failure during load surfaces a
typed error explanation and a Retry button.

The Dedup page now hosts its own scroll surface so the Load button
stays below Spotify's topbar — click it with a real mouse to start a
load. The page renders five state views — idle, loading, list, empty,
and failed — each with intentional visual styling so a reader can
distinguish them at a glance.

This iteration is strictly read-only. Track enumeration, duplicate
detection, and library mutation arrive in later iterations.

## Prerequisites

- Node.js (any current LTS) and `npm`.
- Spicetify installed and pointed at a working Spotify desktop client. See the [Spicetify getting-started guide](https://spicetify.app/docs/getting-started) for installation and initial setup.

## Install

```sh
git clone <this-repo-url>
cd SpicetifyDedup
npm install
```

## Run the tests

```sh
npm test          # watch mode
npm run test:run  # one-shot
```

The test suite uses Vitest + happy-dom + React Testing Library. `npm run test:coverage` enforces 100 % line, branch, function, and statement coverage across `src/`.

## Build and install into the Spicetify config dir

For active development (rebuilds on save):

```sh
npm run watch
```

For a one-shot production build:

```sh
npm run build
```

Both commands write the compiled app to `~/.config/spicetify/CustomApps/spicetify-dedup/` on Linux (the path is platform-specific on macOS and Windows — consult the Spicetify docs).

## Register the app with Spicetify and apply

The first time you install the app — and any time you change the Spicetify config — you need to register it and re-apply:

```sh
spicetify config custom_apps spicetify-dedup
spicetify apply
```

Then (re)open Spotify. A new entry labelled `Dedup` will appear in the left sidebar; clicking it opens the idle landing page with the Load button.

For an active dev loop that keeps the Spotify client in sync as you edit code, use:

```sh
spicetify watch -a -l
```

(`-a` re-applies on change, `-l` tails logs.) With this running, you don't need to re-run `spicetify apply` for every edit — only the first-time `spicetify config custom_apps spicetify-dedup` registration step is one-off.

## Customization

Users whose Spotify build has a non-default topbar height (the default the page assumes is `110px`) can override the Load-button vertical offset by setting the `--dedup-topbar-offset` CSS custom property in their Spicetify `user.css` — for example, `:root { --dedup-topbar-offset: 128px; }`. This keeps the Load button clear of the topbar without rebuilding the app.
