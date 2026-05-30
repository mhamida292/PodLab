# PodLab Redesign (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand and redesign PodLab's browsing UI — rose palette, light/dark with toggle, bottom-tab (mobile) / sidebar (desktop) navigation, feed-style Home, Library grid with management, dedicated Search tab, restyled now-playing sheet, and in-app add/settings — frontend-only, zero new dependencies.

**Architecture:** Keep the existing vanilla-JS, no-build PWA. Extract the two genuinely testable pieces (theme resolution, data selectors) into pure ES modules unit-tested with `node:test`. Build the UI as a design-token CSS layer (`:root` custom properties + `[data-theme]` overrides) plus component classes. `app.js` orchestrates tab routing, rendering, and DOM/event wiring; the player's behavior is unchanged (restyle only). No API/backend changes — the server already supports add/DELETE/PATCH/state.

**Tech Stack:** Vanilla ES modules, plain CSS custom properties, `node:test` for logic. No bundler, no framework, no new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-30-podlab-redesign-design.md`

---

## File Structure

**Created:**
- `public/theme.js` — theme state: pure `resolveTheme()` + `nextTheme()`, plus `loadTheme()`/`applyTheme()`/`setTheme()` that touch `localStorage` + `<html data-theme>`.
- `public/select.js` — pure data selectors over the `/api/podcasts` payload + playback map: `allEpisodes`, `recentEpisodes`, `inProgress`, `searchEpisodes`.
- `test/theme.test.js`, `test/select.test.js`.
- `public/icons/*` — the real icon set (copied from `podlab-assets/`).

**Modified:**
- `public/index.html` — new shell: top bar (mobile), view container, bottom tab bar (mobile) / sidebar (desktop), mini-player, and hidden sheet containers (now-playing, add-podcast, settings). Head: new icons, per-theme `theme-color`, pre-paint theme script.
- `public/styles.css` — rewritten around design tokens + light/dark + component classes + responsive nav.
- `public/app.js` — tab-aware routing, new view renderers, management actions, theme + sheets + settings wiring; consumes `select.js`/`theme.js`; keeps `state.js` and player behavior.
- `public/sw.js` — bump cache name, precache new modules + icons.
- `public/manifest.webmanifest` — new icon set + `theme_color`.
- `README.md` — features/layout/roadmap updates.

**Unchanged:** `public/state.js`, `server.js`, `store.js`, `feed.js`, `categorize.js`, `config.js`, `package.json`.

### Episode object shape (from `/api/podcasts`, for reference in all tasks)
Each podcast: `{ id, name, image, mode: "series"|"flat", series: [{name,count,episodes}], episodes: [...] }`.
Each episode: `{ id, podcastId, podcast, title, series: string|null, speakers: string[], audioUrl, duration, pubDate, pubTs, notes, link }`.
Playback record (from `state.js`): `{ position, played, updatedAt }`.

---

## Task 1: Theme module (TDD)

**Files:**
- Create: `public/theme.js`
- Test: `test/theme.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/theme.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, nextTheme } from "../public/theme.js";

test("resolveTheme: explicit light/dark win over system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("resolveTheme: auto follows the system preference", () => {
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("auto", false), "light");
});

test("resolveTheme: missing/invalid stored value is treated as auto", () => {
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(undefined, false), "light");
  assert.equal(resolveTheme("nonsense", true), "dark");
});

test("nextTheme cycles auto -> light -> dark -> auto", () => {
  assert.equal(nextTheme("auto"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "auto");
  assert.equal(nextTheme("garbage"), "light"); // treated as auto
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/theme.test.js`
Expected: FAIL — `public/theme.js` does not exist.

- [ ] **Step 3: Implement `public/theme.js`**

```js
// Theme state. Pure helpers (resolveTheme/nextTheme) are unit-tested; the
// load/apply/set helpers touch localStorage + <html data-theme> for the app.
//
// Stored preference is one of: "auto" | "light" | "dark" (default "auto").
// resolveTheme turns the preference + system setting into the concrete theme.

const KEY = "podlab.theme";
const ORDER = ["auto", "light", "dark"];

function normalize(pref) {
  return ORDER.includes(pref) ? pref : "auto";
}

// Concrete theme to apply: explicit wins, "auto" follows the system.
export function resolveTheme(pref, prefersDark) {
  const p = normalize(pref);
  if (p === "light" || p === "dark") return p;
  return prefersDark ? "dark" : "light";
}

// Cycle for the settings control: auto -> light -> dark -> auto.
export function nextTheme(pref) {
  const i = ORDER.indexOf(normalize(pref));
  return ORDER[(i + 1) % ORDER.length];
}

// --- browser-only helpers (not unit-tested) ---

export function getStored() {
  try { return normalize(localStorage.getItem(KEY)); } catch { return "auto"; }
}

function systemPrefersDark() {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
}

// Apply the resolved theme to <html> and update theme-color meta.
export function applyTheme(pref = getStored()) {
  const theme = resolveTheme(pref, systemPrefersDark());
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#14161b" : "#ffffff");
  return theme;
}

export function setTheme(pref) {
  const p = normalize(pref);
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  return applyTheme(p);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/theme.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add public/theme.js test/theme.test.js
git commit -m "feat: theme module (auto/light/dark resolution + cycle)"
```

---

## Task 2: Data selectors module (TDD)

**Files:**
- Create: `public/select.js`
- Test: `test/select.test.js`

These pure functions replace logic currently inline in `app.js` (continue-listening, search) and add Home's "recent". Making them pure lets us test them in `node` and keeps `app.js` focused.

- [ ] **Step 1: Write the failing tests**

Create `test/select.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { allEpisodes, recentEpisodes, inProgress, searchEpisodes } from "../public/select.js";

const podcasts = [
  {
    id: "p1", name: "Qalam", mode: "series",
    episodes: [
      { id: "p1:a", podcast: "Qalam", title: "The Cure: Ep 1", series: "The Cure", pubTs: 300 },
      { id: "p1:b", podcast: "Qalam", title: "Khutbah on Sabr", series: "Khutbahs", pubTs: 100 },
    ],
  },
  {
    id: "p2", name: "Daily", mode: "flat",
    episodes: [
      { id: "p2:c", podcast: "Daily", title: "Markets today", series: null, pubTs: 200 },
    ],
  },
];

test("allEpisodes flattens every podcast's episodes", () => {
  assert.equal(allEpisodes(podcasts).length, 3);
});

test("recentEpisodes returns newest-first, capped", () => {
  const r = recentEpisodes(podcasts, 2);
  assert.deepEqual(r.map((e) => e.id), ["p1:a", "p2:c"]); // pubTs 300, 200
});

test("inProgress: only started + not played, newest activity first", () => {
  const playback = {
    "p1:a": { position: 50, played: false, updatedAt: 10 },
    "p1:b": { position: 80, played: true, updatedAt: 20 },  // played -> excluded
    "p2:c": { position: 5, played: false, updatedAt: 30 },
    "p9:x": { position: 5, played: false, updatedAt: 40 },  // unknown id -> dropped
  };
  const r = inProgress(podcasts, playback);
  assert.deepEqual(r.map((e) => e.id), ["p2:c", "p1:a"]); // by updatedAt desc
});

test("searchEpisodes matches title, series, or podcast name; groups by podcast", () => {
  const byTitle = searchEpisodes(podcasts, "markets");
  assert.deepEqual(byTitle.map((g) => g.podcast.id), ["p2"]);
  assert.equal(byTitle[0].matches.length, 1);

  const bySeries = searchEpisodes(podcasts, "cure");
  assert.deepEqual(bySeries[0].matches.map((e) => e.id), ["p1:a"]);

  const byPodcast = searchEpisodes(podcasts, "qalam");
  assert.equal(byPodcast[0].matches.length, 2); // both Qalam episodes

  assert.deepEqual(searchEpisodes(podcasts, ""), []); // empty query -> no groups
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/select.test.js`
Expected: FAIL — `public/select.js` does not exist.

- [ ] **Step 3: Implement `public/select.js`**

```js
// Pure selectors over the /api/podcasts payload (array of podcasts, each with a
// flat `episodes` list) and the playback map from state.js. No DOM, no fetch.

export function allEpisodes(podcasts) {
  return podcasts.flatMap((p) => p.episodes || []);
}

// Newest episodes across all podcasts, capped at `limit`.
export function recentEpisodes(podcasts, limit = 20) {
  return allEpisodes(podcasts)
    .slice()
    .sort((a, b) => (b.pubTs || 0) - (a.pubTs || 0))
    .slice(0, limit);
}

// In-progress episodes (started, not played), most-recently-active first.
// `limit` defaults high; callers slice for the hero/shelf.
export function inProgress(podcasts, playback, limit = 12) {
  const byId = new Map(allEpisodes(podcasts).map((e) => [e.id, e]));
  return Object.entries(playback)
    .filter(([, r]) => r.position > 0 && !r.played)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id]) => byId.get(id))
    .filter(Boolean)
    .slice(0, limit);
}

// Search across title, series, and podcast name. Returns groups:
// [{ podcast, matches: episode[] }] for podcasts with >=1 match. Empty q -> [].
export function searchEpisodes(podcasts, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return podcasts
    .map((p) => ({
      podcast: p,
      matches: (p.episodes || []).filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.series && e.series.toLowerCase().includes(q)) ||
          p.name.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.matches.length > 0);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/select.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run full suite + commit**

Run: `npm test`
Expected: PASS — Phase 1's 21 tests + theme (4) + select (4) = 29.

```bash
git add public/select.js test/select.test.js
git commit -m "feat: pure data selectors (recent, in-progress, search)"
```

---

## Task 3: Icons, manifest, and head (theme bootstrap)

**Files:**
- Create: `public/icons/*` (copies)
- Modify: `public/manifest.webmanifest`, `public/index.html` (head only)

- [ ] **Step 1: Copy the real icon set into the served path**

```bash
cp podlab-assets/icon-192.png            public/icons/icon-192.png
cp podlab-assets/icon-512.png            public/icons/icon-512.png
cp podlab-assets/icon-192-maskable.png   public/icons/icon-192-maskable.png
cp podlab-assets/icon-512-maskable.png   public/icons/icon-512-maskable.png
cp podlab-assets/apple-touch-icon.png    public/icons/apple-touch-icon.png
cp podlab-assets/favicon-16.png          public/icons/favicon-16.png
cp podlab-assets/favicon-32.png          public/icons/favicon-32.png
cp podlab-assets/favicon.svg             public/icons/favicon.svg
```

- [ ] **Step 2: Rewrite `public/manifest.webmanifest`**

```json
{
  "name": "PodLab",
  "short_name": "PodLab",
  "description": "Self-hosted multi-podcast listener with synced playback.",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#14161b",
  "theme_color": "#14161b",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: Update `<head>` in `public/index.html`**

Replace the existing `<link rel="apple-touch-icon" ...>` line and the `theme-color` meta with the block below, and add the favicon links + the pre-paint theme script. The pre-paint script runs before `styles.css` is applied so the correct theme is set with no flash.

```html
  <meta name="theme-color" content="#14161b" />
  <link rel="icon" type="image/svg+xml" href="/icons/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <script>
    // Pre-paint: apply persisted/auto theme to <html> before CSS loads (no flash).
    (function () {
      try {
        var pref = localStorage.getItem("podlab.theme") || "auto";
        var dark = pref === "dark" || (pref !== "light" &&
          matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      } catch (e) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    })();
  </script>
```

> Note: there may be an existing `<link rel="manifest">` earlier in the head; ensure only one remains.

- [ ] **Step 4: Verify icons serve and the page still loads**

```bash
rm -rf data && PORT=9095 node server.js >/tmp/pl.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "icon-512 %{http_code}\n" http://127.0.0.1:9095/icons/icon-512.png
curl -s -o /dev/null -w "favicon  %{http_code}\n" http://127.0.0.1:9095/icons/favicon.svg
curl -s -o /dev/null -w "manifest %{http_code} %{content_type}\n" http://127.0.0.1:9095/manifest.webmanifest
curl -s http://127.0.0.1:9095/ | grep -c "data-theme\|pre-paint" >/dev/null && echo "head script present"
kill %1
```
Expected: all `200`; manifest content-type `application/manifest+json`; head script present.

- [ ] **Step 5: Commit**

```bash
git add public/icons public/manifest.webmanifest public/index.html
git commit -m "feat: real PWA icon set + per-theme color + pre-paint theme bootstrap"
```

---

## Task 4: CSS token layer + app shell + responsive nav + tab routing

This task establishes the foundation every view builds on: the design tokens (light/dark), the base reset, the responsive navigation (mobile top bar + bottom tab bar; desktop sidebar), the `index.html` shell containers, and tab-aware routing in `app.js`. After this task the app shows three empty tabs you can switch between; views are filled in Tasks 5–11.

**Files:**
- Modify: `public/index.html` (body), `public/styles.css` (replace), `public/app.js` (replace)

- [ ] **Step 1: Replace the `<body>` shell in `public/index.html`**

Replace everything between `<body>` and the closing `</body>` (keep the `<script src="/app.js" type="module">` last) with:

```html
  <div id="app" class="app">
    <!-- Sidebar (desktop) -->
    <nav id="sidebar" class="sidebar">
      <div class="lockup">
        <svg class="mark" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <rect x="6" y="13" width="3.4" height="6" rx="1.7"/><rect x="11.3" y="9" width="3.4" height="14" rx="1.7"/>
          <rect x="16.6" y="6" width="3.4" height="20" rx="1.7"/><rect x="21.9" y="10" width="3.4" height="12" rx="1.7"/>
          <rect x="27.2" y="14" width="3.4" height="4" rx="1.7"/>
        </svg>
        <span class="wordmark">PODLAB</span>
      </div>
      <button class="nav-item" data-tab="home"><span class="ni-ic">▦</span> Home</button>
      <button class="nav-item" data-tab="search"><span class="ni-ic">⌕</span> Search</button>
      <button class="nav-item" data-tab="library"><span class="ni-ic">▤</span> Library</button>
      <div class="sidebar-spacer"></div>
      <button id="addBtnSide" class="btn-accent">+ Add podcast</button>
    </nav>

    <div class="frame">
      <!-- Top bar (mobile) -->
      <header id="topbar" class="topbar">
        <button id="backBtn" class="iconbtn back hidden" aria-label="Back">‹</button>
        <div class="lockup">
          <svg class="mark" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
            <rect x="6" y="13" width="3.4" height="6" rx="1.7"/><rect x="11.3" y="9" width="3.4" height="14" rx="1.7"/>
            <rect x="16.6" y="6" width="3.4" height="20" rx="1.7"/><rect x="21.9" y="10" width="3.4" height="12" rx="1.7"/>
            <rect x="27.2" y="14" width="3.4" height="4" rx="1.7"/>
          </svg>
          <span class="wordmark">PODLAB</span>
        </div>
        <button id="settingsBtn" class="iconbtn" aria-label="Settings">◐</button>
      </header>

      <main id="view" class="view"><div class="loading">Loading…</div></main>

      <!-- Mini player -->
      <footer id="player" class="player hidden">
        <div class="mini" id="miniPlayer">
          <div id="miniArt" class="mini-art"></div>
          <div class="mini-meta"><div id="miniTitle" class="mini-title">—</div><div id="miniPod" class="mini-pod"></div></div>
          <button id="miniPlay" class="iconbtn accent" aria-label="Play/Pause">❚❚</button>
        </div>
      </footer>

      <!-- Bottom tab bar (mobile) -->
      <nav id="tabbar" class="tabbar">
        <button class="tab" data-tab="home"><span class="tab-ic">▦</span><span>Home</span></button>
        <button class="tab" data-tab="search"><span class="tab-ic">⌕</span><span>Search</span></button>
        <button class="tab" data-tab="library"><span class="tab-ic">▤</span><span>Library</span></button>
      </nav>
    </div>
  </div>

  <!-- Sheets (hidden until opened) -->
  <div id="sheet" class="sheet-backdrop hidden"><div id="sheetBody" class="sheet"></div></div>
  <audio id="audio" preload="metadata"></audio>

  <script src="/app.js" type="module"></script>
```

- [ ] **Step 2: Replace `public/styles.css` with the token layer + base + nav**

Replace the whole file. (Component CSS for cards/episodes/sheets is appended in later tasks; this is the foundation.)

```css
/* ---------- Design tokens ---------- */
:root, :root[data-theme="dark"] {
  --bg: #14161b; --surface: #1b1e25; --surface-2: #21262f;
  --text: #e8eaed; --muted: #9aa3b2; --border: #ffffff14;
  --accent: #9e4b6a; --accent-soft: #b86a86; --accent-deep: #7d3a54;
  --on-accent: #ffffff;
  --radius: 14px; --radius-sm: 10px; --safe-b: env(safe-area-inset-bottom, 0px);
}
:root[data-theme="light"] {
  --bg: #faf7f8; --surface: #ffffff; --surface-2: #f1ebed;
  --text: #2a2226; --muted: #8a7f84; --border: #00000012;
  --accent: #9e4b6a; --accent-soft: #b86a86; --accent-deep: #7d3a54;
  --on-accent: #ffffff;
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); }
.mono, .wordmark { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
.hidden { display: none !important; }
.loading { padding: 40px 16px; text-align: center; color: var(--muted); }
button { font: inherit; color: inherit; cursor: pointer; }

/* lockup */
.lockup { display: flex; align-items: center; gap: 8px; }
.mark rect { fill: var(--accent); }
.wordmark { font-size: 14px; letter-spacing: 2.5px; color: var(--accent); font-weight: 500; }

.iconbtn { background: none; border: none; color: var(--muted); font-size: 18px; padding: 6px; border-radius: 8px; }
.iconbtn.accent { color: var(--on-accent); background: var(--accent); width: 34px; height: 34px; border-radius: 50%; }
.btn-accent { background: var(--accent); color: var(--on-accent); border: none; border-radius: 10px; padding: 10px; font-weight: 600; }

/* ---------- Layout: mobile-first ---------- */
.app { min-height: 100vh; }
.sidebar { display: none; }
.frame { max-width: 760px; margin: 0 auto; padding-bottom: calc(132px + var(--safe-b)); }
.topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 12px 14px; background: var(--bg); border-bottom: 1px solid var(--border); }
.topbar .back { font-size: 24px; }
.view { padding: 16px 14px; }

