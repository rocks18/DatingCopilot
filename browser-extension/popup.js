const phase = document.querySelector("#phase");
const error = document.querySelector("#error");
const processed = document.querySelector("#processed");
const likes = document.querySelector("#likes");
const passes = document.querySelector("#passes");
const limit = document.querySelector("#limit");
const toggle = document.querySelector("#toggle");
const dot = document.querySelector("#dot");
let tabId = null;
let current = null;

function render(state) {
  current = state;
  phase.textContent = state?.phase || "Ready";
  error.textContent = state?.error || "";
  processed.textContent = state?.processed ?? 0;
  likes.textContent = state?.likes ?? 0;
  passes.textContent = state?.passes ?? 0;
  limit.value = state?.runLimit ?? 50;
  toggle.textContent = state?.running ? "Pause agent" : "Start agent";
  toggle.classList.toggle("pause", Boolean(state?.running));
  dot.classList.toggle("live", Boolean(state?.running));
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  if (!tabId || !/https:\/\/([^.]+\.)?bumble\.com\//i.test(tab.url || "")) {
    render({ ...current, running: false, phase: "Open Bumble Web first", error: "This control works on an active bumble.com tab." });
    toggle.disabled = true;
    return;
  }
  try {
    render(await chrome.tabs.sendMessage(tabId, { type: "PAIRWISE_GET_STATE" }));
  } catch {
    render({ running: false, phase: "Reload the Bumble tab", error: "The Pairwise content script is not active on this page." });
    toggle.disabled = true;
  }
}

toggle.addEventListener("click", async () => {
  if (!tabId) return;
  toggle.disabled = true;
  const message = current?.running
    ? { type: "PAIRWISE_PAUSE" }
    : { type: "PAIRWISE_START", runLimit: Number(limit.value) || 50 };
  await chrome.tabs.sendMessage(tabId, message);
  toggle.disabled = false;
  await load();
});

void load();
