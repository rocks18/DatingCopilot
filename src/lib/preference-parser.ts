import { EMPTY_PREFERENCES } from "./defaults";
import type { Preferences } from "./types";

const phraseGroups: Record<keyof Pick<Preferences, "relationshipIntentions" | "interests" | "lifestyle" | "communication" | "values">, string[]> = {
  relationshipIntentions: ["serious relationship", "long-term relationship", "long term relationship", "marriage", "life partner", "casual dating", "casual relationship", "casual", "hookup", "hookups", "fun"],
  interests: ["travel", "hiking", "fitness", "books", "reading", "music", "cooking", "art", "photography", "technology", "films", "movies", "theatre", "sports", "yoga", "meditation", "nature", "food", "dancing", "gaming"],
  lifestyle: ["active lifestyle", "healthy lifestyle", "early riser", "night owl", "outdoors", "social", "homebody", "vegetarian", "vegan", "sober", "non-smoker", "independent"],
  communication: ["communicates clearly", "clear communication", "direct communication", "open communication", "emotionally available", "consistent communication", "good listener", "honest communication"],
  values: ["kindness", "honesty", "independence", "family", "ambition", "curiosity", "empathy", "loyalty", "growth", "creativity", "community", "respect"],
};

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function foundPhrases(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  return unique(phrases.filter((phrase) => lower.includes(phrase)));
}

function parseDelimitedClause(text: string, markers: RegExp) {
  const match = text.match(markers);
  if (!match?.[1]) return [];
  return unique(
    match[1]
      .split(/,|;|\band\b/gi)
      .map((item) => item.replace(/[.!?].*$/, "").trim())
      .filter((item) => item.length > 1 && item.length < 80),
  );
}

export function parsePreferenceNarrative(narrative: string): Preferences {
  const normalized = narrative.replace(/\s+/g, " ").trim();
  const parsed: Preferences = structuredClone(EMPTY_PREFERENCES);
  parsed.narrative = normalized;

  const ageMatch = normalized.match(/(?:age(?:d|s)?\s*)?(\d{2})\s*(?:-|–|to)\s*(\d{2})/i);
  if (ageMatch) {
    parsed.ageRange = { min: Number(ageMatch[1]), max: Number(ageMatch[2]) };
  }

  const radiusMatch = normalized.match(/(?:within|radius(?: of)?|up to)\s*(\d{1,4})\s*(km|kilomet(?:er|re)s?|miles?)/i);
  if (radiusMatch) {
    const amount = Number(radiusMatch[1]);
    parsed.radiusKm = radiusMatch[2].toLowerCase().startsWith("mile") ? Math.round(amount * 1.60934) : amount;
  }

  for (const [key, phrases] of Object.entries(phraseGroups) as [keyof typeof phraseGroups, string[]][]) {
    parsed[key] = foundPhrases(normalized, phrases);
  }
  if (parsed.communication.includes("communicates clearly")) {
    parsed.communication = unique(parsed.communication.map((item) => item === "communicates clearly" ? "clear communication" : item));
  }

  parsed.flexible = parseDelimitedClause(
    normalized,
    /(?:flexible (?:about|on)|open to|nice to have)\s*[:—-]?\s*([^.!?]+)/i,
  );
  parsed.nonNegotiables = parseDelimitedClause(
    normalized,
    /(?:non[- ]?negotiable(?:s)?|must have|require(?:s|d)?|essential)\s*[:—-]?\s*([^.!?]+)/i,
  );
  parsed.exclusions = parseDelimitedClause(
    normalized,
    /(?:\bexclude\b|\bavoid\b|\bdeal[- ]?breaker(?:s)?\b|\bnot interested in\b|\bno\b)\s*[:—-]?\s*([^.!?]+)/i,
  );

  if (/\bstrict|highly selective|very selective\b/i.test(normalized)) parsed.policy = "strict";
  if (/\bexploratory|open-minded|open minded|varied|hookup|hookups|casual|swipe right on everyone|maximi[sz]e\b/i.test(normalized)) parsed.policy = "exploratory";

  return parsed;
}
