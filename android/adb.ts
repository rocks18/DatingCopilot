import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BUMBLE_PACKAGE = "com.bumble.app";

export interface AndroidDevice {
  serial: string;
  state: "device" | "unauthorized" | "offline" | string;
  model: string | null;
}

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAdbPath() {
  const candidates = [
    process.env.PAIRWISE_ADB_PATH,
    process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, "platform-tools", "adb") : null,
    path.join(process.cwd(), ".tools", "platform-tools", "adb"),
    "/opt/homebrew/bin/adb",
    "/usr/local/bin/adb",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  return "adb";
}

export class AdbController {
  constructor(private readonly binary: string) {}

  private async run(args: string[], timeout = 15_000) {
    const result = await execFileAsync(this.binary, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    return result.stdout.trim();
  }

  private withDevice(serial: string, args: string[]) {
    return ["-s", serial, ...args];
  }

  async devices(): Promise<AndroidDevice[]> {
    const output = await this.run(["devices", "-l"]);
    return output.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [serial, state] = line.split(/\s+/, 2);
      const model = line.match(/\bmodel:([^\s]+)/)?.[1]?.replace(/_/g, " ") ?? null;
      return { serial, state, model };
    });
  }

  async foregroundPackage(serial: string): Promise<string | null> {
    try {
      const windowOutput = await this.run(this.withDevice(serial, ["shell", "dumpsys", "window"]), 4_000);
      const match = windowOutput.match(/mCurrentFocus=.*?\s(?:u\d+\s+)?([\w.]+)\//)
        ?? windowOutput.match(/mFocusedApp=.*?\s(?:u\d+\s+)?([\w.]+)\//);
      if (match?.[1]) return match[1];
    } catch {
      // fallback
    }
    try {
      const activityOutput = await this.run(this.withDevice(serial, ["shell", "dumpsys", "activity", "activities"]), 4_000);
      const match = activityOutput.match(/(?:mResumedActivity|topResumedActivity)=.*?\s(?:u\d+\s+)?([\w.]+)\//);
      if (match?.[1]) return match[1];
    } catch {
      // fallback
    }
    return null;
  }

  async launchBumble(serial: string) {
    await this.run(this.withDevice(serial, ["shell", "am", "start", "-n", "com.bumble.app/.ui.launcher.BumbleLauncherActivity"]));
  }

  async dumpUi(serial: string): Promise<string> {
    const tmpPath = `/data/local/tmp/pairwise-window-${Date.now()}.xml`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.run(this.withDevice(serial, ["shell", "uiautomator", "dump", tmpPath]), 15_000);
        const xml = await this.run(this.withDevice(serial, ["exec-out", "cat", tmpPath]), 15_000);
        this.run(this.withDevice(serial, ["shell", "rm", "-f", tmpPath])).catch(() => {});
        if (xml && xml.includes("<hierarchy")) return xml;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error("uiautomator dump returned empty or invalid hierarchy");
  }

  async screenSize(serial: string) {
    const output = await this.run(this.withDevice(serial, ["shell", "wm", "size"]));
    const matches = [...output.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g)];
    const match = matches.at(-1);
    if (!match) throw new Error("Could not read the Android screen size.");
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  async tap(serial: string, x: number, y: number) {
    await this.run(this.withDevice(serial, ["shell", "input", "tap", String(x), String(y)]));
  }

  async swipe(serial: string, gesture: { startX: number; startY: number; endX: number; endY: number; durationMs: number }) {
    await this.run(this.withDevice(serial, [
      "shell", "input", "swipe",
      String(gesture.startX), String(gesture.startY), String(gesture.endX), String(gesture.endY), String(gesture.durationMs),
    ]));
  }

  async screenshot(serial: string): Promise<Buffer> {
    const { stdout } = await execFileAsync(this.binary, this.withDevice(serial, ["exec-out", "screencap", "-p"]), {
      encoding: "buffer",
      maxBuffer: 25 * 1024 * 1024,
      timeout: 10_000,
    });
    return stdout as Buffer;
  }

  async connectWifi(target: string): Promise<string> {
    const hostPort = target.includes(":") ? target : `${target}:5555`;
    return this.run(["connect", hostPort]);
  }

  async disconnectWifi(target: string): Promise<string> {
    const hostPort = target.includes(":") ? target : `${target}:5555`;
    return this.run(["disconnect", hostPort]);
  }

  async tcpip(serial: string, port = 5555): Promise<string> {
    return this.run(this.withDevice(serial, ["tcpip", String(port)]));
  }

  async getWifiIp(serial: string): Promise<string | null> {
    try {
      const output = await this.run(this.withDevice(serial, ["shell", "ip", "-f", "inet", "addr", "show", "wlan0"]));
      const match = output.match(/inet\s+(\d+\.\d+\.\d+\.\d+)\//);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }
}

export { BUMBLE_PACKAGE };
