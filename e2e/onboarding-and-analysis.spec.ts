import { expect, test } from "@playwright/test";

test("completes onboarding and analyzes the local demo", async ({ page, request }) => {
  await request.post("/api/reset").catch(() => undefined);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Describe what matters" })).toBeVisible();
  await page.getByLabel("In your own words").fill(
    "I want a serious relationship with someone age 26 to 38 within 50 km who enjoys travel, communicates clearly, values kindness, and is a non-smoker.",
  );
  await page.getByRole("button", { name: /Interpret my preferences/ }).click();
  await expect(page.getByRole("heading", { name: "Review the interpretation" })).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await expect(page.getByRole("heading", { name: "Choose your decision style" })).toBeVisible();
  await page.getByRole("button", { name: /Balanced/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator("#privacy-confirm").check();
  await page.getByRole("button", { name: /Save & open Pairwise/ }).click();
  await expect(page.getByRole("heading", { name: /Set the brief/ })).toBeVisible();
  await page.getByRole("button", { name: "Profile analysis" }).click();
  await page.getByRole("button", { name: /Run local demo/ }).click();
  await expect(page.getByRole("heading", { name: "Avery · demo profile" })).toBeVisible();
  await expect(page.getByText(/ASSISTANT ASSESSMENT/)).toBeVisible();
});
