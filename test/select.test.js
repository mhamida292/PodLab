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
