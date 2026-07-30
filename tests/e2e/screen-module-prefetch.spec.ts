import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const moduleNames = {
  purchase: "PurchaseOrderRegistration",
  work: "WorkOrderRegistration",
  development: "DevelopmentDataManager",
  ai: "AiSolutionCenterPage",
  compact: "CompactSalesOrderPage"
} as const;

const firstSalesLineKey = "1000::SO2026070001::1";

function requestsFor(moduleName: string, requests: Request[]) {
  return requests.filter((request) => new URL(request.url()).pathname.includes(moduleName));
}

function trackModuleRequests(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (Object.values(moduleNames).some((moduleName) => new URL(request.url()).pathname.includes(moduleName))) requests.push(request);
  });
  return requests;
}

test("Gate 12-12: initial entry excludes non-default modules, then hover preloads only purchase once", async ({ page }) => {
  const moduleRequests = trackModuleRequests(page);
  const purchaseApiRequests: Request[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/purchase-orders") || pathname.startsWith("/api/warehouses")) purchaseApiRequests.push(request);
  });

  await page.goto("/");
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  for (const moduleName of Object.values(moduleNames)) expect(requestsFor(moduleName, moduleRequests)).toHaveLength(0);

  const purchaseMenu = page.getByTestId("nav-purchase-order");
  await purchaseMenu.hover();
  await expect.poll(() => requestsFor(moduleNames.purchase, moduleRequests).length).toBe(1);
  expect(purchaseApiRequests).toHaveLength(0);

  await purchaseMenu.hover();
  await purchaseMenu.focus();
  expect(requestsFor(moduleNames.purchase, moduleRequests)).toHaveLength(1);
  expect(requestsFor(moduleNames.work, moduleRequests)).toHaveLength(0);
  expect(requestsFor(moduleNames.ai, moduleRequests)).toHaveLength(0);
  expect(requestsFor(moduleNames.compact, moduleRequests)).toHaveLength(0);

  await purchaseMenu.click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
  expect(requestsFor(moduleNames.purchase, moduleRequests)).toHaveLength(1);
});

test("Gate 12-12: keyboard focus preloads work once before Enter navigation", async ({ page }) => {
  const moduleRequests = trackModuleRequests(page);
  await page.goto("/");
  const workMenu = page.getByTestId("nav-work-order");

  await workMenu.focus();
  await expect(workMenu).toBeFocused();
  await expect.poll(() => requestsFor(moduleNames.work, moduleRequests).length).toBe(1);
  await workMenu.press("Enter");

  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
  expect(requestsFor(moduleNames.work, moduleRequests)).toHaveLength(1);
  expect(requestsFor(moduleNames.ai, moduleRequests)).toHaveLength(0);
});

test("Gate 12-12: touch-compatible pointer intent preloads the compact screen once without other screens", async ({ page }) => {
  const moduleRequests = trackModuleRequests(page);
  await page.goto("/");

  const mobileMenu = page.getByTestId("nav-mobile-sales-order");
  await mobileMenu.dispatchEvent("pointerdown", { pointerType: "touch" });
  await expect.poll(() => requestsFor(moduleNames.compact, moduleRequests).length).toBe(1);

  await mobileMenu.click();
  await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
  expect(requestsFor(moduleNames.compact, moduleRequests)).toHaveLength(1);
  expect(requestsFor(moduleNames.purchase, moduleRequests)).toHaveLength(0);
  expect(requestsFor(moduleNames.work, moduleRequests)).toHaveLength(0);
  expect(requestsFor(moduleNames.ai, moduleRequests)).toHaveLength(0);
});

test("Gate 12-12: failed intent preload keeps the current screen and recovers on actual navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let failedPreloadCount = 0;
  const failFirstPurchaseModule = async (route: Route) => {
    failedPreloadCount += 1;
    if (failedPreloadCount === 1) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  };

  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.route(`**/*${moduleNames.purchase}*`, failFirstPurchaseModule);
  try {
    await page.getByTestId("nav-purchase-order").hover();
    await expect.poll(() => failedPreloadCount).toBe(1);
    await expect(page.getByTestId("page-title")).toHaveText("수주등록");
    await expect(page.getByTestId("app-page-load-error")).toHaveCount(0);

    await page.getByTestId("nav-ai-solution-center").click();
    await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI 솔루션 센터");
    await page.getByTestId("nav-sales-order").click();
    await expect(page.getByTestId("page-title")).toHaveText("수주등록");

    await page.unroute(`**/*${moduleNames.purchase}*`, failFirstPurchaseModule);
    await page.getByTestId("nav-purchase-order").click();
    await expect.poll(async () => (await page.getByTestId("purchase-page-title").count()) + (await page.getByTestId("app-page-load-error").count())).toBeGreaterThan(0);
    if (await page.getByTestId("app-page-load-error").count()) {
      await page.getByRole("button", { name: "다시 시도" }).click();
      await expect(page).toHaveURL(/\/purchase-orders$/);
    }
    await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");

    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("Failed to fetch dynamically imported module") && !message.includes("Failed to load resource: net::ERR_FAILED"));
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await page.unrouteAll();
  }
});

test("Gate 12-12: dirty sales hover only preloads code, while click still uses the dirty guard", async ({ page }) => {
  const moduleRequests = trackModuleRequests(page);
  await page.goto("/");
  await page.getByTestId("btn-search").click();
  const quantity = page.getByTestId(`sales-order-line-grid-cell-${firstSalesLineKey}-QT_SO`);
  await quantity.fill("3");
  await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveText("수정됨");

  const purchaseMenu = page.getByTestId("nav-purchase-order");
  await purchaseMenu.hover();
  await expect.poll(() => requestsFor(moduleNames.purchase, moduleRequests).length).toBe(1);
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(quantity).toHaveValue("3");

  await purchaseMenu.click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항이 있습니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await expect(quantity).toHaveValue("3");

  await purchaseMenu.click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
});
