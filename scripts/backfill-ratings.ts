import { getDatabase, closeDatabase } from "../src/lib/db";
import { analyzeCandidate } from "../src/lib/analyzer";
import type { CandidateInput } from "../src/lib/types";

function runBackfill() {
  const db = getDatabase();
  const rows = db.prepare("SELECT id, input_json, analysis_json FROM candidates").all() as Array<{
    id: number;
    input_json: string;
    analysis_json: string | null;
  }>;

  console.log(`Found ${rows.length} candidates to backfill with picture & attractiveness ratings...`);

  let updatedCount = 0;
  db.exec("BEGIN");
  try {
    const updateStmt = db.prepare("UPDATE candidates SET analysis_json = ? WHERE id = ?");
    for (const row of rows) {
      try {
        const input: CandidateInput = JSON.parse(row.input_json);
        const analysis = analyzeCandidate(input);
        updateStmt.run(JSON.stringify(analysis), row.id);
        updatedCount++;
      } catch (err) {
        console.warn(`Could not backfill candidate #${row.id}:`, err);
      }
    }
    db.prepare("INSERT INTO activity (kind, level, message, created_at) VALUES (?, ?, ?, ?)").run(
      "system",
      "info",
      `Backfilled attractiveness and picture ratings for ${updatedCount} existing profiles.`,
      new Date().toISOString(),
    );
    db.exec("COMMIT");
    console.log(`Successfully backfilled ${updatedCount} profiles!`);
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("Backfill transaction failed:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

runBackfill();
