import { getDatabase, processDueJobs, setPaused } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const runtimeRequest = z.object({ paused: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const db = getDatabase();
    const { paused } = runtimeRequest.parse(await request.json());
    const state = setPaused(db, paused);
    if (!paused) processDueJobs(db);
    return Response.json({ runtime: state });
  } catch (error) {
    return apiError(error);
  }
}
