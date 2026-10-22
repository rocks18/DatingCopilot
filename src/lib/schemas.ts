import { z } from "zod";

const cleanString = z.string().trim().max(500);
const shortList = z.array(cleanString.min(1)).max(40).default([]);

export const weightsSchema = z
  .object({
    relationshipIntentions: z.number().min(0).max(100),
    sharedInterests: z.number().min(0).max(100),
    lifestyle: z.number().min(0).max(100),
    communication: z.number().min(0).max(100),
    values: z.number().min(0).max(100),
  })
  .refine((weights) => Object.values(weights).reduce((sum, value) => sum + value, 0) === 100, {
    message: "Compatibility weights must total 100%.",
  });

export const preferencesSchema = z.object({
  narrative: z.string().trim().max(4000).default(""),
  ageRange: z
    .object({ min: z.number().int().min(18).max(99), max: z.number().int().min(18).max(99) })
    .refine(({ min, max }) => min <= max, { message: "Minimum age must not exceed maximum age." }),
  radiusKm: z.number().min(1).max(10000).nullable(),
  acceptableLocations: shortList,
  relationshipIntentions: shortList,
  interests: shortList,
  lifestyle: shortList,
  communication: shortList,
  values: shortList,
  flexible: shortList,
  nonNegotiables: shortList,
  exclusions: shortList,
  policy: z.enum(["strict", "balanced", "exploratory"]),
  weights: weightsSchema,
  confirmed: z.boolean(),
});

export const photoObservationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  brightness: z.number().min(0).max(1),
  contrast: z.number().min(0).max(1),
  sharpness: z.number().min(0).max(1),
  observations: z.array(z.string().max(200)).max(10),
});

export const candidateInputSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  age: z.number().int().min(18).max(99).nullable(),
  location: z.string().trim().max(200),
  distanceKm: z.number().min(0).max(10000).nullable(),
  relationshipIntentions: shortList,
  interests: shortList,
  lifestyle: shortList,
  communication: shortList,
  values: shortList,
  explicitConflicts: shortList,
  bio: z.string().trim().max(6000),
  prompts: z.array(z.string().trim().max(1000)).max(20),
  structuredPrompts: z.array(z.object({ question: z.string().trim(), answer: z.string().trim() })).optional().default([]),
  rawText: z.string().trim().optional(),
  photos: z.array(photoObservationSchema).max(12),
  source: z.enum(["manual", "simulation", "import", "bumble"]),
  profileUrl: z.string().nullable().optional().default(null),
  screenshots: z.array(z.string()).optional().default([]),
  profileImages: z.array(z.string()).optional().default([]),
  physicalDetails: z.record(z.string(), z.string()).optional().default({}),
});

export const parseRequestSchema = z.object({ narrative: z.string().trim().min(10).max(4000) });
