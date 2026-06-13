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

Each listed collection can be **scanned** for duplicates from its row.
A scan enumerates the collection's tracks in-client and reports the
duplicate groups it finds; collections with removable duplicates then
expose a **Remove duplicates** action (see below).

## Remove duplicates

After a collection is scanned, a per-row **Remove duplicates** button
appears whenever that collection has removable duplicates. Pressing it
keeps the **earliest copy** of each duplicate group and removes the
rest — from **that collection only**. Each row acts on its own
collection; removing duplicates in one playlist never touches Liked
Songs or any other row.

Nothing runs automatically. The button opens a confirmation that names
the collection and the **exact number** of tracks to be removed. When a
removal would delete **more than 25** tracks, a second confirmation is
required before anything is changed.

If some removals fail (for example, a track that is no longer present),
the failures are surfaced and the copies that could not be removed stay
visible in the row. The row updates in-client to reflect what was
actually removed — there is no automatic re-scan.

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
