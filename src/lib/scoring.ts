import type {
  CandidateAnalysis,
  CandidateInput,
  CompatibilityDecision,
  DimensionKey,
  DimensionScore,
  Preferences,
} from "./types";

export const ENGINE_VERSION = "pairwise-deterministic-v1";

const LABELS: Record<DimensionKey, string> = {
  relationshipIntentions: "Relationship intentions",
  sharedInterests: "Shared interests",
  lifestyle: "Lifestyle",
  communication: "Communication",
  values: "Values & priorities",
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function overlapScore(preferred: string[], candidate: string[]) {
  const wanted = unique(preferred);
  const offered = unique(candidate);
  if (wanted.length === 0 || offered.length === 0) return null;
  const overlap = wanted.filter((item) => offered.some((other) => other.includes(item) || item.includes(other)));
  return Math.round((overlap.length / wanted.length) * 100);
}

function dimension(
  key: DimensionKey,
  weight: number,
  preferred: string[],
  candidate: string[],
): DimensionScore {
  const score = overlapScore(preferred, candidate);
  const common = unique(preferred).filter((item) => unique(candidate).some((other) => other.includes(item) || item.includes(other)));
  return {
    key,
    label: LABELS[key],
    score,
    weight,
    evidence: score === null ? [] : common,
    unknown: score === null,
  };
}

const conflictPairs: Array<{ requirement: RegExp; conflict: RegExp; reason: string }> = [
  { requirement: /non[- ]?smok|no smok/i, conflict: /(?<!non-)(?<!non )\b(smoker|smoking)\b/i, reason: "smoking preference conflicts" },
  { requirement: /want(?:s|ing)? (?:children|kids)/i, conflict: /\b(childfree|doesn.?t want (?:children|kids)|no kids)\b/i, reason: "family-planning preference conflicts" },
  { requirement: /monogam/i, conflict: /\b(polyamory|polyamorous|non[- ]?monogam)\b/i, reason: "relationship-structure preference conflicts" },
  { requirement: /sober|no alcohol/i, conflict: /\b(drink(?:s|ing)?|alcohol)\b/i, reason: "alcohol preference conflicts" },
  { requirement: /serious|long[- ]?term/i, conflict: /\b(casual|hookup|short[- ]?term)\b/i, reason: "relationship intention conflicts" },
];

function containsPhrase(haystack: string, needle: string) {
  const normalizedNeedle = normalize(needle);
  if (!normalizedNeedle) return false;
  return normalize(haystack).includes(normalizedNeedle);
}

function isFlexible(preferences: Preferences, phrases: string[]) {
  return preferences.flexible.some((value) => phrases.some((phrase) => normalize(value).includes(phrase)));
}

export function scoreCandidate(
  preferences: Preferences,
  input: CandidateInput,
  analysis: CandidateAnalysis,
): CompatibilityDecision {
  const inferred = (field: string) => analysis.inferences.filter((item) => item.field === field).map((item) => item.value);
  const dimensions: DimensionScore[] = [
    dimension("relationshipIntentions", preferences.weights.relationshipIntentions, preferences.relationshipIntentions, input.relationshipIntentions.length ? input.relationshipIntentions : inferred("relationship intentions")),
    dimension("sharedInterests", preferences.weights.sharedInterests, preferences.interests, input.interests.length ? input.interests : inferred("interest")),
    dimension("lifestyle", preferences.weights.lifestyle, preferences.lifestyle, input.lifestyle.length ? input.lifestyle : inferred("lifestyle")),
    dimension("communication", preferences.weights.communication, preferences.communication, input.communication),
    dimension("values", preferences.weights.values, preferences.values, input.values.length ? input.values : inferred("value")),
  ];

  const allCandidateText = [
    input.bio,
    input.rawText || "",
    ...input.prompts,
    ...input.relationshipIntentions,
    ...input.interests,
    ...input.lifestyle,
    ...input.communication,
    ...input.values,
    ...input.explicitConflicts,
  ].join(" ");

  const conflicts = [...input.explicitConflicts];
  for (const exclusion of preferences.exclusions) {
    if (containsPhrase(allCandidateText, exclusion)) conflicts.push(`Explicit exclusion found: ${exclusion}`);
  }
  for (const requirement of preferences.nonNegotiables) {
    for (const pair of conflictPairs) {
      if (pair.requirement.test(requirement) && pair.conflict.test(allCandidateText)) conflicts.push(pair.reason);
    }
  }

  if (input.age !== null && (input.age < preferences.ageRange.min || input.age > preferences.ageRange.max) && !isFlexible(preferences, ["age"])) {
    conflicts.push(`Age ${input.age} is outside the confirmed ${preferences.ageRange.min}–${preferences.ageRange.max} range`);
  }
  if (preferences.radiusKm !== null && input.distanceKm !== null && input.distanceKm > preferences.radiusKm && !isFlexible(preferences, ["distance", "radius", "location"])) {
    conflicts.push(`Distance ${input.distanceKm} km exceeds the confirmed ${preferences.radiusKm} km radius`);
  }
  if (preferences.acceptableLocations.length && input.location && !preferences.acceptableLocations.some((location) => containsPhrase(input.location, location)) && !isFlexible(preferences, ["location", "city"])) {
    conflicts.push(`${input.location} is outside the confirmed acceptable locations`);
  }

  const known = dimensions.filter((item) => item.score !== null);
  const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
  const score = knownWeight
    ? Math.round(known.reduce((sum, item) => sum + (item.score ?? 0) * item.weight, 0) / knownWeight)
    : null;
  const evidenceCoverage = knownWeight / 100;
  const explicitEvidenceRatio = analysis.facts.length / Math.max(analysis.facts.length + analysis.inferences.length, 1);
  const confidence = Number((evidenceCoverage * (0.75 + explicitEvidenceRatio * 0.25)).toFixed(2));

  const thresholds = {
    strict: { strong: 82, possible: 68, minimumConfidence: 0.55 },
    balanced: { strong: 76, possible: 56, minimumConfidence: 0.4 },
    exploratory: { strong: 70, possible: 45, minimumConfidence: 0.3 },
  }[preferences.policy];

  let label: CompatibilityDecision["label"];
  if (conflicts.length) label = "Does not meet stated criteria";
  else if (score === null || confidence < thresholds.minimumConfidence) label = "Insufficient information";
  else if (score >= thresholds.strong) label = "Strong potential match";
  else if (score >= thresholds.possible) label = "Possible match";
  else label = "Does not meet stated criteria";

  const unknowns = dimensions.filter((item) => item.unknown).map((item) => item.label);
  const strongest = [...known].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const weakest = [...known].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const explanation = [
    conflicts.length ? `${conflicts.length} explicit conflict${conflicts.length === 1 ? "" : "s"} override the aggregate score.` : "No explicit deal-breaker conflict was found in the supplied information.",
    strongest?.score !== undefined ? `${strongest.label} is the strongest evidenced dimension at ${strongest.score}%.` : "There is not enough evidence to identify a strongest dimension.",
    weakest && weakest.key !== strongest?.key ? `${weakest.label} has the least alignment among known dimensions at ${weakest.score}%.` : "",
    unknowns.length ? `${unknowns.join(", ")} remain unknown and were excluded from the score.` : "All weighted dimensions have supplied evidence.",
  ].filter(Boolean);

  return {
    label,
    score,
    confidence,
    evidenceCoverage: Number(evidenceCoverage.toFixed(2)),
    dimensions,
    conflicts: [...new Set(conflicts)],
    unknowns,
    explanation,
    engineVersion: ENGINE_VERSION,
  };
}
