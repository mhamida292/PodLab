# PodLab Phase 1 — Multi-podcast Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn PodLab from a single-feed Qalam listener into a multi-podcast app with server-synced playback state, continue-listening, played/watched, and global search.

**Architecture:** A writable server-side JSON store (`store.js`, built as an injectable factory for testability) becomes the source of truth for podcasts + playback. `feed.js` becomes multi-feed with per-podcast caches and namespaced episode IDs. `categorize.js` gains profile-based heuristics (Qalam keeps its tuned lists; other series feeds use generic title-prefix grouping). `server.js` exposes podcasts CRUD + state read/write. The frontend gains a three-tier nav (Podcasts grid → series/flat → episodes) and a sync layer replacing localStorage-only resume.

**Tech Stack:** Node 18+ (Node 24 in dev), ES modules, zero runtime dependencies. Tests use the built-in `node:test` runner with `node:assert/strict`. No frontend framework — vanilla DOM, as today.

**Spec:** `docs/superpowers/specs/2026-05-29-podlab-phase1-multipodcast-design.md`

---

## File Structure

**Created:**
- `test/fixtures/sample-feed.xml` — a small static RSS feed for parser/server tests.
- `test/categorize.test.js`, `test/store.test.js`, `test/feed.test.js`, `test/server.test.js`
- `public/state.js` — frontend sync layer (load/cache/debounced-write of playback state).

**Modified:**
- `config.js` — replace single `FEED_URL` + loose lists with categorization **profiles** + `SEED_PODCASTS`.
- `categorize.js` — `classify(episode, profile)` takes a profile; no profile = generic grouping.
- `feed.js` — per-podcast cache, namespaced episode IDs, flat vs series output; `parseFeed(xml, podcast)` pure + `getPodcastFeed(podcast)`.
- `server.js` — new JSON API (podcasts CRUD + `/api/state`), wires the store.
- `package.json` — add `"test": "node --test"`.
- `public/app.js` — three-tier nav, Add flow, continue-listening, played, search; use `state.js` instead of `LS.pos`.
- `public/index.html` — search box, continue-listening container, add-podcast affordance.
- `public/styles.css` — styles for grid home, tiles, shelf, played state, search.
- `README.md` — update roadmap checkboxes + project layout.

---

## Task 1: Test runner wiring + fixture feed

**Files:**
- Modify: `package.json`
- Create: `test/fixtures/sample-feed.xml`
- Create: `test/smoke.test.js` (temporary; deleted in Task 1 step 5)

- [ ] **Step 1: Add the test script**

In `package.json`, add a `test` script under `scripts`:

```json
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Create the fixture feed**

Create `test/fixtures/sample-feed.xml` (a multi-series feed exercising title-prefix, Khutbah, and a speaker tag):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <description>Fixture feed</description>
    <itunes:image href="https://example.com/art.jpg"/>
    <item>
      <title>The Cure: Episode 1</title>
      <guid>g-cure-1</guid>
      <category>Podcast</category>
      <category>Shaykh Test Speaker</category>
      <enclosure url="https://cdn.example.com/cure1.mp3" type="audio/mpeg"/>
      <itunes:duration>40:00</itunes:duration>
      <pubDate>Mon, 05 May 2025 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Notes one.</p>]]></description>
    </item>
    <item>
      <title>The Cure: Episode 2</title>
      <guid>g-cure-2</guid>
      <enclosure url="https://cdn.example.com/cure2.mp3" type="audio/mpeg"/>
      <itunes:duration>41:00</itunes:duration>
      <pubDate>Tue, 06 May 2025 10:00:00 GMT</pubDate>
      <description>Notes two.</description>
    </item>
    <item>
      <title>Khutbah on Patience</title>
      <guid>g-khutbah-1</guid>
      <enclosure url="https://cdn.example.com/khutbah1.mp3" type="audio/mpeg"/>
      <itunes:duration>20:00</itunes:duration>
      <pubDate>Wed, 07 May 2025 10:00:00 GMT</pubDate>
      <description>Khutbah notes.</description>
    </item>
  </channel>
</rss>
```

- [ ] **Step 3: Create a smoke test**

Create `test/smoke.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run it to verify the runner works**

Run: `npm test`
Expected: PASS, 1 test passing.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm test/smoke.test.js
git add package.json test/fixtures/sample-feed.xml
git commit -m "test: add node:test runner script and fixture feed"
```

---

## Task 2: Categorization profiles in config.js

**Files:**
- Modify: `config.js`
- Test: `test/categorize.test.js` (added in Task 3)

- [ ] **Step 1: Rewrite config.js around profiles**

Replace the entire contents of `config.js` with:

```js
// Configuration: refresh cadence, categorization profiles, and seed podcasts.
// Kept in one place so it's trivial to tune.

// How often (ms) to re-fetch + re-parse each feed in the background.
export const REFRESH_MS = 30 * 60 * 1000; // 30 minutes

// A categorization profile bundles the heuristics used in "series" mode.
// Podcasts with no profile fall back to generic title-prefix grouping.
const qalam = {
  // Category tags that are pure noise — never a series, never a speaker.
  NOISE_TAGS: new Set(
    ["podcast", "qalam institute", "qalam", "qalaminstitute"].map((s) => s.toLowerCase())
  ),
  // Honorifics that mark a category tag as a speaker name rather than a series.
  SPEAKER_HONORIFICS: [
    "shaykh", "sheikh", "shaikh", "shayk", "sh.",
    "mufti", "ustadh", "ustadha", "ustadhah", "imam",
    "hafidh", "hafiz", "qari", "dr.", "dr",
  ],
  // Known speaker names (lowercased) so we catch un-prefixed variants.
  KNOWN_SPEAKERS: new Set(
    [
      "Abdul Nasir Jangda", "Mikaeel Smith", "Mikaeel Ahmed Smith",
      "Hussain Kamani", "Abdelrahman Murphy", "Abdel Rahman Murphy",
      "Noman Hussain", "Muntasir Zaman", "Fatima Lette", "Khadeejah Bari",
      "Samrina Qureshi", "Naeem Baig", "Obaidullah Ahmed", "Ameen Almallah",
      "Syed Omair", "Ozair Hasan", "Adam Anwer", "Shaheer Syed",
      "Khalil Abdur-Rashid", "Hasan Murtaza Zaidi", "Murphy",
    ].map((s) => s.toLowerCase())
  ),
  // Series-name aliases -> canonical name (merge variants/typos).
  SERIES_ALIASES: new Map([
    ["khutbah", "Khutbahs"],
    ["khutbahs", "Khutbahs"],
    ["the cure", "The Cure"],
    ["the beloved", "The Beloved"],
  ]),
};

export const PROFILES = { qalam };

// Look up a profile by name. Returns null for unknown/empty names (generic mode).
export function getProfile(name) {
  return name ? PROFILES[name] || null : null;
}

// Seeded into the store on first boot so existing Qalam users see no regression.
export const SEED_PODCASTS = [
  {
    feedUrl: process.env.FEED_URL || "https://feeds.feedburner.com/QalamPodcast",
    name: "Qalam Podcast",
    image: "",
    mode: "series",
    profile: "qalam",
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add config.js
git commit -m "feat: replace single feed config with categorization profiles + seed"
```

