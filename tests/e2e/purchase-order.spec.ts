import { expect, test } from "@playwright/test";

const headerKey = "1000::PO2026070001";
const lineKey = "1000::PO2026070001::1";
const remainingLineKey = "1000::PO2026070001::2";

async function openPurchaseOrder(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
}

test("A: 메뉴 전환 후 발주 조회와 Header-Line 표시", async ({ page }) => {
  await openPurchaseOrder(page);
  await expect(page.getByTestId("po-btn-search")).toBeVisible();
  await expect(page.getByTestId("po-btn-new")).toBeVisible();
  await expect(page.getByTestId("po-btn-save")).toBeVisible();
  await expect(page.getByTestId("po-btn-delete")).toBeVisible();
  await page.getByTestId("po-btn-search").click();
  await expect(page.getByTestId(`purchase-header-grid-row-${headerKey}`)).toBeVisible();
  const headerCount = await page.getByTestId("purchase-header-grid").locator("tbody tr[data-row-key]").count();
  await expect(page.getByTestId("purchase-header-grid-total-count")).toHaveText(`전체 ${headerCount}건`);
  await page.getByTestId(`purchase-header-grid-row-${headerKey}`).click();
  await expect(page.getByTestId(`purchase-header-grid-row-${headerKey}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("purchase-header-grid-selected-document")).toHaveText("선택 문서 PO2026070001");
  await expect(page.getByTestId("purchase-line-grid-total-count")).toHaveText("전체 2건");
  await expect(page.getByTestId(`purchase-line-grid-row-${lineKey}`)).toBeVisible();
  await page.getByTestId("nav-sales-order").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
});

test("Gate 7: purchase detail Tab skips calculated cells and focuses a new row", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-search").click();
  await expect(page.getByTestId(`purchase-line-grid-row-${lineKey}`)).toBeVisible();

  const quantity = page.getByTestId(`purchase-line-grid-cell-${lineKey}-QT_PO`);
  const price = page.getByTestId(`purchase-line-grid-cell-${lineKey}-UM_PO`);
  const deliveryDate = page.getByTestId(`purchase-line-grid-cell-${lineKey}-DT_DLV`);

  await quantity.fill("5");
  await quantity.press("Tab");
  await expect(price).toBeFocused();
  await price.press("Tab");
  await expect(deliveryDate).toBeFocused();
  await deliveryDate.press("Shift+Tab");
  await expect(price).toBeFocused();
  await expect(page.getByTestId("purchase-order-dirty-indicator")).toHaveText("수정됨");

  await page.getByTestId("po-btn-add-line").click();
  const newLineKey = "1000::PO2026070001::3";
  await expect(page.getByTestId(`purchase-line-grid-cell-${newLineKey}-CD_ITEM`)).toBeFocused();
});

test("B: 신규 발주 Validation, Lookup, 금액 계산과 저장", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-new").click();
  await page.getByTestId("po-btn-save").click();
  await expect(page.getByTestId("status-message")).toContainText("저장할 수 없습니다.");
  await expect(page.getByTestId("purchase-validation-summary")).toBeVisible();
  await page.getByTestId("purchase-validation-close").click();

  await page.getByTestId("po-btn-partner-lookup").click();
  await page.getByTestId("po-partner-lookup-grid-row-1000::P-10021").click();
  await page.getByTestId("po-partner-lookup-confirm").click();
  await page.getByTestId("po-btn-add-line").click();

  const tempLineKey = "1000::TEMP_PO_001::1";
  await page.getByTestId(`purchase-line-grid-row-${tempLineKey}`).click();
  await expect(page.getByTestId("po-btn-item-lookup")).toHaveCount(0);
  await page.getByTestId(`purchase-line-grid-cell-container-${tempLineKey}-CD_ITEM`).dblclick();
  await page.getByTestId("po-item-lookup-grid-row-1000::ITM-1001").click();
  await page.getByTestId("po-item-lookup-confirm").click();
  await expect(page.getByTestId("po-btn-warehouse-lookup")).toHaveCount(0);
  await page.getByTestId(`purchase-line-grid-cell-container-${tempLineKey}-CD_WH`).dblclick();
  await page.getByTestId("po-warehouse-lookup-grid-row-1000::WH-100").click();
  await page.getByTestId("po-warehouse-lookup-confirm").click();

  await page.getByTestId(`purchase-line-grid-cell-${tempLineKey}-QT_PO`).fill("3");
  await page.getByTestId(`purchase-line-grid-cell-${tempLineKey}-UM_PO`).fill("101");
  await expect(page.getByTestId("purchase-total-summary")).toContainText("333");
  await page.getByTestId("po-btn-save").click();
  expect(await page.getByTestId("confirm-dialog").locator("button").evaluateAll(
    (buttons) => buttons.map((button) => button.getAttribute("data-testid")).filter(Boolean)
  )).toEqual(["confirm-dialog-confirm", "confirm-dialog-cancel"]);
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("status-message")).toHaveText("저장되었습니다.");
});

test("C: 체크된 발주상세 행을 삭제한다", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-search").click();
  await expect(page.getByTestId(`purchase-line-grid-row-${lineKey}`)).toBeVisible();
  await expect(page.getByTestId(`purchase-line-grid-row-${remainingLineKey}`)).toBeVisible();
  await expect(page.getByTestId("purchase-line-grid-footer-total")).toHaveText(/2/);
  await page.getByTestId(`purchase-line-grid-checkbox-${lineKey}`).check();
  await expect(page.getByTestId("purchase-line-grid-footer-selected")).toHaveText(/1/);

  await page.getByTestId("po-btn-delete-line").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("선택한 발주상세 1건");
  await page.getByTestId("confirm-dialog-confirm").click();

  await expect(page.getByTestId(`purchase-line-grid-row-${remainingLineKey}`)).toHaveCount(0);
  await expect(page.getByTestId(`purchase-line-grid-row-${lineKey}`)).toBeVisible();
  await expect(page.getByTestId("purchase-line-grid-footer-total")).toHaveText(/1/);
  await expect(page.getByTestId("purchase-line-grid-selected-count")).toHaveCount(0);
});

test("Paste: purchase detail updates lookup codes through Ctrl+V", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-search").click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t2\t100"));
  await page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_ITEM`).click();
  await page.keyboard.press("Control+V");

  await page.evaluate(() => navigator.clipboard.writeText("WH-100"));
  await page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_WH`).click();
  await page.keyboard.press("Control+V");

  await expect(page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_ITEM`)).toHaveValue("ITM-1001");
  await expect(page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_WH`)).toHaveValue("WH-100");
  await expect(page.getByTestId("purchase-line-grid-total-count")).toHaveText("전체 2건");
});

test("Paste: purchase calculated columns reject the entire matrix", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-search").click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const before = await page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_ITEM`).inputValue();
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });

  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t2\t100\t1"));
  await page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_ITEM`).click();
  await page.keyboard.press("Control+V");

  await expect(page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-CD_ITEM`)).toHaveValue(before);
  await expect(page.getByTestId("purchase-line-grid-total-count")).toHaveText("전체 2건");
  await expect(page.getByRole("alert")).toContainText("붙여넣기 실패");
  expect(apiRequests).toEqual([]);
});

