import { enqueueCandidate, getDatabase, listCandidates, processDueJobs } from "@/lib/db";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ candidates: listCandidates(getDatabase()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const result = enqueueCandidate(db, await request.json());
    if (!result.duplicate) processDueJobs(db, 1);
    const candidate = listCandidates(db).find((item) => item.id === result.candidate.id);
    return Response.json({ candidate, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
