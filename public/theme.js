// Theme state. Pure helpers (resolveTheme/nextTheme) are unit-tested; the
// load/apply/set helpers touch localStorage + <html data-theme> for the app.
//
// Stored preference is one of: "auto" | "light" | "dark" (default "auto").
// resolveTheme turns the preference + system setting into the concrete theme.

const KEY = "podlab.theme";
const ORDER = ["auto", "light", "dark"];

function normalize(pref) {
  return ORDER.includes(pref) ? pref : "auto";
}

// Concrete theme to apply: explicit wins, "auto" follows the system.
export function resolveTheme(pref, prefersDark) {
  const p = normalize(pref);
  if (p === "light" || p === "dark") return p;
  return prefersDark ? "dark" : "light";
}

// Cycle for the settings control: auto -> light -> dark -> auto.
export function nextTheme(pref) {
  const i = ORDER.indexOf(normalize(pref));
  return ORDER[(i + 1) % ORDER.length];
}

// --- browser-only helpers (not unit-tested) ---

export function getStored() {
  try { return normalize(localStorage.getItem(KEY)); } catch { return "auto"; }
}

function systemPrefersDark() {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
}

// Apply the resolved theme to <html> and update theme-color meta.
export function applyTheme(pref = getStored()) {
  const theme = resolveTheme(pref, systemPrefersDark());
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#14161b" : "#ffffff");
  return theme;
}

export function setTheme(pref) {
  const p = normalize(pref);
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
  return applyTheme(p);
}
