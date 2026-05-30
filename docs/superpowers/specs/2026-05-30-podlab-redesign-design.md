# PodLab Redesign — Design Spec

**Date:** 2026-05-30
**Status:** Approved for planning
**Phase:** 2a — Visual/UX redesign (browsing). Player *feature* work is a separate later phase.

## Goal

Overhaul PodLab's look and feel on top of the Phase 1 multi-podcast data model: a
rose-branded, light/dark, app-like UI with a bottom-tab (mobile) / sidebar (desktop)
navigation, a feed-style Home, a Library grid, a dedicated Search tab, an expanded
now-playing sheet, and in-app podcast management (add sheet, remove, flat/series
toggle) plus a settings screen.

This is a **frontend-only** redesign. The backend API (`/api/podcasts` CRUD,
`/api/state`) already supports everything the new UI needs; no server, store, feed,
or categorization changes are required.

## Constraints (unchanged from the rest of the project)

- **Zero runtime dependencies, no build step.** Vanilla JS + plain CSS, served as
  static files by the existing zero-dep Node server and precached by the service
  worker. No bundler, no framework, no CSS toolchain.
- ES modules, Node 18+ backend (unchanged).
- PWA: installable, offline app shell, iOS home-screen friendly.

## Brand & Theming

Brand assets live in `podlab-assets/` (icon set + logo SVGs). The brand color is
**rose `#9e4b6a`**; the mark is a 5-bar audio equalizer; the wordmark is `PODLAB`
in JetBrains Mono.

- **Accent palette:** `--accent: #9e4b6a`, `--accent-soft: #b86a86`,
  `--accent-deep: #7d3a54`. Rose replaces the current blue (`#4f9cf9`) everywhere:
  progress/resume bars, tags, active nav, play button, links.
- **Equalizer motif:** used for the brand lockup and as the visual treatment for the
  now-playing "is playing" indicator. (Resume/progress bars stay simple linear bars.)
- **Type:** JetBrains Mono (with `ui-monospace` fallback) for the wordmark and small
  uppercase labels; system sans (`ui-sans-serif, system-ui`) for body/content. No
  web-font download is required for body; the mono face falls back to the platform
  monospace if JetBrains Mono is not installed (acceptable — no new asset/network
  dependency).
- **Light + dark:** all colors defined as CSS custom properties on `:root` for the
  default and overridden under `:root[data-theme="light"]` / `[data-theme="dark"]`.
  Default follows `prefers-color-scheme`; a manual override is persisted in
  localStorage (`podlab.theme = auto|light|dark`) and applied by setting
  `data-theme` on `<html>` at boot (before first paint, to avoid a flash). The
  `<meta name="theme-color">` is updated to match the active theme.
- **Icons:** wire the `podlab-assets` icons into `manifest.webmanifest` and
  `index.html` — favicons (16/32/48), `apple-touch-icon` (180), and maskable +
  standard `icon-192`/`icon-512`. Copy the needed files into `public/icons/`
  (served path) and retire the generated placeholder "Q" icons. `generate-icons.js`
  is no longer the source of icons (leave the script in the repo but it is unused).

## Design Tokens (the "framework")

A small token layer in `styles.css` gives us framework-like consistency without
dependencies:

- **Color tokens:** `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`,
  `--border`, `--accent`, `--accent-soft`, `--accent-deep` — each defined per theme.
- **Shape/spacing tokens:** `--radius`, `--radius-sm`, `--gap`, `--pad`, and a small
  type scale.
- **Component classes:** `.tile`, `.tag`, `.ep`, `.card`, `.sheet`, `.tabbar`,
  `.sidebar`, `.topbar`, `.player`, `.nowplaying`, etc. Each is themed purely through
  tokens so light/dark "just works".

## Navigation (Direction B)

Three destinations + an Add action: **Home, Search, Library, (+ Add podcast)**.

- **Mobile (`max-width` breakpoint):** a persistent **top bar** with the PODLAB
  lockup (equalizer mark + wordmark) on the left and a settings/theme icon on the
  right; a **bottom tab bar** with Home / Search / Library (active tab in rose). Add
  is reachable from the Library tab (Add tile) and from an affordance in the bar.
- **Desktop (wider than the breakpoint):** a **left sidebar** with the PODLAB lockup
  at its top, the same three nav items, and an "+ Add podcast" button; **no separate
  top bar**. Content widens (more grid columns).
- One CSS breakpoint swaps bottom-bar ↔ sidebar; all view content is shared.
- **Routing:** the existing client route model is extended so the active tab is part
  of the route (`home` / `search` / `library`, plus drill-down routes `podcast`,
  `series`). Back navigation walks the drill-down stack (series → podcast → tab root).

## Views

### Home (feed)
The "what's next" tab. Top to bottom:
1. **Resume hero** — the most recent in-progress, not-played episode as a large rose
   card: artwork, podcast + episode title, time-left, progress bar, resume button.
   Hidden if nothing is in progress.
2. **Continue listening** — horizontal row of the other in-progress episodes (the
   current Phase 1 shelf logic: `position > 0 && !played`, recency-sorted, capped).
   Shown only when there is more than the hero.
3. **Recent episodes** — a list of the newest episodes across all podcasts.
4. **Empty state** — when nothing has been played yet, a friendly prompt pointing to
   Library / Add.

### Library
The "all my shows" tab: the podcast grid (artwork tile, name, `series`/`flat` tag,
episode count) ending in an **Add podcast** tile. 2 columns on mobile, more on
desktop. Each tile has a **⋯ menu** (also reachable from the show view) with:
- **Remove podcast** (DELETE `/api/podcasts/:id`, with a confirm).
- **Grouping: flat / series** toggle (PATCH `/api/podcasts/:id` `{mode}`), which
  re-renders that show.
