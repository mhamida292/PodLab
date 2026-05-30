// Configuration: refresh cadence, categorization profiles, and seed podcasts.
// Kept in one place so it's trivial to tune.

// How often (ms) to re-fetch + re-parse each feed in the background.
export const REFRESH_MS = 30 * 60 * 1000; // 30 minutes

// A categorization profile bundles the heuristics used in "series" mode.
// Podcasts with no profile fall back to generic title-prefix grouping.
const qalam = {
  // Category tags that are pure noise — never a series, never a speaker.
  NOISE_TAGS: new Set(
    ["podcast", "qalam institute", "qalam", "qalaminstitute"].map((s) => s.toLowerCase())
  ),
  // Honorifics that mark a category tag as a speaker name rather than a series.
  SPEAKER_HONORIFICS: [
    "shaykh", "sheikh", "shaikh", "shayk", "sh.",
    "mufti", "ustadh", "ustadha", "ustadhah", "imam",
    "hafidh", "hafiz", "qari", "dr.", "dr",
  ],
  // Known speaker names (lowercased) so we catch un-prefixed variants.
  KNOWN_SPEAKERS: new Set(
    [
      "Abdul Nasir Jangda", "Mikaeel Smith", "Mikaeel Ahmed Smith",
      "Hussain Kamani", "Abdelrahman Murphy", "Abdel Rahman Murphy",
      "Noman Hussain", "Muntasir Zaman", "Fatima Lette", "Khadeejah Bari",
      "Samrina Qureshi", "Naeem Baig", "Obaidullah Ahmed", "Ameen Almallah",
      "Syed Omair", "Ozair Hasan", "Adam Anwer", "Shaheer Syed",
      "Khalil Abdur-Rashid", "Hasan Murtaza Zaidi", "Murphy",
    ].map((s) => s.toLowerCase())
  ),
  // Series-name aliases -> canonical name (merge variants/typos).
  SERIES_ALIASES: new Map([
    ["khutbah", "Khutbahs"],
    ["khutbahs", "Khutbahs"],
    ["the cure", "The Cure"],
    ["the beloved", "The Beloved"],
  ]),
};

export const PROFILES = { qalam };

// Look up a profile by name. Returns null for unknown/empty names (generic mode).
export function getProfile(name) {
  return name ? PROFILES[name] || null : null;
}

// Seeded into the store on first boot so existing Qalam users see no regression.
export const SEED_PODCASTS = [
  {
    feedUrl: process.env.FEED_URL || "https://feeds.feedburner.com/QalamPodcast",
    name: "Qalam Podcast",
    image: "",
    mode: "series",
    profile: "qalam",
  },
];
