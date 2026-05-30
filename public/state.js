// Playback state synced with the server. Server is source of truth; we cache in
// localStorage and write through with debounced PUTs. Last-write-wins by updatedAt.

const CACHE_KEY = "podlab.state";
let mem = { playback: {}, lastPlayed: null };
const pending = new Map(); // episodeId -> latest record awaiting flush
let flushTimer = null;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function writeCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(mem));
}

// Merge two playback maps, newest updatedAt per episode wins.
function merge(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b)) {
    if (!out[id] || rec.updatedAt > out[id].updatedAt) out[id] = rec;
  }
  return out;
}

export async function loadState() {
  const cached = readCache();
  mem = { playback: cached.playback || {}, lastPlayed: cached.lastPlayed || null };
  try {
    const res = await fetch("/api/state");
    const server = await res.json();
    mem.playback = merge(mem.playback, server.playback || {});
    if (server.lastPlayed) mem.lastPlayed = server.lastPlayed;
    writeCache();
    // Push any local records newer than the server's back up.
    for (const [id, rec] of Object.entries(cached.playback || {})) {
      const s = (server.playback || {})[id];
      if (!s || rec.updatedAt > s.updatedAt) queueWrite(id, rec);
    }
  } catch { /* offline: cache-only */ }
  return mem;
}

export function getPlayback(episodeId) {
  return mem.playback[episodeId] || { position: 0, played: false, updatedAt: 0 };
}
export function getAllPlayback() { return mem.playback; }
export function getLastPlayed() { return mem.lastPlayed; }

export function setPosition(episodeId, position) {
  const rec = { ...getPlayback(episodeId), position, updatedAt: Date.now() };
  mem.playback[episodeId] = rec;
  writeCache();
  queueWrite(episodeId, rec);
}
export function setPlayed(episodeId, played) {
  const rec = { ...getPlayback(episodeId), played, updatedAt: Date.now() };
  if (played) rec.position = 0;
  mem.playback[episodeId] = rec;
  writeCache();
  queueWrite(episodeId, rec);
}
export function setLastPlayed(episodeId) {
  mem.lastPlayed = episodeId;
  writeCache();
  queueWrite(episodeId, { ...getPlayback(episodeId), setLastPlayed: true });
}

function queueWrite(episodeId, rec) {
  pending.set(episodeId, rec);
  if (!flushTimer) flushTimer = setTimeout(flush, 4000);
}
async function flush() {
  flushTimer = null;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [episodeId, rec] of batch) {
    fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId, ...rec, updatedAt: rec.updatedAt || Date.now() }),
    }).catch(() => pending.set(episodeId, rec)); // re-queue on failure
  }
}
// Flush promptly when the tab is hidden / closed.
window.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
