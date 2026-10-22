export type DecisionPolicy = "strict" | "balanced" | "exploratory";

export type DimensionKey =
  | "relationshipIntentions"
  | "sharedInterests"
  | "lifestyle"
  | "communication"
  | "values";

export type PreferenceWeights = Record<DimensionKey, number>;

export interface Preferences {
  narrative: string;
  ageRange: { min: number; max: number };
  radiusKm: number | null;
  acceptableLocations: string[];
  relationshipIntentions: string[];
  interests: string[];
  lifestyle: string[];
  communication: string[];
  values: string[];
  flexible: string[];
  nonNegotiables: string[];
  exclusions: string[];
  policy: DecisionPolicy;
  weights: PreferenceWeights;
  confirmed: boolean;
}

export interface PhotoObservation {
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  observations: string[];
}

export interface ProfilePrompt {
  question: string;
  answer: string;
}

export interface CandidateInput {
  displayName: string;
  age: number | null;
  location: string;
  distanceKm: number | null;
  relationshipIntentions: string[];
  interests: string[];
  lifestyle: string[];
  communication: string[];
  values: string[];
  explicitConflicts: string[];
  bio: string;
  prompts: string[];
  structuredPrompts?: ProfilePrompt[];
  rawText?: string;
  photos: PhotoObservation[];
  source: "manual" | "simulation" | "import" | "bumble";
  profileUrl?: string | null;
  screenshots?: string[];
  profileImages?: string[];
  physicalDetails?: Record<string, string>;
}

export interface EvidenceItem {
  field: string;
  value: string;
  basis: "explicit" | "text-derived" | "photo-metric";
  confidence: number;
}

export interface PictureRating {
  score: number;
  rating10: number;
  tier: "Elite Appeal" | "Very Attractive" | "High Charm" | "Above Average" | "Natural / Everyday";
  stars: number;
  metrics: {
    clarity: number;
    lighting: number;
    vibrance: number;
    composition: number;
  };
  highlights: string[];
  feedback: string;
}

export interface CandidateAnalysis {
  facts: EvidenceItem[];
  inferences: EvidenceItem[];
  unknowns: string[];
  photoSummary: {
    count: number;
    clarity: "unknown" | "needs-attention" | "good";
    lighting: "unknown" | "needs-attention" | "good";
    variety: "unknown" | "limited" | "good";
    observations: string[];
  };
  pictureRating?: PictureRating | null;
}

export type DecisionLabel =
  | "Strong potential match"
  | "Possible match"
  | "Insufficient information"
  | "Does not meet stated criteria";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  score: number | null;
  weight: number;
  evidence: string[];
  unknown: boolean;
}

export interface CompatibilityDecision {
  label: DecisionLabel;
  score: number | null;
  confidence: number;
  evidenceCoverage: number;
  dimensions: DimensionScore[];
  conflicts: string[];
  unknowns: string[];
  explanation: string[];
  engineVersion: string;
}

export interface CandidateRecord {
  id: number;
  status: "queued" | "processing" | "complete" | "failed";
  source: CandidateInput["source"];
  input: CandidateInput;
  analysis: CandidateAnalysis | null;
  decision: CompatibilityDecision | null;
  userDecision: "interested" | "maybe" | "pass" | null;
  userNote: string;
  userDecidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityRecord {
  id: number;
  kind: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  createdAt: string;
}

export interface RuntimeState {
  paused: boolean;
  workerStatus: "idle" | "processing" | "paused" | "error";
  lastSuccessfulProcessingAt: string | null;
  lastError: string | null;
  heartbeatAt: string | null;
}

export interface BrowserBridgeState {
  connected: boolean;
  running: boolean;
  lastSeenAt: string | null;
  tabUrl: string | null;
  processed: number;
  likes: number;
  passes: number;
  runLimit: number;
  lastCandidateId: number | null;
  lastAction: "like" | "pass" | null;
  lastError: string | null;
}

export interface AndroidAgentState {
  controllerAlive: boolean;
  requestedRunning: boolean;
  running: boolean;
  deviceConnected: boolean;
  deviceSerial: string | null;
  deviceModel: string | null;
  appForeground: boolean;
  processed: number;
  likes: number;
  passes: number;
  runLimit: number;
  lastSeenAt: string | null;
  lastProfileAt: string | null;
  lastCandidateId: number | null;
  lastAction: "like" | "pass" | null;
  lastError: string | null;
}

export interface PlatformActionRecord {
  id: number;
  transport: "bumble-android";
  profileSignature: string;
  candidateId: number;
  action: "like" | "pass";
  status: "planned" | "executing" | "confirmed" | "failed" | "uncertain";
  afterSignature: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
