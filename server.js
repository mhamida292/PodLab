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
