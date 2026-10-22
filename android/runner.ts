import {
  closeDatabase,
  confirmPlatformAction,
  failPlatformAction,
  getAndroidAgentState,
  getDatabase,
  getPendingPlatformAction,
  getRuntimeState,
  markPlatformActionExecuting,
  planPlatformAction,
  stopAndroidAgentWithError,
  updateAndroidHeartbeat,
} from "../src/lib/db";
import { evaluateBumbleProfile } from "../src/lib/browser-bridge";
import {
  createAndroidScroll,
  createAndroidSwipe,
  detectAndroidBlockingState,
  extractAndroidProfile,
  extractPhysicalDetails,
  findAndroidActionTarget,
  findAndroidContinueTarget,
  findAndroidExpandTarget,
  isEndOfProfileCard,
  mergeAndroidProfiles,
} from "../src/lib/android-ui";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AdbController, BUMBLE_PACKAGE, resolveAdbPath } from "./adb";
import { extractPhotosFromScreenshots } from "../src/lib/photo-extractor";

const db = getDatabase();
let adb: AdbController | null = null;
let active = false;
let lastSignature = "";
let consecutiveIdleTicks = 0;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initAdb() {
  const binary = await resolveAdbPath();
  adb = new AdbController(binary);
  console.log(`[Android Runner] ADB initialized with binary: ${binary}`);
  try {
    const devices = await adb.devices();
    const emu = devices.find((d) => d.state === "device" && d.serial.startsWith("emulator-"));
    if (emu) {
      console.log(`[Android Runner] Native Android Emulator detected and locked: ${emu.serial} (${emu.model || "Pixel 5"})`);
    } else {
      console.log(`[Android Runner] Waiting for Android device or emulator...`);
    }
  } catch (err) {
    console.warn("[Android Runner] Setup notice:", err instanceof Error ? err.message : err);
  }
}

