import { expect, test, type Page, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body)
  });
}

async function fillValidMobileOrder(page: Page) {
  await page.getByTestId("mobile-sales-new").click();
  await page.getByTestId("mobile-sales-partner-lookup").click();
  await page.getByTestId("mobile-sales-partner-dialog-search-input").fill("P-10021");
  await page.getByTestId("mobile-sales-partner-dialog-search-button").click();
  await page.getByTestId("mobile-sales-partner-dialog-grid-row-1000::P-10021").click();
  await page.getByTestId("mobile-sales-partner-dialog-confirm").click();
  await page.getByTestId("mobile-sales-add-line").click();
  await page.getByTestId("mobile-sales-item-dialog-search-input").fill("ITM-1001");
  await page.getByTestId("mobile-sales-item-dialog-search-button").click();
  await page.getByTestId("mobile-sales-item-dialog-grid-row-1000::ITM-1001").click();
  await page.getByTestId("mobile-sales-item-dialog-confirm").click();
  await page.getByTestId("mobile-sales-line-quantity-1").fill("2");
  await page.getByTestId("mobile-sales-line-price-1").fill("1000");
}

test("saving navigation stays on the active mobile form and has one non-destructive notice", async ({ page }) => {
  let releaseSave!: () => void;
  let signalSaveStarted!: () => void;
  const saveStarted = new Promise<void>((resolve) => { signalSaveStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseSave = resolve; });

  await page.route("**/api/sales-orders**", async (route) => {
    if (route.request().method() === "GET") return fulfillJson(route, 200, []);
    if (route.request().method() !== "POST") return fulfillJson(route, 500, { error: "unexpected request" });
    signalSaveStarted();
    await release;
    return fulfillJson(route, 201, route.request().postDataJSON());
  });

  try {
    await page.goto("/mobile/sales-orders");
    await fillValidMobileOrder(page);
    await page.getByTestId("mobile-sales-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await saveStarted;

    await page.getByTestId("mobile-sales-nav-pda").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(1);
    await expect(page.getByTestId("confirm-dialog-cancel")).toHaveCount(0);
    await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("mobile-sales-page")).toBeVisible();

    releaseSave();
    await expect(page.getByRole("dialog", { name: "저장 완료" })).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("mobile-sales-dirty-indicator")).toHaveCount(0);
    await page.getByTestId("mobile-sales-nav-pda").click();
    await expect(page.getByTestId("pda-sales-page")).toBeVisible();
  } finally {
    releaseSave();
    await page.unroute("**/api/sales-orders**");
  }
});
