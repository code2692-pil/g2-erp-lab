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
  await page.getByTestId("po-btn-search").click();
  await expect(page.getByTestId(`purchase-header-grid-row-${headerKey}`)).toBeVisible();
  await page.getByTestId(`purchase-header-grid-row-${headerKey}`).click();
  await expect(page.getByTestId(`purchase-line-grid-row-${lineKey}`)).toBeVisible();
  await page.getByTestId("nav-sales-order").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
});

test("B: 신규 발주 Validation, Lookup, 금액 계산과 저장", async ({ page }) => {
  await openPurchaseOrder(page);
  await page.getByTestId("po-btn-new").click();
  await page.getByTestId("po-btn-save").click();
  await expect(page.getByTestId("status-message")).toContainText("검증 오류");

  await page.getByTestId("po-btn-partner-lookup").click();
  await page.getByTestId("po-partner-lookup-grid-row-1000::P-10021").click();
  await page.getByTestId("po-partner-lookup-confirm").click();
  await page.getByTestId("po-btn-add-line").click();

  const tempLineKey = "1000::TEMP_PO_001::1";
  await page.getByTestId(`purchase-line-grid-row-${tempLineKey}`).click();
  await page.getByTestId("po-btn-item-lookup").click();
  await page.getByTestId("po-item-lookup-grid-row-1000::ITM-1001").click();
  await page.getByTestId("po-item-lookup-confirm").click();
  await page.getByTestId("po-btn-warehouse-lookup").click();
  await page.getByTestId("po-warehouse-lookup-grid-row-1000::WH-100").click();
  await page.getByTestId("po-warehouse-lookup-confirm").click();

  await page.getByTestId(`purchase-line-grid-cell-${tempLineKey}-QT_PO`).fill("3");
  await page.getByTestId(`purchase-line-grid-cell-${tempLineKey}-UM_PO`).fill("101");
  await expect(page.getByTestId("purchase-total-summary")).toContainText("333");
  await page.getByTestId("po-btn-save").click();
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

  const confirmDialog = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.getByTestId("po-btn-delete-line").click();
  await confirmDialog;

  await expect(page.getByTestId(`purchase-line-grid-row-${lineKey}`)).toHaveCount(0);
  await expect(page.getByTestId(`purchase-line-grid-row-${remainingLineKey}`)).toBeVisible();
  await expect(page.getByTestId("purchase-line-grid-footer-total")).toHaveText(/1/);
  await expect(page.getByTestId("purchase-line-grid-footer-selected")).toHaveText(/0/);
});
