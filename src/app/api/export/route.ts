import { exportData, getDatabase } from "@/lib/db";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new Response(JSON.stringify(exportData(getDatabase()), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="pairwise-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
