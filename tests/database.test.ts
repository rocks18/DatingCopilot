import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  enqueueCandidate,
  exportData,
  getActivities,
  getCandidate,
  getPreferences,
  getRuntimeState,
  importData,
  listCandidates,
  processDueJobs,
  recordUserDecision,
  savePreferences,
} from "@/lib/db";
import { candidate, preferences } from "./fixtures";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function fileDatabase() {
  const folder = mkdtempSync(path.join(tmpdir(), "pairwise-test-"));
  folders.push(folder);
  return { folder, file: path.join(folder, "pairwise.sqlite") };
}

describe("local persistence", () => {
  it("applies the database migration and supports startup/shutdown", () => {
    const db = createDatabase(":memory:");
    const migration = db.prepare("SELECT version FROM schema_migrations").get() as { version: number };
    expect(migration.version).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("persists confirmed preferences across restarts", () => {
    const { file } = fileDatabase();
    const first = createDatabase(file);
    savePreferences(first, preferences());
    first.close();
    const second = createDatabase(file);
    expect(getPreferences(second)?.narrative).toMatch(/serious relationship/);
    second.close();
  });

  it("prevents duplicate processing and completes a queued analysis", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const first = enqueueCandidate(db, candidate());
    const second = enqueueCandidate(db, candidate());
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(processDueJobs(db)).toBe(1);
    expect(getCandidate(db, first.candidate.id)?.status).toBe("complete");
    expect(listCandidates(db)).toHaveLength(1);
    db.close();
  });

  it("recovers an interrupted worker job on restart", () => {
    const { file } = fileDatabase();
    const first = createDatabase(file);
    savePreferences(first, preferences());
    const queued = enqueueCandidate(first, candidate()).candidate;
    first.prepare("UPDATE jobs SET status = 'processing' WHERE candidate_id = ?").run(queued.id);
    first.prepare("UPDATE candidates SET status = 'processing' WHERE id = ?").run(queued.id);
    first.close();
    const second = createDatabase(file);
    expect(getCandidate(second, queued.id)?.status).toBe("queued");
    expect(getActivities(second).some((item) => item.kind === "recovery")).toBe(true);
    second.close();
  });

  it("backs up and restores preferences and candidate inputs", () => {
    const source = createDatabase(":memory:");
    savePreferences(source, preferences());
    const saved = enqueueCandidate(source, candidate()).candidate;
    recordUserDecision(source, saved.id, "interested", "Worth a conversation");
    const backup = exportData(source);
    const target = createDatabase(":memory:");
    expect(importData(target, backup).imported).toBe(1);
    expect(getPreferences(target)?.confirmed).toBe(true);
    expect(listCandidates(target)).toHaveLength(1);
    expect(listCandidates(target)[0].userDecision).toBe("interested");
    expect(listCandidates(target)[0].userNote).toBe("Worth a conversation");
    source.close();
    target.close();
  });

  it("records the user's decision separately from the assistant assessment", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const saved = enqueueCandidate(db, candidate()).candidate;
    processDueJobs(db);
    const updated = recordUserDecision(db, saved.id, "maybe");
    expect(updated.userDecision).toBe("maybe");
    expect(updated.decision?.label).toBe("Strong potential match");
    db.close();
  });

  it("keeps structured logs free of candidate names and bio content", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    enqueueCandidate(db, candidate({ displayName: "Sensitive Name", bio: "Private biography sentence." }));
    processDueJobs(db);
    const logText = getActivities(db, 50).map((item) => item.message).join(" ");
    expect(logText).not.toContain("Sensitive Name");
    expect(logText).not.toContain("Private biography");
    db.close();
  });

  it("uses exponential retry state when preferences are unavailable", () => {
    const db = createDatabase(":memory:");
    enqueueCandidate(db, candidate());
    processDueJobs(db);
    const job = db.prepare("SELECT status, attempts, run_after FROM jobs").get() as { status: string; attempts: number; run_after: string };
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(1);
    expect(new Date(job.run_after).getTime()).toBeGreaterThan(Date.now());
    expect(getRuntimeState(db).workerStatus).toBe("error");
    db.close();
  });

  it("persists screenshots, physicalDetails, and profileUrl on candidate record", () => {
    const db = createDatabase(":memory:");
    savePreferences(db, preferences());
    const result = enqueueCandidate(db, {
      ...candidate(),
      profileUrl: "https://bumble.com/app#test-1234",
      screenshots: ["/screenshots/test_top.png", "/screenshots/test_bottom.png"],
      physicalDetails: { Height: "172 cm", Exercise: "Active", Zodiac: "Leo" },
    });
    const loaded = getCandidate(db, result.candidate.id);
    expect(loaded?.input.profileUrl).toBe("https://bumble.com/app#test-1234");
    expect(loaded?.input.screenshots).toEqual(["/screenshots/test_top.png", "/screenshots/test_bottom.png"]);
    expect(loaded?.input.physicalDetails).toEqual({ Height: "172 cm", Exercise: "Active", Zodiac: "Leo" });
    db.close();
  });
});
