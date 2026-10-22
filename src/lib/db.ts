import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { analyzeCandidate } from "./analyzer";
import { candidateInputSchema, preferencesSchema } from "./schemas";
import { scoreCandidate } from "./scoring";
import type {
  ActivityRecord,
  CandidateInput,
  CandidateRecord,
  Preferences,
  RuntimeState,
  BrowserBridgeState,
  AndroidAgentState,
  PlatformActionRecord,
} from "./types";

type Row = Record<string, unknown>;

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function resolveDatabasePath() {
  const configured = process.env.PAIRWISE_DB_PATH;
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".data", "pairwise.sqlite");
}

function candidateFingerprint(input: CandidateInput) {
  const canonical = {
    ...input,
    interests: [...input.interests].sort(),
    lifestyle: [...input.lifestyle].sort(),
    communication: [...input.communication].sort(),
    values: [...input.values].sort(),
    prompts: [...input.prompts].sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function createDatabase(databasePath = resolveDatabasePath()) {
  if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (databasePath !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  recoverInterruptedWork(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const existing = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
  if (!existing) db.exec(`
    BEGIN;
    CREATE TABLE preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL,
      analysis_json TEXT,
      decision_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      score INTEGER,
      confidence REAL NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    );
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      candidate_id INTEGER,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 4,
      run_after TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    );
    CREATE TABLE activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      paused INTEGER NOT NULL DEFAULT 0,
      worker_status TEXT NOT NULL DEFAULT 'idle',
      last_success_at TEXT,
      last_error TEXT,
      heartbeat_at TEXT
    );
    INSERT INTO app_state (id) VALUES (1);
    INSERT INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'));
    COMMIT;
  `);
  const versionTwo = db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get();
  if (!versionTwo) {
    db.exec(`
      BEGIN;
      ALTER TABLE candidates ADD COLUMN user_decision TEXT;
      ALTER TABLE candidates ADD COLUMN user_note TEXT NOT NULL DEFAULT '';
      ALTER TABLE candidates ADD COLUMN user_decided_at TEXT;
      INSERT INTO schema_migrations (version, applied_at) VALUES (2, datetime('now'));
      COMMIT;
    `);
  }
  const versionThree = db.prepare("SELECT version FROM schema_migrations WHERE version = 3").get();
  if (!versionThree) {
    db.exec(`
      BEGIN;
      CREATE TABLE browser_bridge_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        running INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT,
        tab_url TEXT,
        processed INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        passes INTEGER NOT NULL DEFAULT 0,
        run_limit INTEGER NOT NULL DEFAULT 250,
        last_candidate_id INTEGER,
        last_action TEXT,
        last_error TEXT,
        FOREIGN KEY(last_candidate_id) REFERENCES candidates(id) ON DELETE SET NULL
      );
      INSERT INTO browser_bridge_state (id) VALUES (1);
      INSERT INTO schema_migrations (version, applied_at) VALUES (3, datetime('now'));
      COMMIT;
    `);
  }
  const versionFour = db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get();
  if (!versionFour) {
    db.exec(`
      BEGIN;
      CREATE TABLE android_agent_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        requested_running INTEGER NOT NULL DEFAULT 0,
        controller_heartbeat_at TEXT,
        device_connected INTEGER NOT NULL DEFAULT 0,
        device_serial TEXT,
        device_model TEXT,
        app_foreground INTEGER NOT NULL DEFAULT 0,
        processed INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        passes INTEGER NOT NULL DEFAULT 0,
        run_limit INTEGER NOT NULL DEFAULT 250,
        last_signature TEXT,
        last_profile_at TEXT,
        last_candidate_id INTEGER,
        last_action TEXT,
        last_error TEXT,
        FOREIGN KEY(last_candidate_id) REFERENCES candidates(id) ON DELETE SET NULL
      );
      INSERT INTO android_agent_state (id) VALUES (1);
      INSERT INTO schema_migrations (version, applied_at) VALUES (4, datetime('now'));
      COMMIT;
    `);
  }
  const versionFive = db.prepare("SELECT version FROM schema_migrations WHERE version = 5").get();
  if (!versionFive) {
    db.exec(`
      BEGIN;
      CREATE TABLE platform_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_key TEXT NOT NULL UNIQUE,
        transport TEXT NOT NULL,
        profile_signature TEXT NOT NULL,
        candidate_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        after_signature TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      );
      CREATE INDEX platform_actions_status_idx ON platform_actions (transport, status, updated_at);
      INSERT INTO schema_migrations (version, applied_at) VALUES (5, datetime('now'));
      COMMIT;
    `);
  }
}

function recoverInterruptedWork(db: DatabaseSync) {
  const timestamp = now();
  const changed = db
    .prepare("UPDATE jobs SET status = 'queued', run_after = ?, updated_at = ? WHERE status = 'processing'")
    .run(timestamp, timestamp).changes;
  db.prepare("UPDATE candidates SET status = 'queued', updated_at = ? WHERE status = 'processing'").run(timestamp);
  if (changed) addActivity(db, "recovery", "warning", `Recovered ${changed} interrupted processing task${changed === 1 ? "" : "s"}.`);
}

let singleton: DatabaseSync | null = null;

export function getDatabase() {
  if (!singleton) singleton = createDatabase();
  return singleton;
}

export function closeDatabase() {
  singleton?.close();
  singleton = null;
}

export function addActivity(
  db: DatabaseSync,
  kind: string,
  level: ActivityRecord["level"],
  message: string,
) {
  db.prepare("INSERT INTO activity (kind, level, message, created_at) VALUES (?, ?, ?, ?)").run(
    kind,
    level,
    message,
    now(),
  );
}

export function getActivities(db: DatabaseSync, limit = 12): ActivityRecord[] {
  return db
    .prepare("SELECT id, kind, level, message, created_at FROM activity ORDER BY id DESC LIMIT ?")
    .all(limit)
    .map((row) => {
      const value = row as Row;
      return {
        id: Number(value.id),
        kind: String(value.kind),
        level: value.level as ActivityRecord["level"],
        message: String(value.message),
        createdAt: String(value.created_at),
      };
    });
}

export function getPreferences(db: DatabaseSync): Preferences | null {
  const row = db.prepare("SELECT data FROM preferences WHERE id = 1").get() as Row | undefined;
  return row ? preferencesSchema.parse(parseJson(row.data)) : null;
}

export function savePreferences(db: DatabaseSync, raw: unknown): Preferences {
  const preferences = preferencesSchema.parse(raw);
  const timestamp = now();
  db.prepare(
    `INSERT INTO preferences (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(preferences), timestamp);
  addActivity(db, "preferences", "success", "Partner preferences were saved locally.");
  return preferences;
}

function mapCandidate(row: Row): CandidateRecord {
  return {
    id: Number(row.id),
    status: row.status as CandidateRecord["status"],
    source: row.source as CandidateRecord["source"],
    input: candidateInputSchema.parse(parseJson(row.input_json)),
    analysis: row.analysis_json ? parseJson(row.analysis_json) : null,
    decision: row.decision_json ? parseJson(row.decision_json) : null,
    userDecision: row.user_decision ? row.user_decision as CandidateRecord["userDecision"] : null,
    userNote: row.user_note ? String(row.user_note) : "",
    userDecidedAt: row.user_decided_at ? String(row.user_decided_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listCandidates(db: DatabaseSync, limit = 100): CandidateRecord[] {
  return db
    .prepare("SELECT * FROM candidates ORDER BY updated_at DESC, id DESC LIMIT ?")
    .all(limit)
    .map((row) => mapCandidate(row as Row));
}

export function getCandidate(db: DatabaseSync, id: number): CandidateRecord | null {
  const row = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id) as Row | undefined;
  return row ? mapCandidate(row) : null;
}

export function enqueueCandidate(db: DatabaseSync, raw: unknown) {
  const input = candidateInputSchema.parse(raw);
  const fingerprint = candidateFingerprint(input);
  const existing = db.prepare("SELECT * FROM candidates WHERE fingerprint = ?").get(fingerprint) as Row | undefined;
  if (existing) return { candidate: mapCandidate(existing), duplicate: true };

  const timestamp = now();
  const result = db
    .prepare(
      "INSERT INTO candidates (fingerprint, source, status, input_json, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?)",
    )
    .run(fingerprint, input.source, JSON.stringify(input), timestamp, timestamp);
  const candidateId = Number(result.lastInsertRowid);
  db.prepare(
    "INSERT INTO jobs (job_key, type, candidate_id, status, run_after, created_at, updated_at) VALUES (?, 'analyze-candidate', ?, 'queued', ?, ?, ?)",
  ).run(`candidate:${fingerprint}`, candidateId, timestamp, timestamp, timestamp);
  addActivity(db, "candidate", "info", "A user-supplied profile was queued for local analysis.");
  return { candidate: getCandidate(db, candidateId)!, duplicate: false };
}

export function updateCandidate(db: DatabaseSync, id: number, raw: unknown) {
  const input = candidateInputSchema.parse(raw);
  const current = getCandidate(db, id);
  if (!current) throw new Error("Candidate not found.");
  const fingerprint = candidateFingerprint(input);
  const duplicate = db.prepare("SELECT id FROM candidates WHERE fingerprint = ? AND id != ?").get(fingerprint, id);
  if (duplicate) throw new Error("This corrected profile already exists in the journal.");
  const timestamp = now();
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE candidates SET fingerprint = ?, source = ?, status = 'queued', input_json = ?, analysis_json = NULL, decision_json = NULL, updated_at = ? WHERE id = ?",
    ).run(fingerprint, input.source, JSON.stringify(input), timestamp, id);
    db.prepare("DELETE FROM decisions WHERE candidate_id = ?").run(id);
    db.prepare("DELETE FROM jobs WHERE candidate_id = ?").run(id);
    db.prepare(
      "INSERT INTO jobs (job_key, type, candidate_id, status, run_after, created_at, updated_at) VALUES (?, 'analyze-candidate', ?, 'queued', ?, ?, ?)",
    ).run(`candidate:${fingerprint}`, id, timestamp, timestamp, timestamp);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  addActivity(db, "candidate", "info", "User corrections were saved and the profile was queued for re-analysis.");
  return getCandidate(db, id)!;
}

export function deleteCandidate(db: DatabaseSync, id: number) {
  const result = db.prepare("DELETE FROM candidates WHERE id = ?").run(id);
  if (!result.changes) throw new Error("Candidate not found.");
  addActivity(db, "privacy", "warning", "A candidate and its decision history were deleted locally.");
}

export function recordUserDecision(
  db: DatabaseSync,
  id: number,
  decision: NonNullable<CandidateRecord["userDecision"]>,
  note = "",
  actor: "user" | "agent" = "user",
) {
  if (!(["interested", "maybe", "pass"] as const).includes(decision)) throw new Error("Invalid user decision.");
  const timestamp = now();
  const result = db
    .prepare("UPDATE candidates SET user_decision = ?, user_note = ?, user_decided_at = ?, updated_at = ? WHERE id = ?")
    .run(decision, note.trim().slice(0, 1000), timestamp, timestamp, id);
  if (!result.changes) throw new Error("Candidate not found.");
  addActivity(
    db,
    actor === "agent" ? "browser-action" : "user-decision",
    "success",
    actor === "agent" ? "The browser agent recorded its completed platform action." : "A user decision was recorded in the local journal.",
  );
  return getCandidate(db, id)!;
}

function setRuntime(
  db: DatabaseSync,
  values: Partial<{ workerStatus: RuntimeState["workerStatus"]; lastSuccess: string | null; lastError: string | null; heartbeat: string | null }>,
) {
  if (values.workerStatus !== undefined) db.prepare("UPDATE app_state SET worker_status = ? WHERE id = 1").run(values.workerStatus);
  if (values.lastSuccess !== undefined) db.prepare("UPDATE app_state SET last_success_at = ? WHERE id = 1").run(values.lastSuccess);
  if (values.lastError !== undefined) db.prepare("UPDATE app_state SET last_error = ? WHERE id = 1").run(values.lastError);
  if (values.heartbeat !== undefined) db.prepare("UPDATE app_state SET heartbeat_at = ? WHERE id = 1").run(values.heartbeat);
}

function processJob(db: DatabaseSync, job: Row) {
  const jobId = Number(job.id);
  const candidateId = Number(job.candidate_id);
  const timestamp = now();
  const claimed = db.prepare(
    "UPDATE jobs SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'queued'",
  ).run(timestamp, jobId);
  if (!claimed.changes) return false;

  db.prepare("UPDATE candidates SET status = 'processing', updated_at = ? WHERE id = ?").run(timestamp, candidateId);
  setRuntime(db, { workerStatus: "processing", heartbeat: timestamp });

  try {
    const preferences = getPreferences(db);
    if (!preferences?.confirmed) throw new Error("Confirmed preferences are required before analysis.");
    const candidate = getCandidate(db, candidateId);
    if (!candidate) throw new Error("Candidate record no longer exists.");
    const analysis = analyzeCandidate(candidate.input);
    const decision = scoreCandidate(preferences, candidate.input, analysis);
    const completedAt = now();

    db.prepare(
      "UPDATE candidates SET status = 'complete', analysis_json = ?, decision_json = ?, updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(analysis), JSON.stringify(decision), completedAt, candidateId);
    db.prepare("UPDATE jobs SET status = 'complete', last_error = NULL, updated_at = ? WHERE id = ?").run(completedAt, jobId);
    db.prepare(
      "INSERT INTO decisions (candidate_id, label, score, confidence, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(candidateId, decision.label, decision.score, decision.confidence, JSON.stringify(decision), completedAt);
    setRuntime(db, { workerStatus: "idle", lastSuccess: completedAt, lastError: null, heartbeat: completedAt });
    addActivity(db, "analysis", "success", `Local analysis completed with ${Math.round(decision.evidenceCoverage * 100)}% evidence coverage.`);
    return true;
  } catch (error) {
    const attempts = Number(job.attempts) + 1;
    const terminal = attempts >= Number(job.max_attempts);
    const retryAt = new Date(Date.now() + 2 ** attempts * 1000).toISOString();
    const errorCode = error instanceof Error ? error.message : "Unknown processing error";
    db.prepare(
      "UPDATE jobs SET status = ?, attempts = ?, run_after = ?, last_error = ?, updated_at = ? WHERE id = ?",
    ).run(terminal ? "failed" : "queued", attempts, retryAt, errorCode, now(), jobId);
    db.prepare("UPDATE candidates SET status = ?, updated_at = ? WHERE id = ?").run(terminal ? "failed" : "queued", now(), candidateId);
    setRuntime(db, { workerStatus: "error", lastError: errorCode, heartbeat: now() });
    addActivity(db, "analysis", terminal ? "error" : "warning", terminal ? "Local analysis failed after retry attempts." : "Local analysis will retry after a transient error.");
    return false;
  }
}

export function processDueJobs(db: DatabaseSync, limit = 5) {
  const state = getRuntimeState(db);
  setRuntime(db, { heartbeat: now() });
  if (state.paused) {
    setRuntime(db, { workerStatus: "paused" });
    return 0;
  }

  const jobs = db
    .prepare("SELECT * FROM jobs WHERE status = 'queued' AND run_after <= ? ORDER BY id LIMIT ?")
    .all(now(), limit) as Row[];
  let processed = 0;
  for (const job of jobs) if (processJob(db, job)) processed += 1;

  if (!jobs.length) setRuntime(db, { workerStatus: "idle", heartbeat: now() });
  return processed;
}

export function processCandidateNow(db: DatabaseSync, candidateId: number) {
  const state = getRuntimeState(db);
  setRuntime(db, { heartbeat: now() });
  if (state.paused) {
    setRuntime(db, { workerStatus: "paused" });
    return false;
  }

  const candidate = getCandidate(db, candidateId);
  if (!candidate) throw new Error("Candidate not found.");
  if (candidate.status === "complete") return true;
  const job = db.prepare(
    "SELECT * FROM jobs WHERE candidate_id = ? AND status = 'queued' ORDER BY id DESC LIMIT 1",
  ).get(candidateId) as Row | undefined;
  if (!job) return getCandidate(db, candidateId)?.status === "complete";
  return processJob(db, job);
}

export function getRuntimeState(db: DatabaseSync): RuntimeState {
  const row = db.prepare("SELECT * FROM app_state WHERE id = 1").get() as Row;
  return {
    paused: Boolean(row.paused),
    workerStatus: row.worker_status as RuntimeState["workerStatus"],
    lastSuccessfulProcessingAt: row.last_success_at ? String(row.last_success_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    heartbeatAt: row.heartbeat_at ? String(row.heartbeat_at) : null,
  };
}

export function setPaused(db: DatabaseSync, paused: boolean) {
  db.prepare("UPDATE app_state SET paused = ?, worker_status = ? WHERE id = 1").run(paused ? 1 : 0, paused ? "paused" : "idle");
  addActivity(db, "runtime", "info", paused ? "Background processing was paused." : "Background processing was resumed.");
  return getRuntimeState(db);
}

export function updateBrowserBridge(
  db: DatabaseSync,
  input: {
    running: boolean;
    tabUrl?: string | null;
    processed?: number;
    likes?: number;
    passes?: number;
    runLimit?: number;
    error?: string | null;
  },
) {
  const timestamp = now();
  db.prepare(
    `UPDATE browser_bridge_state
     SET running = ?, last_seen_at = ?, tab_url = ?, processed = ?, likes = ?, passes = ?, run_limit = ?, last_error = ?
     WHERE id = 1`,
  ).run(
    input.running ? 1 : 0,
    timestamp,
    input.tabUrl?.slice(0, 500) ?? null,
    Math.max(0, input.processed ?? 0),
    Math.max(0, input.likes ?? 0),
    Math.max(0, input.passes ?? 0),
    Math.min(1000, Math.max(1, input.runLimit ?? 250)),
    input.error?.slice(0, 500) ?? null,
  );
  return getBrowserBridgeState(db);
}

export function recordBrowserAction(db: DatabaseSync, candidateId: number, action: "like" | "pass") {
  db.prepare(
    "UPDATE browser_bridge_state SET last_candidate_id = ?, last_action = ?, last_error = NULL WHERE id = 1",
  ).run(candidateId, action);
  addActivity(db, "browser-action", "success", `Browser agent queued a ${action} action after local analysis.`);
}

export function getBrowserBridgeState(db: DatabaseSync): BrowserBridgeState {
  const row = db.prepare("SELECT * FROM browser_bridge_state WHERE id = 1").get() as Row;
  const lastSeenAt = row.last_seen_at ? String(row.last_seen_at) : null;
  const connected = Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 15_000);
  return {
    connected,
    running: connected && Boolean(row.running),
    lastSeenAt,
    tabUrl: row.tab_url ? String(row.tab_url) : null,
    processed: Number(row.processed),
    likes: Number(row.likes),
    passes: Number(row.passes),
    runLimit: Number(row.run_limit),
    lastCandidateId: row.last_candidate_id === null ? null : Number(row.last_candidate_id),
    lastAction: row.last_action ? row.last_action as BrowserBridgeState["lastAction"] : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export function getAndroidAgentState(db: DatabaseSync): AndroidAgentState {
  const row = db.prepare("SELECT * FROM android_agent_state WHERE id = 1").get() as Row;
  const lastSeenAt = row.controller_heartbeat_at ? String(row.controller_heartbeat_at) : null;
  const controllerAlive = Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 10_000);
  const requestedRunning = Boolean(row.requested_running);
  const deviceConnected = Boolean(row.device_connected);
  const appForeground = Boolean(row.app_foreground);
  return {
    controllerAlive,
    requestedRunning,
    running: controllerAlive && requestedRunning && deviceConnected && appForeground && !row.last_error,
    deviceConnected,
    deviceSerial: row.device_serial ? String(row.device_serial) : null,
    deviceModel: row.device_model ? String(row.device_model) : null,
    appForeground,
    processed: Number(row.processed),
    likes: Number(row.likes),
    passes: Number(row.passes),
    runLimit: Number(row.run_limit),
    lastSeenAt,
    lastProfileAt: row.last_profile_at ? String(row.last_profile_at) : null,
    lastCandidateId: row.last_candidate_id === null ? null : Number(row.last_candidate_id),
    lastAction: row.last_action ? row.last_action as AndroidAgentState["lastAction"] : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export function commandAndroidAgent(db: DatabaseSync, command: "start" | "pause", runLimit = 0) {
  if (command === "start") {
    const finalLimit = Math.max(0, Math.round(runLimit));
    db.prepare(
      `UPDATE android_agent_state
       SET requested_running = 1, processed = 0, likes = 0, passes = 0, run_limit = ?,
           last_signature = NULL, last_profile_at = NULL, last_candidate_id = NULL,
           last_action = NULL, last_error = NULL
       WHERE id = 1`,
    ).run(finalLimit);
    addActivity(
      db,
      "android-agent",
      "info",
      finalLimit > 0
        ? `Android automation run was started with limit ${finalLimit}.`
        : "Android automation run was started in continuous (unlimited) mode.",
    );
  } else {
    db.prepare("UPDATE android_agent_state SET requested_running = 0, last_error = NULL WHERE id = 1").run();
    addActivity(db, "android-agent", "info", "Android automation run was paused.");
  }
  return getAndroidAgentState(db);
}

export function updateAndroidHeartbeat(
  db: DatabaseSync,
  values: {
    deviceConnected: boolean;
    deviceSerial?: string | null;
    deviceModel?: string | null;
    appForeground?: boolean;
    error?: string | null;
  },
) {
  db.prepare(
    `UPDATE android_agent_state
     SET controller_heartbeat_at = ?, device_connected = ?, device_serial = ?, device_model = ?,
         app_foreground = ?, last_error = ?
     WHERE id = 1`,
  ).run(
    now(),
    values.deviceConnected ? 1 : 0,
    values.deviceSerial?.slice(0, 200) ?? null,
    values.deviceModel?.slice(0, 200) ?? null,
    values.appForeground ? 1 : 0,
    values.error?.slice(0, 500) ?? null,
  );
  return getAndroidAgentState(db);
}

export function recordAndroidAction(
  db: DatabaseSync,
  values: { candidateId: number; action: "like" | "pass"; signature: string },
) {
  const timestamp = now();
  db.prepare(
    `UPDATE android_agent_state
     SET processed = processed + 1,
         likes = likes + ?,
         passes = passes + ?,
         last_signature = ?, last_profile_at = ?, last_candidate_id = ?, last_action = ?, last_error = NULL
     WHERE id = 1`,
  ).run(
    values.action === "like" ? 1 : 0,
    values.action === "pass" ? 1 : 0,
    values.signature,
    timestamp,
    values.candidateId,
    values.action,
  );
  recordUserDecision(
    db,
    values.candidateId,
    values.action === "like" ? "interested" : "pass",
    "Executed by the Pairwise Android agent.",
    "agent",
  );
  addActivity(db, "android-action", "success", `Android agent completed a ${values.action} action.`);
  const state = getAndroidAgentState(db);
  if (state.runLimit > 0 && state.processed >= state.runLimit) {
    db.prepare("UPDATE android_agent_state SET requested_running = 0 WHERE id = 1").run();
    addActivity(db, "android-agent", "success", "Android automation run reached its configured limit.");
  }
  return getAndroidAgentState(db);
}

function mapPlatformAction(row: Row): PlatformActionRecord {
  return {
    id: Number(row.id),
    transport: row.transport as PlatformActionRecord["transport"],
    profileSignature: String(row.profile_signature),
    candidateId: Number(row.candidate_id),
    action: row.action as PlatformActionRecord["action"],
    status: row.status as PlatformActionRecord["status"],
    afterSignature: row.after_signature ? String(row.after_signature) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function planPlatformAction(
  db: DatabaseSync,
  values: { profileSignature: string; candidateId: number; action: "like" | "pass" },
) {
  const key = `bumble-android:${values.profileSignature}`;
  const existing = db.prepare("SELECT * FROM platform_actions WHERE action_key = ?").get(key) as Row | undefined;
  if (existing) return mapPlatformAction(existing);
  const timestamp = now();
  const result = db.prepare(
    `INSERT INTO platform_actions
      (action_key, transport, profile_signature, candidate_id, action, status, created_at, updated_at)
     VALUES (?, 'bumble-android', ?, ?, ?, 'planned', ?, ?)`,
  ).run(key, values.profileSignature, values.candidateId, values.action, timestamp, timestamp);
  return mapPlatformAction(db.prepare("SELECT * FROM platform_actions WHERE id = ?").get(Number(result.lastInsertRowid)) as Row);
}

export function markPlatformActionExecuting(db: DatabaseSync, id: number) {
  const result = db.prepare(
    "UPDATE platform_actions SET status = 'executing', updated_at = ? WHERE id = ? AND status = 'planned'",
  ).run(now(), id);
  if (!result.changes) throw new Error("Platform action is no longer in a planned state.");
  return mapPlatformAction(db.prepare("SELECT * FROM platform_actions WHERE id = ?").get(id) as Row);
}

export function confirmPlatformAction(db: DatabaseSync, id: number, afterSignature: string) {
  const row = db.prepare("SELECT * FROM platform_actions WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new Error("Platform action not found.");
  const action = mapPlatformAction(row);
  if (action.status === "confirmed") return action;
  if (action.status !== "executing") throw new Error("Only an executing platform action can be confirmed.");
  const timestamp = now();
  db.prepare(
    "UPDATE platform_actions SET status = 'confirmed', after_signature = ?, error = NULL, updated_at = ? WHERE id = ?",
  ).run(afterSignature, timestamp, id);
  recordAndroidAction(db, {
    candidateId: action.candidateId,
    action: action.action,
    signature: action.profileSignature,
  });
  return mapPlatformAction(db.prepare("SELECT * FROM platform_actions WHERE id = ?").get(id) as Row);
}

export function failPlatformAction(
  db: DatabaseSync,
  id: number,
  status: "failed" | "uncertain",
  message: string,
) {
  const result = db.prepare(
    "UPDATE platform_actions SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status IN ('planned', 'executing')",
  ).run(status, message.slice(0, 500), now(), id);
  if (!result.changes) throw new Error("Platform action could not be failed from its current state.");
  stopAndroidAgentWithError(db, message);
  return mapPlatformAction(db.prepare("SELECT * FROM platform_actions WHERE id = ?").get(id) as Row);
}

export function getPendingPlatformAction(db: DatabaseSync) {
  const row = db.prepare(
    "SELECT * FROM platform_actions WHERE transport = 'bumble-android' AND status = 'executing' ORDER BY id DESC LIMIT 1",
  ).get() as Row | undefined;
  return row ? mapPlatformAction(row) : null;
}

export function stopAndroidAgentWithError(db: DatabaseSync, message: string) {
  db.prepare("UPDATE android_agent_state SET requested_running = 0, last_error = ? WHERE id = 1").run(message.slice(0, 500));
  addActivity(db, "android-agent", "error", "Android automation stopped and needs attention.");
  return getAndroidAgentState(db);
}

export function exportData(db: DatabaseSync) {
  return {
    format: "pairwise-backup-v1",
    exportedAt: now(),
    preferences: getPreferences(db),
    candidates: listCandidates(db, 1000).map((candidate) => ({
      input: candidate.input,
      userDecision: candidate.userDecision,
      userNote: candidate.userNote,
    })),
  };
}

export function importData(db: DatabaseSync, raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid backup file.");
  const data = raw as { format?: string; preferences?: unknown; candidates?: unknown[] };
  if (data.format !== "pairwise-backup-v1") throw new Error("Unsupported backup format.");
  if (data.preferences) savePreferences(db, data.preferences);
  let imported = 0;
  for (const entry of data.candidates ?? []) {
    const wrapped = entry && typeof entry === "object" && "input" in entry
      ? entry as { input: unknown; userDecision?: CandidateRecord["userDecision"]; userNote?: string }
      : { input: entry, userDecision: null, userNote: "" };
    const result = enqueueCandidate(db, wrapped.input);
    if (!result.duplicate) {
      imported += 1;
      if (wrapped.userDecision) recordUserDecision(db, result.candidate.id, wrapped.userDecision, wrapped.userNote);
    }
  }
  addActivity(db, "backup", "success", `Backup restored; ${imported} candidate record${imported === 1 ? "" : "s"} added.`);
  return { imported };
}

export function resetData(db: DatabaseSync) {
  db.exec(`
    BEGIN;
    DELETE FROM decisions;
    DELETE FROM jobs;
    DELETE FROM platform_actions;
    DELETE FROM candidates;
    DELETE FROM preferences;
    DELETE FROM activity;
    UPDATE app_state SET paused = 0, worker_status = 'idle', last_success_at = NULL, last_error = NULL, heartbeat_at = NULL WHERE id = 1;
    UPDATE browser_bridge_state SET running = 0, last_seen_at = NULL, tab_url = NULL, processed = 0, likes = 0, passes = 0, last_candidate_id = NULL, last_action = NULL, last_error = NULL WHERE id = 1;
    UPDATE android_agent_state SET requested_running = 0, device_connected = 0, device_serial = NULL, device_model = NULL, app_foreground = 0, processed = 0, likes = 0, passes = 0, last_signature = NULL, last_profile_at = NULL, last_candidate_id = NULL, last_action = NULL, last_error = NULL WHERE id = 1;
    COMMIT;
  `);
  addActivity(db, "privacy", "warning", "All local profile and preference data was reset.");
}

export function getSnapshot(db: DatabaseSync) {
  const candidates = listCandidates(db);
  const completed = candidates.filter((candidate) => candidate.status === "complete");
  return {
    preferences: getPreferences(db),
    candidates,
    activities: getActivities(db),
    runtime: getRuntimeState(db),
    android: getAndroidAgentState(db),
    summary: {
      analyzed: completed.length,
      pending: candidates.filter((candidate) => candidate.status === "queued" || candidate.status === "processing").length,
      insufficient: completed.filter((candidate) => candidate.decision?.label === "Insufficient information").length,
      conflicts: completed.filter((candidate) => candidate.decision?.conflicts.length).length,
    },
  };
}

export type PairwiseDatabase = DatabaseSync;
