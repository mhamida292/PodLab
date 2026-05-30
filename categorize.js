// Turns a raw parsed episode into a { series, speakers } classification.
//
// Strategy (in order of trust):
//   1. Title prefix before the first separator (: – -) is the strongest signal.
//   2. With a profile: khutbah aliases collapse, speaker tags are detected.
//   3. No confident series -> "Misc".
//
// A `profile` (from config.js) supplies the heuristics. Without one, generic
// title-prefix grouping is used: no speaker filtering, no aliases.

const MISC = "Misc";
const SEPARATORS = [":", "–", "—", " - "]; // colon, en/em dash, spaced hyphen

function titlePrefix(title) {
  let cut = -1;
  for (const sep of SEPARATORS) {
    const i = title.indexOf(sep);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  return (cut === -1 ? title : title.slice(0, cut)).trim();
}

function makeHelpers(profile) {
  const noise = profile?.NOISE_TAGS ?? new Set();
  const honorifics = profile?.SPEAKER_HONORIFICS ?? [];
  const known = profile?.KNOWN_SPEAKERS ?? new Set();
  const aliases = profile?.SERIES_ALIASES ?? new Map();

  const canonicalSeries = (name) =>
    aliases.get(name.trim().toLowerCase()) || name.trim();

  const looksLikeSpeaker = (tag) => {
    if (!profile) return false; // generic mode does no speaker detection
    const lower = tag.toLowerCase();
    if (known.has(lower)) return true;
    return honorifics.some((h) => lower === h || lower.startsWith(h + " "));
  };

  const isNoise = (tag) => noise.has(tag.trim().toLowerCase());

  return { canonicalSeries, looksLikeSpeaker, isNoise };
}

export function classify({ title, categories }, profile = null) {
  const { canonicalSeries, looksLikeSpeaker, isNoise } = makeHelpers(profile);

  const cats = (categories || []).filter((c) => !isNoise(c));

  const speakers = [
    ...new Set(cats.filter(looksLikeSpeaker).map((c) => c.trim())),
  ];

  // Khutbah special case only when the profile defines that alias.
  if (profile?.SERIES_ALIASES?.has("khutbah") && /^khutbah/i.test(title.trim())) {
    return { series: "Khutbahs", speakers };
  }

  const prefix = titlePrefix(title);
  if (prefix && prefix.length >= 3 && !looksLikeSpeaker(prefix)) {
    return { series: canonicalSeries(prefix), speakers };
  }

  const seriesTag = cats.find((c) => !looksLikeSpeaker(c));
  if (seriesTag) return { series: canonicalSeries(seriesTag), speakers };

  return { series: MISC, speakers };
}
