// Frontend: podcasts -> (series ->) episodes, play audio, synced positions.
import * as State from "/state.js";

const $ = (s) => document.querySelector(s);
const view = $("#view");
const list = $("#list");
const homeExtras = $("#home-extras");
const titleEl = $("#title");
const backBtn = $("#backBtn");
const audio = $("#audio");

let DATA = null;            // [{id,name,image,mode,series,episodes}]
let current = null;         // currently playing episode
let route = { name: "home", podcastId: null, series: null };
let hidePlayed = false;

async function load(force = false) {
  list.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    const res = await fetch("/api/podcasts" + (force ? "?refresh=1" : ""));
    DATA = await res.json();
    await State.loadState();
    render();
  } catch (e) {
    list.innerHTML = `<div class="loading">Couldn't load podcasts.<br>${e}</div>`;
  }
}

const podcastById = (id) => DATA.find((p) => p.id === id);
function allEpisodes() { return DATA.flatMap((p) => p.episodes); }
function findEp(id) { return allEpisodes().find((e) => e.id === id); }

// ---------- routing ----------
function render() {
  if (route.name === "home") return renderHome();
  if (route.name === "podcast") return renderPodcast(route.podcastId);
  if (route.name === "series") return renderSeries(route.podcastId, route.series);
}
function go(r) { route = r; window.scrollTo(0, 0); render(); }
backBtn.addEventListener("click", () => {
  if (route.name === "series") return go({ name: "podcast", podcastId: route.podcastId });
  go({ name: "home" });
});
$("#refreshBtn").addEventListener("click", () => load(true));

// ---------- home: podcast grid ----------
function renderHome() {
  backBtn.classList.add("hidden");
  titleEl.textContent = "PodLab";
  homeExtras.classList.remove("hidden");
  renderContinue();
  wireSearch();
  const tiles = DATA.map((p) => `
    <div class="tile" data-podcast="${esc(p.id)}">
      <div class="tile-art" style="${p.image ? `background-image:url('${esc(p.image)}')` : ""}">
        ${p.image ? "" : esc(p.name[0] || "?")}
      </div>
      <div class="tile-cap">
        <div class="tile-name">${esc(p.name)}</div>
        <div class="tile-meta"><span class="tag ${p.mode}">${p.mode}</span> ${epCount(p)}</div>
      </div>
    </div>`).join("");
  const addTile = `<div class="tile add" id="addTile">
      <div class="tile-art plus">+</div>
      <div class="tile-cap"><div class="tile-name muted">Add podcast</div></div>
    </div>`;
  list.innerHTML = `<div class="grid">${tiles}${addTile}</div>`;
  list.querySelectorAll(".tile[data-podcast]").forEach((el) =>
    el.addEventListener("click", () => go({ name: "podcast", podcastId: el.dataset.podcast }))
  );
  $("#addTile").addEventListener("click", addPodcastFlow);
}
function epCount(p) {
  const n = p.mode === "series" ? p.episodes.length : p.episodes.length;
  return `${n} episode${n === 1 ? "" : "s"}`;
}

// ---------- podcast: series list or flat episodes ----------
function renderPodcast(id) {
  const p = podcastById(id);
  if (!p) return go({ name: "home" });
  backBtn.classList.remove("hidden");
  homeExtras.classList.add("hidden");
  titleEl.textContent = p.name;
  if (p.mode === "series") {
    list.innerHTML = `<div class="series-grid">${p.series.map((s) => `
      <div class="series-card" data-series="${esc(s.name)}">
        <div class="name">${esc(s.name)}</div>
        <div class="count">${s.count} episode${s.count === 1 ? "" : "s"}</div>
      </div>`).join("")}</div>`;
    list.querySelectorAll(".series-card").forEach((el) =>
      el.addEventListener("click", () =>
        go({ name: "series", podcastId: id, series: el.dataset.series })));
  } else {
    renderEpisodes(p.episodes);
  }
}

