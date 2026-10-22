import { getDatabase, recordUserDecision } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const userDecisionSchema = z.object({
  decision: z.enum(["interested", "maybe", "pass"]),
  note: z.string().trim().max(1000).default(""),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { decision, note } = userDecisionSchema.parse(await request.json());
    return Response.json({ candidate: recordUserDecision(getDatabase(), Number(id), decision, note) });
  } catch (error) {
    return apiError(error);
  }
}
