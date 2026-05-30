// Frontend orchestrator: tab routing + rendering + DOM/event wiring.
import * as State from "/state.js";
import * as Select from "/select.js";
import * as Theme from "/theme.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const view = $("#view");
const backBtn = $("#backBtn");
const audio = $("#audio");

let DATA = [];                 // [{id,name,image,mode,series,episodes}]
let current = null;            // playing episode
let route = { tab: "home", podcastId: null, series: null };

const podcastById = (id) => DATA.find((p) => p.id === id);
const findEp = (id) => Select.allEpisodes(DATA).find((e) => e.id === id);

async function load(force = false) {
  view.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    const res = await fetch("/api/podcasts" + (force ? "?refresh=1" : ""));
    DATA = await res.json();
    await State.loadState();
    render();
  } catch (e) {
    view.innerHTML = `<div class="loading">Couldn't load podcasts.<br>${esc(String(e))}</div>`;
  }
}

// ---------- routing ----------
function render() {
  // active nav highlight
  $$(".tab,.nav-item").forEach((el) => el.classList.toggle("on", el.dataset.tab === route.tab));
  const drilled = route.podcastId != null;
  backBtn.classList.toggle("hidden", !drilled);
  if (route.podcastId) {
    return route.series ? renderSeries(route.podcastId, route.series) : renderShow(route.podcastId);
  }
  if (route.tab === "home") return renderHome();
  if (route.tab === "search") return renderSearch();
  if (route.tab === "library") return renderLibrary();
}
function goTab(tab) { route = { tab, podcastId: null, series: null }; window.scrollTo(0, 0); render(); }
function go(r) { route = { ...route, ...r }; window.scrollTo(0, 0); render(); }
function back() {
  if (route.series) return go({ series: null });
  if (route.podcastId) return go({ podcastId: null });
}

$$(".tab,.nav-item").forEach((el) => el.addEventListener("click", () => goTab(el.dataset.tab)));
backBtn.addEventListener("click", back);

// ---------- view stubs (filled in later tasks) ----------
function renderHome() {
  const playback = State.getAllPlayback();
  const prog = Select.inProgress(DATA, playback);
  const hero = prog[0];
  const shelf = prog.slice(1);
  const recent = Select.recentEpisodes(DATA, 20);

  if (DATA.length === 0) {
    view.innerHTML = `<div class="empty"><h2>No podcasts yet</h2>
      <p>Head to Library to add your first feed.</p>
      <button class="btn-accent" id="emptyAdd">+ Add podcast</button></div>`;
    $("#emptyAdd").addEventListener("click", () => goTab("library"));
    return;
  }

  const heroHtml = hero ? `
    <button class="hero" data-id="${esc(hero.id)}">
      <div class="hero-art" style="${artStyle(hero)}"></div>
      <div class="hero-body">
        <div class="mono hero-kicker">CONTINUE LISTENING</div>
        <div class="hero-title">${esc(hero.title)}</div>
        <div class="hero-pod">${esc(hero.podcast)}</div>
        <div class="bar"><i style="width:${pct(hero)}%"></i></div>
      </div>
      <span class="hero-play">▶</span>
    </button>` : "";

  const shelfHtml = shelf.length ? `
    <div class="shelf-h mono">CONTINUE</div>
    <div class="shelf">${shelf.map((e) => `
      <button class="shelf-item" data-id="${esc(e.id)}">
        <div class="shelf-art" style="${artStyle(e)}"></div>
        <div class="shelf-title">${esc(e.title)}</div>
        <div class="shelf-pod">${esc(e.podcast)}</div>
      </button>`).join("")}</div>` : "";

  const recentHtml = recent.length ? `
    <div class="shelf-h mono">RECENT EPISODES</div>
    <div class="ep-list">${recent.map(epRow).join("")}</div>` : "";

  view.innerHTML = heroHtml + shelfHtml + recentHtml;
  wirePlayables();
}

// One-line episode row used by Home recent + show views.
function epRow(e) {
  const rec = State.getPlayback(e.id);
  return `<button class="ep-row ${rec.played ? "played" : ""}" data-id="${esc(e.id)}">
    <div class="ep-row-art" style="${artStyleById(e.podcastId)}"></div>
    <div class="ep-row-main">
      <div class="ep-row-title">${esc(e.title)}</div>
      <div class="ep-row-sub">${esc(e.podcast)}${e.duration ? " · " + esc(e.duration) : ""}</div>
    </div>
    ${rec.played ? `<span class="badge">✓</span>` : ""}
  </button>`;
}

// click any [data-id] element -> play that episode
function wirePlayables() {
  view.querySelectorAll("[data-id]").forEach((el) =>
    el.addEventListener("click", () => play(findEp(el.dataset.id))));
}

