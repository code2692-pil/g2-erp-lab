import { expect, test, type Page } from "@playwright/test";

const salesGrid = "sales-order-line-grid";
const salesDialog = `${salesGrid}-view-settings-dialog`;
const runtimeErrors = new WeakMap<Page, { console: string[]; page: string[] }>();

test.use({ video: "off" });

function gridHeaders(page: Page, gridTestId: string) {
  return page.getByTestId(gridTestId).locator("thead th").allTextContents();
}

async function openSalesSettings(page: Page) {
  await page.getByTestId("sales-order-line-grid-view-settings").click();
  await expect(page.getByTestId(salesDialog)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  runtimeErrors.set(page, { console: consoleErrors, page: pageErrors });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)?.console ?? []).toEqual([]);
  expect(runtimeErrors.get(page)?.page ?? []).toEqual([]);
});

test("Gate 12-13: sales view hides and restores a column across reload without storing business data", async ({ page }) => {
  await page.getByTestId("btn-search").click();
  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-visible-DC_RMK`).uncheck();
  await page.getByTestId(`${salesDialog}-apply`).click();
  await expect(page.getByTestId(salesDialog)).toHaveCount(0);
  expect(await gridHeaders(page, salesGrid)).not.toContain("비고");

  const saved = await page.evaluate(() => localStorage.getItem("g2-erp.grid-view-preferences.v1.sales-order-lines"));
  expect(saved).not.toBeNull();
  expect(Object.keys(JSON.parse(saved!)).sort()).toEqual(["columns", "gridId", "schemaVersion"]);
  expect(saved).not.toContain("SO2026");

  await page.reload();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  expect(await gridHeaders(page, salesGrid)).not.toContain("비고");

  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-visible-DC_RMK`).check();
  await page.getByTestId(`${salesDialog}-apply`).click();
  expect(await gridHeaders(page, salesGrid)).toContain("비고");
});

test("Gate 12-13: displayed order drives headers and Tab skips a hidden editable column", async ({ page }) => {
  await page.getByTestId("btn-search").click();
  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-visible-STND_ITEM`).uncheck();
  await page.getByTestId(`${salesDialog}-move-up-QT_SO`).click();
  await page.getByTestId(`${salesDialog}-move-up-QT_SO`).click();
  await page.getByTestId(`${salesDialog}-apply`).click();

  const headers = await gridHeaders(page, salesGrid);
  expect(headers.indexOf("수주수량*")).toBeLessThan(headers.indexOf("단위"));
  expect(headers).not.toContain("규격");

  const itemName = page.locator(`input[data-testid^="${salesGrid}-cell-"][data-testid$="-NM_ITEM"]`).first();
  const quantity = page.locator(`input[data-testid^="${salesGrid}-cell-"][data-testid$="-QT_SO"]`).first();
  await itemName.focus();
  await page.keyboard.press("Tab");
  await expect(quantity).toBeFocused();
});

test("Gate 12-13: settings are isolated by Grid and do not trigger the document dirty guard", async ({ page }) => {
  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-visible-DC_RMK`).uncheck();
  await page.getByTestId(`${salesDialog}-apply`).click();

  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await page.getByTestId("purchase-line-grid-view-settings").click();
  await expect(page.getByTestId("purchase-line-grid-view-settings-dialog-visible-DC_RMK")).toBeChecked();
  await page.getByTestId("purchase-line-grid-view-settings-dialog-cancel").click();

  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
  await page.getByTestId("work-order-process-grid-view-settings").click();
  await expect(page.getByTestId("work-order-process-grid-view-settings-dialog-visible-DC_RMK")).toBeChecked();
});

test("Gate 12-13: reset confirms, restores defaults, and keeps document rows", async ({ page }) => {
  await page.getByTestId("btn-search").click();
  await expect(page.getByTestId(`${salesGrid}-row-1000::SO2026070001::1`)).toBeVisible();
  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-visible-DC_RMK`).uncheck();
  await page.getByTestId(`${salesDialog}-apply`).click();
  expect(await gridHeaders(page, salesGrid)).not.toContain("비고");

  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-reset`).click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect(await gridHeaders(page, salesGrid)).toContain("비고");
  await expect(page.getByTestId(`${salesGrid}-row-1000::SO2026070001::1`)).toBeVisible();
});

test("Gate 12-13: malformed stored settings recover and a hidden required field is restored for validation", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("g2-erp.grid-view-preferences.v1.sales-order-lines", "{"));
  await page.reload();
  await expect(page.getByTestId("sales-order-line-grid-view-settings")).toBeVisible();
  await page.getByTestId("btn-search").click();
  const itemCode = page.locator(`input[data-testid^="${salesGrid}-cell-"][data-testid$="-CD_ITEM"]`).first();
  await itemCode.fill("");

  await openSalesSettings(page);
  await page.getByTestId(`${salesDialog}-visible-CD_ITEM`).uncheck();
  await page.getByTestId(`${salesDialog}-apply`).click();
  expect(await gridHeaders(page, salesGrid)).not.toContain("품목코드*");

  await page.getByTestId("btn-save").click();
  await expect.poll(async () => (await gridHeaders(page, salesGrid)).some((header) => header.includes("품목코드"))).toBeTruthy();
  await expect(itemCode).toHaveAttribute("aria-invalid", "true");
});

test("Gate 12-13: view settings dialog remains usable in the four supported PC widths", async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 }
  ]) {
    await page.setViewportSize(viewport);
    await openSalesSettings(page);
    await expect(page.getByTestId(`${salesDialog}-apply`)).toBeVisible();
    await expect(page.getByTestId(`${salesDialog}-cancel`)).toBeVisible();
    await expect(page.getByTestId(`${salesDialog}-reset`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await page.getByTestId(`${salesDialog}-cancel`).click();
  }
});