test("Gate 3: invalid numeric and date cells remain atomic and recover on the next paste", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-search").click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const quantity = page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-QT_PO`);
  const deliveryDate = page.getByTestId(`purchase-line-grid-cell-${remainingLineKey}-DT_DLV`);
  const initialQuantity = await quantity.inputValue();
  const initialDeliveryDate = await deliveryDate.inputValue();

  await page.evaluate(() => navigator.clipboard.writeText("NaN"));
  await quantity.click();
  await page.keyboard.press("Control+V");
  await expect(quantity).toHaveValue(initialQuantity);
  await expect(page.locator(".erp-snackbar--error")).toContainText("붙여넣기 실패");

  await page.evaluate(() => navigator.clipboard.writeText("2026-02-30"));
  await deliveryDate.click();
  await page.keyboard.press("Control+V");
  await expect(deliveryDate).toHaveValue(initialDeliveryDate);

  await page.evaluate(() => navigator.clipboard.writeText("3"));
  await quantity.click();
  await page.keyboard.press("Control+V");
  await expect(quantity).toHaveValue("3");

  await page.evaluate(() => navigator.clipboard.writeText("2026-12-31"));
  await deliveryDate.click();
  await page.keyboard.press("Control+V");
  await expect(deliveryDate).toHaveValue("2026-12-31");
});

test("Dirty guard: purchase new keeps edits on cancel and starts clean after discard", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-search").click();
  await page.getByTestId(`purchase-line-grid-cell-${lineKey}-QT_PO`).fill("3");

  await expect(page.getByTestId("purchase-order-dirty-indicator")).toHaveText("수정됨");
  await page.getByTestId("po-btn-new").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId(`purchase-line-grid-cell-${lineKey}-QT_PO`)).toHaveValue("3");
  await expect(page.getByTestId("purchase-order-dirty-indicator")).toBeVisible();

  await page.getByTestId("po-btn-new").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("purchase-header-grid-row-1000::TEMP_PO_001")).toBeVisible();
  await expect(page.getByTestId("purchase-order-dirty-indicator")).toHaveCount(0);
});
