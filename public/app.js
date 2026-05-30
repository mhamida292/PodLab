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
function renderHome() { view.innerHTML = `<h1 class="view-title">Home</h1>`; }
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
