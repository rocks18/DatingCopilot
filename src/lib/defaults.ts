import type { Preferences } from "./types";

export const DEFAULT_WEIGHTS: Preferences["weights"] = {
  relationshipIntentions: 25,
  sharedInterests: 20,
  lifestyle: 20,
  communication: 15,
  values: 20,
};

export const EMPTY_PREFERENCES: Preferences = {
  narrative: "",
  ageRange: { min: 25, max: 38 },
  radiusKm: 50,
  acceptableLocations: [],
  relationshipIntentions: [],
  interests: [],
  lifestyle: [],
  communication: [],
  values: [],
  flexible: [],
  nonNegotiables: [],
  exclusions: [],
  policy: "balanced",
  weights: DEFAULT_WEIGHTS,
  confirmed: false,
};
