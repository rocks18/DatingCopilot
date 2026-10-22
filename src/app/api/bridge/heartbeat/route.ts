import { z } from "zod";
import { assertBridgeRequest, bridgeCorsHeaders, bridgeError } from "@/lib/bridge-http";
import { getDatabase, getRuntimeState, updateBrowserBridge } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const heartbeatSchema = z.object({
  running: z.boolean(),
  tabUrl: z.string().max(500).nullable().optional(),
  processed: z.number().int().min(0).max(10000).optional(),
  likes: z.number().int().min(0).max(10000).optional(),
  passes: z.number().int().min(0).max(10000).optional(),
  runLimit: z.number().int().min(1).max(1000).optional(),
  error: z.string().max(500).nullable().optional(),
});

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: bridgeCorsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    assertBridgeRequest(request);
    const db = getDatabase();
    const bridge = updateBrowserBridge(db, heartbeatSchema.parse(await request.json()));
    return Response.json(
      { bridge, paused: getRuntimeState(db).paused },
      { headers: bridgeCorsHeaders(request) },
    );
  } catch (error) {
    return bridgeError(request, error);
  }
}
