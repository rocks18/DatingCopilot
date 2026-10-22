import { evaluateBrowserCandidate } from "@/lib/browser-bridge";
import { assertBridgeRequest, bridgeCorsHeaders, bridgeError } from "@/lib/bridge-http";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: bridgeCorsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    assertBridgeRequest(request);
    const result = evaluateBrowserCandidate(getDatabase(), await request.json());
    return Response.json(result, { headers: bridgeCorsHeaders(request) });
  } catch (error) {
    return bridgeError(request, error);
  }
}
