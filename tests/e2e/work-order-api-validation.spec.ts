import { expect, test } from "@playwright/test";

test("API UI: work order menu, search, and validation", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toBeVisible();

  await page.getByTestId("wo-btn-search").click();
  await expect(page.getByTestId("work-order-header-grid-row-1000::WO2026070001")).toBeVisible();
  await page.getByTestId("wo-btn-new").click();
  await page.getByTestId("wo-btn-save").click();
  await expect(page.getByTestId("work-order-dialog-validation-summary")).toBeVisible();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await page.getByTestId("work-order-dialog-validation-close").click();
});
