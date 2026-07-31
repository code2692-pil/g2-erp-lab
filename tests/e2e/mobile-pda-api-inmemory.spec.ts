import { expect, test, type Page } from "@playwright/test";

async function choosePartner(page: Page, prefix: "mobile-sales" | "pda-sales") {
  await page.getByTestId(`${prefix}-partner-lookup`).click();
  await page.getByTestId(`${prefix}-partner-dialog-search-input`).fill("P-10021");
  await page.getByTestId(`${prefix}-partner-dialog-search-button`).click();
  await page.getByTestId(`${prefix}-partner-dialog-grid-row-1000::P-10021`).click();
  await page.getByTestId(`${prefix}-partner-dialog-confirm`).click();
}

async function saveCompactOrder(page: Page, prefix: "mobile-sales" | "pda-sales", method: "PUT") {
  const response = page.waitForResponse((current) =>
    current.request().method() === method && new URL(current.url()).pathname.startsWith("/api/sales-orders")
  );
  await page.getByTestId(`${prefix}-save`).click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByTestId(`${prefix}-dirty-indicator`)).toHaveCount(0);
}

test("Gate 12-9 InMemory cross: PC, mobile, and PDA create, update, delete, and requery one order", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-search").click();
  await page.getByTestId("btn-new").click();
  const tempHeaderKey = "1000::TEMP_SO_001";
  const tempLineKey = `${tempHeaderKey}::1`;
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-CD_PARTNER`).fill("P-10021");
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-NM_PARTNER`).fill("InMemory partner");
  await page.getByTestId("btn-add-line").click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t3\t1000"));
  await page.getByTestId(`sales-order-line-grid-cell-${tempLineKey}-CD_ITEM`).click();
  await page.keyboard.press("Control+V");
  const createResponse = page.waitForResponse((current) =>
    current.request().method() === "POST" && new URL(current.url()).pathname === "/api/sales-orders"
  );
  await page.getByTestId("btn-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await createResponse).status()).toBe(201);
  const selectedDocument = page.getByTestId("sales-order-header-grid-selected-document");
  await expect(selectedDocument).toHaveText(/SO\d{10}/);
  const salesOrderNo = (await selectedDocument.textContent())?.match(/SO\d{10}/)?.[0];
  expect(salesOrderNo).toBeTruthy();

  await page.getByTestId("nav-mobile-sales-order").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("mobile-sales-search").click();
  await page.getByTestId(`mobile-sales-result-${salesOrderNo}`).click();
  await expect(page.getByTestId("mobile-sales-line-quantity-1")).toHaveValue("3");
  await page.getByTestId("mobile-sales-line-quantity-1").fill("7");
  await saveCompactOrder(page, "mobile-sales", "PUT");

  await page.getByTestId("mobile-sales-nav-pda").click();
  await page.getByTestId("pda-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("pda-sales-search").click();
  await expect(page.getByTestId("pda-sales-order-no")).toHaveValue(salesOrderNo!);
  await expect(page.getByTestId("pda-sales-line-quantity-1")).toHaveValue("7");
  await page.getByTestId("pda-sales-line-quantity-1").fill("9");
  await saveCompactOrder(page, "pda-sales", "PUT");

  await page.getByTestId("pda-sales-nav-pc").click();
  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-header-grid-row-1000::${salesOrderNo}`).click();
  await expect(page.getByTestId(`sales-order-line-grid-cell-1000::${salesOrderNo}::1-QT_SO`)).toHaveValue("9");

  await page.getByTestId("nav-pda-sales-order").click();
  await page.getByTestId("pda-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("pda-sales-search").click();
  await expect(page.getByTestId("pda-sales-order-no")).toHaveValue(salesOrderNo!);
  const deleteResponse = page.waitForResponse((current) =>
    current.request().method() === "DELETE" && new URL(current.url()).pathname === `/api/sales-orders/1000/${salesOrderNo}`
  );
  await page.getByTestId("pda-sales-delete-order").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByTestId("pda-sales-order-no")).toHaveCount(0);

  await page.getByTestId("pda-sales-nav-pc").click();
  const pcRequery = page.waitForResponse((current) =>
    current.request().method() === "GET" && new URL(current.url()).pathname === "/api/sales-orders"
  );
  await page.getByTestId("btn-search").click();
  expect((await pcRequery).ok()).toBeTruthy();
  await expect(page.getByTestId(`sales-order-header-grid-row-1000::${salesOrderNo}`)).toHaveCount(0);
  await page.getByTestId("nav-mobile-sales-order").click();
  await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
  await page.getByTestId("mobile-sales-filter-order-no").fill(salesOrderNo!);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId(`mobile-sales-result-${salesOrderNo}`)).toHaveCount(0);
});