/* mini player above the tab bar */
.player { position: fixed; left: 0; right: 0; bottom: calc(56px + var(--safe-b)); z-index: 9; }
.mini { display: flex; align-items: center; gap: 10px; margin: 0 10px; padding: 9px 12px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
.mini-art { width: 36px; height: 36px; border-radius: 8px; background: var(--accent); background-size: cover; }
.mini-meta { flex: 1; min-width: 0; }
.mini-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-pod { font-size: 10px; color: var(--muted); }

/* bottom tab bar */
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; justify-content: space-around;
  padding: 8px 0 calc(8px + var(--safe-b)); background: var(--bg); border-top: 1px solid var(--border); }
.tab { background: none; border: none; color: var(--muted); display: flex; flex-direction: column; align-items: center;
  gap: 2px; font-size: 10px; }
.tab .tab-ic { font-size: 16px; }
.tab.on { color: var(--accent); }

/* ---------- Desktop: sidebar replaces tab bar ---------- */
@media (min-width: 760px) {
  .app { display: flex; }
  .topbar, .tabbar { display: none; }
  .sidebar { display: flex; flex-direction: column; gap: 4px; width: 200px; flex-shrink: 0;
    padding: 16px 12px; border-right: 1px solid var(--border); height: 100vh; position: sticky; top: 0; }
  .sidebar .lockup { padding: 4px 8px 14px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 9px;
    background: none; border: none; color: var(--muted); font-size: 14px; text-align: left; }
  .nav-item.on { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-weight: 600; }
  .sidebar-spacer { flex: 1; }
  .frame { flex: 1; max-width: none; margin: 0; padding-bottom: 110px; }
  .player { left: 200px; bottom: 0; }
  .mini { margin: 0; border-radius: 0; border-left: none; border-right: none; border-bottom: none; }
  .view { padding: 22px 26px; max-width: 1100px; }
}
```

- [ ] **Step 3: Replace `public/app.js` with the routed shell**

This new `app.js` imports `state.js`/`select.js`/`theme.js`, loads `/api/podcasts`, manages a tab + drill-down route, and renders placeholder content per tab. View renderers (`renderHome`, `renderLibrary`, `renderSearch`, `renderShow`, `renderSeries`) are stubs here and filled in Tasks 5–8. Player/sheets wiring is added in Tasks 9–11.

```js
// Frontend orchestrator: tab routing + rendering + DOM/event wiring.
import * as State from "/state.js";
import * as Select from "/select.js";
import * as Theme from "/theme.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const view = $("#view");
const backBtn = $("#backBtn");
const audio = $("#audio");

