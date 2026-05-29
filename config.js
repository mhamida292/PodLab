// Configuration for the feed + categorization heuristics.
// Kept in one place so it's trivial to tune as the feed changes.

export const FEED_URL =
  process.env.FEED_URL || "https://feeds.feedburner.com/QalamPodcast";

// How often (ms) to re-fetch + re-parse the feed in the background.
export const REFRESH_MS = 30 * 60 * 1000; // 30 minutes

// Category tags that are pure noise — never a series, never a speaker.
export const NOISE_TAGS = new Set(
  ["podcast", "qalam institute", "qalam", "qalaminstitute"].map((s) => s.toLowerCase())
);

// Honorifics that mark a category tag as a speaker name rather than a series.
export const SPEAKER_HONORIFICS = [
  "shaykh", "sheikh", "shaikh", "shayk", "sh.",
  "mufti", "ustadh", "ustadha", "ustadhah", "imam",
  "hafidh", "hafiz", "qari", "dr.", "dr",
];

// Known speaker names (lowercased) so we catch un-prefixed variants/spellings.
export const KNOWN_SPEAKERS = new Set(
  [
    "Abdul Nasir Jangda", "Mikaeel Smith", "Mikaeel Ahmed Smith",
    "Hussain Kamani", "Abdelrahman Murphy", "Abdel Rahman Murphy",
    "Noman Hussain", "Muntasir Zaman", "Fatima Lette", "Khadeejah Bari",
    "Samrina Qureshi", "Naeem Baig", "Obaidullah Ahmed", "Ameen Almallah",
    "Syed Omair", "Ozair Hasan", "Adam Anwer", "Shaheer Syed",
    "Khalil Abdur-Rashid", "Hasan Murtaza Zaidi", "Murphy",
  ].map((s) => s.toLowerCase())
);

// Series-name aliases -> canonical name (merge variants/typos).
export const SERIES_ALIASES = new Map([
  ["khutbah", "Khutbahs"],
  ["khutbahs", "Khutbahs"],
  ["the cure", "The Cure"],
  ["the beloved", "The Beloved"],
]);
