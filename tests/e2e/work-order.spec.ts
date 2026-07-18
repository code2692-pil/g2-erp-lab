import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const firstHeaderKey = "1000::WO2026070001";
const secondHeaderKey = "1000::WO2026070002";
const firstProcessKey = "1000::WO2026070001::10";
const secondProcessKey = "1000::WO2026070001::20";

function headerRow(page: Page, key = firstHeaderKey) {
  return page.getByTestId(`work-order-header-grid-row-${key}`);
}

function headerCell(page: Page, key: string, field: string) {
  return page.getByTestId(`work-order-header-grid-cell-${key}-${field}`);
}

function processRow(page: Page, key: string) {
  return page.getByTestId(`work-order-process-grid-row-${key}`);
}

function processCell(page: Page, key: string, field: string) {
  return page.getByTestId(`work-order-process-grid-cell-${key}-${field}`);
}

async function openWorkOrder(page: Page) {
  await page.goto("/");
  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
}

async function searchWorkOrders(page: Page) {
  await page.getByTestId("wo-btn-search").click();
  await expect(headerRow(page)).toBeVisible();
}

test("A: 생산관리 메뉴에서 작업지시 화면으로 이동하고 기존 화면과 전환한다", async ({ page }) => {
  await openWorkOrder(page);
  await page.getByTestId("nav-sales-order").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
});

test("B: 조회 결과와 Header-공정상세 연결, 결과 없음 안내를 표시한다", async ({ page }) => {
  await openWorkOrder(page);
  await searchWorkOrders(page);
  await headerRow(page).click();
  await expect(processRow(page, firstProcessKey)).toBeVisible();
  await expect(processRow(page, secondProcessKey)).toBeVisible();
  await expect(page.getByTestId("work-order-process-grid-footer-total")).toContainText("2");

  await page.getByTestId("wo-filter-no").fill("NO-SUCH-WO");
  await page.getByTestId("wo-btn-search").click();
  await expect(page.getByTestId("status-message")).toHaveText("조회된 작업지시가 없습니다.");
  await expect(page.getByTestId("work-order-header-grid-footer-total")).toContainText("0");
});

test("C: 신규 작업지시와 품목·라인·공정·설비 Lookup을 저장한다", async ({ page }, testInfo) => {
  await openWorkOrder(page);
  await page.getByTestId("wo-btn-new").click();

  const tempHeaderKey = "1000::TEMP-WO-001";
  const tempProcessKey = "1000::TEMP-WO-001::10";
  await expect(headerRow(page, tempHeaderKey)).toBeVisible();
  await expect(headerRow(page, tempHeaderKey)).toContainText("미확정");
  await expect(headerRow(page, tempHeaderKey)).toContainText("N");

  await page.getByTestId("wo-btn-item-lookup").click();
  await page.getByTestId("wo-item-lookup-grid-row-1000::ITM-1001").click();
  await page.getByTestId("wo-item-lookup-confirm").click();
  await page.getByTestId("wo-btn-line-lookup").click();
  await page.getByTestId("wo-line-lookup-grid-row-1000::LINE-A").click();
  await page.getByTestId("wo-line-lookup-confirm").click();

  await processRow(page, tempProcessKey).click();
  await page.getByTestId("wo-btn-process-lookup").click();
  await page.getByTestId("wo-process-lookup-grid-row-1000::PROC-010").click();
  await page.getByTestId("wo-process-lookup-confirm").click();
  await page.getByTestId("wo-btn-equipment-lookup").click();
  await page.getByTestId("wo-equipment-lookup-grid-row-1000::EQ-A01").click();
  await page.getByTestId("wo-equipment-lookup-confirm").click();

  await headerCell(page, tempHeaderKey, "QT_WO").fill("10");
  await processCell(page, tempProcessKey, "QT_PLAN").fill("10");
  await page.getByTestId("wo-btn-save").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("입력한 작업지시를 저장하시겠습니까?");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByRole("status")).toContainText("작업지시가 저장되었습니다.");
  await expect(page.getByTestId("work-order-header-grid-row-1000::WO2026070007")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("work-order-save-success.png"), fullPage: true });
});