let DATA = [];                 // [{id,name,image,mode,series,episodes}]
let current = null;            // playing episode
let route = { tab: "home", podcastId: null, series: null };

const podcastById = (id) => DATA.find((p) => p.id === id);
const findEp = (id) => Select.allEpisodes(DATA).find((e) => e.id === id);

async function load(force = false) {
  view.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    const res = await fetch("/api/podcasts" + (force ? "?refresh=1" : ""));
    DATA = await res.json();
    await State.loadState();
    render();
  } catch (e) {
    view.innerHTML = `<div class="loading">Couldn't load podcasts.<br>${esc(String(e))}</div>`;
  }
}

// ---------- routing ----------
function render() {
  // active nav highlight
  $$(".tab,.nav-item").forEach((el) => el.classList.toggle("on", el.dataset.tab === route.tab));
  const drilled = route.podcastId != null;
  backBtn.classList.toggle("hidden", !drilled);
  if (route.podcastId) {
    return route.series ? renderSeries(route.podcastId, route.series) : renderShow(route.podcastId);
  }
  if (route.tab === "home") return renderHome();
  if (route.tab === "search") return renderSearch();
  if (route.tab === "library") return renderLibrary();
}
function goTab(tab) { route = { tab, podcastId: null, series: null }; window.scrollTo(0, 0); render(); }
function go(r) { route = { ...route, ...r }; window.scrollTo(0, 0); render(); }
function back() {
  if (route.series) return go({ series: null });
  if (route.podcastId) return go({ podcastId: null });
}

