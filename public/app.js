// Frontend: render series -> episodes, play audio, remember positions.
const $ = (s) => document.querySelector(s);
const view = $("#view");
const titleEl = $("#title");
const backBtn = $("#backBtn");
const audio = $("#audio");

const LS = {
  pos: (id) => `pos:${id}`,
  last: "lastEpisode",
};

let DATA = null; // { series: [...] }
let current = null; // currently playing episode
let route = { name: "home", series: null };

// ---------- data ----------
async function load(force = false) {
  view.innerHTML = `<div class="loading">Loading episodes…</div>`;
  try {
    const res = await fetch("/api/episodes" + (force ? "?refresh=1" : ""));
    DATA = await res.json();
    render();
  } catch (e) {
    view.innerHTML = `<div class="loading">Couldn't load feed.<br>${e}</div>`;
  }
}

function allEpisodes() {
  return DATA.series.flatMap((s) => s.episodes);
}
function findEp(id) {
  return allEpisodes().find((e) => e.id === id);
}

// ---------- rendering ----------
function render() {
  if (route.name === "home") renderHome();
  else renderSeries(route.series);
}

function renderHome() {
  backBtn.classList.add("hidden");
  titleEl.textContent = DATA.channel?.title || "PodLab";
  const cards = DATA.series
    .map(
      (s) => `
      <div class="series-card" data-series="${esc(s.name)}">
        <div class="name">${esc(s.name)}</div>
        <div class="count">${s.count} episode${s.count === 1 ? "" : "s"}</div>
      </div>`
    )
    .join("");
  view.innerHTML = `<div class="series-grid">${cards}</div>`;
  view.querySelectorAll(".series-card").forEach((el) =>
    el.addEventListener("click", () => go({ name: "series", series: el.dataset.series }))
  );
}

function renderSeries(name) {
  backBtn.classList.remove("hidden");
  titleEl.textContent = name;
  const s = DATA.series.find((x) => x.name === name);
  if (!s) return go({ name: "home" });
  view.innerHTML = s.episodes.map(epCard).join("");
  view.querySelectorAll(".ep").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".ep-title").addEventListener("click", (e) => {
      e.stopPropagation();
      el.classList.toggle("open");
    });
    el.addEventListener("click", () => play(findEp(id)));
  });
}

function epCard(ep) {
  const pos = Number(localStorage.getItem(LS.pos(ep.id)) || 0);
  const total = durToSec(ep.duration);
  const pct = total && pos ? Math.min(100, (pos / total) * 100) : 0;
  const playing = current && current.id === ep.id ? "playing" : "";
  return `
    <div class="ep ${playing}" data-id="${esc(ep.id)}">
      <div class="ep-title">${esc(ep.title)}</div>
      <div class="ep-sub">
        <span>${fmtDate(ep.pubDate)}</span>
        ${ep.duration ? `<span>${esc(ep.duration)}</span>` : ""}
        ${ep.speakers?.length ? `<span>${esc(ep.speakers.join(", "))}</span>` : ""}
      </div>
      ${pct ? `<div class="resume-bar"><i style="width:${pct}%"></i></div>` : ""}
      <div class="ep-notes">${esc(ep.notes || "No show notes.")}</div>
    </div>`;
}

// ---------- navigation ----------
function go(r) {
  route = r;
  window.scrollTo(0, 0);
  render();
}
backBtn.addEventListener("click", () => go({ name: "home" }));
$("#refreshBtn").addEventListener("click", () => load(true));

// ---------- playback ----------
function play(ep) {
  if (!ep) return;
  if (current?.id !== ep.id) {
    current = ep;
    audio.src = ep.audioUrl;
    const saved = Number(localStorage.getItem(LS.pos(ep.id)) || 0);
    audio.currentTime = saved > 5 ? saved : 0;
    localStorage.setItem(LS.last, ep.id);
    updatePlayerMeta();
    setMediaSession(ep);
  }
  $("#player").classList.remove("hidden");
  audio.play();
  if (route.name === "series") renderSeries(route.series);
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
  if (audio.duration) {
    if (!scrubbing) scrub.value = (audio.currentTime / audio.duration) * 100;
    $("#cur").textContent = fmtTime(audio.currentTime);
    $("#dur").textContent = fmtTime(audio.duration);
  }
  if (current && audio.currentTime > 0) {
    localStorage.setItem(LS.pos(current.id), String(Math.floor(audio.currentTime)));
  }
});
audio.addEventListener("play", updatePlayerMeta);
audio.addEventListener("pause", updatePlayerMeta);
audio.addEventListener("ended", () => {
  if (current) localStorage.removeItem(LS.pos(current.id));
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
  const lastId = localStorage.getItem(LS.last);
  if (lastId && DATA) {
    const ep = findEp(lastId);
    if (ep) {
      current = ep;
      audio.src = ep.audioUrl;
      const saved = Number(localStorage.getItem(LS.pos(ep.id)) || 0);
      if (saved > 5) audio.currentTime = saved;
      $("#player").classList.remove("hidden");
      updatePlayerMeta();
    }
  }
});