async function tick() {
  if (active || !adb) return;
  active = true;

  try {
    const devices = await adb.devices();
    const emulatorDevice = devices.find((d) => d.state === "device" && d.serial.startsWith("emulator-"));
    const authorizedDevice = emulatorDevice || devices.find((d) => d.state === "device");

    if (!authorizedDevice) {
      updateAndroidHeartbeat(db, {
        deviceConnected: false,
        deviceSerial: null,
        deviceModel: null,
        appForeground: false,
        error: devices.length > 0 ? `Device state: ${devices[0].state}. Ensure USB/Wi-Fi debugging is accepted.` : "No Android device connected.",
      });
      return;
    }

    const serial = authorizedDevice.serial;
    const model = authorizedDevice.model;
    const foreground = await adb.foregroundPackage(serial);
    const isBumbleForeground = foreground === BUMBLE_PACKAGE;

    updateAndroidHeartbeat(db, {
      deviceConnected: true,
      deviceSerial: serial,
      deviceModel: model,
      appForeground: isBumbleForeground,
      error: null,
    });

    const state = getAndroidAgentState(db);
    const runtime = getRuntimeState(db);

    if (runtime.paused) {
      return;
    }

    if (!state.requestedRunning) {
      return;
    }

    // Agent is requested to run
    if (!isBumbleForeground) {
      consecutiveIdleTicks += 1;
      if (consecutiveIdleTicks % 8 === 1) {
        console.log(`[Android Runner] Bumble not in foreground (${foreground ?? "none"}). Waiting for Bumble to be active on phone...`);
      }
      return;
    }

    // Check if run limit is reached (0 means unlimited / continuous)
    if (state.runLimit > 0 && state.processed >= state.runLimit) {
      console.log(`[Android Runner] Configured run limit (${state.runLimit}) reached.`);
      return;
    }

    // Recover any pending executing action
    const pendingAction = getPendingPlatformAction(db);
    if (pendingAction) {
      console.log(`[Android Runner] Recovering pending platform action #${pendingAction.id}`);
      failPlatformAction(db, pendingAction.id, "uncertain", "Recovered from prior interrupted run.");
    }

    // Dump current UI hierarchy
    let xml: string;
    try {
      xml = await adb.dumpUi(serial);
    } catch (dumpErr) {
      console.error("[Android Runner] Failed to dump UI:", dumpErr instanceof Error ? dumpErr.message : dumpErr);
      return;
    }

    // Check for blocking dialogs / states (out of likes, verification, sign-in)
    const blocking = detectAndroidBlockingState(xml);
    if (blocking) {
      console.warn(`[Android Runner] Blocking state detected: ${blocking}`);
      stopAndroidAgentWithError(db, blocking);
      return;
    }

    // Check for continue / dismissal buttons (e.g. "Keep swiping", "Not now", etc.)
    const continueTarget = findAndroidContinueTarget(xml);
    if (continueTarget) {
      console.log(`[Android Runner] Tapping continue/dismiss target at (${continueTarget.x}, ${continueTarget.y})`);
      await adb.tap(serial, continueTarget.x, continueTarget.y);
      await delay(1200);
      return;
    }

    // Check for "See more" / "Read more" to expand bio if truncated
    const expandTarget = findAndroidExpandTarget(xml);
    if (expandTarget) {
      console.log(`[Android Runner] Expanding profile details at (${expandTarget.x}, ${expandTarget.y})`);
      await adb.tap(serial, expandTarget.x, expandTarget.y);
      await delay(800);
      try {
        xml = await adb.dumpUi(serial);
      } catch {
        // use previous xml
      }
    }

    // Extract visible profile
    let profile = extractAndroidProfile(xml);
    if (!profile.ready) {
      consecutiveIdleTicks += 1;
      if (consecutiveIdleTicks % 10 === 0) {
        console.log("[Android Runner] Waiting for a Bumble profile card to become visible...");
      }
      return;
    }
    consecutiveIdleTicks = 0;

    // Check if profile signature is unchanged from last processed card
    if (profile.signature === lastSignature) {
      await delay(1000);
      return;
    }

    const screen = await adb.screenSize(serial);
    const SCREENSHOTS_DIR = path.join(process.cwd(), "public", "screenshots");
    await mkdir(SCREENSHOTS_DIR, { recursive: true });

    const screenshots: string[] = [];
    const timestamp = Date.now();
    const sanitizedName = (profile.displayName || "profile").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 20);

    // 1. Capture top hero view (Photos, Identity, Age, Badges)
    try {
      const topBuffer = await adb.screenshot(serial);
      const topFile = `${sanitizedName}_${timestamp}_01_top.png`;
      await writeFile(path.join(SCREENSHOTS_DIR, topFile), topBuffer);
      screenshots.push(`/screenshots/${topFile}`);
      console.log(`[Android Runner] [01/top] Captured hero view: /screenshots/${topFile}`);
    } catch (shotErr) {
      console.warn("[Android Runner] Failed to capture top screenshot:", shotErr instanceof Error ? shotErr.message : shotErr);
    }

    // 2. Dynamically scroll down to the very end of the profile card
    let downScrollCount = 0;
    const MAX_SCROLLS = 7;
    let reachedEnd = isEndOfProfileCard(profile.nodes, profile.rawText);

    if (reachedEnd) {
      console.log(`[Android Runner] Initial view already contains end-of-card footer.`);
    }

    let previousNodeCount = profile.nodes.length;
    let previousTextLength = profile.rawText.length;

    while (!reachedEnd && downScrollCount < MAX_SCROLLS) {
      downScrollCount++;
      console.log(`[Android Runner] Scrolling down on ${profile.displayName}'s card (step ${downScrollCount}/${MAX_SCROLLS})...`);
      try {
        await adb.swipe(serial, createAndroidScroll(screen, "down"));
        await delay(500); // Allow scrolling motion to come to a complete standstill

        let stepXml: string | null = null;
        try {
          stepXml = await adb.dumpUi(serial);
        } catch {
          // If rapid swipe caused uiautomator to momentarily fail, wait 400ms and try once more
          await delay(400);
          try {
            stepXml = await adb.dumpUi(serial);
          } catch {
            // Proceed with screenshot even if XML dump failed this step
          }
        }

        if (stepXml) {
          const stepProfile = extractAndroidProfile(stepXml);
          profile = mergeAndroidProfiles(profile, stepProfile);

          if (isEndOfProfileCard(stepProfile.nodes, stepProfile.rawText)) {
            console.log(`[Android Runner] 🏁 Reached bottom of ${profile.displayName}'s profile (footer indicators detected).`);
            reachedEnd = true;
          }
        }

        const stepBuffer = await adb.screenshot(serial);
        const stepNum = String(downScrollCount + 1).padStart(2, "0");
        const stepFile = `${sanitizedName}_${timestamp}_${stepNum}_scroll.png`;
        await writeFile(path.join(SCREENSHOTS_DIR, stepFile), stepBuffer);
        screenshots.push(`/screenshots/${stepFile}`);
        console.log(`[Android Runner] [${stepNum}] Captured scroll view: /screenshots/${stepFile} (Nodes: ${profile.nodes.length}, Text: ${profile.rawText.length} chars)`);

        if (reachedEnd) {
          break;
        }

        // Check if content stopped growing (scroll boundary stop)
        const textGrew = profile.rawText.length > previousTextLength + 8;
        const nodesGrew = profile.nodes.length > previousNodeCount + 2;
        if (!textGrew && !nodesGrew && downScrollCount >= 3) {
          console.log(`[Android Runner] 🏁 Reached end of scrollable content (hard boundary stop).`);
          reachedEnd = true;
          break;
        }

        previousTextLength = profile.rawText.length;
        previousNodeCount = profile.nodes.length;
      } catch (scrollErr) {
        console.warn(`[Android Runner] Scroll ${downScrollCount} issue:`, scrollErr instanceof Error ? scrollErr.message : scrollErr);
        if (downScrollCount >= 4) break;
      }
    }

    // Extract all physical, lifestyle, education, interests, and career attributes
    const physicalDetails = extractPhysicalDetails(profile.rawText, profile.nodes);

    console.log(`[Android Runner] Full profile: ${profile.displayName}, age ${profile.age ?? "?"}, loc: "${profile.location}"`);
    if (Object.keys(physicalDetails).length) {
      console.log(`[Android Runner] Physical & lifestyle details extracted: ${JSON.stringify(physicalDetails)}`);
    }
    if (profile.prompts.length) {
      console.log(`[Android Runner] Prompts & bio details (${profile.prompts.length}): ${profile.prompts.join(" | ")}`);
    }

    // High-resolution clean profile photos extraction across all captured screenshots
    let profileImages: string[] = [];
    let photos: any[] = [];
    try {
      const extracted = await extractPhotosFromScreenshots(screenshots, `${sanitizedName}_${timestamp}`);
      profileImages = extracted.photoUrls;
      photos = extracted.photoObservations;
      console.log(`[Android Runner] ✨ Extracted ${profileImages.length} clean profile photos across ${screenshots.length} screenshots for ${profile.displayName}`);
    } catch (photoErr) {
      console.warn("[Android Runner] Photo extraction note:", photoErr instanceof Error ? photoErr.message : photoErr);
    }

    // Return the card back to the top by scrolling up exactly downScrollCount times
    if (downScrollCount > 0) {
      try {
        console.log(`[Android Runner] Returning card to top (${downScrollCount} scrolls up)...`);
        for (let i = 0; i < downScrollCount; i++) {
          await adb.swipe(serial, createAndroidScroll(screen, "up"));
          await delay(280);
        }
        await delay(450); // Settle cleanly at the top
      } catch (upErr) {
        console.warn("[Android Runner] Issue while scrolling back up:", upErr);
      }
    }

    const profileUrl = `https://bumble.com/app#${encodeURIComponent(sanitizedName)}-${profile.signature.slice(0, 10)}`;

    // Evaluate against user preferences
    const decisionResult = evaluateBumbleProfile(db, {
      displayName: profile.displayName,
      age: profile.age,
      location: profile.location,
      distanceKm: profile.distanceKm,
      rawText: profile.rawText,
      bio: profile.cleanBio,
      prompts: profile.prompts,
      structuredPrompts: profile.structuredPrompts,
      profileUrl,
      screenshots,
      profileImages,
      photos,
      physicalDetails,
    });

    console.log(`[Android Runner] Decision for ${profile.displayName}: ${decisionResult.label} (Score: ${decisionResult.score ?? "N/A"}) -> ACTION: ${decisionResult.action.toUpperCase()}`);

    // Plan platform action
    const actionRecord = planPlatformAction(db, {
      profileSignature: profile.signature,
      candidateId: decisionResult.candidateId,
      action: decisionResult.action,
    });

    if (actionRecord.status === "confirmed") {
      lastSignature = profile.signature;
      await delay(1000);
      return;
    }

    if (actionRecord.status === "planned") {
      markPlatformActionExecuting(db, actionRecord.id);
    }

    // Natural human-like pause before acting
    await delay(1200 + Math.floor(Math.random() * 800));

    // Execute Like or Pass on the restored top view
    let currentXmlForAction = xml;
    try {
      currentXmlForAction = await adb.dumpUi(serial);
    } catch {
      // fallback to initial xml
    }
    const actionTarget = findAndroidActionTarget(currentXmlForAction, decisionResult.action);

    if (actionTarget) {
      console.log(`[Android Runner] Tapping ${decisionResult.action} button at (${actionTarget.x}, ${actionTarget.y})`);
      await adb.tap(serial, actionTarget.x, actionTarget.y);
    } else {
      const swipeGesture = createAndroidSwipe(decisionResult.action, screen);
      console.log(`[Android Runner] Swiping ${decisionResult.action} (${swipeGesture.startX},${swipeGesture.startY}) -> (${swipeGesture.endX},${swipeGesture.endY})`);
      await adb.swipe(serial, swipeGesture);
    }

    // Wait for card transition animation
    await delay(1600);

    // Re-dump UI to verify state and get afterSignature
    let afterSignature = "swiped";
    try {
      const postXml = await adb.dumpUi(serial);
      const postProfile = extractAndroidProfile(postXml);
      afterSignature = postProfile.ready ? postProfile.signature : "transitioned";
    } catch {
      // ignore
    }

    confirmPlatformAction(db, actionRecord.id, afterSignature);
    lastSignature = profile.signature;
    console.log(`[Android Runner] Confirmed ${decisionResult.action} on ${profile.displayName}.`);

    // Grace period before next profile
    await delay(1000);
  } catch (error) {
    console.error("[Android Runner] Error in tick:", error instanceof Error ? error.message : error);
    try {
      updateAndroidHeartbeat(db, {
        deviceConnected: false,
        error: error instanceof Error ? error.message : "Android controller tick error",
      });
    } catch {
      // ignore
    }
  } finally {
    active = false;
  }
}

async function main() {
  await initAdb();
  console.log("[Android Runner] Starting heartbeat loop (interval: 1500ms)...");

  let running = true;
  function shutdown() {
    console.log("[Android Runner] Shutting down...");
    running = false;
    closeDatabase();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try {
      await tick();
    } catch (err) {
      console.error("[Android Runner] Loop error:", err);
    }
    await delay(1500);
  }
}

main().catch((err) => {
  console.error("[Android Runner] Fatal startup error:", err);
  process.exit(1);
});