$$(".tab,.nav-item").forEach((el) => el.addEventListener("click", () => goTab(el.dataset.tab)));
backBtn.addEventListener("click", back);

// ---------- view stubs (filled in later tasks) ----------
function renderHome() { view.innerHTML = `<h1 class="view-title">Home</h1>`; }
function renderLibrary() { view.innerHTML = `<h1 class="view-title">Library</h1>`; }
function renderSearch() { view.innerHTML = `<h1 class="view-title">Search</h1>`; }
function renderShow(id) { const p = podcastById(id); view.innerHTML = `<h1 class="view-title">${esc(p?.name || "")}</h1>`; }
function renderSeries(id, name) { view.innerHTML = `<h1 class="view-title">${esc(name)}</h1>`; }

// ---------- helpers ----------
function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) { const t = Date.parse(d); return isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
function fmtTime(s) { s = Math.floor(s || 0); const m = Math.floor(s / 60), sec = s % 60, h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`; }
function durToSec(d) { if (!d) return 0; const p = d.split(":").map(Number);
  return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p.length === 2 ? p[0]*60 + p[1] : p[0]; }

// ---------- boot ----------
Theme.applyTheme();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
load();

// Exposed for later tasks (avoids "unused" churn): keep references alive.
export { findEp, current, fmtTime, durToSec, fmtDate, esc };
```

- [ ] **Step 4: Verify it parses, boots, and tabs switch**

```bash
node --check public/app.js && node --check public/theme.js && node --check public/select.js
rm -rf data && PORT=9095 node server.js >/tmp/pl.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "app.js %{http_code}\n"    http://127.0.0.1:9095/app.js
curl -s -o /dev/null -w "select %{http_code}\n"    http://127.0.0.1:9095/select.js
curl -s -o /dev/null -w "theme  %{http_code}\n"    http://127.0.0.1:9095/theme.js
kill %1
```
Expected: `node --check` clean; all `200`.
**Manual:** open `http://localhost:9095`, confirm: tabs/sidebar switch the title between Home/Search/Library; no console errors; light/dark follows your OS setting.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: design-token theming + responsive tab/sidebar shell + tab routing"
```

---

## Task 5: Home feed view

**Files:**
- Modify: `public/app.js` (replace `renderHome`), `public/styles.css` (append)

- [ ] **Step 1: Replace `renderHome` in `public/app.js`**

```js
function renderHome() {
  const playback = State.getAllPlayback();
  const prog = Select.inProgress(DATA, playback);
  const hero = prog[0];
  const shelf = prog.slice(1);
  const recent = Select.recentEpisodes(DATA, 20);

  if (DATA.length === 0) {
    view.innerHTML = `<div class="empty"><h2>No podcasts yet</h2>
      <p>Head to Library to add your first feed.</p>
      <button class="btn-accent" id="emptyAdd">+ Add podcast</button></div>`;
    $("#emptyAdd").addEventListener("click", () => goTab("library"));
    return;
  }

  const heroHtml = hero ? `
    <button class="hero" data-id="${esc(hero.id)}">
      <div class="hero-art" style="${artStyle(hero)}"></div>
      <div class="hero-body">
        <div class="mono hero-kicker">CONTINUE LISTENING</div>
        <div class="hero-title">${esc(hero.title)}</div>
        <div class="hero-pod">${esc(hero.podcast)}</div>
        <div class="bar"><i style="width:${pct(hero)}%"></i></div>
      </div>
      <span class="hero-play">▶</span>
    </button>` : "";

  const shelfHtml = shelf.length ? `
    <div class="shelf-h mono">CONTINUE</div>
    <div class="shelf">${shelf.map((e) => `
      <button class="shelf-item" data-id="${esc(e.id)}">
        <div class="shelf-art" style="${artStyle(e)}"></div>
        <div class="shelf-title">${esc(e.title)}</div>
        <div class="shelf-pod">${esc(e.podcast)}</div>
      </button>`).join("")}</div>` : "";

  const recentHtml = `
    <div class="shelf-h mono">RECENT EPISODES</div>
    <div class="ep-list">${recent.map(epRow).join("")}</div>`;

  view.innerHTML = heroHtml + shelfHtml + recentHtml;
  wirePlayables();
}

// One-line episode row used by Home recent + show views.
function epRow(e) {
  const rec = State.getPlayback(e.id);
  return `<button class="ep-row ${rec.played ? "played" : ""}" data-id="${esc(e.id)}">
    <div class="ep-row-art" style="${artStyleById(e.podcastId)}"></div>
    <div class="ep-row-main">
      <div class="ep-row-title">${esc(e.title)}</div>
      <div class="ep-row-sub">${esc(e.podcast)}${e.duration ? " · " + esc(e.duration) : ""}</div>
    </div>
    ${rec.played ? `<span class="badge">✓</span>` : ""}
  </button>`;
}

// click any [data-id] element -> play that episode
function wirePlayables() {
  view.querySelectorAll("[data-id]").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}

// art helpers (use podcast image if present, else accent gradient)
function artStyleById(podcastId) { const p = podcastById(podcastId); return artStyleFor(p?.image); }
function artStyle(ep) { return artStyleById(ep.podcastId); }
function artStyleFor(img) {
  return img ? `background-image:url('${esc(img)}')`
             : `background-image:linear-gradient(135deg,var(--accent),var(--accent-deep))`;
}
function pct(ep) { const total = durToSec(ep.duration); const rec = State.getPlayback(ep.id);
  return total && rec.position ? Math.min(100, (rec.position / total) * 100) : 0; }
```

> `play()` is defined in Task 9. Until then it is undefined; this task's manual check only inspects layout — wiring clicks to `play` works once Task 9 lands. (Tasks are executed in order.)

- [ ] **Step 2: Append Home styles to `public/styles.css`**

```css
.view-title { font-size: 22px; font-weight: 700; margin: 2px 0 16px; }
.empty { text-align: center; color: var(--muted); padding: 48px 16px; }
.empty h2 { color: var(--text); }
.bar { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); }

.hero { width: 100%; text-align: left; display: flex; gap: 14px; align-items: center; border: none;
  background: linear-gradient(120deg, var(--accent), var(--accent-deep)); color: var(--on-accent);
  border-radius: var(--radius); padding: 15px; margin-bottom: 20px; }
.hero-art { width: 78px; height: 78px; border-radius: 10px; background-size: cover; background-position: center; flex-shrink: 0; }
.hero-body { flex: 1; min-width: 0; }
.hero-kicker { font-size: 9px; letter-spacing: 1.5px; opacity: .85; }
.hero-title { font-size: 16px; font-weight: 700; margin: 3px 0 1px; }
.hero-pod { font-size: 12px; opacity: .85; margin-bottom: 9px; }
.hero .bar { background: #ffffff33; } .hero .bar i { background: #fff; }
.hero-play { font-size: 16px; }

.shelf-h { font-size: 10px; letter-spacing: 1.2px; color: var(--muted); margin: 4px 0 10px; }
.shelf { display: flex; gap: 11px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 18px; }
.shelf-item { flex: 0 0 150px; text-align: left; background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 10px; }
.shelf-art { aspect-ratio: 1; border-radius: 8px; background-size: cover; margin-bottom: 8px; }
.shelf-title { font-size: 12px; font-weight: 600; line-height: 1.3; }
.shelf-pod { font-size: 10px; color: var(--muted); margin-top: 3px; }

.ep-list { display: flex; flex-direction: column; gap: 2px; }
.ep-row { width: 100%; text-align: left; display: flex; align-items: center; gap: 11px; padding: 10px 8px;
  background: none; border: none; border-radius: 10px; }
.ep-row:hover { background: var(--surface); }
.ep-row.played { opacity: .55; }
.ep-row-art { width: 40px; height: 40px; border-radius: 8px; background-size: cover; flex-shrink: 0; }
.ep-row-main { flex: 1; min-width: 0; }
.ep-row-title { font-size: 13px; font-weight: 600; }
.ep-row-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
.badge { color: var(--accent); font-size: 13px; }
```

- [ ] **Step 3: Verify**

Run: `node --check public/app.js`
Expected: clean.
**Manual:** boot (`PORT=9095 node server.js`, fresh `data/`), open Home. With the seeded Qalam podcast you should see the "Recent episodes" list (no hero until something is in progress). No console errors. Switch to light/dark via OS — colors invert cleanly.

- [ ] **Step 4: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: Home feed (resume hero, continue shelf, recent list, empty state)"
```

---

## Task 6: Library view + per-podcast menu

**Files:**
- Modify: `public/app.js` (replace `renderLibrary`, add menu + actions), `public/styles.css` (append)

- [ ] **Step 1: Replace `renderLibrary` and add management actions in `public/app.js`**

```js
function renderLibrary() {
  const tiles = DATA.map((p) => `
    <div class="tile" data-podcast="${esc(p.id)}">
      <button class="tile-tap" data-open="${esc(p.id)}">
        <div class="tile-art" style="${artStyleFor(p.image)}">${p.image ? "" : esc((p.name[0] || "?"))}</div>
      </button>
      <button class="tile-menu" data-menu="${esc(p.id)}" aria-label="Manage">⋯</button>
      <div class="tile-cap">
        <div class="tile-name">${esc(p.name)}</div>
        <div class="tile-meta"><span class="tag ${p.mode}">${p.mode}</span> ${p.episodes.length} eps</div>
      </div>
    </div>`).join("");
  const addTile = `<button class="tile add" id="libAdd">
    <div class="tile-art plus">+</div><div class="tile-cap"><div class="tile-name muted">Add podcast</div></div></button>`;
  view.innerHTML = `<h1 class="view-title">Library</h1><div class="grid">${tiles}${addTile}</div>`;

  view.querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => go({ podcastId: el.dataset.open, series: null })));
  view.querySelectorAll("[data-menu]").forEach((el) =>
    el.addEventListener("click", (e) => { e.stopPropagation(); openPodcastMenu(el.dataset.menu); }));
  $("#libAdd").addEventListener("click", addPodcastFlow);
}

function openPodcastMenu(id) {
  const p = podcastById(id);
  if (!p) return;
  const otherMode = p.mode === "series" ? "flat" : "series";
  openSheet(`
    <h2 class="sheet-title">${esc(p.name)}</h2>
    <button class="sheet-row" id="modeRow">Switch to <b>${otherMode}</b> grouping</button>
    <button class="sheet-row danger" id="removeRow">Remove podcast</button>
    <button class="sheet-row cancel" id="cancelRow">Cancel</button>`);
  $("#cancelRow").addEventListener("click", closeSheet);
  $("#modeRow").addEventListener("click", async () => {
    await fetch(`/api/podcasts/${id}`, { method: "PATCH",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: otherMode }) });
    closeSheet(); await load(true);
  });
  $("#removeRow").addEventListener("click", async () => {
    if (!confirm(`Remove "${p.name}"? Your playback history stays.`)) return;
    await fetch(`/api/podcasts/${id}`, { method: "DELETE" });
    closeSheet(); await load(true);
  });
}
```

- [ ] **Step 2: Append Library + tag styles to `public/styles.css`**

```css
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
@media (min-width: 760px) { .grid { grid-template-columns: repeat(4, 1fr); } }
.tile { position: relative; }
.tile-tap { display: block; width: 100%; padding: 0; border: none; background: none; }
.tile-art { aspect-ratio: 1; border-radius: var(--radius-sm); background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 700; color: var(--on-accent); }
.tile-art.plus { background: var(--surface-2); color: var(--muted); }
.tile-menu { position: absolute; top: 6px; right: 6px; background: #0008; color: #fff; border: none;
  width: 26px; height: 26px; border-radius: 50%; font-size: 13px; }
.tile-cap { padding: 7px 2px 0; }
.tile-name { font-size: 13px; font-weight: 650; } .tile-name.muted { color: var(--muted); }
.tile-meta { font-size: 11px; color: var(--muted); margin-top: 4px; display: flex; align-items: center; gap: 6px; }
.tag { font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 20px; }
.tag.series { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent-soft); }
.tag.flat { background: var(--surface-2); color: var(--muted); }

/* sheet (shared by menu, add, settings) */
.sheet-backdrop { position: fixed; inset: 0; background: #0007; z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
@media (min-width: 760px) { .sheet-backdrop { align-items: center; } }
.sheet { background: var(--surface); width: 100%; max-width: 460px; border-radius: 16px 16px 0 0; padding: 18px 16px calc(18px + var(--safe-b));
  border: 1px solid var(--border); }
@media (min-width: 760px) { .sheet { border-radius: 16px; } }
.sheet-title { font-size: 16px; margin: 0 0 12px; }
.sheet-row { display: block; width: 100%; text-align: left; padding: 13px; border: none; background: var(--surface-2);
  border-radius: 10px; margin-bottom: 8px; font-size: 14px; }
.sheet-row.danger { color: #e06c75; } .sheet-row.cancel { background: none; color: var(--muted); text-align: center; }
```

- [ ] **Step 3: Add the sheet helpers + add-podcast flow in `public/app.js`**

Add near the helpers:

```js
// ---------- sheets ----------
const sheetEl = $("#sheet");
function openSheet(html) { $("#sheetBody").innerHTML = html; sheetEl.classList.remove("hidden"); }
function closeSheet() { sheetEl.classList.add("hidden"); $("#sheetBody").innerHTML = ""; }
sheetEl.addEventListener("click", (e) => { if (e.target === sheetEl) closeSheet(); });

// ---------- add podcast ----------
async function addPodcastFlow() {
  openSheet(`
    <h2 class="sheet-title">Add a podcast</h2>
    <input id="feedUrl" class="sheet-input" type="url" placeholder="Paste an RSS feed URL" />
    <div id="addMsg" class="add-msg"></div>
    <button class="btn-accent" id="addFetch">Fetch feed</button>
    <button class="sheet-row cancel" id="addCancel">Cancel</button>`);
  $("#addCancel").addEventListener("click", closeSheet);
  $("#addFetch").addEventListener("click", doAddFetch);
}

async function doAddFetch() {
  const feedUrl = $("#feedUrl").value.trim();
  const msg = $("#addMsg");
  if (!feedUrl) { msg.textContent = "Enter a feed URL."; return; }
  msg.textContent = "Fetching…";
  let preview;
  try {
    const res = await fetch("/api/podcasts", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ feedUrl }) });
    preview = await res.json();
    if (!res.ok) throw new Error(preview.error || "fetch failed");
  } catch (e) { msg.textContent = "Couldn't add feed: " + e.message; return; }
  openSheet(`
    <h2 class="sheet-title">${esc(preview.name)}</h2>
    <p class="add-msg">${preview.episodeCount} episodes. How should episodes be grouped?</p>
    <button class="sheet-row" id="gFlat"><b>Flat</b> — one chronological list</button>
    <button class="sheet-row" id="gSeries"><b>Series</b> — group by title/series (like Qalam)</button>`);
  const finish = async (mode) => {
    if (mode === "series") await fetch(`/api/podcasts/${preview.id}`, { method: "PATCH",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "series" }) });
    closeSheet(); goTab("library"); await load(true);
  };
  $("#gFlat").addEventListener("click", () => finish("flat"));
  $("#gSeries").addEventListener("click", () => finish("series"));
}
```

Append styles:

```css
.sheet-input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface-2); color: var(--text); font-size: 14px; margin-bottom: 10px; }
.add-msg { font-size: 13px; color: var(--muted); margin-bottom: 12px; min-height: 18px; }
```

- [ ] **Step 4: Verify**

Run: `node --check public/app.js`
**Manual:** boot fresh, open Library → see Qalam tile + Add tile. ⋯ menu opens a sheet; "Switch to flat" toggles the tag after reload; Add → paste a real RSS feed → preview → choose flat → new tile appears. (Tap-to-open a show shows the stub title until Task 7.)

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: Library grid + per-podcast menu (remove/grouping) + add-podcast sheet"
```

---

## Task 7: Show / series / episode views

**Files:**
- Modify: `public/app.js` (replace `renderShow`/`renderSeries`, add `renderEpisodes`/`epCard`/hide-played state), `public/styles.css` (append)

- [ ] **Step 1: Replace `renderShow`/`renderSeries` and add episode rendering in `public/app.js`**

```js
let hidePlayed = false;

function renderShow(id) {
  const p = podcastById(id);
  if (!p) return goTab("library");
  if (p.mode === "series") {
    const cards = p.series.map((s) => `
      <button class="series-card" data-series="${esc(s.name)}">
        <div class="series-name">${esc(s.name)}</div>
        <div class="series-count">${s.count} episode${s.count === 1 ? "" : "s"}</div>
      </button>`).join("");
    view.innerHTML = `<h1 class="view-title">${esc(p.name)}</h1><div class="series-grid">${cards}</div>`;
    view.querySelectorAll("[data-series]").forEach((el) =>
      el.addEventListener("click", () => go({ podcastId: id, series: el.dataset.series })));
  } else {
    view.innerHTML = `<h1 class="view-title">${esc(p.name)}</h1>` + episodesHtml(p.episodes);
    wireEpisodes();
  }
}

function renderSeries(id, name) {
  const p = podcastById(id);
  const s = p?.series.find((x) => x.name === name);
  if (!s) return go({ podcastId: id, series: null });
  view.innerHTML = `<h1 class="view-title">${esc(name)}</h1>` + episodesHtml(s.episodes);
  wireEpisodes();
}

function episodesHtml(eps) {
  const shown = hidePlayed ? eps.filter((e) => !State.getPlayback(e.id).played) : eps;
  return `<label class="hide-played"><input type="checkbox" id="hidePlayedCb" ${hidePlayed ? "checked" : ""}/> Hide played</label>
    <div class="ep-cards">${shown.map(epCard).join("")}</div>`;
}

function epCard(e) {
  const rec = State.getPlayback(e.id);
  const playing = current && current.id === e.id ? "playing" : "";
  return `<div class="ep-card ${rec.played ? "played" : ""} ${playing}" data-id="${esc(e.id)}">
    <div class="ep-head">
      <button class="ep-open">
        <div class="ep-title">${esc(e.title)}</div>
        <div class="ep-sub">${fmtDate(e.pubDate)}${e.duration ? " · " + esc(e.duration) : ""}${e.speakers?.length ? " · " + esc(e.speakers.join(", ")) : ""}</div>
      </button>
      <button class="played-toggle" aria-label="Mark played">${rec.played ? "✓" : "○"}</button>
    </div>
    ${pct(e) ? `<div class="bar"><i style="width:${pct(e)}%"></i></div>` : ""}
    <div class="ep-notes">${esc(e.notes || "No show notes.")}</div>
  </div>`;
}

function wireEpisodes() {
  const cb = $("#hidePlayedCb");
  if (cb) cb.addEventListener("change", (e) => { hidePlayed = e.target.checked; render(); });
  view.querySelectorAll(".ep-card").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".ep-open").addEventListener("click", (e) => { e.stopPropagation(); el.classList.toggle("open"); });
    el.querySelector(".played-toggle").addEventListener("click", (e) => {
      e.stopPropagation(); const rec = State.getPlayback(id); State.setPlayed(id, !rec.played); render();
    });
    el.addEventListener("click", () => play(findEp(id)));
  });
}
```

- [ ] **Step 2: Append show/episode styles to `public/styles.css`**

```css
.series-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (min-width: 760px) { .series-grid { grid-template-columns: repeat(3, 1fr); } }
.series-card { text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.series-name { font-weight: 650; font-size: 14px; }
.series-count { font-size: 12px; color: var(--muted); margin-top: 4px; }

.hide-played { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 13px; margin-bottom: 12px; }
.ep-cards { display: flex; flex-direction: column; gap: 9px; }
.ep-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
.ep-card.played { opacity: .6; } .ep-card.playing { border-color: var(--accent); }
.ep-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.ep-open { flex: 1; text-align: left; background: none; border: none; padding: 0; }
.ep-title { font-size: 14px; font-weight: 600; } .ep-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }
.played-toggle { background: none; border: none; color: var(--muted); font-size: 15px; }
.ep-card.played .played-toggle { color: var(--accent); }
.ep-card .bar { margin-top: 9px; }
.ep-notes { display: none; font-size: 13px; color: var(--muted); margin-top: 10px; line-height: 1.5; white-space: pre-wrap; }
.ep-card.open .ep-notes { display: block; }
```

- [ ] **Step 3: Verify**

Run: `node --check public/app.js`
**Manual:** Library → Qalam → series cards → tap one → episode list. Tapping a title toggles notes; the ✓/○ toggles played (and dims); Hide-played filters. (Playback starts working in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: show/series/episode views (played toggle, hide-played, notes)"
```

