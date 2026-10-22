import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BRIDGE_HEADER } from "./browser-bridge";

export function bridgeCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = origin.startsWith("chrome-extension://") ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, x-pairwise-bridge",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function assertBridgeRequest(request: Request) {
  if (request.headers.get("x-pairwise-bridge") !== BRIDGE_HEADER) {
    throw new Error("The request did not come from the Pairwise browser extension.");
  }
}

export function bridgeError(request: Request, error: unknown) {
  const validation = error instanceof ZodError;
  return NextResponse.json(
    {
      error: validation ? "Browser profile data could not be validated." : error instanceof Error ? error.message : "Browser bridge error.",
      ...(validation ? { details: error.issues } : {}),
    },
    { status: validation ? 400 : 500, headers: bridgeCorsHeaders(request) },
  );
}
