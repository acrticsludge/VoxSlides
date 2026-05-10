import { test, expect } from "@playwright/test";

test.describe("VoxSlides", () => {
  test("page loads with editor visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("VoxSlides")).toBeVisible();
    await expect(page.getByTestId("textarea")).toBeVisible();
  });

  test("typing text updates compiled preview", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("textarea").fill("Hello world this is a test");
    await expect(page.locator('[data-testid="compiled-preview"]')).toContainText(
      "Speaker 1: Hello world"
    );
  });

  test("inserting a preset condition slot", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("textarea").fill("Hello world");
    await page.locator('[data-testid="add-slot-btn"]').click();
    await page.getByRole("button", { name: "⚡ Excited" }).first().click();
    await expect(page.locator('[data-testid="slot-chip"]')).toBeVisible();
  });

  test("removing a slot chip", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("textarea").fill("Test text");
    await page.locator('[data-testid="add-slot-btn"]').click();
    await page.getByRole("button", { name: "🌊 Calm" }).first().click();
    await page.locator('[data-testid="slot-chip-remove"]').first().click();
    await expect(page.locator('[data-testid="slot-chip"]')).toHaveCount(0);
  });

  test("generate button shows loading state", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("textarea").fill("Testing generation");
    await page.locator('[data-testid="generate-btn"]').click();
    await expect(page.locator('[data-testid="generate-btn"]')).toContainText(
      /Generating/i
    );
  });

  test("audio player appears after generation", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("textarea").fill("Hello VoxSlides");
    await page.locator('[data-testid="generate-btn"]').click();
    await expect(page.locator('[data-testid="audio-player"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("generation saved to history", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("textarea").fill("History test");
    await page.locator('[data-testid="generate-btn"]').click();
    await page
      .locator('[data-testid="audio-player"]')
      .waitFor({ timeout: 5000 });
    await page.locator('[data-testid="history-btn"]').click();
    await expect(page.locator('[data-testid="history-item"]')).toHaveCount(1);
  });
});
