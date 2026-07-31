import { expect, test, type Page } from "@playwright/test";

const salesLineKey = "1000::SO2026070001::1";
const purchaseLineKey = "1000::PO2026070001::1";

async function makeSalesDirty(page: Page) {
  await page.goto("/");
  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-line-grid-cell-${salesLineKey}-QT_SO`).fill("3");
  await expect(page.getByTestId("sales-order-dirty-indicator")).toBeVisible();
}

test("global dirty guard keeps the active form and focus on cancel, then discards exactly once", async ({ page }) => {
  await makeSalesDirty(page);
  const purchaseNavigation = page.getByTestId("nav-purchase-order");

  await purchaseNavigation.click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(1);
  await page.getByTestId("confirm-dialog-cancel").click();

  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await expect(page.getByTestId(`sales-order-line-grid-cell-${salesLineKey}-QT_SO`)).toHaveValue("3");
  await expect(purchaseNavigation).toBeFocused();

  await purchaseNavigation.click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page).toHaveURL(/\/purchase-orders$/);
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
});

test("browser Back cancellation restores the current entry and confirmation replays the requested entry once", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toBeVisible();
  await page.getByTestId("po-btn-search").click();
  await page.getByTestId(`purchase-line-grid-cell-${purchaseLineKey}-QT_PO`).fill("3");
  await expect(page.getByTestId("purchase-order-dirty-indicator")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/purchase-orders$/);
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId(`purchase-line-grid-cell-${purchaseLineKey}-QT_PO`)).toHaveValue("3");
  await expect(page.getByTestId("purchase-page-title")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
});

test("clean browser Back and Forward apply immediately without a discard dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-purchase-order").click();
  await expect(page).toHaveURL(/\/purchase-orders$/);
  await page.getByTestId("nav-work-order").click();
  await expect(page).toHaveURL(/\/work-orders$/);

  await page.goBack();
  await expect(page.getByTestId("purchase-page-title")).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("work-order-page-title")).toBeVisible();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
});

test("beforeunload guard is attached only for dirty data", async ({ page }) => {
  await page.goto("/");
  const clean = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    const dispatched = window.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented, dispatched };
  });
  expect(clean).toEqual({ defaultPrevented: false, dispatched: true });

  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-line-grid-cell-${salesLineKey}-QT_SO`).fill("3");
  await expect(page.getByTestId("sales-order-dirty-indicator")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    const dispatched = window.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented, dispatched };
  })).toEqual({ defaultPrevented: true, dispatched: false });
});

test("AI input uses the same single global guard", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
  await page.getByRole("tab", { name: "고객 업무 Q&A" }).click();
  await page.getByTestId("ai-customer-inquiry").fill("수주 변경 이력을 현장과 영업 부서가 함께 확인할 수 있도록 정리하고 싶습니다.");
  await page.getByTestId("nav-sales-order").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(1);
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("ai-customer-inquiry")).toHaveValue(/수주 변경 이력/);
});

test("compact mobile input uses the same single global guard", async ({ page }) => {
  await page.goto("/mobile/sales-orders");
  await page.getByTestId("mobile-sales-new").click();
  await page.getByTestId("mobile-sales-partner-lookup").click();
  await page.getByTestId("mobile-sales-partner-dialog-search-input").fill("P-10021");
  await page.getByTestId("mobile-sales-partner-dialog-search-button").click();
  await page.getByTestId("mobile-sales-partner-dialog-grid-row-1000::P-10021").click();
  await page.getByTestId("mobile-sales-partner-dialog-confirm").click();
  await page.getByTestId("mobile-sales-nav-pda").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(1);
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
});
