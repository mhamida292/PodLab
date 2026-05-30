import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../store.js";

async function tempStore(seed = []) {
  const dir = await mkdtemp(join(tmpdir(), "podlab-"));
  const store = createStore({ file: join(dir, "state.json"), seed });
  await store.ready();
  return { store, dir };
}

test("boot survives an unwritable data dir (degrades to in-memory, warns once)", async () => {
  // Simulate a non-writable data dir (e.g. a root-owned Docker bind mount):
  // put a regular file where the store will try to mkdir its parent dir, so
  // every persist() fails. The server must still boot and serve.
  const dir = await mkdtemp(join(tmpdir(), "podlab-ro-"));
  const blocker = join(dir, "blocker");
  await writeFile(blocker, "x"); // a FILE; mkdir(blocker) will fail
  const file = join(blocker, "state.json"); // dirname(file) === blocker (a file)

  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  try {
    const store = createStore({ file, seed: [{ feedUrl: "https://x/rss", name: "X" }] });
    await store.ready(); // must NOT reject despite persist() failing
    const s = await store.getState();
    assert.equal(s.podcasts.length, 1); // seeded in memory

    // Subsequent writes also don't throw and update in-memory state.
    await store.updatePlayback({ episodeId: "e1", position: 10, updatedAt: 1 });
    const s2 = await store.getState();
    assert.equal(s2.playback.e1.position, 10);
  } finally {
    console.error = orig;
  }
  assert.equal(errs.length, 1); // warns exactly once, not on every write
});

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
  assert.equal(p.mode, "flat");
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
  await store.updatePlayback({ episodeId: "e1", position: 50, updatedAt: 500 });
  let s = await store.getState();
  assert.equal(s.playback.e1.position, 100);
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
  const parsed = JSON.parse(raw);
  assert.equal(parsed.podcasts[0].name, "Z");
});
