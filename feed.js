// Fetches + parses the RSS feed and groups episodes into series.
// In-memory cache with background refresh.

import { FEED_URL, REFRESH_MS } from "./config.js";
import { classify } from "./categorize.js";

let cache = { fetchedAt: 0, series: [], episodes: [], channel: {} };
let refreshing = null;

// --- tiny, forgiving XML helpers (the feed is well-formed & consistent) ---

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
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

function parse(xml) {
  const channelBlock = xml.match(/<channel>([\s\S]*?)<item>/i)?.[1] || xml;
  const channel = {
    title: tag(channelBlock, "title") || "Podcast",
    description: tag(channelBlock, "description"),
    image: attr(channelBlock, "itunes:image", "href"),
  };

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const episodes = items.map((it, idx) => {
    const title = tag(it, "title");
    const categories = [...it.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map(
      (c) => decode(c[1]).trim()
    );
    const { series, speakers } = classify({ title, categories });
    const descRaw = tag(it, "description");
    return {
      id: tag(it, "guid") || attr(it, "enclosure", "url") || String(idx),
      title,
      series,
      speakers,
      audioUrl: attr(it, "enclosure", "url"),
      duration: tag(it, "itunes:duration"),
      pubDate: tag(it, "pubDate"),
      pubTs: Date.parse(tag(it, "pubDate")) || 0,
      notes: stripHtml(descRaw),
      link: tag(it, "link"),
    };
  }).filter((e) => e.audioUrl);

  // Group into series, newest first within each, series ordered by episode count.
  const map = new Map();
  for (const ep of episodes) {
    if (!map.has(ep.series)) map.set(ep.series, []);
    map.get(ep.series).push(ep);
  }
  const series = [...map.entries()]
    .map(([name, eps]) => {
      eps.sort((a, b) => b.pubTs - a.pubTs);
      return { name, count: eps.length, episodes: eps };
    })
    .sort((a, b) => {
      if (a.name === "Misc") return 1; // Misc always last
      if (b.name === "Misc") return -1;
      return b.count - a.count;
    });

  return { channel, episodes, series };
}

async function refresh() {
  const res = await fetch(FEED_URL, { headers: { "user-agent": "qalam-listener/0.1" } });
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  const xml = await res.text();
  const parsed = parse(xml);
  cache = { fetchedAt: Date.now(), ...parsed };
  return cache;
}

export async function getFeed({ force = false } = {}) {
  const stale = Date.now() - cache.fetchedAt > REFRESH_MS;
  if (force || stale || cache.series.length === 0) {
    if (!refreshing) {
      refreshing = refresh().finally(() => (refreshing = null));
    }
    // If we have no data yet, wait; otherwise serve stale and refresh in bg.
    if (cache.series.length === 0) await refreshing;
  }
  return cache;
}
