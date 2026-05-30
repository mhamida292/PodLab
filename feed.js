// Fetches + parses RSS feeds. Multi-feed: a per-podcast in-memory cache with
// background refresh. parseFeed is pure (no network) for testability.

import { REFRESH_MS, getProfile } from "./config.js";
import { classify } from "./categorize.js";

const caches = new Map(); // podcastId -> { fetchedAt, channel, series, episodes }
const refreshing = new Map(); // podcastId -> Promise

// --- tiny, forgiving XML helpers ---

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&apos;/g, "'");
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}

function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}

function stripHtml(html) {
  return decode(html)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Pure: parse feed XML for a given podcast config into { channel, series, episodes }.
export function parseFeed(xml, podcast) {
  const profile = podcast.mode === "series" ? getProfile(podcast.profile) : null;

  const channelBlock = xml.match(/<channel>([\s\S]*?)<item>/i)?.[1] || xml;
  const channel = {
    title: tag(channelBlock, "title") || podcast.name || "Podcast",
    description: tag(channelBlock, "description"),
    image: attr(channelBlock, "itunes:image", "href"),
  };

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const episodes = items
    .map((it, idx) => {
      const title = tag(it, "title");
      const categories = [...it.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map(
        (c) => decode(c[1]).trim()
      );
      const rawId = tag(it, "guid") || attr(it, "enclosure", "url") || String(idx);
      const { series, speakers } =
        podcast.mode === "series"
          ? classify({ title, categories }, profile)
          : { series: null, speakers: [] };
      return {
        id: `${podcast.id}:${rawId}`,
        podcastId: podcast.id,
        podcast: podcast.name,
        title,
        series,
        speakers,
        audioUrl: attr(it, "enclosure", "url"),
        duration: tag(it, "itunes:duration"),
        pubDate: tag(it, "pubDate"),
        pubTs: Date.parse(tag(it, "pubDate")) || 0,
        notes: stripHtml(tag(it, "description")),
        link: tag(it, "link"),
      };
    })
    .filter((e) => e.audioUrl)
    .sort((a, b) => b.pubTs - a.pubTs);

  if (podcast.mode !== "series") {
    return { channel, series: [], episodes };
  }

  // Group into series, newest first within each, series ordered by count.
  const map = new Map();
  for (const ep of episodes) {
    if (!map.has(ep.series)) map.set(ep.series, []);
    map.get(ep.series).push(ep);
  }
  const series = [...map.entries()]
    .map(([name, eps]) => ({ name, count: eps.length, episodes: eps }))
    .sort((a, b) => {
      if (a.name === "Misc") return 1;
      if (b.name === "Misc") return -1;
      return b.count - a.count;
    });

  return { channel, series, episodes };
}

async function refresh(podcast) {
  const res = await fetch(podcast.feedUrl, {
    headers: { "user-agent": "podlab/0.2" },
  });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  const xml = await res.text();
  const parsed = parseFeed(xml, podcast);
  caches.set(podcast.id, { fetchedAt: Date.now(), ...parsed });
  return caches.get(podcast.id);
}

// Fetch (or serve cached) parsed feed for one podcast.
export async function getPodcastFeed(podcast, { force = false } = {}) {
  const cached = caches.get(podcast.id);
  const stale = !cached || Date.now() - cached.fetchedAt > REFRESH_MS;
  if (force || stale) {
    if (!refreshing.has(podcast.id)) {
      const p = refresh(podcast).finally(() => refreshing.delete(podcast.id));
      refreshing.set(podcast.id, p);
      // Background refresh (we already have a cache to serve): swallow errors so
      // a transient feed failure can't crash the process via unhandledRejection.
      // The initial-load path below still awaits and surfaces the error.
      if (cached) p.catch((e) => console.error(`[feed] refresh failed for ${podcast.id}:`, e.message));
    }
    if (!cached) await refreshing.get(podcast.id); // no data yet: wait + propagate
  }
  return caches.get(podcast.id) || { fetchedAt: 0, channel: {}, series: [], episodes: [] };
}

// Fetch a feed once for the "add podcast" preview (no caching side effects).
export async function fetchFeedPreview(feedUrl) {
  const res = await fetch(feedUrl, { headers: { "user-agent": "podlab/0.2" } });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  const xml = await res.text();
  const tmp = { id: "preview", name: "", mode: "flat", profile: null };
  const parsed = parseFeed(xml, tmp);
  return {
    name: parsed.channel.title,
    image: parsed.channel.image,
    episodeCount: parsed.episodes.length,
  };
}

export function dropCache(podcastId) {
  caches.delete(podcastId);
}
