import { EMPTY_PREFERENCES } from "@/lib/defaults";
import type { CandidateInput, Preferences } from "@/lib/types";

export function preferences(overrides: Partial<Preferences> = {}): Preferences {
  return {
    ...structuredClone(EMPTY_PREFERENCES),
    narrative: "A serious relationship with clear communication, travel, kindness, and a non-smoker.",
    ageRange: { min: 26, max: 38 },
    radiusKm: 50,
    acceptableLocations: ["bengaluru"],
    relationshipIntentions: ["serious relationship"],
    interests: ["travel", "cooking"],
    lifestyle: ["active lifestyle", "non-smoker"],
    communication: ["clear communication"],
    values: ["kindness", "growth"],
    nonNegotiables: ["non-smoker"],
    confirmed: true,
    ...overrides,
  };
}

export function candidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    displayName: "Test candidate",
    age: 31,
    location: "Bengaluru",
    distanceKm: 14,
    relationshipIntentions: ["serious relationship"],
    interests: ["travel", "cooking"],
    lifestyle: ["active lifestyle", "non-smoker"],
    communication: ["clear communication"],
    values: ["kindness", "growth"],
    explicitConflicts: [],
    bio: "I enjoy travel and cooking and value kindness.",
    prompts: [],
    photos: [],
    source: "manual",
    ...overrides,
  };
}