---

## Task 8: Search tab

**Files:**
- Modify: `public/app.js` (replace `renderSearch`), `public/styles.css` (append)

- [ ] **Step 1: Replace `renderSearch` in `public/app.js`**

```js
let searchQuery = "";

function renderSearch() {
  view.innerHTML = `
    <input id="searchBox" class="search" type="search" placeholder="Search podcasts, series, episodes…" value="${esc(searchQuery)}" />
    <div id="searchResults"></div>`;
  const box = $("#searchBox");
  box.addEventListener("input", () => { searchQuery = box.value; renderSearchResults(); });
  renderSearchResults();
  box.focus();
}

function renderSearchResults() {
  const out = $("#searchResults");
  const q = searchQuery.trim();
  if (!q) { out.innerHTML = `<div class="loading">Type to search your podcasts.</div>`; return; }
  const groups = Select.searchEpisodes(DATA, q);
  if (groups.length === 0) { out.innerHTML = `<div class="loading">No matches.</div>`; return; }
  out.innerHTML = groups.map((g) => `
    <div class="search-group"><div class="shelf-h mono">${esc(g.podcast.name)}</div>
      <div class="ep-list">${g.matches.slice(0, 25).map(epRow).join("")}</div></div>`).join("");
  out.querySelectorAll("[data-id]").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}
```

