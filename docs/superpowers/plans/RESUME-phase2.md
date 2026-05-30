# Phase 2a (Redesign) — Resume State

**Saved:** 2026-05-30 (end of session, before implementation)
**Branch:** `phase2-redesign` (off `main`)
**Spec:** `docs/superpowers/specs/2026-05-30-podlab-redesign-design.md`
**Plan:** `docs/superpowers/plans/2026-05-30-podlab-redesign.md` (12 tasks)

## Where we are
Brainstorming + spec + plan are **DONE and committed**. **No implementation has started** — Task 1 is next. Backend tests green at 21 (theme/select tests arrive in T1/T2, bringing it to 29).

## Decisions locked (from brainstorming)
- **Scope:** browsing redesign only. Player behavior unchanged (restyle only). Player *features* deferred: playback speed, sleep timer, seek redesign, **iOS lock-screen series-name fix**, **15/30 skip-UX decision**. Also deferred: podcast rename, data export.
- **Brand:** rose `#9e4b6a` (soft `#b86a86`, deep `#7d3a54`) replaces blue. Equalizer-bar logo + `PODLAB` in JetBrains Mono. Real icon set lives in `podlab-assets/` (now committed) → copied to `public/icons/` in Task 3. JetBrains Mono is NOT shipped (falls back to system mono).
- **Theme:** light + dark, follow OS by default, manual toggle persisted (`podlab.theme`), pre-paint script to avoid flash.
- **Nav (Direction B):** Home / Search / Library + Add. Mobile = top bar (PODLAB lockup) + bottom tab bar. Desktop = left sidebar (PODLAB atop it, no separate top bar). One CSS breakpoint (760px) swaps them.
- **UI stack:** vanilla JS + plain-CSS design tokens. NO framework, NO build step, NO new deps.
- **Management in-app:** polished add-podcast sheet (replaces native prompt), per-podcast ⋯ menu (remove + flat/series toggle), settings screen (theme toggle). NOT rename.

## Task status (all pending)
T1 theme.js (TDD) · T2 select.js (TDD) · T3 icons+manifest+head · T4 token CSS + shell + responsive nav + tab routing · T5 Home feed · T6 Library + ⋯ menu + add sheet · T7 show/series/episodes · T8 Search · T9 playback + now-playing sheet · T10 settings · T11 SW precache + README · T12 final verification.

## Branch commits (main..HEAD)
```
bf32268 docs: add Phase 2a redesign implementation plan (12 tasks)
4079e67 docs: add Phase 2a redesign design spec
```
(plus the assets + gitignore + this resume commit). `main` tip: `0854498` (Phase 1 + the 502/data-dir fix, already deployed on ZimaOS).

## To resume in the morning
1. `git checkout phase2-redesign` (verify with `git branch --show-current`).
2. Re-read the plan; **execution mode was not chosen yet** — ask the user: subagent-driven-development (recommended) vs executing-plans (inline). Then start at **Task 1**.
3. Run `npm test` first to confirm the 21-test baseline is green.
4. Finish with `superpowers:finishing-a-development-branch` after T12.

## Already shipped early (out of plan order)
- **Icon swap is DONE and on `main`** (commit `a28bccd`, pushed): the real rose equalizer icon set + favicons + maskable variants replaced the placeholder "Q"; SW cache bumped to `podlab-shell-v3`; brand source committed to `podlab-assets/`; `data/` gitignored. `main` was merged into `phase2-redesign`. **Effect on the plan:** Task 3's icon-copy/manifest/favicon work is effectively already complete — when executing T3, verify icons exist and focus only on the redesign-specific head bits NOT yet done (the rose `theme-color` value + the pre-paint theme `<script>`). The SW `CACHE` is already `v3` (T11 leaves it at v3 — fine).
- User can redeploy `main` now (`git pull` on ZimaOS + `docker compose up -d --build`) to get the new icon; they may need to clear the old service worker / re-add the PWA to see it (the v3 cache bump forces this once loaded online).

## Loose ends / notes
- Visual companion server was stopped; mockups persist (gitignored) in `.superpowers/brainstorm/14742-1780131139/content/` if you want to re-reference the approved designs (brand-identity, directions, nav-final, library, desktop-b).
- On the user's devices, the **old service worker** may still serve stale `app.js` ("Couldn't load feed"); clearing it / re-adding the PWA was the fix. The redesign bumps the SW cache to `podlab-shell-v3` (Task 11), which will also force-refresh once deployed.
- `data/` is now gitignored (local runtime state from smoke boots).
