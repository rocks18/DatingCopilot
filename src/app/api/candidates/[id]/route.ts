import { deleteCandidate, getDatabase, processDueJobs, updateCandidate } from "@/lib/db";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = getDatabase();
    const candidate = updateCandidate(db, Number(id), await request.json());
    processDueJobs(db, 1);
    return Response.json({ candidate });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    deleteCandidate(getDatabase(), Number(id));
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