- [ ] **Step 2: Append search styles to `public/styles.css`**

```css
.search { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 12px 14px; color: var(--text); font-size: 14px; margin-bottom: 16px; }
.search-group { margin-bottom: 18px; }
```

- [ ] **Step 3: Verify**

Run: `node --check public/app.js`
**Manual:** Search tab → type "cure" → grouped Qalam results; "qalam" → all its episodes; clearing shows the prompt. Tapping a result plays (after Task 9).

- [ ] **Step 4: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: dedicated Search tab (grouped results)"
```

---

## Task 9: Playback wiring + now-playing sheet

**Files:**
- Modify: `public/app.js` (add `play`, player wiring, now-playing sheet), `public/styles.css` (append)

- [ ] **Step 1: Add playback + player + now-playing sheet to `public/app.js`**

```js
const player = $("#player");

function play(ep) {
  if (!ep) return;
  if (current?.id !== ep.id) {
    current = ep;
    audio.src = ep.audioUrl;
    const saved = State.getPlayback(ep.id).position;
    audio.currentTime = saved > 5 ? saved : 0;
    State.setLastPlayed(ep.id);
    setMediaSession(ep);
  }
  player.classList.remove("hidden");
  updatePlayerMeta();
  audio.play();
  render();
}

function updatePlayerMeta() {
  if (!current) return;
  $("#miniTitle").textContent = current.title;
  $("#miniPod").textContent = current.podcast;
  $("#miniArt").style.cssText = artStyleById(current.podcastId);
  const mp = $("#miniPlay"); if (mp) mp.textContent = audio.paused ? "▶" : "❚❚";
  if ($("#npPlay")) $("#npPlay").textContent = audio.paused ? "▶" : "❚❚";
}

