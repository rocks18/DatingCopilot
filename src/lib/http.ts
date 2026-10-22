import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unexpected local application error" },
    { status: 500 },
  );
}
