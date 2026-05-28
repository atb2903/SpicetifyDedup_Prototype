# SpicetifyDedup

A Spicetify Custom App that will (eventually) deduplicate your Spotify saved tracks from inside the Spotify desktop client — avoiding the `502 Bad Gateway` that the public `GET /v1/me/tracks` endpoint returns for large libraries.

**Current iteration:** the app renders the literal text `Hello World` on a sidebar page named `Dedup`. The dedup logic itself lands in a later iteration; this iteration exists to prove the build, install, and sidebar-registration loop end-to-end.

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

The test suite uses Vitest + happy-dom + React Testing Library. There's currently one smoke test that renders the app component and asserts `Hello World` is in the DOM.

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

Then (re)open Spotify. A new entry labelled `Dedup` will appear in the left sidebar; clicking it opens the page and shows `Hello World`.

For an active dev loop that keeps the Spotify client in sync as you edit code, use:

```sh
spicetify watch -a -l
```

(`-a` re-applies on change, `-l` tails logs.) With this running, you don't need to re-run `spicetify apply` for every edit — only the first-time `spicetify config custom_apps spicetify-dedup` registration step is one-off.