---

## Task 3: categorize.js accepts a profile

**Files:**
- Modify: `categorize.js`
- Test: `test/categorize.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/categorize.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../categorize.js";
import { getProfile } from "../config.js";

const qalam = getProfile("qalam");

test("series mode with profile: title prefix becomes the series", () => {
  const r = classify({ title: "The Cure: Episode 1", categories: ["Podcast"] }, qalam);
  assert.equal(r.series, "The Cure");
});

test("series mode with profile: speaker tags become speakers, not series", () => {
  const r = classify(
    { title: "The Cure: Episode 1", categories: ["Shaykh Test Speaker"] },
    qalam
  );
  assert.deepEqual(r.speakers, ["Shaykh Test Speaker"]);
});

test("series mode with profile: khutbah titles collapse to Khutbahs", () => {
  const r = classify({ title: "Khutbah on Patience", categories: [] }, qalam);
  assert.equal(r.series, "Khutbahs");
});

test("series mode with profile: aliases merge variants", () => {
  const r = classify({ title: "the cure: x", categories: [] }, qalam);
  assert.equal(r.series, "The Cure");
});

test("generic mode (no profile): prefix grouping, no speaker filtering", () => {
  const r = classify(
    { title: "The Cure: Episode 1", categories: ["Shaykh Test Speaker"] },
    null
  );
  assert.equal(r.series, "The Cure");
  assert.deepEqual(r.speakers, []); // no speaker detection without a profile
});

test("generic mode: khutbah is NOT collapsed (no profile alias)", () => {
  const r = classify({ title: "Khutbah on Patience", categories: [] }, null);
  assert.equal(r.series, "Khutbah on Patience");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/categorize.test.js`
Expected: FAIL — `classify` currently imports from config.js the old named exports (which no longer exist) and ignores the profile argument.

- [ ] **Step 3: Rewrite categorize.js to take a profile**

Replace the entire contents of `categorize.js` with:

```js
// Turns a raw parsed episode into a { series, speakers } classification.
//
// Strategy (in order of trust):
//   1. Title prefix before the first separator (: – -) is the strongest signal.
//   2. With a profile: khutbah aliases collapse, speaker tags are detected.
//   3. No confident series -> "Misc".
//
// A `profile` (from config.js) supplies the heuristics. Without one, generic
// title-prefix grouping is used: no speaker filtering, no aliases.

const MISC = "Misc";
const SEPARATORS = [":", "–", "—", " - "]; // colon, en/em dash, spaced hyphen

function titlePrefix(title) {
  let cut = -1;
  for (const sep of SEPARATORS) {
    const i = title.indexOf(sep);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  return (cut === -1 ? title : title.slice(0, cut)).trim();
}

function makeHelpers(profile) {
  const noise = profile?.NOISE_TAGS ?? new Set();
  const honorifics = profile?.SPEAKER_HONORIFICS ?? [];
  const known = profile?.KNOWN_SPEAKERS ?? new Set();
  const aliases = profile?.SERIES_ALIASES ?? new Map();

  const canonicalSeries = (name) =>
    aliases.get(name.trim().toLowerCase()) || name.trim();

  const looksLikeSpeaker = (tag) => {
    if (!profile) return false; // generic mode does no speaker detection
    const lower = tag.toLowerCase();
    if (known.has(lower)) return true;
    return honorifics.some((h) => lower === h || lower.startsWith(h + " "));
  };

  const isNoise = (tag) => noise.has(tag.trim().toLowerCase());

  return { canonicalSeries, looksLikeSpeaker, isNoise };
}

export function classify({ title, categories }, profile = null) {
  const { canonicalSeries, looksLikeSpeaker, isNoise } = makeHelpers(profile);

  const cats = (categories || []).filter((c) => !isNoise(c));

  const speakers = [
    ...new Set(cats.filter(looksLikeSpeaker).map((c) => c.trim())),
  ];

  // Khutbah special case only when the profile defines that alias.
  if (profile?.SERIES_ALIASES?.has("khutbah") && /^khutbah/i.test(title.trim())) {
    return { series: "Khutbahs", speakers };
  }

  const prefix = titlePrefix(title);
  if (prefix && prefix.length >= 3 && !looksLikeSpeaker(prefix)) {
    return { series: canonicalSeries(prefix), speakers };
  }

  const seriesTag = cats.find((c) => !looksLikeSpeaker(c));
  if (seriesTag) return { series: canonicalSeries(seriesTag), speakers };

  return { series: MISC, speakers };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/categorize.test.js`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add categorize.js test/categorize.test.js
git commit -m "feat: profile-based categorization (qalam tuned, generic fallback)"
```

---

## Task 4: store.js — persistent state factory

**Files:**
- Create: `store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/store.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../store.js";

async function tempStore(seed = []) {
  const dir = await mkdtemp(join(tmpdir(), "podlab-"));
  const store = createStore({ file: join(dir, "state.json"), seed });
  await store.ready();
  return { store, dir };
}

test("seeds podcasts on first boot", async () => {
  const { store } = await tempStore([
    { feedUrl: "https://x/rss", name: "Seed", mode: "series", profile: "qalam" },
  ]);
  const s = await store.getState();
  assert.equal(s.podcasts.length, 1);
  assert.equal(s.podcasts[0].name, "Seed");
  assert.ok(s.podcasts[0].id);
});

test("addPodcast and removePodcast", async () => {
  const { store } = await tempStore();
  const p = await store.addPodcast({ feedUrl: "https://y/rss", name: "Y" });
  assert.equal(p.mode, "flat"); // default
  let s = await store.getState();
  assert.equal(s.podcasts.length, 1);
  await store.removePodcast(p.id);
  s = await store.getState();
  assert.equal(s.podcasts.length, 0);
});