test("D: 저장 전 Validation은 ConfirmDialog 없이 요약과 오류 셀을 표시한다", async ({ page }) => {
  await openWorkOrder(page);
  await page.getByTestId("wo-btn-new").click();
  await page.getByTestId("wo-btn-save").click();
  await expect(page.getByTestId("work-order-dialog-validation-summary")).toBeVisible();
  await expect(page.getByTestId("work-order-validation-summary-list")).toContainText("생산품목코드은(는) 필수 입력값입니다.");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("work-order-header-grid-cell-container-1000::TEMP-WO-001-CD_ITEM")).toHaveClass(/erp-data-grid__cell--invalid/);
  await page.getByTestId("work-order-dialog-validation-close").click();

  await headerCell(page, "1000::TEMP-WO-001", "DT_PLAN_START").fill("2026-07-11");
  await headerCell(page, "1000::TEMP-WO-001", "DT_PLAN_END").fill("2026-07-10");
  await page.getByTestId("wo-btn-save").click();
  await expect(page.getByTestId("work-order-validation-summary-list")).toContainText("계획시작일은 계획종료일보다 늦을 수 없습니다.");
});

test("E: 공정상세 행추가, 다중 삭제와 Footer 갱신을 처리한다", async ({ page }) => {
  test.setTimeout(60_000);
  await openWorkOrder(page);
  await searchWorkOrders(page);
  await expect(page.getByTestId("work-order-process-grid-footer-total")).toContainText("2");
  await page.getByTestId("wo-btn-add-process").click();
  const addedProcessKey = "1000::WO2026070001::30";
  await expect(processRow(page, addedProcessKey)).toBeVisible();
  await expect(page.getByTestId("work-order-process-grid-footer-total")).toContainText("3");

  await page.getByTestId(`work-order-process-grid-checkbox-${firstProcessKey}`).check();
  await page.getByTestId(`work-order-process-grid-checkbox-${secondProcessKey}`).check();
  await page.getByTestId("wo-btn-delete-process").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("공정상세 2건");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(processRow(page, firstProcessKey)).toBeVisible();

  await page.getByTestId("wo-btn-delete-process").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(processRow(page, firstProcessKey)).toHaveCount(0);
  await expect(processRow(page, secondProcessKey)).toHaveCount(0);
  await expect(page.getByTestId("work-order-process-grid-footer-total")).toContainText("1");
  await expect(page.getByRole("status")).toContainText("선택한 공정상세 2건이 삭제되었습니다.");
});

test("F: dirty 상태는 Header 선택과 메뉴 이동 전 변경사항 폐기를 확인한다", async ({ page }) => {
  await openWorkOrder(page);
  await searchWorkOrders(page);
  await headerCell(page, firstHeaderKey, "QT_WO").fill("101");

  await headerRow(page, secondHeaderKey).click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항이 있습니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(processRow(page, firstProcessKey)).toBeVisible();

  await headerRow(page, secondHeaderKey).click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(processRow(page, "1000::WO2026070002::10")).toBeVisible();
  await headerCell(page, secondHeaderKey, "QT_WO").fill("241");
  await page.getByTestId("nav-sales-order").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항이 있습니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("work-order-page-title")).toBeVisible();
  await page.getByTestId("nav-sales-order").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
});

test("G: Header 삭제와 저장 처리 중 버튼 비활성화를 확인한다", async ({ page }) => {
  await openWorkOrder(page);
  await page.getByTestId("wo-btn-delete").click();
  await expect(page.getByTestId("status-message")).toHaveText("선택된 작업지시가 없습니다.");
  await searchWorkOrders(page);

  await page.getByTestId("wo-btn-delete").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("연결된 공정상세도 함께 삭제됩니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(headerRow(page)).toBeVisible();
  await page.getByTestId("wo-btn-delete").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(headerRow(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("작업지시가 삭제되었습니다.");

  await page.reload();
  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
  await searchWorkOrders(page);
  await page.getByTestId("wo-btn-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("wo-btn-save")).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("작업지시가 저장되었습니다.");
});
