export interface IntegrationCapability {
  id: string;
  name: string;
  status: "available" | "diagnostic-only" | "unavailable";
  canReceiveCandidates: boolean;
  canActOnPlatform: boolean;
  detail: string;
  recovery: string | null;
  connected?: boolean;
  lastSeenAt?: string | null;
}

export function getIntegrationCapabilities(
  bridge?: { connected: boolean; running: boolean; lastSeenAt: string | null },
  android?: { deviceConnected: boolean; running: boolean; deviceModel: string | null; deviceSerial: string | null; lastSeenAt: string | null },
): IntegrationCapability[] {
  return [
    {
      id: "manual",
      name: "Manual profile input",
      status: "available",
      canReceiveCandidates: true,
      canActOnPlatform: false,
      detail: "User-supplied profile details and local photo metrics are supported.",
      recovery: null,
    },
    {
      id: "simulation",
      name: "Local simulation",
      status: "available",
      canReceiveCandidates: true,
      canActOnPlatform: false,
      detail: "Mock profiles exercise the full local analysis and decision pipeline.",
      recovery: null,
    },
    {
      id: "android",
      name: "Bumble Android Controller (USB)",
      status: android?.deviceConnected ? "available" : "diagnostic-only",
      canReceiveCandidates: true,
      canActOnPlatform: true,
      connected: android?.deviceConnected ?? false,
      lastSeenAt: android?.lastSeenAt ?? null,
      detail: android?.deviceConnected
        ? `Android device (${android.deviceModel || android.deviceSerial}) connected${android.running ? " and swiping" : " (ready to start)"}.`
        : "Connect your Android phone with USB debugging enabled to automate the Bumble app.",
      recovery: android?.deviceConnected ? null : "Enable USB debugging on your Android device and connect it via USB.",
    },
    {
      id: "bumble",
      name: "Bumble Web Controller",
      status: bridge?.connected ? "available" : "diagnostic-only",
      canReceiveCandidates: true,
      canActOnPlatform: true,
      connected: bridge?.connected ?? false,
      lastSeenAt: bridge?.lastSeenAt ?? null,
      detail: bridge?.connected
        ? `Browser extension connected${bridge.running ? " and actively running" : " and waiting to start"}.`
        : "The automation bridge is ready. Load the included Chrome extension, open Bumble Web, and press Start.",
      recovery: bridge?.connected ? null : "Extension folder: browser-extension. In Chrome, open chrome://extensions, enable Developer mode, then choose Load unpacked.",
    },
  ];
}