// mini-bar controls
$("#miniPlay").addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
$("#miniPlayer").addEventListener("click", openNowPlaying);
function togglePlay() { if (!current) return; audio.paused ? audio.play() : audio.pause(); }

function openNowPlaying() {
  if (!current) return;
  openSheet(`
    <div class="np">
      <div class="np-art" style="${artStyleById(current.podcastId)}"></div>
      <div class="np-title">${esc(current.title)}</div>
      <div class="np-sub">${esc(current.podcast)}${current.series ? " · " + esc(current.series) : ""}</div>
      <div class="np-seek"><span id="npCur">0:00</span>
        <input id="npScrub" class="scrub" type="range" min="0" max="100" value="0" step="0.1" />
        <span id="npDur">0:00</span></div>
      <div class="np-controls">
        <button id="npBack" class="np-ctl">⟲15</button>
        <button id="npPlay" class="np-play">${audio.paused ? "▶" : "❚❚"}</button>
        <button id="npFwd" class="np-ctl">30⟳</button>
      </div>
      <button class="sheet-row cancel" id="npClose">Close</button>
    </div>`);
  const scrub = $("#npScrub");
  $("#npClose").addEventListener("click", closeSheet);
  $("#npPlay").addEventListener("click", togglePlay);
  $("#npBack").addEventListener("click", () => (audio.currentTime = Math.max(0, audio.currentTime - 15)));
  $("#npFwd").addEventListener("click", () => (audio.currentTime += 30));
  scrub.addEventListener("input", () => { npScrubbing = true; if (audio.duration) $("#npCur").textContent = fmtTime((scrub.value/100)*audio.duration); });
  scrub.addEventListener("change", () => { if (audio.duration) audio.currentTime = (scrub.value/100)*audio.duration; npScrubbing = false; });
  syncNowPlaying();
}
let npScrubbing = false;
function syncNowPlaying() {
  const scrub = $("#npScrub"); if (!scrub) return;
  if (audio.duration && !npScrubbing) {
    scrub.value = (audio.currentTime / audio.duration) * 100;
    $("#npCur").textContent = fmtTime(audio.currentTime);
    $("#npDur").textContent = fmtTime(audio.duration);
  }
}

// audio events (behavior identical to Phase 1, just feeding new UI)
audio.addEventListener("timeupdate", () => {
  syncNowPlaying();
  if (current && audio.currentTime > 0) State.setPosition(current.id, Math.floor(audio.currentTime));
});
audio.addEventListener("play", updatePlayerMeta);
audio.addEventListener("pause", updatePlayerMeta);
audio.addEventListener("ended", () => { if (current) State.setPlayed(current.id, true); render(); });

function setMediaSession(ep) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ep.title, artist: ep.speakers?.join(", ") || ep.podcast, album: ep.series || ep.podcast,
    artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("seekbackward", () => (audio.currentTime -= 15));
  navigator.mediaSession.setActionHandler("seekforward", () => (audio.currentTime += 30));
}
```

- [ ] **Step 2: Update the boot block to restore last-played**

Replace the `load();` line near the bottom with:

```js
load().then(() => {
  const lastId = State.getLastPlayed();
  const ep = lastId && findEp(lastId);
  if (ep) {
    current = ep; audio.src = ep.audioUrl;
    const saved = State.getPlayback(ep.id).position;
    if (saved > 5) audio.currentTime = saved;
    player.classList.remove("hidden");
    updatePlayerMeta();
  }
});
```

- [ ] **Step 3: Append now-playing styles to `public/styles.css`**

```css
.np { text-align: center; }
.np-art { width: 60%; aspect-ratio: 1; margin: 4px auto 16px; border-radius: 14px; background-size: cover; background-position: center; }
.np-title { font-size: 17px; font-weight: 700; }
.np-sub { font-size: 13px; color: var(--muted); margin: 4px 0 16px; }
.np-seek { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); margin-bottom: 14px; }
.scrub { flex: 1; accent-color: var(--accent); }
.np-controls { display: flex; align-items: center; justify-content: center; gap: 26px; margin-bottom: 16px; }
.np-ctl { background: none; border: none; color: var(--text); font-size: 14px; }
.np-play { width: 56px; height: 56px; border-radius: 50%; background: var(--accent); color: var(--on-accent); border: none; font-size: 18px; }
```

- [ ] **Step 4: Verify**

Run: `node --check public/app.js`
**Manual:** play an episode from any view → mini-bar appears, audio plays; tap mini-bar → now-playing sheet with working scrub/±skip/play-pause; let it run a few seconds, reload → position restored and resume hero appears on Home. Confirm `data/state.json` gains the playback record.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: synced playback + restyled mini-bar and now-playing sheet"
```

