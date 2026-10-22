import { apiError } from "@/lib/http";
import { parsePreferenceNarrative } from "@/lib/preference-parser";
import { parseRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const { narrative } = parseRequestSchema.parse(await request.json());
    return Response.json({ preferences: parsePreferenceNarrative(narrative) });
  } catch (error) {
    return apiError(error);
  }
}
