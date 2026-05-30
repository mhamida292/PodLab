# PodLab

A tiny self-hosted **PWA podcast listener**. Add multiple podcast feeds via the UI;
episodes are auto-grouped into series and served as an installable app you can add to
your iPhone home screen and run behind Tailscale on your homelab.

Built for the [Qalam Institute Podcast](https://feeds.feedburner.com/QalamPodcast) —
one feed that contains many series — with support for additional podcasts added at runtime.

## Features

- **Multiple podcasts** — add any podcast RSS feed from the app UI; no rebuild required.
- **Auto-categorization** — episodes are sorted into series from RSS title patterns
  and category tags (speakers and noise tags are filtered out). Unmatched episodes
  fall into a `Misc` bucket.
- **Rose redesign** — refreshed visual identity with a rose/pink accent palette and
  polished typography throughout.
- **Light / dark theme** — auto-detects system preference with a manual toggle to
  override; preference is persisted.
- **Responsive navigation** — bottom tab bar on mobile, collapsible sidebar on desktop.
- **Home feed** — continue-listening hero card + recent-episodes list on the default tab.
- **Library** — add / remove podcasts and browse series with in-app grouping.
- **Dedicated search tab** — search across all podcasts, series, and episodes at once.
- **Native audio playback** with play/pause, scrub, ±15s/30s, and a persistent
  mini-player.
- **Resume playback** — position and last-played episode sync through the server
  (source of truth) with a local cache; your progress follows you across devices.
- **Played/watched marking** — mark episodes as played with an option to hide them.
- **iOS lock-screen controls** via the MediaSession API.
- **Installable PWA** with an offline app shell (audio + feed are always live).
- **Zero runtime dependencies** — just Node's standard library.

## Run with Docker (recommended)

```bash
docker compose up -d --build
```

Then open `http://<homelab-host>:9090`. On your iPhone (over Tailscale): open that
URL in Safari → **Share → Add to Home Screen**, and launch it from the icon for
background audio + lock-screen controls.

## Run with bare Node

Requires Node 18+ (for global `fetch`).

```bash
npm start          # node server.js
```

## Configuration

Everything tunable lives in `config.js`:

- `REFRESH_MS` — how often feeds are re-fetched (default 30 min).
- `PROFILES` — categorization profiles (e.g. the tuned `qalam` profile for the
  Qalam Institute feed, plus a `generic` fallback for all other feeds). Each
  profile contains its own noise tags, speaker honorifics, known speakers, and
  series aliases. To tune categorization for a feed, edit or add a profile here.
- `SEED_PODCASTS` — the podcast(s) seeded into state on first boot (when
  `data/state.json` does not yet exist). Additional podcasts are added at
  runtime from the app UI.

There is no top-level `FEED_URL` env var — podcast subscriptions are stored in
`data/state.json` (path overridable via the `STATE_FILE` env var).

When running with Docker, state is persisted in the named `podlab-data` volume
(see `docker-compose.yml`), so podcasts and playback positions survive container
recreation. A named volume is used instead of a host bind mount so the non-root
container user can always write it. (If the data directory is ever not writable,
the server logs a warning and keeps state in memory rather than crashing.)

## Project layout

| File | Purpose |
|------|---------|
| `server.js` | HTTP server: serves the PWA + `/api/podcasts` and `/api/state` JSON |
| `store.js` | Persistent server-side state (podcasts + playback), written to `data/state.json` |
| `feed.js` | Fetches + parses multiple RSS feeds, caches them, background-refreshes |
| `categorize.js` | Classifies each episode into a series + speakers |
| `config.js` | Categorization profiles + seed podcasts |
| `generate-icons.js` | Generates placeholder PNG app icons |
| `public/` | The PWA (HTML, JS, CSS, service worker, manifest, icons) |
| `public/app.js` | Tab routing + view rendering (Home / Library / Search) |
| `public/state.js` | Frontend playback sync layer (server-backed with local cache) |
| `public/select.js` | Pure data selectors: recent episodes, in-progress list, search |
| `public/theme.js` | Theme state: resolves auto / light / dark and persists preference |

## Roadmap / planned features

- [x] **Fix logo** — real equalizer-mark icon set wired in (192 / 512 PNG + SVG favicon + Apple touch icon).
- [x] **App redesign** — rose-palette redesign with light/dark theme, responsive tab/sidebar nav, Home feed, Library, and Search.
- [ ] **Better media player** — a richer, more capable player UI.
- [x] **Multi-podcast categorization** — extend the categorizer to handle other
      podcasts (beyond Qalam) that the user follows.

### Deferred / next (player phase)

- Playback speed control
- Sleep timer
- Seek bar redesign
- iOS lock-screen series name (now-playing metadata)
- 15 s back / 30 s forward skip UX decision (labels vs. symmetry)

### Known bugs

- [ ] **iPhone lock-screen player:** podcast/series name does not show up in the
      iOS now-playing player. (Fix scheduled for Phase 2 player work.)
- [x] **Skip buttons mislabeled:** ~~the "forward" control is labeled 10 seconds but
      actually skips 30 seconds~~ — RESOLVED: button labels now match the actual
      seek amounts (back 15s, forward 30s).

## Notes

- Audio streams directly from the podcast's CDN, not proxied through the server.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
