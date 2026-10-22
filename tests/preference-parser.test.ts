import { describe, expect, it } from "vitest";
import { parsePreferenceNarrative } from "@/lib/preference-parser";

describe("preference parsing", () => {
  it("extracts only supported phrases present in the narrative", () => {
    const result = parsePreferenceNarrative(
      "I want a serious relationship, age 27 to 37, within 25 km. I enjoy travel and cooking, value honesty, and prefer clear communication.",
    );
    expect(result.ageRange).toEqual({ min: 27, max: 37 });
    expect(result.radiusKm).toBe(25);
    expect(result.relationshipIntentions).toContain("serious relationship");
    expect(result.interests).toEqual(expect.arrayContaining(["travel", "cooking"]));
    expect(result.values).toContain("honesty");
    expect(result.communication).toContain("clear communication");
    expect(result.confirmed).toBe(false);
  });

  it("keeps unmentioned preference lists empty", () => {
    const result = parsePreferenceNarrative("I would like to meet someone thoughtful and see where it goes.");
    expect(result.relationshipIntentions).toEqual([]);
    expect(result.interests).toEqual([]);
    expect(result.nonNegotiables).toEqual([]);
    expect(result.exclusions).toEqual([]);
  });

  it("converts an explicitly stated radius in miles", () => {
    expect(parsePreferenceNarrative("Looking for someone within 10 miles for a serious relationship.").radiusKm).toBe(16);
  });

  it("does not treat non-smoker as a no-prefixed exclusion", () => {
    const result = parsePreferenceNarrative("I want a serious relationship with a non-smoker who communicates clearly.");
    expect(result.lifestyle).toContain("non-smoker");
    expect(result.communication).toContain("clear communication");
    expect(result.exclusions).toEqual([]);
  });
});
