# PodLab Phase 1 — Multi-podcast foundation, synced state & features

**Date:** 2026-05-29
**Type:** Design spec (implementation-ready)
**Parent:** [Roadmap triage](./2026-05-29-podlab-roadmap-triage.md)

Phase 1 turns PodLab from a single-feed Qalam listener into a multi-podcast app
with server-synced playback state, plus three features (continue-listening,
played/watched, search). Phase 2 (visual redesign + richer player + iOS
lock-screen fix) builds on this and is out of scope here.

## Goals

- Follow multiple podcasts, each its own RSS feed, added/removed at runtime.
- Playback state (position, played, last-played) is **shared across devices**
  (PC + phone), server-owned, surviving brief offline use.
- Continue-listening, played/watched, and global search.
- Preserve Qalam's existing categorization behavior exactly.

## Non-goals (Phase 1)

- Visual/UX redesign and richer player UI (Phase 2).
- iOS lock-screen series-name fix and skip-amount UX (Phase 2).
- Multiple human users / accounts / auth — single shared state only.
- Local-file or single-file-URL sources — RSS feeds only.
- Uploading a saved `.rss`/`.xml` file — deferred ("later if needed").
- Real logo artwork (separate deferred track).

## Key decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Podcast config | Added at runtime via UI, persisted to a server-side JSON store |
| Per-podcast organization | `flat` (default) or `series` mode |
| Series heuristics | Named code profiles; `qalam` keeps tuned lists, others use generic title-prefix grouping |
| Home layout | Cover-art grid |
| Add flow | Paste RSS URL → confirm name/art + mode → added (3 steps) |
| Users / auth | Single shared state, no login |
| Sync | Server is source of truth; client caches in localStorage; last-write-wins by `updatedAt` |

## Architecture

New and changed units, each with one clear job:

### `store.js` (new) — persistence
Owns all writable server state via a JSON file (default `data/state.json`,
overridable by env var; directory created on boot). Atomic writes
(write temp + rename) to avoid corruption. Shape:

```jsonc
{
  "podcasts": [
    { "id": "p_ab12", "feedUrl": "https://…/rss", "name": "Qalam Podcast",
      "image": "https://…/art.jpg", "mode": "series", "profile": "qalam",
      "addedAt": 1780000000 }
  ],
  "playback": {
    "<episodeId>": { "position": 1234, "played": false, "updatedAt": 1780000001 }
  },
  "lastPlayed": "<episodeId>"
}
```

- `mode`: `"flat" | "series"`. `profile` only meaningful in series mode;
  optional, names a categorization profile in `config.js`.
- API: `getState()`, `addPodcast({feedUrl})`, `removePodcast(id)`,
  `updatePlayback({episodeId, position?, played?, updatedAt})` (last-write-wins:
  ignore writes whose `updatedAt` is older than the stored record),
  `setLastPlayed(id)`.

### `feed.js` (changed) — multi-feed
- Per-podcast in-memory cache keyed by podcast id: `{ fetchedAt, channel,
  series, episodes }`. Independent background refresh per feed (`REFRESH_MS`).
- Parsing is unchanged except: each episode object now carries `podcastId`,
  `podcast` (name), and (already present) `series`.
- `getPodcastFeed(podcast, {force})` replaces the single `getFeed`. Episode IDs
  must be unique across podcasts — namespace as `${podcastId}:${guid}` to avoid
  collisions in the shared playback store.
- `flat` mode: skip series grouping; return one chronological episode list.
- `series` mode: run `classify` with the podcast's profile.

### `categorize.js` (changed) — profiles
- `classify({title, categories}, profile)` takes an optional profile.
- A profile bundles `{ NOISE_TAGS, SPEAKER_HONORIFICS, KNOWN_SPEAKERS,
  SERIES_ALIASES }`. No profile → generic: title-prefix grouping only, no
  speaker filtering, no aliases.
- The current Qalam lists move into a `qalam` profile in `config.js`. Behavior
  for the Qalam feed is unchanged.

