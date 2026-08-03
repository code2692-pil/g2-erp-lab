import { expect, test, type APIRequestContext } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:5080";
const marker = process.env.G2ERP_SQL_MARKER;

function requireMarker() {
  expect(marker, "G2ERP_SQL_MARKER must identify this isolated local SQL Server test row.").toMatch(/^G2-MPDA-[A-Za-z0-9-]+$/);
  return marker!;
}

async function cleanupMarkedOrders(request: APIRequestContext, testMarker: string) {
  const listResponse = await request.get(`${apiBaseUrl}/api/sales-orders`);
  if (!listResponse.ok()) throw new Error(`Marker cleanup could not read sales orders: HTTP ${listResponse.status()}.`);
  const orders = await listResponse.json() as Array<{ Header: { CD_FIRM: string; NO_SO: string; DC_RMK: string } }>;
  const matches = orders.filter((current) => current.Header.CD_FIRM === "1000" && current.Header.DC_RMK === testMarker);
  for (const current of matches) {
    const deleteResponse = await request.delete(`${apiBaseUrl}/api/sales-orders/1000/${current.Header.NO_SO}`);
    if (!deleteResponse.ok() && deleteResponse.status() !== 404) {
      throw new Error(`Marker cleanup could not delete ${current.Header.NO_SO}: HTTP ${deleteResponse.status()}.`);
    }
  }
  const verifyResponse = await request.get(`${apiBaseUrl}/api/sales-orders`);
  if (!verifyResponse.ok()) throw new Error(`Marker cleanup could not verify sales orders: HTTP ${verifyResponse.status()}.`);
  const remaining = await verifyResponse.json() as Array<{ Header: { CD_FIRM: string; DC_RMK: string } }>;
  if (remaining.some((current) => current.Header.CD_FIRM === "1000" && current.Header.DC_RMK === testMarker)) {
    throw new Error(`Marker cleanup left the SQL Server sales order '${testMarker}'.`);
  }
}

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  if (marker) await cleanupMarkedOrders(request, marker);
});

async function saveCompactOrder(page: import("@playwright/test").Page, prefix: "mobile-sales" | "pda-sales", method: "POST" | "PUT") {
  const response = page.waitForResponse((current) =>
    current.request().method() === method && new URL(current.url()).pathname.startsWith("/api/sales-orders")
  );
  await page.getByTestId(`${prefix}-save`).click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByRole("dialog", { name: "저장 완료" })).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId(`${prefix}-dirty-indicator`)).toHaveCount(0);
}

