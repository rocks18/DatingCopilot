import { candidateInputSchema } from "./schemas";
import type { CandidateInput, CompatibilityDecision } from "./types";
import type { IntegrationCapability } from "./integrations";

export interface AdapterHealth {
  ok: boolean;
  checkedAt: string;
  message: string;
}

export interface DatingPlatformAdapter {
  readonly id: string;
  checkCapabilities(): Promise<IntegrationCapability>;
  receiveAuthorizedCandidate(input: unknown): Promise<CandidateInput>;
  recordRecommendation(candidateId: number, decision: CompatibilityDecision): Promise<void>;
  recordUserDecision(candidateId: number, decision: "interested" | "maybe" | "pass"): Promise<void>;
  health(): Promise<AdapterHealth>;
}

export class ManualInputAdapter implements DatingPlatformAdapter {
  readonly id = "manual";

  async checkCapabilities(): Promise<IntegrationCapability> {
    return {
      id: this.id,
      name: "Manual profile input",
      status: "available",
      canReceiveCandidates: true,
      canActOnPlatform: false,
      detail: "User-supplied profile details and local photo metrics are supported.",
      recovery: null,
    };
  }

  async receiveAuthorizedCandidate(input: unknown) {
    return candidateInputSchema.parse(input);
  }

  async recordRecommendation(_candidateId: number, _decision: CompatibilityDecision) {
    void _candidateId;
    void _decision;
    // The local journal owns persistence; this adapter performs no platform action.
  }

  async recordUserDecision(_candidateId: number, _decision: "interested" | "maybe" | "pass") {
    void _candidateId;
    void _decision;
    // The local journal owns persistence; this adapter performs no platform action.
  }

  async health(): Promise<AdapterHealth> {
    return { ok: true, checkedAt: new Date().toISOString(), message: "Manual input is available." };
  }
}

export class BumbleWebAdapter implements DatingPlatformAdapter {
  readonly id = "bumble";

  async checkCapabilities(): Promise<IntegrationCapability> {
    return {
      id: this.id,
      name: "Bumble Web Controller",
      status: "available",
      canReceiveCandidates: true,
      canActOnPlatform: true,
      detail: "The local Chrome extension sends visible profile data to Pairwise and executes returned Like or Pass actions.",
      recovery: "Load the browser-extension folder as an unpacked Chrome extension and keep Pairwise running locally.",
    };
  }

  async receiveAuthorizedCandidate(_input: unknown): Promise<CandidateInput> {
    return candidateInputSchema.parse(_input);
  }

  async recordRecommendation(_candidateId: number, _decision: CompatibilityDecision) {
    void _candidateId;
    void _decision;
    // The browser bridge records this in the journal before returning the action.
  }

  async recordUserDecision(_candidateId: number, _decision: "interested" | "maybe" | "pass") {
    void _candidateId;
    void _decision;
    // The content script owns the final page click after the server returns an action.
  }

  async health(): Promise<AdapterHealth> {
    return { ok: true, checkedAt: new Date().toISOString(), message: "Bumble Web controller is installed in the local application." };
  }
}