---

## Task 10: Settings screen

**Files:**
- Modify: `public/app.js` (settings sheet + wire buttons), `public/styles.css` (append)

- [ ] **Step 1: Add the settings sheet and wire the buttons in `public/app.js`**

```js
function openSettings() {
  const pref = Theme.getStored();
  const opt = (val, label) => `<button class="seg ${pref === val ? "on" : ""}" data-theme="${val}">${label}</button>`;
  openSheet(`
    <h2 class="sheet-title">Settings</h2>
    <div class="set-label">Theme</div>
    <div class="seg-group">${opt("auto", "Auto")}${opt("light", "Light")}${opt("dark", "Dark")}</div>
    <div class="set-label">About</div>
    <p class="add-msg">PodLab · multi-podcast PWA. Feed refresh runs in the background.</p>
    <button class="sheet-row cancel" id="setClose">Close</button>`);
  $("#setClose").addEventListener("click", closeSheet);
  $("#sheetBody").querySelectorAll("[data-theme]").forEach((el) =>
    el.addEventListener("click", () => { Theme.setTheme(el.dataset.theme); openSettings(); }));
}

$("#settingsBtn").addEventListener("click", openSettings);
$("#addBtnSide").addEventListener("click", addPodcastFlow);
```

- [ ] **Step 2: Append settings styles to `public/styles.css`**

```css
.set-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin: 10px 0 8px; }
.seg-group { display: flex; gap: 8px; margin-bottom: 6px; }
.seg { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: 13px; }
.seg.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
```

- [ ] **Step 3: Verify**

Run: `node --check public/app.js`
**Manual:** tap the ◐ icon (mobile) / it's reachable on desktop too → Settings sheet; switch Auto/Light/Dark → theme changes immediately and the active segment highlights; reload → choice persists with no flash. Sidebar "+ Add podcast" (desktop) opens the add sheet.

- [ ] **Step 4: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: settings sheet with theme toggle (auto/light/dark)"
```

---

## Task 11: Service worker precache + README

**Files:**
- Modify: `public/sw.js`, `README.md`

- [ ] **Step 1: Update `public/sw.js`**

Bump the cache name and precache the new modules + icons. Replace the `CACHE` and `SHELL` declarations:

```js
const CACHE = "podlab-shell-v3";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/state.js",
  "/select.js",
  "/theme.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon.svg",
  "/icons/apple-touch-icon.png",
];
```

- [ ] **Step 2: Update `README.md`**

- Features: note the rose redesign, light/dark theme with toggle, bottom-tab/sidebar navigation, Home feed (continue-listening), Library with in-app add/remove/grouping, and search. Keep the existing multi-podcast/sync bullets.
- Project layout table: add `public/theme.js` (theme state) and `public/select.js` (pure data selectors); note `public/app.js` now does tab routing + views.
- Roadmap: check off **App redesign** and **Fix logo** (real icon set wired in). Under a "Deferred / next" note, list the player-phase items: playback speed, sleep timer, seek redesign, iOS lock-screen series name, and the 15/30 skip-UX decision.

- [ ] **Step 3: Verify**

```bash
node --check public/sw.js
npm test
```
Expected: clean; `npm test` PASS (29 tests).

- [ ] **Step 4: Commit**

```bash
git add public/sw.js README.md
git commit -m "chore: precache redesign assets in SW; update README/roadmap"
```

---

## Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

Run: `npm test`
Expected: PASS — 29 tests (categorize 6, store 8, feed 3, server 4, theme 4, select 4).

- [ ] **Step 2: Syntax check all frontend modules**

```bash
for f in public/app.js public/state.js public/select.js public/theme.js public/sw.js; do node --check "$f" && echo "ok $f"; done
```
Expected: all ok.

- [ ] **Step 3: Smoke boot + asset/API check**

```bash
rm -rf data && PORT=9096 node server.js >/tmp/pl.log 2>&1 &
sleep 2
for a in / /app.js /select.js /theme.js /styles.css /manifest.webmanifest /icons/icon-512.png; do
  curl -s -o /dev/null -w "%{http_code} $a\n" "http://127.0.0.1:9096$a"; done
curl -s -o /dev/null -w "%{http_code} /api/podcasts\n" http://127.0.0.1:9096/api/podcasts
cat /tmp/pl.log
kill %1
```
Expected: all `200`; log shows "PodLab running", no errors.

- [ ] **Step 4: Manual checklist (mobile width + desktop width, light + dark)**

Run through the spec's Verification checklist: nav swap, Home (hero/continue/recent/empty), Library + ⋯ menu (remove/grouping), show→series→episodes, played toggle + hide-played + notes, Search grouped results, mini-bar → now-playing sheet (scrub/skip/play), add-podcast sheet, settings theme persistence with no flash, and the new home-screen/favicon icons.

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch` to merge `phase2-redesign` (verify tests on the merged result) or open a PR.

---

## Self-Review Notes

- **Spec coverage:** brand/theming (T2 tokens + T1 theme + T3 icons), nav Direction B responsive (T4), Home feed (T5), Library + management menu (T6), add-podcast sheet (T6), show/series/episodes + played/hide-played (T7), Search tab (T8), now-playing mini+sheet restyle (T9), settings (T10), SW precache + README (T11), final verification (T12). Non-goals (player features, rename, export) are not implemented — correct.
- **Testability:** only the two pure modules (`theme.js`, `select.js`) get `node:test` coverage; DOM/CSS is verified via `node --check` + smoke boot + manual checklist, consistent with the project's no-frontend-harness, zero-dep constraint.
- **Type/name consistency:** `Select.allEpisodes/recentEpisodes/inProgress/searchEpisodes`, `Theme.applyTheme/getStored/setTheme/resolveTheme/nextTheme`, `State.getAllPlayback/getPlayback/setPosition/setPlayed/setLastPlayed/getLastPlayed/loadState`, and the route shape `{tab,podcastId,series}` are used consistently across tasks. `play`/`epRow`/`epCard`/`openSheet`/`closeSheet`/`artStyleById`/`pct` are each defined once (T5/T6/T9) and referenced in order.
- **Ordering note:** `renderHome`/Search wire clicks to `play`, which is defined in T9; tasks execute in order, so by the time playback is exercised end-to-end (T9 manual step) all references resolve. Earlier tasks' manual checks inspect layout only.
