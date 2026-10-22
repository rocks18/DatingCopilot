import { z } from "zod";
import {
  enqueueCandidate,
  getCandidate,
  getPreferences,
  getRuntimeState,
  processCandidateNow,
  recordUserDecision,
  type PairwiseDatabase,
} from "./db";
import type { CandidateInput, CompatibilityDecision, Preferences } from "./types";

import { extractBioAndPrompts } from "./android-ui";

export const BRIDGE_HEADER = "pairwise-local-extension-v1";

export const bridgeCandidateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  age: z.number().int().min(18).max(99).nullable().default(null),
  location: z.string().trim().max(200).default(""),
  distanceKm: z.number().min(0).max(10000).nullable().default(null),
  rawText: z.string().trim().min(1).max(12000),
  bio: z.string().trim().optional(),
  prompts: z.array(z.string().trim().max(1000)).max(25).default([]),
  structuredPrompts: z.array(z.object({ question: z.string().trim(), answer: z.string().trim() })).optional().default([]),
  profileUrl: z.string().nullable().optional().default(null),
  screenshots: z.array(z.string()).default([]),
  profileImages: z.array(z.string()).optional().default([]),
  photos: z.array(z.any()).optional().default([]),
  physicalDetails: z.record(z.string(), z.string()).optional().default({}),
});

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mentioned(text: string, values: string[]) {
  const haystack = normalize(text);
  return [...new Set(values.filter((value) => {
    const needle = normalize(value);
    const searchable = needle === "smoker" ? haystack.replace(/\bnon smoker\b/g, "") : haystack;
    return needle.length > 1 && searchable.includes(needle);
  }))];
}

const SIGNALS = {
  relationshipIntentions: ["serious relationship", "long-term", "marriage", "life partner", "casual", "relationship", "hookup", "hookups", "fun", "dating"],
  interests: ["travel", "hiking", "reading", "cooking", "music", "movies", "fitness", "art", "photography", "dogs", "cats", "coffee", "food", "sports", "yoga", "gaming", "dancing"],
  lifestyle: ["active", "fitness", "outdoors", "vegetarian", "vegan", "non-smoker", "smoker", "sober", "drinking", "nightlife"],
  communication: ["clear communication", "good listener", "honest", "direct", "empathetic", "open communication"],
  values: ["kindness", "honesty", "family", "independence", "growth", "ambition", "curiosity", "loyalty", "respect"],
};

function buildCandidate(raw: z.infer<typeof bridgeCandidateSchema>, preferences: Preferences): CandidateInput {
  const extracted = extractBioAndPrompts(raw.rawText);
  const bio = raw.bio?.trim() || extracted.bio || "";
  const structuredPrompts = raw.structuredPrompts && raw.structuredPrompts.length > 0 ? raw.structuredPrompts : extracted.prompts;
  const promptStrings = raw.prompts.length > 0 && !raw.prompts.every((p) => p.length < 5) ? raw.prompts : extracted.promptStrings;
  const text = [raw.rawText, bio, ...promptStrings].join("\n");

  return {
    displayName: raw.displayName,
    age: raw.age,
    location: raw.location,
    distanceKm: raw.distanceKm,
    relationshipIntentions: mentioned(text, [...preferences.relationshipIntentions, ...SIGNALS.relationshipIntentions]),
    interests: mentioned(text, [...preferences.interests, ...SIGNALS.interests]),
    lifestyle: mentioned(text, [...preferences.lifestyle, ...SIGNALS.lifestyle]),
    communication: mentioned(text, [...preferences.communication, ...SIGNALS.communication]),
    values: mentioned(text, [...preferences.values, ...SIGNALS.values]),
    explicitConflicts: [],
    bio,
    prompts: promptStrings,
    structuredPrompts,
    rawText: raw.rawText,
    photos: (raw.photos as CandidateInput["photos"]) || [],
    source: "bumble",
    profileUrl: raw.profileUrl,
    screenshots: raw.screenshots,
    profileImages: raw.profileImages || [],
    physicalDetails: raw.physicalDetails,
  };
}

export function actionForDecision(decision: CompatibilityDecision, preferences?: Preferences): "like" | "pass" {
  if (decision.conflicts.length > 0) return "pass";
  if (
    preferences?.policy === "exploratory" &&
    /hookup|casual|swipe right on everyone|maximi[sz]e|everyone/i.test(preferences.narrative)
  ) {
    return "like";
  }
  return decision.label === "Strong potential match" || decision.label === "Possible match" ? "like" : "pass";
}

export function evaluateBumbleProfile(db: PairwiseDatabase, input: unknown) {
  const runtime = getRuntimeState(db);
  if (runtime.paused) throw new Error("Pairwise is paused. Resume the agent before starting Android automation.");
  const preferences = getPreferences(db);
  if (!preferences?.confirmed) throw new Error("Complete and confirm onboarding before starting Android automation.");

  const raw = bridgeCandidateSchema.parse(input);
  const normalized = buildCandidate(raw, preferences);
  const queued = enqueueCandidate(db, normalized);
  if (!queued.duplicate || queued.candidate.status !== "complete") processCandidateNow(db, queued.candidate.id);
  const candidate = getCandidate(db, queued.candidate.id);
  if (!candidate?.decision) throw new Error("The candidate could not be evaluated.");
  const action = actionForDecision(candidate.decision, preferences);
  recordUserDecision(
    db,
    candidate.id,
    action === "like" ? "interested" : "pass",
    "Executed by the Pairwise agent.",
    "agent",
  );

  return {
    action,
    candidateId: candidate.id,
    displayName: candidate.input.displayName,
    label: candidate.decision.label,
    score: candidate.decision.score,
    confidence: candidate.decision.confidence,
    duplicate: queued.duplicate,
  };
}

// Kept for the legacy local bridge endpoint while the Android controller is the active transport.
export const evaluateBrowserCandidate = evaluateBumbleProfile;