function renderSeries(podcastId, name) {
  const p = podcastById(podcastId);
  const s = p?.series.find((x) => x.name === name);
  if (!s) return go({ name: "podcast", podcastId });
  backBtn.classList.remove("hidden");
  homeExtras.classList.add("hidden");
  titleEl.textContent = name;
  renderEpisodes(s.episodes);
}

function renderEpisodes(eps) {
  const shown = hidePlayed ? eps.filter((e) => !State.getPlayback(e.id).played) : eps;
  list.innerHTML =
    `<label class="hide-played"><input type="checkbox" id="hidePlayedCb" ${hidePlayed ? "checked" : ""}/> Hide played</label>` +
    shown.map(epCard).join("");
  $("#hidePlayedCb").addEventListener("change", (e) => { hidePlayed = e.target.checked; render(); });
  list.querySelectorAll(".ep").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".ep-title").addEventListener("click", (e) => {
      e.stopPropagation(); el.classList.toggle("open");
    });
    el.querySelector(".played-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      const rec = State.getPlayback(id);
      State.setPlayed(id, !rec.played);
      render();
    });
    el.addEventListener("click", () => play(findEp(id)));
  });
}

function epCard(ep) {
  const rec = State.getPlayback(ep.id);
  const total = durToSec(ep.duration);
  const pct = total && rec.position ? Math.min(100, (rec.position / total) * 100) : 0;
  const playing = current && current.id === ep.id ? "playing" : "";
  const played = rec.played ? "played" : "";
  return `
    <div class="ep ${playing} ${played}" data-id="${esc(ep.id)}">
      <div class="ep-row">
        <div class="ep-title">${esc(ep.title)}</div>
        <button class="played-toggle" aria-label="Mark played">${rec.played ? "✓" : "○"}</button>
      </div>
      <div class="ep-sub">
        <span>${fmtDate(ep.pubDate)}</span>
        ${ep.duration ? `<span>${esc(ep.duration)}</span>` : ""}
        ${ep.speakers?.length ? `<span>${esc(ep.speakers.join(", "))}</span>` : ""}
      </div>
      ${pct ? `<div class="resume-bar"><i style="width:${pct}%"></i></div>` : ""}
      <div class="ep-notes">${esc(ep.notes || "No show notes.")}</div>
    </div>`;
}