test("setPodcastMode changes mode", async () => {
  const { store } = await tempStore();
  const p = await store.addPodcast({ feedUrl: "https://y/rss", name: "Y" });
  await store.setPodcastMode(p.id, "series");
  const s = await store.getState();
  assert.equal(s.podcasts[0].mode, "series");
});

test("updatePlayback applies last-write-wins by updatedAt", async () => {
  const { store } = await tempStore();
  await store.updatePlayback({ episodeId: "e1", position: 100, updatedAt: 1000 });
  // Older write is ignored.
  await store.updatePlayback({ episodeId: "e1", position: 50, updatedAt: 500 });
  let s = await store.getState();
  assert.equal(s.playback.e1.position, 100);
  // Newer write wins.
  await store.updatePlayback({ episodeId: "e1", position: 200, updatedAt: 2000 });
  s = await store.getState();
  assert.equal(s.playback.e1.position, 200);
});

test("updatePlayback merges fields (played without losing position)", async () => {
  const { store } = await tempStore();
  await store.updatePlayback({ episodeId: "e1", position: 100, updatedAt: 1000 });
  await store.updatePlayback({ episodeId: "e1", played: true, updatedAt: 2000 });
  const s = await store.getState();
  assert.equal(s.playback.e1.position, 100);
  assert.equal(s.playback.e1.played, true);
});

test("setLastPlayed records the episode", async () => {
  const { store } = await tempStore();
  await store.setLastPlayed("e9");
  const s = await store.getState();
  assert.equal(s.lastPlayed, "e9");
});

