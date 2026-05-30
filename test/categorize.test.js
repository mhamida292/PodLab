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
  assert.deepEqual(r.speakers, []);
});

test("generic mode: khutbah is NOT collapsed (no profile alias)", () => {
  const r = classify({ title: "Khutbah on Patience", categories: [] }, null);
  assert.equal(r.series, "Khutbah on Patience");
});