Tapping a tile opens the show view.

### Show / series view
- **Series mode:** a grid/list of series cards → tapping a series shows its episode
  list.
- **Flat mode:** the episode list directly.
- **Episode card:** title, publish date, duration, speakers (when present), an
  equalizer-styled **resume progress bar**, a **played ✓/○ toggle**, and expandable
  show notes. Tapping the card plays the episode.
- **Hide-played** control lives in this view (filters played episodes).

### Search tab
A dedicated tab with a query input and results **grouped by podcast**, matching
episode title, series name, or podcast name (guarding the `series: null` flat case).
Tapping a result plays it. Empty query shows a prompt; no matches shows a message.

### Now-playing
- **Mini-bar:** persistent compact bar (artwork, title, play/pause) above the tab bar
  (mobile) / at the bottom of the content (desktop).
- **Expanded sheet:** tapping/clicking the mini-bar opens a full now-playing sheet —
  large artwork, title / podcast / series, scrub + current/duration times, and the
  transport controls (⟲15 / play-pause / 30⟳), plus the played toggle.
- **Behavior is unchanged** — this is a restyle of the existing player only. (Skip
  amounts, MediaSession wiring, and seek behavior are not redesigned here.)

### Add-podcast sheet
Replaces the Phase 1 native `prompt`/`confirm` with an in-app sheet:
1. Paste an RSS feed URL.
2. POST `/api/podcasts` → show the returned preview (name, artwork, episode count).
3. Choose **flat** or **series** grouping (PATCH if series).
4. Confirm → the new show appears in Library.
Inline error states (e.g. "Couldn't fetch that feed").

### Settings screen
Opened from the top-bar icon (mobile) / a sidebar entry (desktop):
- **Theme:** Auto / Light / Dark (writes `podlab.theme`, applies `data-theme`).
- **Refresh info** (read-only display of the configured refresh cadence).
- **App info:** name, version, link.

## Technical Approach

Frontend-only, vanilla, no build. Files touched:

- **`public/index.html`** — restructure into: top bar (mobile) / nav shell, a single
  view container, the bottom tab bar (mobile), the mini-player, and the now-playing /
  add / settings sheets (as hidden containers toggled by JS). Wire the new icon set,
  manifest link, and per-theme `theme-color`. Inline a tiny pre-paint script that
  applies the persisted/auto `data-theme` before CSS loads (no flash).
- **`public/styles.css`** — rewrite around the design-token layer: theme variables
  for light/dark, component classes, the responsive nav (tab bar ↔ sidebar via one
  breakpoint), grid, cards, episode list, sheets, and player.
- **`public/app.js`** — extend the existing module: tab-aware routing; render Home
  (hero + continue + recent + empty state), Library (grid + ⋯ menu), Search tab,
  show/series/episode views, the expanded now-playing sheet, the add-podcast sheet,
  and settings; theme load/apply/persist; management actions (DELETE/PATCH). Continue
  using `public/state.js` unchanged for playback sync. Keep player event wiring
  (timeupdate/ended/MediaSession) behavior identical, restyling the markup only.
- **`public/state.js`** — unchanged.
- **`public/sw.js`** — bump the cache name and precache the new icons / any new shell
  assets so the redesigned shell loads offline and old caches are purged.
- **`public/manifest.webmanifest`** — point at the new icon set; confirm name/theme.
- **`podlab-assets` → `public/icons/`** — copy the required icon files to their served
  paths.

No `package.json`, server, or dependency changes. No new tests are required for the
backend (its suite stays green). The frontend has no unit-test harness; verification
is by running the app against a manual checklist (below) and a smoke boot like the
one used to validate Phase 1.

## Verification

- Backend test suite (`npm test`) remains green (unchanged code, but run as a guard).
- Smoke boot the server and confirm the shell + assets serve (HTTP 200, correct MIME)
  and `/api/podcasts` / `/api/state` respond.
- Manual checklist on mobile width and desktop width, in both light and dark:
  - Nav: tab bar (mobile) / sidebar (desktop); PODLAB lockup placement correct;
    active destination highlighted; back navigation walks the stack.
  - Home: resume hero, continue row, recent list, and the empty state each render
    correctly per playback state.
  - Library: grid + tags + counts; ⋯ menu remove (with confirm) and flat/series
    toggle both work and re-render.
  - Show view: series → episodes (series mode) and direct list (flat); episode card
    resume bar, played toggle, notes expand, hide-played filter.
  - Search: grouped results, play on tap, empty/no-match states.
  - Now-playing: mini-bar → expanded sheet; transport + scrub behave exactly as today.
  - Add sheet: paste → preview → flat/series → appears in Library; error state.
  - Settings: theme Auto/Light/Dark applies immediately and persists across reload;
    no theme flash on load.
  - Icons: installed PWA / home-screen icon and favicons are the new equalizer mark.

## Non-Goals (explicitly deferred)

These belong to a later **player** phase, not this redesign:
- Playback speed control, sleep timer, redesigned seek/scrub behavior.
- **iOS lock-screen series-name fix** (mapping series into a MediaSession field iOS
  surfaces).
- The **15s/30s skip-UX decision** (symmetric vs asymmetric vs configurable) and
  reconciling labels/handlers.

Also out of scope: podcast **rename**, data **export/import**, any backend/API or
categorization changes, and adopting any UI framework or build tooling.