test("persists valid JSON to disk", async () => {
  const { store, dir } = await tempStore();
  await store.addPodcast({ feedUrl: "https://z/rss", name: "Z" });
  const raw = await readFile(join(dir, "state.json"), "utf8");
  const parsed = JSON.parse(raw); // throws if invalid
  assert.equal(parsed.podcasts[0].name, "Z");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/store.test.js`
Expected: FAIL — `store.js` does not exist.

- [ ] **Step 3: Implement store.js**

Create `store.js`:

```js
// Writable server-side state, persisted to a JSON file. Single shared state
// (no users/auth). Built as a factory so tests can use a temp file.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const newId = () => "p_" + randomBytes(4).toString("hex");

function emptyState() {
  return { podcasts: [], playback: {}, lastPlayed: null };
}

export function createStore({ file, seed = [] } = {}) {
  let state = null;

  async function load() {
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch {
      state = emptyState();
    }
    // Seed only when there are no podcasts yet.
    if (state.podcasts.length === 0 && seed.length) {
      for (const s of seed) {
        state.podcasts.push({
          id: newId(),
          feedUrl: s.feedUrl,
          name: s.name || s.feedUrl,
          image: s.image || "",
          mode: s.mode || "flat",
          profile: s.profile || null,
          addedAt: Date.now(),
        });
      }
      await persist();
    }
  }

  // Atomic write: temp file + rename.
  async function persist() {
    await mkdir(dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, file);
  }

  const loaded = load();

  return {
    ready: () => loaded,

    async getState() {
      await loaded;
      return state;
    },

    async addPodcast({ feedUrl, name, image, mode, profile }) {
      await loaded;
      const podcast = {
        id: newId(),
        feedUrl,
        name: name || feedUrl,
        image: image || "",
        mode: mode || "flat",
        profile: profile || null,
        addedAt: Date.now(),
      };
      state.podcasts.push(podcast);
      await persist();
      return podcast;
    },

    async removePodcast(id) {
      await loaded;
      state.podcasts = state.podcasts.filter((p) => p.id !== id);
      await persist();
    },

    async setPodcastMode(id, mode) {
      await loaded;
      const p = state.podcasts.find((x) => x.id === id);
      if (p) {
        p.mode = mode;
        await persist();
      }
      return p;
    },

    async updatePlayback({ episodeId, position, played, updatedAt }) {
      await loaded;
      const prev = state.playback[episodeId];
      if (prev && prev.updatedAt > updatedAt) return prev; // last-write-wins
      const next = {
        position: position ?? prev?.position ?? 0,
        played: played ?? prev?.played ?? false,
        updatedAt,
      };
      state.playback[episodeId] = next;
      await persist();
      return next;
    },

    async setLastPlayed(episodeId) {
      await loaded;
      state.lastPlayed = episodeId;
      await persist();
    },
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/store.test.js`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add store.js test/store.test.js
git commit -m "feat: add persistent state store (podcasts + playback, last-write-wins)"
```

---

## Task 5: feed.js multi-feed parsing

**Files:**
- Modify: `feed.js`
- Test: `test/feed.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/feed.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseFeed } from "../feed.js";

const xml = await readFile(
  fileURLToPath(new URL("./fixtures/sample-feed.xml", import.meta.url)),
  "utf8"
);

test("series mode groups episodes and namespaces ids", () => {
  const podcast = { id: "p_test", name: "Test", mode: "series", profile: "qalam" };
  const out = parseFeed(xml, podcast);
  const names = out.series.map((s) => s.name).sort();
  assert.deepEqual(names, ["Khutbahs", "The Cure"]);
  const cure = out.series.find((s) => s.name === "The Cure");
  assert.equal(cure.count, 2);
  assert.equal(cure.episodes[0].id, "p_test:g-cure-2"); // newest first, namespaced
  assert.equal(cure.episodes[0].podcastId, "p_test");
  assert.equal(cure.episodes[0].podcast, "Test");
});

test("flat mode returns one chronological list, no series", () => {
  const podcast = { id: "p_flat", name: "Flat", mode: "flat", profile: null };
  const out = parseFeed(xml, podcast);
  assert.equal(out.series.length, 0);
  assert.equal(out.episodes.length, 3);
  assert.equal(out.episodes[0].id, "p_flat:g-khutbah-1"); // newest first
});

test("channel metadata is parsed", () => {
  const out = parseFeed(xml, { id: "p_x", name: "X", mode: "flat" });
  assert.equal(out.channel.title, "Test Podcast");
  assert.equal(out.channel.image, "https://example.com/art.jpg");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/feed.test.js`
Expected: FAIL — `parseFeed` is not exported by `feed.js`.

- [ ] **Step 3: Rewrite feed.js**

Replace the entire contents of `feed.js` with:

```js
// Fetches + parses RSS feeds. Multi-feed: a per-podcast in-memory cache with
// background refresh. parseFeed is pure (no network) for testability.

import { REFRESH_MS, getProfile } from "./config.js";
import { classify } from "./categorize.js";

const caches = new Map(); // podcastId -> { fetchedAt, channel, series, episodes }
const refreshing = new Map(); // podcastId -> Promise

// --- tiny, forgiving XML helpers ---

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .replace(/&apos;/g, "'");
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}

function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}

function stripHtml(html) {
  return decode(html)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Pure: parse feed XML for a given podcast config into { channel, series, episodes }.
export function parseFeed(xml, podcast) {
  const profile = podcast.mode === "series" ? getProfile(podcast.profile) : null;

  const channelBlock = xml.match(/<channel>([\s\S]*?)<item>/i)?.[1] || xml;
  const channel = {
    title: tag(channelBlock, "title") || podcast.name || "Podcast",
    description: tag(channelBlock, "description"),
    image: attr(channelBlock, "itunes:image", "href"),
  };

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const episodes = items
    .map((it, idx) => {
      const title = tag(it, "title");
      const categories = [...it.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map(
        (c) => decode(c[1]).trim()
      );
      const rawId = tag(it, "guid") || attr(it, "enclosure", "url") || String(idx);
      const { series, speakers } =
        podcast.mode === "series"
          ? classify({ title, categories }, profile)
          : { series: null, speakers: [] };
      return {
        id: `${podcast.id}:${rawId}`,
        podcastId: podcast.id,
        podcast: podcast.name,
        title,
        series,
        speakers,
        audioUrl: attr(it, "enclosure", "url"),
        duration: tag(it, "itunes:duration"),
        pubDate: tag(it, "pubDate"),
        pubTs: Date.parse(tag(it, "pubDate")) || 0,
        notes: stripHtml(tag(it, "description")),
        link: tag(it, "link"),
      };
    })
    .filter((e) => e.audioUrl)
    .sort((a, b) => b.pubTs - a.pubTs);

  if (podcast.mode !== "series") {
    return { channel, series: [], episodes };
  }

  // Group into series, newest first within each, series ordered by count.
  const map = new Map();
  for (const ep of episodes) {
    if (!map.has(ep.series)) map.set(ep.series, []);
    map.get(ep.series).push(ep);
  }
  const series = [...map.entries()]
    .map(([name, eps]) => ({ name, count: eps.length, episodes: eps }))
    .sort((a, b) => {
      if (a.name === "Misc") return 1;
      if (b.name === "Misc") return -1;
      return b.count - a.count;
    });

  return { channel, series, episodes };
}

async function refresh(podcast) {
  const res = await fetch(podcast.feedUrl, {
    headers: { "user-agent": "podlab/0.2" },
  });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  const xml = await res.text();
  const parsed = parseFeed(xml, podcast);
  caches.set(podcast.id, { fetchedAt: Date.now(), ...parsed });
  return caches.get(podcast.id);
}

// Fetch (or serve cached) parsed feed for one podcast.
export async function getPodcastFeed(podcast, { force = false } = {}) {
  const cached = caches.get(podcast.id);
  const stale = !cached || Date.now() - cached.fetchedAt > REFRESH_MS;
  if (force || stale) {
    if (!refreshing.has(podcast.id)) {
      const p = refresh(podcast).finally(() => refreshing.delete(podcast.id));
      refreshing.set(podcast.id, p);
    }
    if (!cached) await refreshing.get(podcast.id); // no data yet: wait
  }
  return caches.get(podcast.id) || { fetchedAt: 0, channel: {}, series: [], episodes: [] };
}

// Fetch a feed once for the "add podcast" preview (no caching side effects).
export async function fetchFeedPreview(feedUrl) {
  const res = await fetch(feedUrl, { headers: { "user-agent": "podlab/0.2" } });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  const xml = await res.text();
  const tmp = { id: "preview", name: "", mode: "flat", profile: null };
  const parsed = parseFeed(xml, tmp);
  return {
    name: parsed.channel.title,
    image: parsed.channel.image,
    episodeCount: parsed.episodes.length,
  };
}

export function dropCache(podcastId) {
  caches.delete(podcastId);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/feed.test.js`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add feed.js test/feed.test.js
git commit -m "feat: multi-feed parsing with profiles, namespaced ids, flat/series"
```

---

## Task 6: server.js API

**Files:**
- Modify: `server.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/server.test.js`. These start the app on an ephemeral port with a temp store and a stubbed `fetch` returning the fixture, then exercise the endpoints.

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../store.js";
import { createApp } from "../server.js";

const fixture = await readFile(
  fileURLToPath(new URL("./fixtures/sample-feed.xml", import.meta.url)),
  "utf8"
);

let server, base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "podlab-srv-"));
  const store = createStore({ file: join(dir, "state.json") });
  await store.ready();
  globalThis.fetch = async () =>
    new Response(fixture, { status: 200, headers: { "content-type": "text/xml" } });
  const app = createApp({ store });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("POST /api/podcasts adds a podcast and previews it", async () => {
  const res = await fetch(`${base}/api/podcasts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feedUrl: "https://x/rss" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.name, "Test Podcast");
  assert.equal(body.mode, "flat");
  assert.ok(body.id);
});

test("GET /api/podcasts returns nested content", async () => {
  const res = await fetch(`${base}/api/podcasts`);
  const body = await res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].episodes.length, 3); // flat
});

test("PUT and GET /api/state round-trips with last-write-wins", async () => {
  await fetch(`${base}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ episodeId: "e1", position: 42, updatedAt: 1000 }),
  });
  const res = await fetch(`${base}/api/state`);
  const body = await res.json();
  assert.equal(body.playback.e1.position, 42);
});

test("POST with a failing feed returns 4xx", async () => {
  globalThis.fetch = async () => new Response("nope", { status: 404 });
  const res = await fetch(`${base}/api/podcasts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feedUrl: "https://bad/rss" }),
  });
  assert.equal(res.status, 400);
});
```

> Note: the test reassigns `globalThis.fetch`; the last test deliberately leaves it failing, so keep it last.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — `createApp` is not exported by `server.js`.

- [ ] **Step 3: Rewrite server.js**

Replace the entire contents of `server.js` with:

```js
// Zero-dependency server: serves the PWA + a JSON API for podcasts + state.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { SEED_PODCASTS } from "./config.js";
import { getPodcastFeed, fetchFeedPreview, dropCache } from "./feed.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") path = "/index.html";
  const filePath = normalize(join(ROOT, path));
  if (!filePath.startsWith(ROOT)) return res.writeHead(403).end("forbidden");
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}

