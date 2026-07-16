import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const headerRowKey = "1000::SO2026070001";
const firstLineKey = "1000::SO2026070001::1";
const secondLineKey = "1000::SO2026070001::2";

function headerRow(page: Page, rowKey = headerRowKey) {
  return page.getByTestId(`sales-order-header-grid-row-${rowKey}`);
}

function headerCell(page: Page, rowKey: string, field: string) {
  return page.getByTestId(`sales-order-header-grid-cell-${rowKey}-${field}`);
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
  test.setTimeout(60_000);
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await page.getByTestId(`sales-order-line-grid-checkbox-${firstLineKey}`).check();
  await page.getByTestId(`sales-order-line-grid-checkbox-${secondLineKey}`).check();
  await page.getByTestId("btn-delete-line").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("선택한 수주상세 2건");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("sales-order-line-grid-footer-total")).toHaveText(/0/);

  await page.reload();
  await searchSalesOrders(page);
  await lineRow(page, firstLineKey).click();
  await page.getByTestId("btn-delete-line").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(lineRow(page, secondLineKey)).toHaveCount(0);
  await expect(lineCell(page, firstLineKey, "CD_ITEM")).toHaveValue("ITM-1204");

  await page.reload();
  await searchSalesOrders(page);
  await page.getByTestId("btn-delete-line").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
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
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();

  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("dialog-validation-summary")).toBeVisible();
  await page.getByTestId("dialog-validation-close").click();
  await expect(page.getByTestId("sales-order-header-grid-row-1000::TEMP_SO_001")).toHaveCount(1);
  await page.getByTestId("btn-delete-order").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("sales-order-header-grid-footer-total")).toHaveText(/2/);
});

test("Validation A: Header 필수값 누락 시 저장을 중단하고 오류를 표시한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await headerCell(page, headerRowKey, "CD_PARTNER").fill("");
  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("dialog-validation-summary")).toBeVisible();
  await expect(page.getByTestId("validation-summary-list")).toContainText("거래처코드은(는) 필수 입력값입니다.");
  await expect(
    page.getByTestId(`sales-order-header-grid-cell-container-${headerRowKey}-CD_PARTNER`)
  ).toHaveClass(/erp-data-grid__cell--invalid/);
  await expect(headerRow(page)).toHaveCount(1);
});

test("Validation B: 상세 필수값 누락 시 오류 셀을 강조하고 저장을 중단한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.getByTestId("btn-add-line").click();

  const newLineKey = "1000::SO2026070001::3";
  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("dialog-validation-summary")).toBeVisible();
  await expect(page.getByTestId("validation-summary-list")).toContainText("품목코드은(는) 필수 입력값입니다.");
  await expect(
    page.getByTestId(`sales-order-line-grid-cell-container-${newLineKey}-CD_ITEM`)
  ).toHaveClass(/erp-data-grid__cell--invalid/);
});

test("Validation C: 수량이 0이면 오류 메시지와 함께 저장을 중단한다", async ({ page }) => {
  test.setTimeout(60_000);
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await lineCell(page, firstLineKey, "QT_SO").fill("0");
  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("dialog-validation-summary")).toBeVisible();
  await expect(page.getByTestId("validation-summary-list")).toContainText("수량은 0보다 커야 합니다.");
  await expect(
    page.getByTestId(`sales-order-line-grid-cell-container-${firstLineKey}-QT_SO`)
  ).toHaveClass(/erp-data-grid__cell--invalid/);
});

test("Validation D: 단가가 음수이면 오류 메시지와 함께 저장을 중단한다", async ({ page }) => {
  test.setTimeout(60_000);
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await lineCell(page, firstLineKey, "UM_SO").fill("-1");
  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("dialog-validation-summary")).toBeVisible();
  await expect(page.getByTestId("validation-summary-list")).toContainText("단가은(는) 0 이상이어야 합니다.");
  await expect(
    page.getByTestId(`sales-order-line-grid-cell-container-${firstLineKey}-UM_SO`)
  ).toHaveClass(/erp-data-grid__cell--invalid/);
});

test("Validation E: 오류 값을 수정하면 오류 표시가 즉시 해제된다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await lineCell(page, firstLineKey, "QT_SO").fill("0");
  await page.getByTestId("btn-save").click();
  await page.getByTestId("dialog-validation-close").click();
  const quantityCell = page.getByTestId(
    `sales-order-line-grid-cell-container-${firstLineKey}-QT_SO`
  );
  await expect(quantityCell).toHaveClass(/erp-data-grid__cell--invalid/);

  await lineCell(page, firstLineKey, "QT_SO").fill("1");
  await expect(quantityCell).not.toHaveClass(/erp-data-grid__cell--invalid/);
  await expect(page.getByTestId("validation-error-count")).toHaveCount(0);
});

test("Validation F: 정상 입력값이면 mock 저장 성공 메시지를 표시하고 화면을 저장한다", async ({ page }, testInfo) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하시겠습니까?");
  await page.getByTestId("confirm-dialog-confirm").click();

  await expect(page.getByTestId("dialog-validation-summary")).toHaveCount(0);
  await expect(page.getByTestId("status-message")).toHaveText("저장되었습니다");
  await page.screenshot({ path: testInfo.outputPath("sales-order-validation-success.png"), fullPage: true });
});