test("Gate 12-9 SQL cross A: PC creates, mobile and PDA update, and PC sees the same order", async ({ page }) => {
  const testMarker = requireMarker();
  await page.goto("/");
  await page.getByTestId("btn-search").click();
  await expect(page.locator("main[data-processing-state]")).toHaveAttribute("data-processing-state", "idle");
  await page.getByTestId("btn-new").click();

  const tempHeaderKey = "1000::TEMP_SO_001";
  const tempLineKey = `${tempHeaderKey}::1`;
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-CD_PARTNER`).fill("P-10021");
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-NM_PARTNER`).fill("SQL cross test partner");
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-DC_RMK`).fill(testMarker);
  await page.getByTestId("btn-add-line").click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t3\t1000"));
  await page.getByTestId(`sales-order-line-grid-cell-${tempLineKey}-CD_ITEM`).click();
  await page.keyboard.press("Control+V");
  await expect(page.getByTestId(`sales-order-line-grid-cell-${tempLineKey}-QT_SO`)).toHaveValue("3");
  const createResponse = page.waitForResponse((current) =>
    current.request().method() === "POST" && new URL(current.url()).pathname === "/api/sales-orders"
  );
  await page.getByTestId("btn-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await createResponse).status()).toBe(201);
  const selectedDocument = page.getByTestId("sales-order-header-grid-selected-document");
  await expect(selectedDocument).toHaveText(/SOR\d{10}/);
  const salesOrderNo = (await selectedDocument.textContent())?.match(/SOR\d{10}/)?.[0];
  expect(salesOrderNo).toBeTruthy();
  await expect(page.getByRole("dialog", { name: "저장 완료" })).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();

  await page.getByTestId("nav-mobile-sales-order").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId("mobile-sales-page")).toHaveAttribute("data-processing-state", "idle");
  await page.getByTestId(`mobile-sales-result-${salesOrderNo}`).click();
  await expect(page.getByTestId("mobile-sales-line-quantity-1")).toHaveValue("3");
  await page.getByTestId("mobile-sales-line-quantity-1").fill("7");
  await saveCompactOrder(page, "mobile-sales", "PUT");

  await page.getByTestId("mobile-sales-nav-pda").click();
  await page.getByTestId("pda-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("pda-sales-search").click();
  await expect(page.getByTestId("pda-sales-page")).toHaveAttribute("data-processing-state", "idle");
  await expect(page.getByTestId("pda-sales-order-no")).toHaveValue(salesOrderNo!);
  await expect(page.getByTestId("pda-sales-line-quantity-1")).toHaveValue("7");
  await expect(page.getByTestId("pda-sales-line-price-1")).toHaveValue("1000");
  await expect(page.getByTestId("pda-sales-line-quantity-1")).toBeEnabled();
  await page.getByTestId("pda-sales-line-quantity-1").fill("9");
  await expect(page.getByTestId("pda-sales-line-quantity-1")).toHaveValue("9");
  await expect(page.getByTestId("pda-sales-save")).toBeEnabled();
  await saveCompactOrder(page, "pda-sales", "PUT");
  const updatedOrdersResponse = await page.request.get(`${apiBaseUrl}/api/sales-orders`);
  expect(updatedOrdersResponse.ok()).toBeTruthy();
  const updatedOrders = await updatedOrdersResponse.json() as Array<{
    Header: { CD_FIRM: string; NO_SO: string };
    Lines: Array<{ QT_SO: number }>;
  }>;
  const updatedOrder = updatedOrders.find((current) => current.Header.CD_FIRM === "1000" && current.Header.NO_SO === salesOrderNo);
  expect(updatedOrder?.Lines[0]?.QT_SO).toBe(9);

  await page.getByTestId("pda-sales-nav-pc").click();
  await page.getByLabel("수주일자 To").fill("2026-12-31");
  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-header-grid-cell-container-1000::${salesOrderNo}-NO_SO`).click();
  await expect(page.getByTestId(`sales-order-line-grid-cell-1000::${salesOrderNo}::1-QT_SO`)).toHaveValue("9");
  await expect(page.getByTestId("sales-order-total-summary")).toContainText("9,900");

  await page.getByTestId("nav-mobile-sales-order").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId("mobile-sales-page")).toHaveAttribute("data-processing-state", "idle");
  await page.getByTestId(`mobile-sales-result-${salesOrderNo}`).click();
  await expect(page.getByTestId("mobile-sales-line-quantity-1")).toHaveValue("9");
});

test("Gate 12-9 SQL cross D: PDA deletes the same order and all screens no longer find it", async ({ page, request }) => {
  const testMarker = requireMarker();
  const ordersResponse = await request.get(`${apiBaseUrl}/api/sales-orders`);
  expect(ordersResponse.ok()).toBeTruthy();
  const orders = await ordersResponse.json() as Array<{ Header: { CD_FIRM: string; NO_SO: string; DC_RMK: string } }>;
  const order = orders.find((current) => current.Header.CD_FIRM === "1000" && current.Header.DC_RMK === testMarker);
  expect(order, "The creation/update SQL phase must leave one marked order for PDA deletion.").toBeTruthy();
  const salesOrderNo = order!.Header.NO_SO;

  await page.goto("/mobile/sales-orders");
  await page.getByTestId("mobile-sales-filter-order-no").fill(salesOrderNo);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId(`mobile-sales-result-${salesOrderNo}`)).toBeVisible();
  await page.getByTestId("mobile-sales-nav-pda").click();
  await page.getByTestId("pda-sales-filter-order-no").fill(salesOrderNo);
  await page.getByTestId("pda-sales-search").click();
  await expect(page.getByTestId("pda-sales-page")).toHaveAttribute("data-processing-state", "idle");
  await expect(page.getByTestId("pda-sales-order-no")).toHaveValue(salesOrderNo);
  const deleteResponse = page.waitForResponse((current) =>
    current.request().method() === "DELETE" && new URL(current.url()).pathname === `/api/sales-orders/1000/${salesOrderNo}`
  );
  await page.getByTestId("pda-sales-delete-order").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByRole("dialog", { name: "삭제 완료" })).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("pda-sales-order-no")).toHaveCount(0);

  await page.getByTestId("pda-sales-nav-pc").click();
  await page.getByTestId("btn-search").click();
  await expect(page.getByTestId(`sales-order-header-grid-row-1000::${salesOrderNo}`)).toHaveCount(0);
  await page.getByTestId("nav-mobile-sales-order").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(salesOrderNo);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId(`mobile-sales-result-${salesOrderNo}`)).toHaveCount(0);
});