// ---------- add podcast ----------
async function addPodcastFlow() {
  const feedUrl = prompt("Paste the podcast's RSS feed URL:");
  if (!feedUrl) return;
  list.innerHTML = `<div class="loading">Fetching feed…</div>`;
  let preview;
  try {
    const res = await fetch("/api/podcasts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedUrl }),
    });
    preview = await res.json();
    if (!res.ok) throw new Error(preview.error || "fetch failed");
  } catch (e) {
    alert("Couldn't add feed: " + e.message);
    return load();
  }
  const series = confirm(
    `Added "${preview.name}" (${preview.episodeCount} episodes).\n\n` +
    `OK = group into series (like Qalam). Cancel = flat episode list.`
  );
  if (series) {
    await fetch(`/api/podcasts/${preview.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "series" }),
    });
  }
  await load(true);
}

// ---------- playback ----------
function play(ep) {
  if (!ep) return;
  if (current?.id !== ep.id) {
    current = ep;
    audio.src = ep.audioUrl;
    const saved = State.getPlayback(ep.id).position;
    audio.currentTime = saved > 5 ? saved : 0;
    State.setLastPlayed(ep.id);
    updatePlayerMeta();
    setMediaSession(ep);
  }
  $("#player").classList.remove("hidden");
  audio.play();
  render();
}

function updatePlayerMeta() {
  $("#pTitle").textContent = current?.title || "Nothing playing";
  $("#pSeries").textContent = current?.series || "";
  $("#playPause").textContent = audio.paused ? "▶" : "❚❚";
}

$("#playPause").addEventListener("click", () => {
  if (!current) return;
  audio.paused ? audio.play() : audio.pause();
});
$("#back15").addEventListener("click", () => (audio.currentTime = Math.max(0, audio.currentTime - 15)));
$("#fwd30").addEventListener("click", () => (audio.currentTime += 30));

const scrub = $("#scrub");
let scrubbing = false;
scrub.addEventListener("input", () => {
  scrubbing = true;
  if (audio.duration) $("#cur").textContent = fmtTime((scrub.value / 100) * audio.duration);
});
scrub.addEventListener("change", () => {
  if (audio.duration) audio.currentTime = (scrub.value / 100) * audio.duration;
  scrubbing = false;
});

audio.addEventListener("timeupdate", () => {
  if (audio.duration && !scrubbing) {
    scrub.value = (audio.currentTime / audio.duration) * 100;
    $("#cur").textContent = fmtTime(audio.currentTime);
    $("#dur").textContent = fmtTime(audio.duration);
  }
  if (current && audio.currentTime > 0) State.setPosition(current.id, Math.floor(audio.currentTime));
});
audio.addEventListener("play", updatePlayerMeta);
audio.addEventListener("pause", updatePlayerMeta);
audio.addEventListener("ended", () => {
  if (current) State.setPlayed(current.id, true);
  render();
});

function setMediaSession(ep) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ep.title,
    artist: ep.speakers?.join(", ") || "Qalam Institute",
    album: ep.series,
    artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("seekbackward", () => (audio.currentTime -= 15));
  navigator.mediaSession.setActionHandler("seekforward", () => (audio.currentTime += 30));
}

// ---------- continue listening ----------
function renderContinue() {
  const cont = $("#continue");
  const inProgress = Object.entries(State.getAllPlayback())
    .filter(([, r]) => r.position > 0 && !r.played)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id]) => findEp(id))
    .filter(Boolean)
    .slice(0, 12);
  if (inProgress.length === 0) { cont.classList.add("hidden"); cont.innerHTML = ""; return; }
  cont.classList.remove("hidden");
  cont.innerHTML = `<h2>Continue listening</h2><div class="continue-row">` +
    inProgress.map((ep) => `
      <div class="continue-item" data-id="${esc(ep.id)}">
        <div class="ci-pod">${esc(ep.podcast)}</div>
        <div class="ci-title">${esc(ep.title)}</div>
      </div>`).join("") + `</div>`;
  cont.querySelectorAll(".continue-item").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}

// ---------- search ----------
function wireSearch() {
  const box = $("#search");
  if (!box || box.dataset.wired) return;
  box.dataset.wired = "1";
  box.addEventListener("input", () => renderSearch(box.value.trim().toLowerCase()));
}

function renderSearch(q) {
  if (!q) { render(); return; } // empty query restores normal home
  const groups = DATA.map((p) => {
    const matches = p.episodes.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.series && e.series.toLowerCase().includes(q)) ||
        p.name.toLowerCase().includes(q)
    );
    return { p, matches };
  }).filter((g) => g.matches.length);

  if (groups.length === 0) { list.innerHTML = `<div class="loading">No matches.</div>`; return; }
  list.innerHTML = groups.map((g) => `
    <div class="search-group"><h2>${esc(g.p.name)}</h2>
      ${g.matches.slice(0, 25).map((e) => `
        <div class="ep" data-id="${esc(e.id)}"><div class="ep-title">${esc(e.title)}</div>
          <div class="ep-sub"><span>${esc(e.series || "")}</span><span>${fmtDate(e.pubDate)}</span></div>
        </div>`).join("")}
    </div>`).join("");
  list.querySelectorAll(".ep").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}

// ---------- helpers ----------
function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtTime(s) {
  s = Math.floor(s || 0);
  const m = Math.floor(s / 60), sec = s % 60;
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function fmtDate(d) {
  const t = Date.parse(d);
  return isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function durToSec(d) {
  if (!d) return 0;
  const p = d.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
}

// ---------- boot ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
load().then(() => {
  const lastId = State.getLastPlayed();
  if (lastId && DATA) {
    const ep = findEp(lastId);
    if (ep) {
      current = ep;
      audio.src = ep.audioUrl;
      const saved = State.getPlayback(ep.id).position;
      if (saved > 5) audio.currentTime = saved;
      $("#player").classList.remove("hidden");
      updatePlayerMeta();
    }
  }
});
