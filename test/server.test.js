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
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (typeof url === "string" && url.startsWith("http://127.0.0.1")) {
      return realFetch(url, opts);
    }
    return new Response(fixture, { status: 200, headers: { "content-type": "text/xml" } });
  };
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
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      if (typeof url === "string" && url.startsWith("http://127.0.0.1")) {
        return savedFetch(url, opts);
      }
      return new Response("nope", { status: 404 });
    };
    const res = await fetch(`${base}/api/podcasts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedUrl: "https://bad/rss" }),
    });
    assert.equal(res.status, 400);
  } finally {
    globalThis.fetch = savedFetch;
  }
});
