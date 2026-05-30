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
