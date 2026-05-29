// Tiny zero-dependency server: serves the PWA + one JSON API.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getFeed } from "./feed.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const PORT = process.env.PORT || 9090;

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

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") path = "/index.html";
  const filePath = normalize(join(ROOT, path));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/episodes")) {
      const force = new URL(req.url, "http://x").searchParams.has("refresh");
      const feed = await getFeed({ force });
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-cache",
      });
      res.end(
        JSON.stringify({
          channel: feed.channel,
          fetchedAt: feed.fetchedAt,
          series: feed.series,
        })
      );
      return;
    }
    await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`PodLab running on http://0.0.0.0:${PORT}`);
  getFeed().then(
    (f) => console.log(`Feed loaded: ${f.series.length} series, ${f.episodes.length} episodes`),
    (e) => console.error("Initial feed load failed:", e.message)
  );
});