// Build the podcasts payload: each podcast with nested series/episodes.
async function podcastsPayload(store, force) {
  const { podcasts } = await store.getState();
  return Promise.all(
    podcasts.map(async (p) => {
      const feed = await getPodcastFeed(p, { force }).catch(() => ({
        series: [],
        episodes: [],
      }));
      return {
        id: p.id,
        name: p.name,
        image: p.image || feed.channel?.image || "",
        mode: p.mode,
        series: feed.series,
        episodes: feed.episodes,
      };
    })
  );
}

export function createApp({ store }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const { pathname } = url;

      if (pathname === "/api/podcasts" && req.method === "GET") {
        const force = url.searchParams.has("refresh");
        return sendJson(res, 200, await podcastsPayload(store, force));
      }

      if (pathname === "/api/podcasts" && req.method === "POST") {
        const { feedUrl } = await readBody(req);
        if (!feedUrl) return sendJson(res, 400, { error: "feedUrl required" });
        let preview;
        try {
          preview = await fetchFeedPreview(feedUrl);
        } catch (e) {
          return sendJson(res, 400, { error: "Could not fetch feed: " + e.message });
        }
        const p = await store.addPodcast({
          feedUrl,
          name: preview.name,
          image: preview.image,
        });
        return sendJson(res, 200, { ...p, episodeCount: preview.episodeCount });
      }

      const podMatch = pathname.match(/^\/api\/podcasts\/([^/]+)$/);
      if (podMatch && req.method === "PATCH") {
        const { mode } = await readBody(req);
        const p = await store.setPodcastMode(podMatch[1], mode);
        dropCache(podMatch[1]); // mode change => recategorize on next fetch
        return sendJson(res, 200, p || { error: "not found" });
      }
      if (podMatch && req.method === "DELETE") {
        await store.removePodcast(podMatch[1]);
        dropCache(podMatch[1]);
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === "/api/state" && req.method === "GET") {
        const s = await store.getState();
        return sendJson(res, 200, { playback: s.playback, lastPlayed: s.lastPlayed });
      }
      if (pathname === "/api/state" && req.method === "PUT") {
        const body = await readBody(req);
        if (!body.episodeId || typeof body.updatedAt !== "number") {
          return sendJson(res, 400, { error: "episodeId and updatedAt required" });
        }
        const rec = await store.updatePlayback(body);
        if (body.setLastPlayed) await store.setLastPlayed(body.episodeId);
        return sendJson(res, 200, rec);
      }

      await serveStatic(req, res);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: String(err.message || err) });
    }
  });
}

// Boot when run directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 9090;
  const store = createStore({
    file: process.env.STATE_FILE || join(process.cwd(), "data", "state.json"),
    seed: SEED_PODCASTS,
  });
  await store.ready();
  const app = createApp({ store });
  app.listen(PORT, () => {
    console.log(`PodLab running on http://0.0.0.0:${PORT}`);
  });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/server.test.js`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Run the full backend suite + commit**

Run: `npm test`
Expected: PASS — categorize + store + feed + server suites all green.

```bash
git add server.js test/server.test.js
git commit -m "feat: podcasts CRUD + state API on zero-dep server"
```

---

## Task 7: Frontend sync layer (state.js)

**Files:**
- Create: `public/state.js`
- Manual verification (no unit harness on the frontend).

- [ ] **Step 1: Implement the sync layer**

Create `public/state.js`:

```js
// Playback state synced with the server. Server is source of truth; we cache in
// localStorage and write through with debounced PUTs. Last-write-wins by updatedAt.

const CACHE_KEY = "podlab.state";
let mem = { playback: {}, lastPlayed: null };
const pending = new Map(); // episodeId -> latest record awaiting flush
let flushTimer = null;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function writeCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(mem));
}

// Merge two playback maps, newest updatedAt per episode wins.
function merge(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b)) {
    if (!out[id] || rec.updatedAt > out[id].updatedAt) out[id] = rec;
  }
  return out;
}

export async function loadState() {
  const cached = readCache();
  mem = { playback: cached.playback || {}, lastPlayed: cached.lastPlayed || null };
  try {
    const res = await fetch("/api/state");
    const server = await res.json();
    mem.playback = merge(mem.playback, server.playback || {});
    if (server.lastPlayed) mem.lastPlayed = server.lastPlayed;
    writeCache();
    // Push any local records newer than the server's back up.
    for (const [id, rec] of Object.entries(cached.playback || {})) {
      const s = (server.playback || {})[id];
      if (!s || rec.updatedAt > s.updatedAt) queueWrite(id, rec);
    }
  } catch { /* offline: cache-only */ }
  return mem;
}

export function getPlayback(episodeId) {
  return mem.playback[episodeId] || { position: 0, played: false, updatedAt: 0 };
}
export function getAllPlayback() { return mem.playback; }
export function getLastPlayed() { return mem.lastPlayed; }

export function setPosition(episodeId, position) {
  const rec = { ...getPlayback(episodeId), position, updatedAt: Date.now() };
  mem.playback[episodeId] = rec;
  writeCache();
  queueWrite(episodeId, rec);
}
export function setPlayed(episodeId, played) {
  const rec = { ...getPlayback(episodeId), played, updatedAt: Date.now() };
  if (played) rec.position = 0;
  mem.playback[episodeId] = rec;
  writeCache();
  queueWrite(episodeId, rec);
}
export function setLastPlayed(episodeId) {
  mem.lastPlayed = episodeId;
  writeCache();
  queueWrite(episodeId, { ...getPlayback(episodeId), setLastPlayed: true });
}

function queueWrite(episodeId, rec) {
  pending.set(episodeId, rec);
  if (!flushTimer) flushTimer = setTimeout(flush, 4000);
}
async function flush() {
  flushTimer = null;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [episodeId, rec] of batch) {
    fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId, ...rec, updatedAt: rec.updatedAt || Date.now() }),
    }).catch(() => pending.set(episodeId, rec)); // re-queue on failure
  }
}
// Flush promptly when the tab is hidden / closed.
window.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
```

- [ ] **Step 2: Verify it loads without errors**

Temporarily add `import "/state.js";` to the top of `public/app.js`, run `npm start`, open `http://localhost:9090`, and confirm the console shows no errors and `GET /api/state` returns `{playback:{},lastPlayed:null}` in the Network tab. Then remove the temporary import (Task 8 wires it properly).

