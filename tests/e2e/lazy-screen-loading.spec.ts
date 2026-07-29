import { expect, test, type Route } from "@playwright/test";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const purchaseScreenModule = "**/src/features/purchase-order/PurchaseOrderRegistration.tsx*";

test("Gate 12-11: delayed purchase screen shows an accessible loading state before rendering", async ({ page }) => {
  const moduleStarted = deferred();
  const releaseModule = deferred();
  let moduleRequestCount = 0;
  const holdPurchaseModule = async (route: Route) => {
    moduleRequestCount += 1;
    moduleStarted.resolve();
    await releaseModule.promise;
    await route.continue();
  };

  await page.goto("/");
  await page.route(purchaseScreenModule, holdPurchaseModule);
  try {
    await page.getByTestId("nav-purchase-order").click();
    await moduleStarted.promise;
    await expect(page.getByTestId("app-page-loading")).toBeVisible();
    await expect(page.getByTestId("app-page-loading")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("status")).toHaveText("화면을 불러오는 중입니다.");
    expect(moduleRequestCount).toBe(1);

    releaseModule.resolve();
    await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
  } finally {
    releaseModule.resolve();
    await page.unroute(purchaseScreenModule, holdPurchaseModule);
  }
});

test("Gate 12-11: one failed screen-module request exposes recovery and succeeds after retry", async ({ page }) => {
  let aborted = false;
  const failFirstPurchaseModule = async (route: Route) => {
    if (!aborted) {
      aborted = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  };

  await page.goto("/");
  await page.route(purchaseScreenModule, failFirstPurchaseModule);
  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("app-page-load-error")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("화면을 불러오지 못했습니다.");
  expect(aborted).toBeTruthy();

  await page.unroute(purchaseScreenModule, failFirstPurchaseModule);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
});