test("UX A: 저장 확인을 취소하면 저장하지 않고, 확인하면 알림을 표시한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineCell(page, firstLineKey, "QT_SO").fill("3");

  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하시겠습니까?");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("status-message")).not.toHaveText("저장되었습니다");

  await page.getByTestId("btn-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByRole("status")).toContainText("저장되었습니다.");
});

test("UX B: 변경 중 Header 이동은 계속 편집 또는 폐기를 선택할 수 있다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineCell(page, firstLineKey, "QT_SO").fill("3");

  await headerRow(page, "1000::SO2026070002").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항이 있습니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(lineRow(page, firstLineKey)).toBeVisible();

  await headerRow(page, "1000::SO2026070002").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(lineRow(page, "1000::SO2026070002::1")).toBeVisible();
});

async function openMailImport(page: Page) {
  await page.getByTestId("btn-mail-import").click();
  await expect(page.getByTestId("mail-order-import-dialog")).toBeVisible();
}

async function analyzeMail(page: Page, mailId: string) {
  await page.getByTestId(`mail-import-mail-${mailId}`).click();
  await page.getByTestId("mail-import-analyze").click();
  await expect(page.getByTestId("mail-import-preview")).toBeVisible();
}

test("Mail A: 정상 수주 메일을 분석하고 신규 수주로 반영한다", async ({ page }, testInfo) => {
  await openSalesOrder(page);
  await openMailImport(page);
  await analyzeMail(page, "mock-mail-normal-001");

  await expect(page.getByTestId("mail-import-result-status")).toHaveText("분석 결과: 성공");
  await expect(page.getByTestId("mail-import-header-preview")).toContainText("P-10021");
  await expect(page.getByTestId("mail-import-preview-line-1")).toContainText("ITM-1001");
  await page.getByTestId("mail-import-apply").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("자동 저장되지 않습니다");
  await page.getByTestId("confirm-dialog-confirm").click();

  const importedHeaderKey = "1000::TEMP_SO_001";
  const importedLineKey = "1000::TEMP_SO_001::1";
  await expect(page.getByTestId("mail-order-import-dialog")).toHaveCount(0);
  await expect(headerCell(page, importedHeaderKey, "CD_PARTNER")).toHaveValue("P-10021");
  await expect(lineCell(page, importedLineKey, "CD_ITEM")).toHaveValue("ITM-1001");
  await page.screenshot({ path: testInfo.outputPath("mail-order-import-success.png"), fullPage: true });
});

test("Mail B: 여러 품목 수주 메일은 상세행을 2건 이상 미리보기로 표시한다", async ({ page }) => {
  await openSalesOrder(page);
  await openMailImport(page);
  await analyzeMail(page, "mock-mail-multiple-002");

  await expect(page.getByTestId("mail-import-result-status")).toHaveText("분석 결과: 성공");
  await expect(page.getByTestId("mail-import-preview-line-1")).toContainText("ITM-1204");
  await expect(page.getByTestId("mail-import-preview-line-2")).toContainText("ITM-1410");
});

test("Mail C: 거래처 누락 메일은 경고 또는 오류와 반영 불가 상태를 표시한다", async ({ page }) => {
  await openSalesOrder(page);
  await openMailImport(page);
  await analyzeMail(page, "mock-mail-partner-missing-003");

  await expect(page.getByTestId("mail-import-can-apply")).toHaveText("반영 불가");
  await expect(page.getByTestId("mail-import-error")).toContainText("거래처코드 또는 거래처명이 누락되었습니다.");
  await expect(page.getByTestId("mail-import-apply")).toBeDisabled();
});

test("Mail D: 수량 형식 오류는 원문을 0이나 1로 채우지 않고 오류로 표시한다", async ({ page }) => {
  await openSalesOrder(page);
  await openMailImport(page);
  await analyzeMail(page, "mock-mail-quantity-error-005");

  await expect(page.getByTestId("mail-import-error")).toContainText("수량 형식이 올바르지 않습니다: 세 개");
  await expect(page.getByTestId("mail-import-quantity-1")).toHaveText("-");
  await expect(page.getByTestId("mail-import-apply")).toBeDisabled();
});

test("Mail E: 수주와 관계없는 일반 메일은 분석 실패 및 반영 불가로 처리한다", async ({ page }) => {
  await openSalesOrder(page);
  await openMailImport(page);
  await analyzeMail(page, "mock-mail-general-006");

  await expect(page.getByTestId("mail-import-result-status")).toHaveText("분석 결과: 실패");
  await expect(page.getByTestId("mail-import-error")).toContainText("수주 메일 형식을 인식하지 못했습니다.");
  await expect(page.getByTestId("mail-import-apply")).toBeDisabled();
});

test("Mail F: 동일 MAIL_ID의 중복 반영을 차단한다", async ({ page }) => {
  await openSalesOrder(page);
  await openMailImport(page);
  await analyzeMail(page, "mock-mail-normal-001");
  await page.getByTestId("mail-import-apply").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("mail-order-import-dialog")).toHaveCount(0);

  await openMailImport(page);
  await analyzeMail(page, "mock-mail-normal-001");
  await page.getByTestId("mail-import-apply").click();
  await expect(page.getByTestId("mail-order-import-dialog")).toBeVisible();
  await expect(page.getByTestId("mail-import-notice")).toContainText("동일 MAIL_ID가 이미 반영되었습니다.");
});
