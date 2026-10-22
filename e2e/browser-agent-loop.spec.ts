import path from "node:path";
import { expect, test } from "@playwright/test";

test("browser agent extracts a visible profile and executes the returned action", async ({ page }) => {
  await page.setContent(`
    <main>
      <h1>Maya, 31</h1>
      <p>Lives in Bengaluru</p>
      <p>12 km away</p>
      <p>Looking for a serious relationship. I love travel, cooking, kindness and clear communication.</p>
      <button aria-label="Pass">Pass</button>
      <button aria-label="Like" onclick="document.querySelector('main').innerHTML = '<h1>Leena, 30</h1><p>New profile</p>'">Like</button>
    </main>
  `);

  await page.evaluate(() => {
    type Listener = (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean;
    const browserWindow = window as typeof window & { __pairwiseListener?: Listener; chrome?: unknown };
    browserWindow.chrome = {
      storage: { local: { get: async () => ({}), set: async () => undefined } },
      runtime: {
        onMessage: { addListener: (listener: Listener) => { browserWindow.__pairwiseListener = listener; } },
        sendMessage: async (message: { endpoint?: string }) => {
          if (message.endpoint === "/api/bridge/evaluate") {
            return { ok: true, payload: { action: "like", label: "Strong potential match", score: 92, confidence: 0.8 } };
          }
          return { ok: true, payload: { paused: false } };
        },
      },
    };
  });

  await page.addScriptTag({ path: path.join(process.cwd(), "browser-extension", "content.js") });
  await page.evaluate(async () => {
    const browserWindow = window as typeof window & { __pairwiseListener?: (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean };
    await new Promise<void>((resolve) => {
      browserWindow.__pairwiseListener?.({ type: "PAIRWISE_START", runLimit: 1 }, null, () => resolve());
    });
  });

  await expect(page.getByRole("heading", { name: "Leena, 30" })).toBeVisible({ timeout: 10_000 });
});
