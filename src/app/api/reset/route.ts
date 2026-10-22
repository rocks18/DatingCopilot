import { getDatabase, resetData } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function POST() {
  try {
    resetData(getDatabase());
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
