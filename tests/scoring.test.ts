import { describe, expect, it } from "vitest";
import { analyzeCandidate } from "@/lib/analyzer";
import { scoreCandidate } from "@/lib/scoring";
import { candidate, preferences } from "./fixtures";

describe("deterministic compatibility scoring", () => {
  it("produces a strong, explainable result with full alignment", () => {
    const input = candidate();
    const result = scoreCandidate(preferences(), input, analyzeCandidate(input));
    expect(result.label).toBe("Strong potential match");
    expect(result.score).toBe(100);
    expect(result.confidence).toBe(1);
    expect(result.explanation.length).toBeGreaterThan(2);
  });

  it("lets an explicit deal-breaker override a high aggregate score", () => {
    const input = candidate({ lifestyle: ["active lifestyle", "smoker"], bio: "I am a smoker who loves travel and cooking." });
    const result = scoreCandidate(preferences(), input, analyzeCandidate(input));
    expect(result.score).toBeGreaterThan(70);
    expect(result.label).toBe("Does not meet stated criteria");
    expect(result.conflicts).toContain("smoking preference conflicts");
  });

  it("excludes missing dimensions instead of scoring them as zero", () => {
    const input = candidate({ communication: [], values: [], lifestyle: [] });
    const result = scoreCandidate(preferences(), input, analyzeCandidate(input));
    expect(result.dimensions.find((item) => item.key === "communication")?.score).toBeNull();
    expect(result.unknowns).toContain("Communication");
    expect(result.evidenceCoverage).toBeLessThan(1);
  });

  it("honors configurable weights", () => {
    const input = candidate({ interests: [], lifestyle: ["active lifestyle"], values: ["unrelated"] });
    const valuesHeavy = preferences({ weights: { relationshipIntentions: 10, sharedInterests: 5, lifestyle: 5, communication: 5, values: 75 } });
    const intentionHeavy = preferences({ weights: { relationshipIntentions: 75, sharedInterests: 5, lifestyle: 5, communication: 10, values: 5 } });
    const analysis = analyzeCandidate(input);
    expect(scoreCandidate(intentionHeavy, input, analysis).score).toBeGreaterThan(scoreCandidate(valuesHeavy, input, analysis).score!);
  });

  it("is reproducible for identical inputs", () => {
    const input = candidate();
    const analysis = analyzeCandidate(input);
    expect(scoreCandidate(preferences(), input, analysis)).toEqual(scoreCandidate(preferences(), input, analysis));
  });

  it("reports insufficient information when evidence coverage is too low", () => {
    const input = candidate({ relationshipIntentions: [], interests: [], lifestyle: [], communication: [], values: [], bio: "Hello.", prompts: [] });
    const result = scoreCandidate(preferences(), input, analyzeCandidate(input));
    expect(result.label).toBe("Insufficient information");
    expect(result.score).toBeNull();
  });
});