- [ ] **Step 3: Commit**

```bash
git add public/state.js
git commit -m "feat: frontend playback sync layer (server-of-truth + cache, LWW)"
```

---

## Task 8: Frontend — Podcasts grid, navigation, and Add flow

**Files:**
- Modify: `public/index.html`, `public/app.js`, `public/styles.css`
- Manual verification.

- [ ] **Step 1: Update index.html**

In `public/index.html`, replace the `<main>` element and keep the player. Add a search box + continue-listening container that `app.js` populates. Replace:

```html
  <main id="view" class="view">
    <div class="loading">Loading episodes…</div>
  </main>
```

with:

```html
  <main id="view" class="view">
    <div id="home-extras" class="home-extras hidden">
      <input id="search" class="search" type="search" placeholder="Search podcasts, series, episodes…" />
      <div id="continue" class="continue hidden"></div>
    </div>
    <div id="list"><div class="loading">Loading…</div></div>
  </main>
```

- [ ] **Step 2: Rewrite app.js navigation around podcasts**

Replace the data + rendering + navigation sections of `public/app.js`. The full new structure (replace the file from the top through the `// ---------- playback ----------` marker, keeping playback/helpers/boot to be edited in later tasks):

```js
// Frontend: podcasts -> (series ->) episodes, play audio, synced positions.
import * as State from "/state.js";

const $ = (s) => document.querySelector(s);
const view = $("#view");
const list = $("#list");
const homeExtras = $("#home-extras");
const titleEl = $("#title");
const backBtn = $("#backBtn");
const audio = $("#audio");

let DATA = null;            // [{id,name,image,mode,series,episodes}]
let current = null;         // currently playing episode
let route = { name: "home", podcastId: null, series: null };
let hidePlayed = false;

async function load(force = false) {
  list.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    const res = await fetch("/api/podcasts" + (force ? "?refresh=1" : ""));
    DATA = await res.json();
    await State.loadState();
    render();
  } catch (e) {
    list.innerHTML = `<div class="loading">Couldn't load podcasts.<br>${e}</div>`;
  }
}

const podcastById = (id) => DATA.find((p) => p.id === id);
function allEpisodes() { return DATA.flatMap((p) => p.episodes); }
function findEp(id) { return allEpisodes().find((e) => e.id === id); }

// ---------- routing ----------
function render() {
  if (route.name === "home") return renderHome();
  if (route.name === "podcast") return renderPodcast(route.podcastId);
  if (route.name === "series") return renderSeries(route.podcastId, route.series);
}
function go(r) { route = r; window.scrollTo(0, 0); render(); }
backBtn.addEventListener("click", () => {
  if (route.name === "series") return go({ name: "podcast", podcastId: route.podcastId });
  go({ name: "home" });
});
$("#refreshBtn").addEventListener("click", () => load(true));

// ---------- home: podcast grid ----------
function renderHome() {
  backBtn.classList.add("hidden");
  titleEl.textContent = "PodLab";
  homeExtras.classList.remove("hidden");
  renderContinue();
  const tiles = DATA.map((p) => `
    <div class="tile" data-podcast="${esc(p.id)}">
      <div class="tile-art" style="${p.image ? `background-image:url('${esc(p.image)}')` : ""}">
        ${p.image ? "" : esc(p.name[0] || "?")}
      </div>
      <div class="tile-cap">
        <div class="tile-name">${esc(p.name)}</div>
        <div class="tile-meta"><span class="tag ${p.mode}">${p.mode}</span> ${epCount(p)}</div>
      </div>
    </div>`).join("");
  const addTile = `<div class="tile add" id="addTile">
      <div class="tile-art plus">+</div>
      <div class="tile-cap"><div class="tile-name muted">Add podcast</div></div>
    </div>`;
  list.innerHTML = `<div class="grid">${tiles}${addTile}</div>`;
  list.querySelectorAll(".tile[data-podcast]").forEach((el) =>
    el.addEventListener("click", () => go({ name: "podcast", podcastId: el.dataset.podcast }))
  );
  $("#addTile").addEventListener("click", addPodcastFlow);
}
function epCount(p) {
  const n = p.mode === "series" ? p.episodes.length : p.episodes.length;
  return `${n} episode${n === 1 ? "" : "s"}`;
}

// ---------- podcast: series list or flat episodes ----------
function renderPodcast(id) {
  const p = podcastById(id);
  if (!p) return go({ name: "home" });
  backBtn.classList.remove("hidden");
  homeExtras.classList.add("hidden");
  titleEl.textContent = p.name;
  if (p.mode === "series") {
    list.innerHTML = `<div class="series-grid">${p.series.map((s) => `
      <div class="series-card" data-series="${esc(s.name)}">
        <div class="name">${esc(s.name)}</div>
        <div class="count">${s.count} episode${s.count === 1 ? "" : "s"}</div>
      </div>`).join("")}</div>`;
    list.querySelectorAll(".series-card").forEach((el) =>
      el.addEventListener("click", () =>
        go({ name: "series", podcastId: id, series: el.dataset.series })));
  } else {
    renderEpisodes(p.episodes);
  }
}

function renderSeries(podcastId, name) {
  const p = podcastById(podcastId);
  const s = p?.series.find((x) => x.name === name);
  if (!s) return go({ name: "podcast", podcastId });
  backBtn.classList.remove("hidden");
  homeExtras.classList.add("hidden");
  titleEl.textContent = name;
  renderEpisodes(s.episodes);
}

