import { describe, expect, it } from "vitest";
import { getIntegrationCapabilities } from "@/lib/integrations";
import { BumbleWebAdapter, ManualInputAdapter } from "@/lib/platform-adapter";
import { candidate } from "./fixtures";

describe("integration health declarations", () => {
  it("exposes the Bumble browser controller and local input adapters", () => {
    const capabilities = getIntegrationCapabilities({ connected: true, running: true, lastSeenAt: new Date().toISOString() });
    expect(capabilities.find((item) => item.id === "manual")?.canReceiveCandidates).toBe(true);
    const bumble = capabilities.find((item) => item.id === "bumble");
    expect(bumble?.status).toBe("available");
    expect(bumble?.canActOnPlatform).toBe(true);
    expect(bumble?.connected).toBe(true);
  });

  it("reports setup required until the extension sends a heartbeat", () => {
    const bumble = getIntegrationCapabilities().find((item) => item.id === "bumble");
    expect(bumble?.status).toBe("diagnostic-only");
    expect(bumble?.canReceiveCandidates).toBe(true);
    expect(bumble?.canActOnPlatform).toBe(true);
  });

  it("normalizes manual inputs through the platform-independent adapter", async () => {
    const adapter = new ManualInputAdapter();
    await expect(adapter.receiveAuthorizedCandidate(candidate())).resolves.toMatchObject({ displayName: "Test candidate" });
    await expect(adapter.health()).resolves.toMatchObject({ ok: true });
  });

  it("normalizes candidates through the Bumble Web adapter", async () => {
    const adapter = new BumbleWebAdapter();
    await expect(adapter.receiveAuthorizedCandidate(candidate({ source: "bumble" }))).resolves.toMatchObject({ source: "bumble" });
    await expect(adapter.health()).resolves.toMatchObject({ ok: true });
  });
});
