const PAIRWISE_ORIGIN = "http://127.0.0.1:3000";
const BRIDGE_HEADER = "pairwise-local-extension-v1";
const ALLOWED_ENDPOINTS = new Set(["/api/bridge/heartbeat", "/api/bridge/evaluate"]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PAIRWISE_API" || !ALLOWED_ENDPOINTS.has(message.endpoint)) return false;

  fetch(`${PAIRWISE_ORIGIN}${message.endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pairwise-bridge": BRIDGE_HEADER,
    },
    body: JSON.stringify(message.body ?? {}),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Pairwise returned ${response.status}`);
      sendResponse({ ok: true, payload });
    })
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Pairwise is unavailable." }));

  return true;
});