// Episode list rendering is added/extended in later tasks (played, etc.).
function renderEpisodes(eps) {
  const shown = hidePlayed ? eps.filter((e) => !State.getPlayback(e.id).played) : eps;
  list.innerHTML =
    `<label class="hide-played"><input type="checkbox" id="hidePlayedCb" ${hidePlayed ? "checked" : ""}/> Hide played</label>` +
    shown.map(epCard).join("");
  $("#hidePlayedCb").addEventListener("change", (e) => { hidePlayed = e.target.checked; render(); });
  list.querySelectorAll(".ep").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".ep-title").addEventListener("click", (e) => {
      e.stopPropagation(); el.classList.toggle("open");
    });
    el.querySelector(".played-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      const rec = State.getPlayback(id);
      State.setPlayed(id, !rec.played);
      render();
    });
    el.addEventListener("click", () => play(findEp(id)));
  });
}
```

> The `epCard`, `play`, helpers, and boot sections are updated in Tasks 9–11. Leave the existing `epCard`/`play`/helpers below this block for now; they are replaced incrementally.

- [ ] **Step 3: Add the Add-podcast flow function**

Append to `public/app.js` (before the helpers section):

```js
// ---------- add podcast ----------
async function addPodcastFlow() {
  const feedUrl = prompt("Paste the podcast's RSS feed URL:");
  if (!feedUrl) return;
  list.innerHTML = `<div class="loading">Fetching feed…</div>`;
  let preview;
  try {
    const res = await fetch("/api/podcasts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedUrl }),
    });
    preview = await res.json();
    if (!res.ok) throw new Error(preview.error || "fetch failed");
  } catch (e) {
    alert("Couldn't add feed: " + e.message);
    return load();
  }
  const series = confirm(
    `Added "${preview.name}" (${preview.episodeCount} episodes).\n\n` +
    `OK = group into series (like Qalam). Cancel = flat episode list.`
  );
  if (series) {
    await fetch(`/api/podcasts/${preview.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "series" }),
    });
  }
  await load(true);
}
```

> This uses native `prompt`/`confirm` for Phase 1 (functional, zero-styling). The polished 3-step sheet from the mockup is Phase 2 redesign work.

- [ ] **Step 4: Add styles**

Append to `public/styles.css`:

```css
/* Home extras */
.home-extras { margin-bottom: 14px; }
.search {
  width: 100%; background: var(--surface); border: 1px solid #ffffff14;
  border-radius: 12px; padding: 11px 13px; color: var(--text); font-size: 14px;
}
.continue { margin-top: 14px; }
.continue.hidden { display: none; }
.continue h2 { font-size: 13px; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
.continue-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
.continue-item {
  flex: 0 0 200px; background: var(--surface); border: 1px solid #ffffff0d;
  border-radius: 12px; padding: 11px; cursor: pointer;
}
.continue-item .ci-pod { color: var(--muted); font-size: 11px; }
.continue-item .ci-title { font-size: 13px; font-weight: 600; margin: 4px 0 8px; }

/* Podcast grid */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
.tile { background: var(--surface); border: 1px solid #ffffff0d; border-radius: var(--radius); overflow: hidden; cursor: pointer; }
.tile:active { background: var(--surface-2); }
.tile-art {
  aspect-ratio: 1; background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center;
  font-size: 34px; font-weight: 700; color: #fff; background-color: var(--accent-2);
}
.tile-art.plus { background: var(--surface-2); color: var(--muted); }
.tile-cap { padding: 10px 11px 12px; }
.tile-name { font-weight: 650; font-size: 14px; line-height: 1.25; }
.tile-name.muted { color: var(--muted); }
.tile-meta { color: var(--muted); font-size: 12px; margin-top: 6px; display: flex; align-items: center; gap: 7px; }
.tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
.tag.series { background: #4f9cf922; color: var(--accent); }
.tag.flat { background: #ffffff12; color: var(--muted); }

/* Played state + hide-played */
.hide-played { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 13px; margin-bottom: 10px; }
.ep.played { opacity: .55; }
.played-toggle { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 15px; padding: 0 4px; }
.ep.played .played-toggle { color: var(--accent); }
```

- [ ] **Step 5: Manual verification**

Run `npm start`, open `http://localhost:9090`. Verify:
- Home shows the Qalam tile (seeded) + an "Add podcast" tile.
- Tapping Qalam shows its series; tapping a series shows episodes; Back walks up.
- "Add podcast" prompts for a URL — paste a real flat feed (e.g. any podcast RSS), confirm it appears as a flat tile and its episodes list.
- Network tab: `/api/podcasts` and `/api/state` both 200.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: podcast grid home, three-tier nav, add-podcast flow"
```

---

## Task 9: Playback wiring + Continue-listening shelf

**Files:**
- Modify: `public/app.js`
- Manual verification.

- [ ] **Step 1: Replace epCard to use synced state + played toggle**

In `public/app.js`, replace the existing `epCard` function with:

```js
function epCard(ep) {
  const rec = State.getPlayback(ep.id);
  const total = durToSec(ep.duration);
  const pct = total && rec.position ? Math.min(100, (rec.position / total) * 100) : 0;
  const playing = current && current.id === ep.id ? "playing" : "";
  const played = rec.played ? "played" : "";
  return `
    <div class="ep ${playing} ${played}" data-id="${esc(ep.id)}">
      <div class="ep-row">
        <div class="ep-title">${esc(ep.title)}</div>
        <button class="played-toggle" aria-label="Mark played">${rec.played ? "✓" : "○"}</button>
      </div>
      <div class="ep-sub">
        <span>${fmtDate(ep.pubDate)}</span>
        ${ep.duration ? `<span>${esc(ep.duration)}</span>` : ""}
        ${ep.speakers?.length ? `<span>${esc(ep.speakers.join(", "))}</span>` : ""}
      </div>
      ${pct ? `<div class="resume-bar"><i style="width:${pct}%"></i></div>` : ""}
      <div class="ep-notes">${esc(ep.notes || "No show notes.")}</div>
    </div>`;
}
```

Add to `public/styles.css`:

```css
.ep-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
```

- [ ] **Step 2: Replace play() and the timeupdate/ended handlers to use State**

Replace the `play` function and the audio event handlers with:

```js
function play(ep) {
  if (!ep) return;
  if (current?.id !== ep.id) {
    current = ep;
    audio.src = ep.audioUrl;
    const saved = State.getPlayback(ep.id).position;
    audio.currentTime = saved > 5 ? saved : 0;
    State.setLastPlayed(ep.id);
    updatePlayerMeta();
    setMediaSession(ep);
  }
  $("#player").classList.remove("hidden");
  audio.play();
  render();
}

audio.addEventListener("timeupdate", () => {
  if (audio.duration && !scrubbing) {
    scrub.value = (audio.currentTime / audio.duration) * 100;
    $("#cur").textContent = fmtTime(audio.currentTime);
    $("#dur").textContent = fmtTime(audio.duration);
  }
  if (current && audio.currentTime > 0) State.setPosition(current.id, Math.floor(audio.currentTime));
});
audio.addEventListener("play", updatePlayerMeta);
audio.addEventListener("pause", updatePlayerMeta);
audio.addEventListener("ended", () => {
  if (current) State.setPlayed(current.id, true);
  render();
});
```

> Remove the old `LS` object and any remaining `localStorage.getItem(LS.pos(...))` references — `state.js` owns this now.

- [ ] **Step 3: Add the continue-listening shelf renderer**

Add to `public/app.js`:

```js
function renderContinue() {
  const cont = $("#continue");
  const inProgress = Object.entries(State.getAllPlayback())
    .filter(([, r]) => r.position > 0 && !r.played)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id]) => findEp(id))
    .filter(Boolean)
    .slice(0, 12);
  if (inProgress.length === 0) { cont.classList.add("hidden"); cont.innerHTML = ""; return; }
  cont.classList.remove("hidden");
  cont.innerHTML = `<h2>Continue listening</h2><div class="continue-row">` +
    inProgress.map((ep) => `
      <div class="continue-item" data-id="${esc(ep.id)}">
        <div class="ci-pod">${esc(ep.podcast)}</div>
        <div class="ci-title">${esc(ep.title)}</div>
      </div>`).join("") + `</div>`;
  cont.querySelectorAll(".continue-item").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}