### `config.js` (changed)
- Keeps `REFRESH_MS`.
- Defines categorization **profiles** (a `qalam` profile holding today's lists).
- `FEED_URL` is no longer the single source of truth. On first boot with an
  empty store, seed the store with the Qalam podcast (`series` mode, `qalam`
  profile) so existing users see no regression.

### `server.js` (changed) — API
New JSON endpoints (still zero-dependency, Node stdlib only):

| Method & path | Purpose |
|---------------|---------|
| `GET /api/podcasts` | All podcasts, each as `{id, name, image, mode}` + nested content: `series → episodes` (series mode) or `episodes` (flat). Serves cached feeds; triggers background refresh when stale. `?refresh=1` forces. |
| `POST /api/podcasts` | Body `{feedUrl}`. Fetches + parses feed, returns `{id, name, image, episodeCount}` preview; persists with default `mode:"flat"`. |
| `PATCH /api/podcasts/:id` | Change `mode` (flat/series). |
| `DELETE /api/podcasts/:id` | Remove podcast (and drop its cache). |
| `GET /api/state` | Full playback state (`playback` + `lastPlayed`). |
| `PUT /api/state` | Body `{episodeId, position?, played?, updatedAt}`. Applies last-write-wins; returns the stored record. |

`POST` fetch failures (bad URL, non-RSS, unreachable) return a 4xx with a clear
message the UI surfaces inline.

### Frontend (`public/`) — changed
Three-tier navigation: **Podcasts → (Series →) Episodes**.

- **State sync layer (new, in `app.js` or a small `state.js`):** on boot, `GET
  /api/state`, cache to `localStorage`. Reads come from the in-memory synced
  state. Writes (position on `timeupdate`, played on `ended`/manual toggle,
  lastPlayed on play) update local state immediately, write through to
  `localStorage`, and `PUT /api/state` **debounced** (e.g. position every ~5s /
  on pause/ended). Each write carries `updatedAt: Date.now()`. On load, merge:
  server record wins unless a local cached record has a newer `updatedAt`
  (then push local up). This replaces the current localStorage-only `LS.pos`.
- **Podcasts home:** cover-art grid of podcast tiles (`name`, artwork, `series`/
  `flat` tag, episode count) + an **Add podcast** tile. Above the grid: a
  **search box** and a **Continue listening** shelf.
- **Add podcast:** tile/+button → paste RSS URL → `POST` → preview (art, title,
  count) + Flat/Series toggle (default flat) → confirm → `PATCH` mode if
  changed → back to grid. Inline error on fetch failure.
- **Inside a podcast:** series mode → series list (today's grid) → episode list;
  flat mode → episode list directly. Back button walks the tier.
- **Episode list / cards:** unchanged layout plus played treatment.

## Features

### Continue listening
- A horizontal shelf at the top of the Podcasts home.
- Source: synced `playback` entries with `0 < position < end` and `played:false`,
  newest `updatedAt` first.
- Each item shows podcast + episode title + resume progress; tap resumes at
  saved position (same as today's resume, now cross-device).
- Hidden when empty.

### Played / watched
- **Auto:** on `ended`, set `played:true` (and clear position) via the sync layer.
- **Manual:** a toggle control on each episode card to mark played/unplayed.
- **Visual:** played episodes render dimmed with a check indicator.
- **Hide played:** a per-list toggle (in series/episode views) that filters out
  played episodes; preference stored locally.

### Search
- Search box on the Podcasts home.
- Matches (case-insensitive substring) across podcast names, series names, and
  episode titles, over all loaded podcasts.
- Results grouped by podcast; tapping an episode result plays it, a series
  result opens that series.

## Data flow

1. Boot: client `GET /api/podcasts` + `GET /api/state`; reconcile local cache.
2. Browse: render from the podcasts payload; played/resume overlays from state.
3. Play: position updates → debounced `PUT /api/state`; `ended` → played + clear.
4. Other device: its next `GET /api/state` reflects the latest writes
   (last-write-wins by `updatedAt`).
5. Feeds refresh in the background per `REFRESH_MS`; `?refresh=1` forces.

## Error handling

- Feed fetch/parse failure on add → 4xx + inline UI message; nothing persisted.
- Background refresh failure → keep serving stale cache, log, retry next cycle
  (current behavior, per podcast).
- Store write failure → 5xx; client keeps local cache and retries on next change.
- Offline client → reads/writes hit localStorage cache; sync resumes on
  reconnect via last-write-wins.
- Unknown/again-namespaced episode ids in state are harmless (ignored on render).

## Testing

- **categorize.js:** generic grouping vs `qalam` profile (speakers filtered,
  aliases merged, Khutbah special case) — table-driven on sample titles/tags.
- **store.js:** add/remove podcast; last-write-wins (older `updatedAt` ignored,
  newer applied); atomic write leaves valid JSON; seeds Qalam on empty store.
- **feed.js:** flat vs series output shape; episode-id namespacing; per-podcast
  cache isolation. Parse against a saved sample feed fixture (no live network).
- **server.js:** each endpoint's happy path + add-feed failure (4xx). Drive via
  http requests against an ephemeral server with a temp store + fixture feed.
- **Frontend:** manual verification on PC + phone — add a feed, play on one
  device, confirm position/played/continue-listening reflect on the other;
  hide-played and search behavior.

## Suggested build order

1. `store.js` + `config.js` profiles + multi-feed `feed.js` + API endpoints
   (data layer; verified with tests, no UI).
2. Frontend nav rebuild (Podcasts grid → podcast → episodes) + Add flow on the
   new API.
3. Sync layer: replace localStorage-only resume with server-synced playback;
   add Continue-listening shelf.
4. Played/watched, then search.
