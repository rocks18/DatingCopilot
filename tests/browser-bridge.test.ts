import { describe, expect, it } from "vitest";
import { evaluateBrowserCandidate } from "@/lib/browser-bridge";
import { createDatabase, getBrowserBridgeState, getCandidate, savePreferences, updateBrowserBridge } from "@/lib/db";
import { preferences } from "./fixtures";

describe("Bumble browser bridge", () => {
  it("converts an aligned visible profile into a Like action and journals it", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const result = evaluateBrowserCandidate(db, {
      displayName: "Aligned profile",
      age: 31,
      location: "Bengaluru",
      distanceKm: 12,
      rawText: "Looking for a serious relationship. I love travel, cooking, an active lifestyle, clear communication, kindness and growth. Non-smoker.",
      prompts: [],
    });
    expect(result.action).toBe("like");
    expect(getCandidate(db, result.candidateId)?.userDecision).toBe("interested");
    expect(getCandidate(db, result.candidateId)?.source).toBe("bumble");
    db.close();
  });

  it("converts a confirmed conflict into a Pass action", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const result = evaluateBrowserCandidate(db, {
      displayName: "Conflicting profile",
      age: 32,
      location: "Bengaluru",
      distanceKm: 8,
      rawText: "Smoker. Looking for something casual.",
      prompts: [],
    });
    expect(result.action).toBe("pass");
    expect(getCandidate(db, result.candidateId)?.decision?.conflicts.length).toBeGreaterThan(0);
    db.close();
  });

  it("tracks a live extension heartbeat without storing browser credentials", () => {
    const db = createDatabase(":memory:");
    const state = updateBrowserBridge(db, {
      running: true,
      tabUrl: "https://bumble.com/app",
      processed: 4,
      likes: 2,
      passes: 2,
      runLimit: 20,
    });
    expect(state).toMatchObject({ connected: true, running: true, processed: 4, likes: 2, passes: 2, runLimit: 20 });
    const columns = db.prepare("PRAGMA table_info(browser_bridge_state)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("password");
    expect(getBrowserBridgeState(db).tabUrl).toBe("https://bumble.com/app");
    db.close();
  });
});
