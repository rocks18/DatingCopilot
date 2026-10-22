import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    channel: "chrome",
  },
  webServer: {
    command: "npm run dev:web",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { ...process.env, PAIRWISE_DB_PATH: ".data/pairwise-e2e.sqlite" },
  },
});
