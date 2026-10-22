import { getIntegrationCapabilities } from "@/lib/integrations";
import { getAndroidAgentState, getBrowserBridgeState, getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  const bridge = getBrowserBridgeState(db);
  const android = getAndroidAgentState(db);
  return Response.json({
    integrations: getIntegrationCapabilities(bridge, android),
    bridge,
    android,
  });
}
