import { getDatabase, closeDatabase, getPreferences } from "../src/lib/db";
import { analyzeCandidate } from "../src/lib/analyzer";
import { scoreCandidate } from "../src/lib/scoring";
import { extractBioAndPrompts } from "../src/lib/android-ui";
import type { CandidateInput } from "../src/lib/types";

function runBackfill() {
  const db = getDatabase();
  const preferences = getPreferences(db);
  const rows = db.prepare("SELECT id, input_json, analysis_json, decision_json FROM candidates").all() as Array<{
    id: number;
    input_json: string;
    analysis_json: string | null;
    decision_json: string | null;
  }>;

  console.log(`Found ${rows.length} candidates to backfill with clean bio and prompts...`);

  let updatedCount = 0;
  let bioFoundCount = 0;
  let promptsFoundCount = 0;

  db.exec("BEGIN");
  try {
    const updateStmt = db.prepare(
      "UPDATE candidates SET input_json = ?, analysis_json = ?, decision_json = ? WHERE id = ?"
    );

    for (const row of rows) {
      try {
        const input: CandidateInput = JSON.parse(row.input_json);
        const sourceText = input.rawText || input.bio || "";
        const extracted = extractBioAndPrompts(sourceText);

        // Keep rawText for audit & search
        if (!input.rawText) {
          input.rawText = sourceText;
        }

        // Set clean bio
        if (extracted.bio) {
          input.bio = extracted.bio;
          bioFoundCount++;
        } else if (input.bio && input.bio.length > 800) {
          input.bio = ""; // clear raw XML dump if no clean bio
        }

        // Set structured & clean prompts
        if (extracted.prompts.length > 0) {
          input.structuredPrompts = extracted.prompts;
          input.prompts = extracted.promptStrings;
          promptsFoundCount++;
        }

        const analysis = analyzeCandidate(input);
        const decision = preferences ? scoreCandidate(preferences, input, analysis) : null;

        updateStmt.run(
          JSON.stringify(input),
          JSON.stringify(analysis),
          decision ? JSON.stringify(decision) : row.decision_json,
          row.id
        );
        updatedCount++;
      } catch (err) {
        console.warn(`Could not process candidate #${row.id}:`, err);
      }
    }

    db.prepare("INSERT INTO activity (kind, level, message, created_at) VALUES (?, ?, ?, ?)").run(
      "system",
      "info",
      `Backfilled explicit bios (${bioFoundCount}) and prompts (${promptsFoundCount}) for ${updatedCount} profiles.`,
      new Date().toISOString()
    );

    db.exec("COMMIT");
    console.log(`Successfully updated ${updatedCount} candidates!`);
    console.log(`- Bios extracted: ${bioFoundCount}`);
    console.log(`- Prompts extracted: ${promptsFoundCount}`);
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("Backfill failed:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

runBackfill();
