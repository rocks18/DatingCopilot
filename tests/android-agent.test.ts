import { describe, expect, it } from "vitest";
import {
  commandAndroidAgent,
  confirmPlatformAction,
  createDatabase,
  enqueueCandidate,
  getAndroidAgentState,
  getCandidate,
  markPlatformActionExecuting,
  planPlatformAction,
  recordAndroidAction,
  savePreferences,
  stopAndroidAgentWithError,
  updateAndroidHeartbeat,
} from "@/lib/db";
import { candidate, preferences } from "./fixtures";

describe("Android Agent State and Lifecycle", () => {
  it("initializes with default state", () => {
    const db = createDatabase(":memory:");
    const state = getAndroidAgentState(db);
    expect(state.requestedRunning).toBe(false);
    expect(state.deviceConnected).toBe(false);
    expect(state.processed).toBe(0);
    expect(state.likes).toBe(0);
    expect(state.passes).toBe(0);
    db.close();
  });

  it("updates state on start and pause commands", () => {
    const db = createDatabase(":memory:");
    const started = commandAndroidAgent(db, "start", 25);
    expect(started.requestedRunning).toBe(true);
    expect(started.runLimit).toBe(25);

    const paused = commandAndroidAgent(db, "pause");
    expect(paused.requestedRunning).toBe(false);
    db.close();
  });

  it("tracks heartbeat and connected device info", () => {
    const db = createDatabase(":memory:");
    const heartbeat = updateAndroidHeartbeat(db, {
      deviceConnected: true,
      deviceSerial: "TEST_SERIAL_123",
      deviceModel: "Redmi K50i",
      appForeground: true,
      error: null,
    });
    expect(heartbeat.deviceConnected).toBe(true);
    expect(heartbeat.deviceSerial).toBe("TEST_SERIAL_123");
    expect(heartbeat.deviceModel).toBe("Redmi K50i");
    expect(heartbeat.appForeground).toBe(true);
    db.close();
  });

  it("records an Android action and journals user decision as agent", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const queued = enqueueCandidate(db, candidate());

    const state = recordAndroidAction(db, {
      candidateId: queued.candidate.id,
      action: "like",
      signature: "test-sig-123",
    });

    expect(state.processed).toBe(1);
    expect(state.likes).toBe(1);
    expect(state.passes).toBe(0);
    expect(state.lastAction).toBe("like");

    const cand = getCandidate(db, queued.candidate.id);
    expect(cand?.userDecision).toBe("interested");
    db.close();
  });

  it("handles platform action planning, execution, and confirmation lifecycle", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const queued = enqueueCandidate(db, candidate());

    const planned = planPlatformAction(db, {
      profileSignature: "sig-abc",
      candidateId: queued.candidate.id,
      action: "pass",
    });
    expect(planned.status).toBe("planned");

    const executing = markPlatformActionExecuting(db, planned.id);
    expect(executing.status).toBe("executing");

    const confirmed = confirmPlatformAction(db, executing.id, "sig-def");
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.afterSignature).toBe("sig-def");

    const state = getAndroidAgentState(db);
    expect(state.processed).toBe(1);
    expect(state.passes).toBe(1);
    db.close();
  });

  it("stops agent and sets error message on failure", () => {
    const db = createDatabase(":memory:");
    commandAndroidAgent(db, "start", 10);
    const stopped = stopAndroidAgentWithError(db, "Photo verification required on phone.");
    expect(stopped.requestedRunning).toBe(false);
    expect(stopped.lastError).toBe("Photo verification required on phone.");
    db.close();
  });
});
