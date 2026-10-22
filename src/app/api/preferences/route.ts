import { getDatabase, savePreferences } from "@/lib/db";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    return Response.json({ preferences: savePreferences(getDatabase(), await request.json()) });
  } catch (error) {
    return apiError(error);
  }
}
