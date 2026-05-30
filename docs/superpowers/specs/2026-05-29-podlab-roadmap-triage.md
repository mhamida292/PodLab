# PodLab Roadmap Triage

**Date:** 2026-05-29
**Type:** Triage / sequencing doc (decomposition into sub-projects)

This document triages the six "projected changes" listed in the README, decides
the order to build them, and explains the dependencies that drive that order.
Each phase below becomes its own spec → plan → implementation cycle.

## The six listed items

From the README roadmap + known bugs:

1. Fix logo — replace the placeholder "Q" icon with real artwork.
2. Better media player — a richer player UI.
3. App redesign — overall visual/UX overhaul.
4. Multi-podcast categorization — handle podcasts beyond Qalam.
5. Lock-screen series name missing on iOS.
6. Skip button mislabeled ("10s" label, 30s seek).

## Findings that reshaped the triage

Two README claims did not match the code. Verified before sequencing:

- **Item 5 is a field-mapping issue, not data plumbing.** Episodes already
  carry `series` (`feed.js:63`); the API returns it and `setMediaSession`
  already reads `ep.series` (`app.js:165`). The series is mapped to the
  `album` field of `MediaMetadata`, and iOS's now-playing screen reliably
  surfaces **title** + **artist** but often **not album**. `artist` currently
  holds speakers (or "Qalam Institute"). Fix = remap fields (fold series into
  `artist`/title). This is a **player concern**, so it lives in Phase 2.

- **Item 6 is effectively already resolved.** There is no "10s" label anywhere
  in the code. Back is labeled `⟲15` and seeks −15s (`index.html:33`,
  `app.js:130`); forward is labeled `30⟳` and seeks +30s (`index.html:35`,
  `app.js:131`). Labels match behavior. The only real question is the
  **asymmetry** (15 back / 30 forward) — a skip-UX decision deferred to Phase 2.

## Decisions

- **Logo (item 1): deferred.** No artwork exists yet. Out of active planning;
  revisit when art is available. It's an asset swap into the existing icon
  pipeline (`generate-icons.js`) and depends on nothing else.
- **Multi-podcast (item 4): near-term and foundational.** Confirmed as
  definitely-coming-soon. The app today assumes a single feed end-to-end:
  one `FEED_URL` + Qalam-specific heuristics (`config.js`), a single-feed
  in-memory cache (`feed.js`), and a two-tier nav (`home → series → episodes`,
  `app.js`). Multi-podcast adds a tier on top: `podcast → series → episodes`.
- **Sequencing principle: data model before pixels.** Because the redesign must
  sit on the new `podcast → series → episodes` hierarchy, building the UI first
  would mean redesigning navigation twice. So the data model hardens first.

## Phased plan (chosen: Foundation-first)

### Phase 1 — Multi-podcast foundation (backend + data + thin UI)
- Support multiple feeds with per-podcast configuration (feed URL +
  categorization heuristics scoped per podcast).
- `feed.js` cache becomes per-podcast; background refresh per feed.
- API returns a `podcast → series → episodes` structure; every episode carries
  its `podcast` and `series`.
- Minimal, functional UI: a podcast-selection tier above the existing series
  view. Visuals stay plain — polish comes in Phase 2.
- **Out of scope:** visual redesign, player improvements.

### Phase 2 — Player + redesign (UI overhaul on the new nav)
- Visual/UX overhaul of the whole app, built on Phase 1's three-tier nav.
- Richer media player UI.
- **Resolve item 5:** map series into a field iOS surfaces on the lock screen
  (e.g., `artist`, or a composed title), validated on-device.
- **Resolve the skip-UX question (item 6):** decide symmetric vs 15/30 vs
  configurable skip amounts; reconcile button labels, click handlers, and
  MediaSession seek handlers.
- **Out of scope:** multi-podcast data model (done in Phase 1), logo art.

### Deferred (no phase)
- **Logo art (item 1)** — blocked on artwork; independent asset swap when ready.

## Build order

1. **Phase 1** — multi-podcast foundation.
2. **Phase 2** — player + redesign (includes items 5 and the skip-UX decision).
3. **Logo** — whenever artwork exists; slots in anytime, no dependencies.

Each phase gets its own brainstorm → spec → plan → implementation cycle. Phase 1
is the next thing to design in depth.
