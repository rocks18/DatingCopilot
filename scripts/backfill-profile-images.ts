import { getDatabase, closeDatabase, getPreferences } from "../src/lib/db";
import { analyzeCandidate } from "../src/lib/analyzer";
import { scoreCandidate } from "../src/lib/scoring";
import { extractPhotosFromScreenshots } from "../src/lib/photo-extractor";
import type { CandidateInput } from "../src/lib/types";

async function runBackfill() {
  const db = getDatabase();
  const preferences = getPreferences(db);
  const rows = db.prepare("SELECT id, input_json, analysis_json, decision_json FROM candidates ORDER BY id DESC").all() as Array<{
    id: number;
    input_json: string;
    analysis_json: string | null;
    decision_json: string | null;
  }>;

  console.log(`[Backfill Photos] Found ${rows.length} candidates in database.`);
  let totalPhotosExtracted = 0;
  let candidatesUpdated = 0;

  const updateStmt = db.prepare(
    "UPDATE candidates SET input_json = ?, analysis_json = ?, decision_json = ? WHERE id = ?"
  );

  for (const row of rows) {
    try {
      const input: CandidateInput = JSON.parse(row.input_json);
      if (!input.screenshots || input.screenshots.length === 0) {
        continue;
      }

      // Check if candidate already has profileImages extracted
      if (input.profileImages && input.profileImages.length > 0) {
        continue;
      }

      const sanitizedName = (input.displayName || "candidate").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 16);
      const filePrefix = `${sanitizedName}_${row.id}`;

      const { photoUrls, photoObservations } = await extractPhotosFromScreenshots(input.screenshots, filePrefix);

      if (photoUrls.length > 0) {
        input.profileImages = photoUrls;
        input.photos = photoObservations;
        totalPhotosExtracted += photoUrls.length;
        candidatesUpdated++;

        const analysis = analyzeCandidate(input);
        const decision = preferences ? scoreCandidate(preferences, input, analysis) : null;

        updateStmt.run(
          JSON.stringify(input),
          JSON.stringify(analysis),
          decision ? JSON.stringify(decision) : row.decision_json,
          row.id
        );

        console.log(`[Backfill Photos] Candidate #${row.id} (${input.displayName}): Extracted ${photoUrls.length} photos`);
      }
    } catch (err) {
      console.warn(`[Backfill Photos] Error processing candidate #${row.id}:`, err);
    }
  }

  console.log(`[Backfill Photos] Successfully completed! Updated ${candidatesUpdated} candidates with ${totalPhotosExtracted} clean extracted photos.`);
  closeDatabase();
}

runBackfill().catch((err) => {
  console.error("[Backfill Photos] Fatal backfill error:", err);
  process.exit(1);
});
