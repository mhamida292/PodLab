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
  assert.equal(cure.episodes[0].id, "p_test:g-cure-2");
  assert.equal(cure.episodes[0].podcastId, "p_test");
  assert.equal(cure.episodes[0].podcast, "Test");
});

test("flat mode returns one chronological list, no series", () => {
  const podcast = { id: "p_flat", name: "Flat", mode: "flat", profile: null };
  const out = parseFeed(xml, podcast);
  assert.equal(out.series.length, 0);
  assert.equal(out.episodes.length, 3);
  assert.equal(out.episodes[0].id, "p_flat:g-khutbah-1");
});

test("channel metadata is parsed", () => {
  const out = parseFeed(xml, { id: "p_x", name: "X", mode: "flat" });
  assert.equal(out.channel.title, "Test Podcast");
  assert.equal(out.channel.image, "https://example.com/art.jpg");
});