// art helpers (use podcast image if present, else accent gradient)
function artStyleById(podcastId) { const p = podcastById(podcastId); return artStyleFor(p?.image); }
function artStyle(ep) { return artStyleById(ep.podcastId); }
function artStyleFor(img) {
  if (!img) return `background-image:linear-gradient(135deg,var(--accent),var(--accent-deep))`;
  // Keep URL structure intact (encodeURI) but neutralize chars that could break
  // out of the quoted CSS url(...) / the HTML style="" attribute (feed-controlled).
  const safe = encodeURI(img).replace(/['"()\\]/g, encodeURIComponent);
  return `background-image:url('${safe}')`;
}
function pct(ep) { const total = durToSec(ep.duration); const rec = State.getPlayback(ep.id);
  return total && rec.position ? Math.min(100, (rec.position / total) * 100) : 0; }

function renderLibrary() {
  const tiles = DATA.map((p) => `
    <div class="tile" data-podcast="${esc(p.id)}">
      <button class="tile-tap" data-open="${esc(p.id)}">
        <div class="tile-art" style="${artStyleFor(p.image)}">${p.image ? "" : esc((p.name[0] || "?"))}</div>
      </button>
      <button class="tile-menu" data-menu="${esc(p.id)}" aria-label="Manage">⋯</button>
      <div class="tile-cap">
        <div class="tile-name">${esc(p.name)}</div>
        <div class="tile-meta"><span class="tag ${esc(p.mode)}">${esc(p.mode)}</span> ${p.episodes.length} eps</div>
      </div>
    </div>`).join("");
  const addTile = `<button class="tile add" id="libAdd">
    <div class="tile-art plus">+</div><div class="tile-cap"><div class="tile-name muted">Add podcast</div></div></button>`;
  view.innerHTML = `<h1 class="view-title">Library</h1><div class="grid">${tiles}${addTile}</div>`;

  view.querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => go({ podcastId: el.dataset.open, series: null })));
  view.querySelectorAll("[data-menu]").forEach((el) =>
    el.addEventListener("click", (e) => { e.stopPropagation(); openPodcastMenu(el.dataset.menu); }));
  $("#libAdd").addEventListener("click", addPodcastFlow);
}

function openPodcastMenu(id) {
  const p = podcastById(id);
  if (!p) return;
  const otherMode = p.mode === "series" ? "flat" : "series";
  openSheet(`
    <h2 class="sheet-title">${esc(p.name)}</h2>
    <button class="sheet-row" id="modeRow">Switch to <b>${otherMode}</b> grouping</button>
    <button class="sheet-row danger" id="removeRow">Remove podcast</button>
    <button class="sheet-row cancel" id="cancelRow">Cancel</button>`);
  $("#cancelRow").addEventListener("click", closeSheet);
  $("#modeRow").addEventListener("click", async () => {
    try {
      const res = await fetch(`/api/podcasts/${id}`, { method: "PATCH",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: otherMode }) });
      if (!res.ok) throw new Error("request failed");
    } catch { alert("Couldn't switch grouping. Try again."); return; }
    closeSheet(); await load(true);
  });
  $("#removeRow").addEventListener("click", async () => {
    if (!confirm(`Remove "${p.name}"? Your playback history stays.`)) return;
    try {
      const res = await fetch(`/api/podcasts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("request failed");
    } catch { alert("Couldn't remove the podcast. Try again."); return; }
    closeSheet(); await load(true);
  });
}
function renderSearch() { view.innerHTML = `<h1 class="view-title">Search</h1>`; }
function renderShow(id) { const p = podcastById(id); view.innerHTML = `<h1 class="view-title">${esc(p?.name || "")}</h1>`; }
function renderSeries(id, name) { view.innerHTML = `<h1 class="view-title">${esc(name)}</h1>`; }

// ---------- sheets ----------
const sheetEl = $("#sheet");
function openSheet(html) { $("#sheetBody").innerHTML = html; sheetEl.classList.remove("hidden"); }
function closeSheet() { sheetEl.classList.add("hidden"); $("#sheetBody").innerHTML = ""; }
sheetEl.addEventListener("click", (e) => { if (e.target === sheetEl) closeSheet(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !sheetEl.classList.contains("hidden")) closeSheet();
});

// ---------- add podcast ----------
async function addPodcastFlow() {
  openSheet(`
    <h2 class="sheet-title">Add a podcast</h2>
    <input id="feedUrl" class="sheet-input" type="url" placeholder="Paste an RSS feed URL" />
    <div id="addMsg" class="add-msg"></div>
    <button class="btn-accent" id="addFetch">Fetch feed</button>
    <button class="sheet-row cancel" id="addCancel">Cancel</button>`);
  $("#addCancel").addEventListener("click", closeSheet);
  $("#addFetch").addEventListener("click", doAddFetch);
}

async function doAddFetch() {
  const feedUrl = $("#feedUrl").value.trim();
  const msg = $("#addMsg");
  const btn = $("#addFetch");
  if (!feedUrl) { msg.textContent = "Enter a feed URL."; return; }
  if (btn.disabled) return;            // guard against double-submit while in flight
  btn.disabled = true;
  msg.textContent = "Fetching…";
  let preview;
  try {
    const res = await fetch("/api/podcasts", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ feedUrl }) });
    preview = await res.json();
    if (!res.ok) throw new Error(preview.error || "fetch failed");
  } catch (e) { msg.textContent = "Couldn't add feed: " + e.message; btn.disabled = false; return; }
  openSheet(`
    <h2 class="sheet-title">${esc(preview.name)}</h2>
    <p class="add-msg">${preview.episodeCount} episodes. How should episodes be grouped?</p>
    <button class="sheet-row" id="gFlat"><b>Flat</b> — one chronological list</button>
    <button class="sheet-row" id="gSeries"><b>Series</b> — group by title/series (like Qalam)</button>`);
  const finish = async (mode) => {
    if (mode === "series") await fetch(`/api/podcasts/${preview.id}`, { method: "PATCH",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "series" }) });
    closeSheet(); goTab("library"); await load(true);
  };
  $("#gFlat").addEventListener("click", () => finish("flat"));
  $("#gSeries").addEventListener("click", () => finish("series"));
}

// ---------- helpers ----------
function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) { const t = Date.parse(d); return isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
function fmtTime(s) { s = Math.floor(s || 0); const m = Math.floor(s / 60), sec = s % 60, h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`; }
function durToSec(d) { if (!d) return 0; const p = d.split(":").map(Number);
  return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p.length === 2 ? p[0]*60 + p[1] : p[0]; }

// ---------- boot ----------
Theme.applyTheme();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
load();

// Exposed for later tasks (avoids "unused" churn): keep references alive.
export { findEp, current, fmtTime, durToSec, fmtDate, esc };
