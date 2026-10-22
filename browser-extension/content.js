const DEFAULT_STATE = {
  running: false,
  phase: "Ready",
  processed: 0,
  likes: 0,
  passes: 0,
  runLimit: 50,
  lastDecision: null,
  error: null,
};

let state = { ...DEFAULT_STATE };
let loopVersion = 0;
let lastSignature = "";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function cleanLines(text) {
  return [...new Set(text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 1))];
}

function findNameAndAge(lines) {
  const headings = [...document.querySelectorAll("h1, h2, [role='heading']")]
    .filter(isVisible)
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);
  for (const value of [...headings, ...lines.slice(0, 30)]) {
    const combined = value.match(/^(.{1,70}?)(?:,|·|\s)\s*(\d{2})$/);
    if (combined && Number(combined[2]) >= 18 && Number(combined[2]) <= 99) {
      return { displayName: combined[1].trim(), age: Number(combined[2]) };
    }
  }
  const heading = headings.find((value) => value.length <= 70 && !/bumble|people|match|chat/i.test(value));
  const ageLine = lines.find((value) => /^(?:age\s*)?(?:1[89]|[2-9]\d)$/i.test(value));
  return {
    displayName: heading || "Bumble profile",
    age: ageLine ? Number(ageLine.replace(/\D/g, "")) : null,
  };
}

function extractProfile() {
  const root = document.querySelector("main") ?? document.body;
  const lines = cleanLines(root.innerText || document.body.innerText || "");
  const rawText = lines.join("\n").slice(0, 12000);
  if (rawText.length < 10) throw new Error("No visible Bumble profile was found.");
  const { displayName, age } = findNameAndAge(lines);
  const locationLine = lines.find((line) => /^(?:lives in|located in|from)\s+/i.test(line));
  const distanceLine = lines.find((line) => /\d+(?:\.\d+)?\s*(?:km|kilomet)/i.test(line));
  const distanceMatch = distanceLine?.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet)/i);
  const prompts = lines.filter((line) => line.length >= 18 && line.length <= 500 && /\?|my |i |we |you /i.test(line)).slice(0, 12);
  return {
    displayName,
    age,
    location: locationLine?.replace(/^(?:lives in|located in|from)\s+/i, "") ?? "",
    distanceKm: distanceMatch ? Number(distanceMatch[1]) : null,
    rawText,
    prompts,
  };
}

function signature(profile) {
  let hash = 2166136261;
  const value = `${profile.displayName}|${profile.age}|${profile.rawText.slice(0, 2500)}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function buttonLabel(element) {
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-qa-role"),
    element.getAttribute("data-testid"),
    element.textContent,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

function findActionButton(action) {
  const elements = [...document.querySelectorAll("button, [role='button']")].filter(isVisible);
  const matches = elements.filter((element) => {
    const label = buttonLabel(element);
    if (action === "like") return /(^|\b)(like|yes|swipe right)(\b|$)/i.test(label) && !/super|undo|liked you/i.test(label);
    return /(^|\b)(pass|nope|swipe left|not interested)(\b|$)/i.test(label) && !/passport/i.test(label);
  });
  return matches.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] ?? null;
}

async function api(endpoint, body) {
  const response = await chrome.runtime.sendMessage({ type: "PAIRWISE_API", endpoint, body });
  if (!response?.ok) throw new Error(response?.error || "Pairwise is not running on port 3000.");
  return response.payload;
}

async function persist(patch) {
  state = { ...state, ...patch };
  await chrome.storage.local.set({ pairwiseState: state });
}

async function heartbeat() {
  try {
    return await api("/api/bridge/heartbeat", {
      running: state.running,
      tabUrl: location.href,
      processed: state.processed,
      likes: state.likes,
      passes: state.passes,
      runLimit: state.runLimit,
      error: state.error,
    });
  } catch (error) {
    if (state.running) await persist({ phase: "Pairwise offline", error: error.message });
    throw error;
  }
}

async function waitForNewProfile(previous, version) {
  for (let attempt = 0; attempt < 40 && state.running && version === loopVersion; attempt += 1) {
    await delay(250);
    try {
      const next = extractProfile();
      if (signature(next) !== previous) return true;
    } catch {
      // The card can briefly disappear between swipes.
    }
  }
  return false;
}

async function runLoop(version) {
  while (state.running && version === loopVersion) {
    if (state.processed >= state.runLimit) {
      await persist({ running: false, phase: "Run limit reached" });
      await heartbeat().catch(() => undefined);
      return;
    }

    try {
      const health = await heartbeat();
      if (health.paused) {
        await persist({ running: false, phase: "Paused from Pairwise" });
        return;
      }

      const profile = extractProfile();
      const currentSignature = signature(profile);
      if (currentSignature === lastSignature) {
        await persist({ phase: "Waiting for next profile" });
        await delay(750);
        continue;
      }

      await persist({ phase: `Evaluating ${profile.displayName}`, error: null });
      const result = await api("/api/bridge/evaluate", profile);
      const action = result.action;
      await persist({
        phase: `${result.label} · ${action === "like" ? "Like" : "Pass"}`,
        lastDecision: result,
      });
      await delay(1200 + Math.floor(Math.random() * 1200));

      const button = findActionButton(action);
      if (!button) throw new Error(`Could not find the visible ${action === "like" ? "Like" : "Pass"} button on this page.`);
      button.click();
      lastSignature = currentSignature;
      await persist({
        processed: state.processed + 1,
        likes: state.likes + (action === "like" ? 1 : 0),
        passes: state.passes + (action === "pass" ? 1 : 0),
        phase: `${action === "like" ? "Liked" : "Passed"} ${profile.displayName}`,
      });
      await heartbeat();
      const advanced = await waitForNewProfile(currentSignature, version);
      if (!advanced) throw new Error("Bumble did not advance to a new profile after the action.");
      await delay(900 + Math.floor(Math.random() * 900));
    } catch (error) {
      await persist({ running: false, phase: "Needs attention", error: error instanceof Error ? error.message : "Automation stopped." });
      await heartbeat().catch(() => undefined);
      return;
    }
  }
}

async function start(runLimit) {
  loopVersion += 1;
  lastSignature = "";
  await persist({ ...DEFAULT_STATE, running: true, runLimit: Math.min(250, Math.max(1, runLimit || 50)), phase: "Connecting" });
  void runLoop(loopVersion);
}

async function pause() {
  loopVersion += 1;
  await persist({ running: false, phase: "Paused" });
  await heartbeat().catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PAIRWISE_GET_STATE") {
    sendResponse(state);
    return false;
  }
  if (message?.type === "PAIRWISE_START") {
    start(message.runLimit).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "PAIRWISE_PAUSE") {
    pause().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.storage.local.get("pairwiseState").then(({ pairwiseState }) => {
  state = { ...DEFAULT_STATE, ...(pairwiseState ?? {}), running: false, phase: "Ready" };
  return chrome.storage.local.set({ pairwiseState: state });
}).then(() => heartbeat()).catch(() => undefined);

setInterval(() => heartbeat().catch(() => undefined), 5000);
