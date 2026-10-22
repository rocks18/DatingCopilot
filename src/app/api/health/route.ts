import { getBrowserBridgeState, getDatabase, getRuntimeState } from "@/lib/db";
import { getIntegrationCapabilities } from "@/lib/integrations";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDatabase();
    db.prepare("SELECT 1 AS ok").get();
    return Response.json({
      ok: true,
      storage: "local-sqlite",
      runtime: getRuntimeState(db),
      integrations: getIntegrationCapabilities(getBrowserBridgeState(db)),
    });
  } catch (error) {
    return apiError(error);
  }
}
