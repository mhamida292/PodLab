// Pure selectors over the /api/podcasts payload (array of podcasts, each with a
// flat `episodes` list) and the playback map from state.js. No DOM, no fetch.

export function allEpisodes(podcasts) {
  return podcasts.flatMap((p) => p.episodes || []);
}

// Newest episodes across all podcasts, capped at `limit`.
export function recentEpisodes(podcasts, limit = 20) {
  return allEpisodes(podcasts)
    .slice()
    .sort((a, b) => (b.pubTs || 0) - (a.pubTs || 0))
    .slice(0, limit);
}

// In-progress episodes (started, not played), most-recently-active first.
// `limit` defaults high; callers slice for the hero/shelf.
export function inProgress(podcasts, playback, limit = 12) {
  const byId = new Map(allEpisodes(podcasts).map((e) => [e.id, e]));
  return Object.entries(playback)
    .filter(([, r]) => r.position > 0 && !r.played)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id]) => byId.get(id))
    .filter(Boolean)
    .slice(0, limit);
}

// Search across title, series, and podcast name. Returns groups:
// [{ podcast, matches: episode[] }] for podcasts with >=1 match. Empty q -> [].
export function searchEpisodes(podcasts, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return podcasts
    .map((p) => ({
      podcast: p,
      matches: (p.episodes || []).filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.series && e.series.toLowerCase().includes(q)) ||
          p.name.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.matches.length > 0);
}
