// Writable server-side state, persisted to a JSON file. Single shared state
// (no users/auth). Built as a factory so tests can use a temp file.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const newId = () => "p_" + randomBytes(4).toString("hex");

function emptyState() {
  return { podcasts: [], playback: {}, lastPlayed: null };
}

export function createStore({ file, seed = [] } = {}) {
  let state = null;

  async function load() {
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch {
      state = emptyState();
    }
    // Seed only when there are no podcasts yet.
    if (state.podcasts.length === 0 && seed.length) {
      for (const s of seed) {
        state.podcasts.push({
          id: newId(),
          feedUrl: s.feedUrl,
          name: s.name || s.feedUrl,
          image: s.image || "",
          mode: s.mode || "flat",
          profile: s.profile || null,
          addedAt: Date.now(),
        });
      }
      await persist();
    }
  }

  // Atomic write: temp file + rename.
  async function persist() {
    await mkdir(dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, file);
  }

  const loaded = load();

  return {
    ready: () => loaded,

    async getState() {
      await loaded;
      return state;
    },

    async addPodcast({ feedUrl, name, image, mode, profile }) {
      await loaded;
      const podcast = {
        id: newId(),
        feedUrl,
        name: name || feedUrl,
        image: image || "",
        mode: mode || "flat",
        profile: profile || null,
        addedAt: Date.now(),
      };
      state.podcasts.push(podcast);
      await persist();
      return podcast;
    },

    async removePodcast(id) {
      await loaded;
      state.podcasts = state.podcasts.filter((p) => p.id !== id);
      await persist();
    },

    async setPodcastMode(id, mode) {
      await loaded;
      const p = state.podcasts.find((x) => x.id === id);
      if (p) {
        p.mode = mode;
        await persist();
      }
      return p;
    },

    async updatePlayback({ episodeId, position, played, updatedAt }) {
      await loaded;
      const prev = state.playback[episodeId];
      if (prev && prev.updatedAt > updatedAt) return prev;
      const next = {
        position: position ?? prev?.position ?? 0,
        played: played ?? prev?.played ?? false,
        updatedAt,
      };
      state.playback[episodeId] = next;
      await persist();
      return next;
    },

    async setLastPlayed(episodeId) {
      await loaded;
      state.lastPlayed = episodeId;
      await persist();
    },
  };
}