```

- [ ] **Step 4: Update the boot block**

Replace the boot block at the bottom of `public/app.js` with:

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
load().then(() => {
  const lastId = State.getLastPlayed();
  if (lastId && DATA) {
    const ep = findEp(lastId);
    if (ep) {
      current = ep;
      audio.src = ep.audioUrl;
      const saved = State.getPlayback(ep.id).position;
      if (saved > 5) audio.currentTime = saved;
      $("#player").classList.remove("hidden");
      updatePlayerMeta();
    }
  }
});
```

- [ ] **Step 5: Manual cross-device verification**

Run `npm start`. On your PC: play an episode ~30s, pause. Confirm:
- A "Continue listening" shelf appears on home with that episode.
- Reload — position is restored.
- The `data/state.json` file now contains the playback record.
- On your phone (over Tailscale, same server): open the app, confirm the same episode shows in Continue listening at the saved position. Play further on the phone, then reload the PC — position reflects the newer device (last-write-wins).

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: synced playback + continue-listening shelf"
```

---

## Task 10: Search

**Files:**
- Modify: `public/app.js`
- Manual verification.

- [ ] **Step 1: Add the search renderer + wire the input**

Add to `public/app.js`:

```js
// ---------- search ----------
function wireSearch() {
  const box = $("#search");
  if (!box || box.dataset.wired) return;
  box.dataset.wired = "1";
  box.addEventListener("input", () => renderSearch(box.value.trim().toLowerCase()));
}

function renderSearch(q) {
  if (!q) { render(); return; } // empty query restores normal home
  const groups = DATA.map((p) => {
    const matches = p.episodes.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.series && e.series.toLowerCase().includes(q)) ||
        p.name.toLowerCase().includes(q)
    );
    return { p, matches };
  }).filter((g) => g.matches.length);

  if (groups.length === 0) { list.innerHTML = `<div class="loading">No matches.</div>`; return; }
  list.innerHTML = groups.map((g) => `
    <div class="search-group"><h2>${esc(g.p.name)}</h2>
      ${g.matches.slice(0, 25).map((e) => `
        <div class="ep" data-id="${esc(e.id)}"><div class="ep-title">${esc(e.title)}</div>
          <div class="ep-sub"><span>${esc(e.series || "")}</span><span>${fmtDate(e.pubDate)}</span></div>
        </div>`).join("")}
    </div>`).join("");
  list.querySelectorAll(".ep").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}
```

- [ ] **Step 2: Call wireSearch from renderHome**

In `renderHome`, after `renderContinue();`, add:

```js
  wireSearch();
```

- [ ] **Step 3: Add styles**

Append to `public/styles.css`:

```css
.search-group { margin-bottom: 18px; }
.search-group h2 { font-size: 13px; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
```

- [ ] **Step 4: Manual verification**

Run `npm start`. On home, type into the search box:
- A term in an episode title → matching episodes appear grouped by podcast.
- A series name (e.g. "Cure") → episodes from that series appear.
- A podcast name → its episodes appear.
- Clearing the box restores the normal home (grid + continue shelf).
- Tapping a result plays the episode.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: global search across podcasts, series, episodes"
```

---

## Task 11: Docs + cleanup

**Files:**
- Modify: `README.md`, `.dockerignore`, `Dockerfile`/`docker-compose.yml` (state volume)

- [ ] **Step 1: Persist state across container restarts**

The store writes to `data/state.json`. Ensure it survives container recreation. In `docker-compose.yml`, add a volume mapping for `./data:/app/data` (read the file first to match its existing structure and indentation, then add the `volumes:` entry under the service). Confirm `.dockerignore` does not exclude needed files but DOES exclude `data/` from the image build context (add `data/` to `.dockerignore` if not present, so local state isn't baked into the image).

- [ ] **Step 2: Update README**

In `README.md`:
- Update the Features list to mention multiple podcasts, synced playback across devices, continue-listening, played/watched, and search.
- Update the Configuration section: `config.js` now holds `REFRESH_MS`, categorization **profiles**, and `SEED_PODCASTS`; podcasts are added at runtime in the UI; state persists to `data/state.json`.
- Update the Project layout table to add `store.js` and `public/state.js`.
- In Roadmap, check off **Multi-podcast categorization**. Under Known bugs, mark the skip-button item resolved (labels already match: back 15s, forward 30s) and note the lock-screen series-name fix is scheduled for the Phase 2 player work.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all backend suites green.

- [ ] **Step 4: Commit**

```bash
git add README.md docker-compose.yml .dockerignore
git commit -m "docs: update README for multi-podcast; persist state volume"
```

---

## Self-Review Notes

- **Spec coverage:** store/persistence (T4), profiles (T2–T3), multi-feed + namespacing + flat/series (T5), API incl. CRUD + state (T6), sync layer LWW (T7), grid home + nav + add flow (T8), synced playback + continue-listening (T9), played/hide-played (T8 wiring + T9 epCard), search (T10), docs + state volume (T11). iOS lock-screen + skip-UX + redesign are explicitly Phase 2 (out of scope).
- **Type consistency:** `parseFeed(xml, podcast)`, `getPodcastFeed(podcast, {force})`, `createStore({file, seed})`, `updatePlayback({episodeId, position, played, updatedAt})`, and the `State.*` names (`getPlayback`, `setPosition`, `setPlayed`, `setLastPlayed`, `getAllPlayback`, `getLastPlayed`, `loadState`) are used consistently across tasks.
- **Known simplification:** Add-podcast UI uses native `prompt`/`confirm` in Phase 1; the polished sheet is Phase 2 redesign work (noted in T8).
