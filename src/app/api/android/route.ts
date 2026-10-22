import { commandAndroidAgent, getAndroidAgentState, getDatabase } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { AdbController, resolveAdbPath } from "../../../../android/adb";

const androidCommandSchema = z.object({
  command: z.enum(["start", "pause", "launch", "connect_wifi", "disconnect_wifi", "refresh_devices"]),
  runLimit: z.number().int().min(0).max(10000).optional().default(0),
  ip: z.string().trim().optional(),
});

export async function GET() {
  try {
    const db = getDatabase();
    let devices: Array<{ serial: string; state: string; model: string | null; type: "emulator" | "wifi" | "usb" }> = [];
    try {
      const binary = await resolveAdbPath();
      const adb = new AdbController(binary);
      const rawDevices = await adb.devices();
      devices = rawDevices.map((d) => ({
        ...d,
        type: d.serial.startsWith("emulator-") ? "emulator" : d.serial.includes(":") ? "wifi" : "usb",
      }));
    } catch {
      // ADB might not be available or running
    }
    return Response.json({ android: getAndroidAgentState(db), devices });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const { command, runLimit, ip } = androidCommandSchema.parse(await request.json());
    const binary = await resolveAdbPath().catch(() => null);
    const adb = binary ? new AdbController(binary) : null;

    if (command === "launch") {
      if (adb) {
        const devices = await adb.devices();
        const dev = devices.find((d) => d.state === "device" && d.serial.startsWith("emulator-")) || devices.find((d) => d.state === "device");
        if (dev) await adb.launchBumble(dev.serial);
      }
      return Response.json({ android: getAndroidAgentState(db) });
    }

    if (command === "connect_wifi" && adb) {
      const target = ip || "192.168.0.2:5555";
      await adb.connectWifi(target);
      const rawDevices = await adb.devices();
      const devices = rawDevices.map((d) => ({
        ...d,
        type: d.serial.startsWith("emulator-") ? "emulator" : d.serial.includes(":") ? "wifi" : "usb",
      }));
      return Response.json({ android: getAndroidAgentState(db), devices });
    }

    if (command === "disconnect_wifi" && adb) {
      const target = ip || "192.168.0.2:5555";
      await adb.disconnectWifi(target);
      const rawDevices = await adb.devices();
      const devices = rawDevices.map((d) => ({
        ...d,
        type: d.serial.startsWith("emulator-") ? "emulator" : d.serial.includes(":") ? "wifi" : "usb",
      }));
      return Response.json({ android: getAndroidAgentState(db), devices });
    }

    if (command === "refresh_devices" && adb) {
      const rawDevices = await adb.devices();
      const devices = rawDevices.map((d) => ({
        ...d,
        type: d.serial.startsWith("emulator-") ? "emulator" : d.serial.includes(":") ? "wifi" : "usb",
      }));
      return Response.json({ android: getAndroidAgentState(db), devices });
    }

    const state = commandAndroidAgent(db, command as "start" | "pause", runLimit);
    return Response.json({ android: state });
  } catch (error) {
    return apiError(error);
  }
}
