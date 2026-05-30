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

function renderLibrary() { view.innerHTML = `<h1 class="view-title">Library</h1>`; }
function renderSearch() { view.innerHTML = `<h1 class="view-title">Search</h1>`; }
function renderShow(id) { const p = podcastById(id); view.innerHTML = `<h1 class="view-title">${esc(p?.name || "")}</h1>`; }
function renderSeries(id, name) { view.innerHTML = `<h1 class="view-title">${esc(name)}</h1>`; }

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
