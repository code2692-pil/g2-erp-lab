import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const headerRowKey = "1000::SO2026070001";
const firstLineKey = "1000::SO2026070001::1";
const secondLineKey = "1000::SO2026070001::2";

function headerRow(page: Page, rowKey = headerRowKey) {
  return page.getByTestId(`sales-order-header-grid-row-${rowKey}`);
}

function lineRow(page: Page, rowKey: string) {
  return page.getByTestId(`sales-order-line-grid-row-${rowKey}`);
}

function lineCell(page: Page, rowKey: string, field: string) {
  return page.getByTestId(`sales-order-line-grid-cell-${rowKey}-${field}`);
}

async function openSalesOrder(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("page-title")).toBeVisible();
}

async function searchSalesOrders(page: Page) {
  await page.getByTestId("btn-search").click();
  await expect(headerRow(page)).toBeVisible();
}

test("A: 기본 화면에서 조회 후 수주정보와 수주상세를 표시한다", async ({ page }) => {
  await openSalesOrder(page);

  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await expect(page.getByTestId("btn-search")).toBeVisible();
  await expect(page.getByTestId("btn-new")).toBeVisible();
  await expect(page.getByTestId("btn-save")).toBeVisible();
  await expect(page.getByTestId("btn-delete-order")).toBeVisible();

  await searchSalesOrders(page);
  await headerRow(page).click();

  await expect(lineRow(page, firstLineKey)).toBeVisible();
  await expect(lineRow(page, secondLineKey)).toBeVisible();
});

test("B: 거래처 Lookup 선택값을 조회조건에 반영한다", async ({ page }) => {
  await openSalesOrder(page);

  await page.getByTestId("btn-partner-lookup").click();
  await page.getByTestId("partner-lookup-search-input").fill("P-10044");
  await page.getByTestId("partner-lookup-search-button").click();
  await page.getByTestId("partner-lookup-grid-row-1000::P-10044").click();
  await page.getByTestId("partner-lookup-confirm").click();

  await expect(page.getByTestId("filter-partner-code")).toHaveValue("P-10044");
  await expect(page.getByTestId("filter-partner-name")).not.toHaveValue("");
});

test("C: 품목 Lookup은 선택한 수주상세 행만 갱신한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineRow(page, firstLineKey).click();

  await page.getByTestId("btn-item-lookup").click();
  await page.getByTestId("item-lookup-search-input").fill("ITM-1204");
  await page.getByTestId("item-lookup-search-button").click();
  await page.getByTestId("item-lookup-grid-row-1000::ITM-1204").click();
  await page.getByTestId("item-lookup-confirm").click();

  await expect(lineCell(page, firstLineKey, "CD_ITEM")).toHaveValue("ITM-1204");
  await expect(lineCell(page, firstLineKey, "NM_ITEM")).not.toHaveValue("");
  await expect(lineCell(page, firstLineKey, "STND_ITEM")).toHaveValue("SENSOR-B / IP67");
  await expect(lineCell(page, firstLineKey, "UNIT_ITEM")).toHaveValue("EA");
  await expect(lineCell(page, secondLineKey, "CD_ITEM")).toHaveValue("ITM-1204");
});

test("D: 수주상세 Grid의 단일, 다중, 전체 선택을 반영한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await page.getByTestId(`sales-order-line-grid-checkbox-${firstLineKey}`).check();
  await expect(page.getByTestId("sales-order-line-grid-footer-selected")).toHaveText(/1/);

  await page.getByTestId(`sales-order-line-grid-checkbox-${secondLineKey}`).check();
  await expect(page.getByTestId("sales-order-line-grid-footer-selected")).toHaveText(/2/);

  await page.getByTestId("sales-order-line-grid-select-all").check();
  await expect(page.getByTestId("sales-order-line-grid-footer-selected")).toHaveText(/2/);

  await page.getByTestId("sales-order-line-grid-select-all").uncheck();
  await expect(page.getByTestId("sales-order-line-grid-footer-selected")).toHaveText(/0/);
});

test("E: 수량과 단가 변경 시 금액 및 Footer 합계를 재계산한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await lineCell(page, firstLineKey, "QT_SO").fill("3");
  await lineCell(page, firstLineKey, "UM_SO").fill("100");

  await expect(page.getByTestId("sales-order-line-grid-summary-AM_SUPPLY")).toHaveText("1,800,300");
  await expect(page.getByTestId("sales-order-line-grid-summary-AM_VAT")).toHaveText("180,030");
  await expect(page.getByTestId("sales-order-line-grid-summary-AM_TOTAL")).toHaveText("1,980,330");
  await expect(page.getByTestId("sales-order-total-summary")).toContainText("1,980,330");
});

test("F: 체크 행, 현재 행, 미선택 행삭제를 각각 처리한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await page.getByTestId(`sales-order-line-grid-checkbox-${firstLineKey}`).check();
  await page.getByTestId(`sales-order-line-grid-checkbox-${secondLineKey}`).check();
  await page.getByTestId("btn-delete-line").click();
  await expect(page.getByTestId("dialog-delete-line")).toBeVisible();
  await page.getByTestId("dialog-delete-line-confirm").click();
  await expect(page.getByTestId("sales-order-line-grid-footer-total")).toHaveText(/0/);

  await page.reload();
  await searchSalesOrders(page);
  await lineRow(page, firstLineKey).click();
  await page.getByTestId("btn-delete-line").click();
  await page.getByTestId("dialog-delete-line-confirm").click();
  await expect(lineRow(page, secondLineKey)).toHaveCount(0);
  await expect(lineCell(page, firstLineKey, "CD_ITEM")).toHaveValue("ITM-1204");

  await page.reload();
  await searchSalesOrders(page);
  await page.getByTestId("btn-delete-line").click();
  await expect(page.getByTestId("dialog-delete-line")).toHaveCount(0);
  await expect(page.getByTestId("status-message")).not.toHaveText("조회되었습니다");
});

test("G: 기존 주요 버튼과 Lookup, Grid 행추가/삭제 동작을 유지한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  for (const testId of [
    "btn-search",
    "btn-new",
    "btn-save",
    "btn-delete-order",
    "btn-add-line",
    "btn-delete-line",
    "btn-partner-lookup",
    "btn-item-lookup"
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
  }

  await page.getByTestId("btn-partner-lookup").click();
  await expect(page.getByTestId("partner-lookup-search-input")).toBeVisible();
  await page.getByTestId("partner-lookup-cancel").click();

  await lineRow(page, firstLineKey).click();
  await page.getByTestId("btn-item-lookup").click();
  await expect(page.getByTestId("item-lookup-search-input")).toBeVisible();
  await page.getByTestId("item-lookup-cancel").click();

  await page.getByTestId("btn-new").click();
  await expect(page.getByTestId("sales-order-header-grid-footer-total")).toHaveText(/3/);
  await page.getByTestId("btn-add-line").click();
  await expect(page.getByTestId("sales-order-line-grid-footer-total")).toHaveText(/1/);

  await page.getByTestId("btn-delete-line").click();
  await expect(page.getByTestId("dialog-delete-line")).toBeVisible();
  await page.getByTestId("dialog-delete-line-cancel").click();

  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("sales-order-header-grid-row-1000::TEMP_SO_001")).toHaveCount(0);
  await page.getByTestId("btn-delete-order").click();
  await expect(page.getByTestId("sales-order-header-grid-footer-total")).toHaveText(/2/);
});
