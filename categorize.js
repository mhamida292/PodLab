// Turns a raw parsed episode into a { series, speakers } classification.
//
// Strategy (in order of trust):
//   1. Title prefix before the first separator (: – -) is the strongest signal.
//   2. Khutbah/Khutbahs titles collapse into one "Khutbahs" series.
//   3. Speaker tags are detected from category tags and returned as metadata.
//   4. No confident series -> "Misc".

import {
  NOISE_TAGS,
  SPEAKER_HONORIFICS,
  KNOWN_SPEAKERS,
  SERIES_ALIASES,
} from "./config.js";

const MISC = "Misc";
const SEPARATORS = [":", "–", "—", " - "]; // colon, en/em dash, spaced hyphen

function canonicalSeries(name) {
  const key = name.trim().toLowerCase();
  return SERIES_ALIASES.get(key) || name.trim();
}

// Find the earliest separator and return the text before it.
function titlePrefix(title) {
  let cut = -1;
  for (const sep of SEPARATORS) {
    const i = title.indexOf(sep);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  const prefix = (cut === -1 ? title : title.slice(0, cut)).trim();
  return prefix;
}

function looksLikeSpeaker(tag) {
  const lower = tag.toLowerCase();
  if (KNOWN_SPEAKERS.has(lower)) return true;
  return SPEAKER_HONORIFICS.some(
    (h) => lower === h || lower.startsWith(h + " ")
  );
}

export function classify({ title, categories }) {
  const cats = (categories || []).filter(
    (c) => !NOISE_TAGS.has(c.trim().toLowerCase())
  );

  // Speakers: from category tags that look like people.
  const speakers = [
    ...new Set(cats.filter(looksLikeSpeaker).map((c) => c.trim())),
  ];

  // Khutbah special case.
  if (/^khutbah/i.test(title.trim())) {
    return { series: "Khutbahs", speakers };
  }

  // Primary: title prefix.
  const prefix = titlePrefix(title);
  if (prefix && prefix.length >= 3 && !looksLikeSpeaker(prefix)) {
    return { series: canonicalSeries(prefix), speakers };
  }

  // Fallback: a remaining non-speaker category tag.
  const seriesTag = cats.find((c) => !looksLikeSpeaker(c));
  if (seriesTag) return { series: canonicalSeries(seriesTag), speakers };

  return { series: MISC, speakers };
}
