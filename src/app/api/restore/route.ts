import { getDatabase, importData, processDueJobs } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const result = importData(db, await request.json());
    processDueJobs(db);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
