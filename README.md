# PodLab

A tiny self-hosted **PWA podcast listener**. Point it at a podcast RSS feed and it
auto-groups the episodes into series, then serves an installable app you can add to
your iPhone home screen and run behind Tailscale on your homelab.

Built for the [Qalam Institute Podcast](https://feeds.feedburner.com/QalamPodcast) —
one feed that contains many series — but the feed URL is configurable.

## Features

- **Auto-categorization** — episodes are sorted into series from RSS title patterns
  and category tags (speakers and noise tags are filtered out). Unmatched episodes
  fall into a `Misc` bucket.
- **Native audio playback** with play/pause, scrub, ±15s/30s, and a persistent
  mini-player.
- **Resume playback** — remembers your position per episode and the last episode
  played (stored locally on the device).
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

- `FEED_URL` — the RSS feed (also overridable via the `FEED_URL` env var).
- `REFRESH_MS` — how often the feed is re-fetched (default 30 min).
- `NOISE_TAGS`, `SPEAKER_HONORIFICS`, `KNOWN_SPEAKERS`, `SERIES_ALIASES` — the
  categorization heuristics. If a new series lands in the wrong bucket, this is
  where you fix it.

## Project layout

| File | Purpose |
|------|---------|
| `server.js` | HTTP server: serves the PWA + `/api/episodes` JSON |
| `feed.js` | Fetches + parses the RSS feed, caches it, background-refreshes |
| `categorize.js` | Classifies each episode into a series + speakers |
| `config.js` | Feed URL + categorization heuristics |
| `generate-icons.js` | Generates placeholder PNG app icons |
| `public/` | The PWA (HTML, JS, CSS, service worker, manifest, icons) |

## Notes

- App icons are generated placeholders — swap in real artwork when you like.
- Audio streams directly from the podcast's CDN, not proxied through the server.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
