import { getDatabase, getSnapshot, processDueJobs } from "@/lib/db";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDatabase();
    processDueJobs(db);
    return Response.json(getSnapshot(db));
  } catch (error) {
    return apiError(error);
  }
}
