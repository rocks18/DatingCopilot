import type { CandidateAnalysis, CandidateInput, EvidenceItem } from "./types";
import { computePictureRating } from "./visual-rating";

const textSignals: Record<string, { field: string; value: string }> = {
  "serious relationship": { field: "relationship intentions", value: "serious relationship" },
  "long-term": { field: "relationship intentions", value: "long-term relationship" },
  marriage: { field: "relationship intentions", value: "marriage" },
  travel: { field: "interest", value: "travel" },
  hiking: { field: "interest", value: "hiking" },
  reading: { field: "interest", value: "reading" },
  cooking: { field: "interest", value: "cooking" },
  fitness: { field: "lifestyle", value: "fitness" },
  outdoors: { field: "lifestyle", value: "outdoors" },
  vegetarian: { field: "lifestyle", value: "vegetarian" },
  vegan: { field: "lifestyle", value: "vegan" },
  kindness: { field: "value", value: "kindness" },
  honesty: { field: "value", value: "honesty" },
  family: { field: "value", value: "family" },
};

function fact(field: string, value: string): EvidenceItem {
  return { field, value, basis: "explicit", confidence: 1 };
}

function pushList(target: EvidenceItem[], field: string, values: string[]) {
  values.forEach((value) => target.push(fact(field, value)));
}

export function analyzeCandidate(input: CandidateInput): CandidateAnalysis {
  const facts: EvidenceItem[] = [fact("display name", input.displayName)];
  if (input.age !== null) facts.push(fact("age", String(input.age)));
  if (input.location) facts.push(fact("location", input.location));
  if (input.distanceKm !== null) facts.push(fact("distance", `${input.distanceKm} km`));
  pushList(facts, "relationship intentions", input.relationshipIntentions);
  pushList(facts, "interest", input.interests);
  pushList(facts, "lifestyle", input.lifestyle);
  pushList(facts, "communication", input.communication);
  pushList(facts, "value", input.values);

  const combinedText = [input.bio, input.rawText || "", ...input.prompts].join(" ").toLowerCase();
  const existing = new Set(facts.map((item) => `${item.field}:${item.value.toLowerCase()}`));
  const inferences = Object.entries(textSignals)
    .filter(([signal]) => combinedText.includes(signal))
    .map(([, result]) => ({
      field: result.field,
      value: result.value,
      basis: "text-derived" as const,
      confidence: 0.65,
    }))
    .filter((item) => !existing.has(`${item.field}:${item.value}`));

  const unknowns: string[] = [];
  if (input.relationshipIntentions.length === 0) unknowns.push("relationship intentions");
  if (input.interests.length === 0 && !inferences.some((item) => item.field === "interest")) unknowns.push("interests");
  if (input.lifestyle.length === 0 && !inferences.some((item) => item.field === "lifestyle")) unknowns.push("lifestyle");
  if (input.communication.length === 0) unknowns.push("communication style");
  if (input.values.length === 0 && !inferences.some((item) => item.field === "value")) unknowns.push("stated values");
  if (input.age === null) unknowns.push("age");
  if (!input.location) unknowns.push("location");

  const photoObservations = input.photos.flatMap((photo) => photo.observations);
  const average = (key: "brightness" | "sharpness") =>
    input.photos.length
      ? input.photos.reduce((sum, photo) => sum + photo[key], 0) / input.photos.length
      : null;
  const brightness = average("brightness");
  const sharpness = average("sharpness");

  return {
    facts,
    inferences,
    unknowns,
    photoSummary: {
      count: input.photos.length,
      clarity: sharpness === null ? "unknown" : sharpness >= 0.32 ? "good" : "needs-attention",
      lighting: brightness === null ? "unknown" : brightness >= 0.25 && brightness <= 0.82 ? "good" : "needs-attention",
      variety: input.photos.length === 0 ? "unknown" : input.photos.length >= 3 ? "good" : "limited",
      observations: [...new Set(photoObservations)].slice(0, 8),
    },
    pictureRating: computePictureRating(input),
  };
}
