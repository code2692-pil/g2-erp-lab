import { consumeWorkerPreparedPage, createWorkerWarmupTest, expect, type Page } from "./worker-frontend-warmup.fixture";

const test = createWorkerWarmupTest("sales");

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
  if (!consumeWorkerPreparedPage(page)) await page.goto("/", { waitUntil: "domcontentloaded" });
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
  await expect(page.getByTestId("sales-order-header-grid-total-count")).toHaveText("전체 2건");
  await headerRow(page).click();
  await expect(headerRow(page)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sales-order-header-grid-selected-document")).toHaveText("선택 문서 SO2026070001");
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 2건");
  const quantity = lineCell(page, firstLineKey, "QT_SO");
  await quantity.focus();
  await expect(quantity).toBeFocused();
  await expect(page.getByTestId(`sales-order-line-grid-cell-container-${firstLineKey}-AM_TOTAL`)).toHaveAttribute("aria-readonly", "true");

  await expect(lineRow(page, firstLineKey)).toBeVisible();
  await expect(lineRow(page, secondLineKey)).toBeVisible();
});

test("Gate 7: sales detail Enter and Tab follow editable cells without wrapping", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  const firstQuantity = lineCell(page, firstLineKey, "QT_SO");
  const secondQuantity = lineCell(page, secondLineKey, "QT_SO");
  const firstPrice = lineCell(page, firstLineKey, "UM_SO");

  await firstQuantity.fill("5");
  await firstQuantity.press("Enter");
  await expect(secondQuantity).toBeFocused();
  await secondQuantity.press("Shift+Enter");
  await expect(firstQuantity).toBeFocused();
  await firstQuantity.press("Tab");
  await expect(firstPrice).toBeFocused();
  await firstPrice.press("Shift+Tab");
  await expect(firstQuantity).toBeFocused();
  await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveText("수정됨");

  await page.getByTestId("btn-add-line").click();
  const newLineKey = "1000::SO2026070001::3";
  await expect(lineCell(page, newLineKey, "CD_ITEM")).toBeFocused();
});

test("Gate 7: detail navigation alone does not mark the sales order as changed", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  const quantity = lineCell(page, firstLineKey, "QT_SO");
  const price = lineCell(page, firstLineKey, "UM_SO");
  await quantity.focus();
  await quantity.press("Tab");

  await expect(price).toBeFocused();
  await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveCount(0);
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

test("B-1: 수주 거래처코드와 거래처명 Grid 더블클릭은 같은 Lookup으로 현재 행을 갱신한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  const rowKey = "1000::SO2026070001";
  const otherRowKey = "1000::SO2026070002";
  const otherPartnerCode = page.getByTestId(`sales-order-header-grid-cell-${otherRowKey}-CD_PARTNER`);
  const otherPartnerName = page.getByTestId(`sales-order-header-grid-cell-${otherRowKey}-NM_PARTNER`);
  const originalOtherPartnerCode = await otherPartnerCode.inputValue();
  const originalOtherPartnerName = await otherPartnerName.inputValue();

  await page.getByTestId(`sales-order-header-grid-cell-container-${rowKey}-CD_PARTNER`).dblclick();
  await expect(page.getByRole("dialog", { name: "거래처 도움창" })).toBeVisible();
  await page.getByTestId("partner-lookup-grid-row-1000::P-10044").click();
  await page.getByTestId("partner-lookup-confirm").click();
  await expect(page.getByTestId(`sales-order-header-grid-cell-${rowKey}-CD_PARTNER`)).toHaveValue("P-10044");
  await expect(page.getByTestId(`sales-order-header-grid-cell-${rowKey}-NM_PARTNER`)).toHaveValue("한빛산업");
  await expect(otherPartnerCode).toHaveValue(originalOtherPartnerCode);
  await expect(otherPartnerName).toHaveValue(originalOtherPartnerName);

  await page.getByTestId(`sales-order-header-grid-cell-container-${rowKey}-NM_PARTNER`).dblclick();
  await expect(page.getByRole("dialog", { name: "거래처 도움창" })).toBeVisible();
  await page.getByTestId("partner-lookup-cancel").click();
  await expect(page.getByTestId(`sales-order-header-grid-cell-${rowKey}-CD_PARTNER`)).toHaveValue("P-10044");
  await expect(page.getByTestId(`sales-order-header-grid-cell-${rowKey}-NM_PARTNER`)).toHaveValue("한빛산업");
});

test("C: 품목 Lookup은 선택한 수주상세 행만 갱신한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineRow(page, firstLineKey).click();

  await expect(page.getByTestId("btn-item-lookup")).toHaveCount(0);
  await page.getByTestId(`sales-order-line-grid-cell-container-${firstLineKey}-CD_ITEM`).dblclick();
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
  await expect(page.getByTestId("sales-order-line-grid-selected-count")).toHaveCount(0);
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
    "btn-partner-lookup"
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
  }

  await page.getByTestId("btn-partner-lookup").click();
  await expect(page.getByTestId("partner-lookup-search-input")).toBeVisible();
  await page.getByTestId("partner-lookup-cancel").click();

  await lineRow(page, firstLineKey).click();
  await expect(page.getByTestId("btn-item-lookup")).toHaveCount(0);
  await page.getByTestId(`sales-order-line-grid-cell-container-${firstLineKey}-CD_ITEM`).dblclick();
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
  await expect(page.getByTestId("sales-order-validation-summary")).toBeVisible();
  await expect(page.getByTestId("sales-order-header-grid-row-1000::TEMP_SO_001")).toHaveCount(1);
  await page.getByTestId("btn-delete-order").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("삭제되었습니다.");
  await expect(page.getByTestId("sales-order-header-grid-row-1000::TEMP_SO_001")).toHaveCount(1);
  await page.getByTestId("confirm-dialog-confirm").evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("sales-order-header-grid-footer-total")).toHaveText(/2/);
});

test("Validation A: Header 필수값 누락 시 저장을 중단하고 오류를 표시한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await headerCell(page, headerRowKey, "CD_PARTNER").fill("");
  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("sales-order-validation-summary")).toBeVisible();
  await expect(page.getByTestId("sales-order-validation-summary-first-message")).toContainText("거래처코드은(는) 필수 입력값입니다.");
  await expect(headerCell(page, headerRowKey, "CD_PARTNER")).toBeFocused();
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

  await expect(page.getByTestId("sales-order-validation-summary")).toBeVisible();
  await expect(page.getByTestId("sales-order-validation-summary-first-message")).toContainText("품목코드은(는) 필수 입력값입니다.");
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

  await expect(page.getByTestId("sales-order-validation-summary")).toBeVisible();
  await expect(page.getByTestId("sales-order-validation-summary-first-message")).toContainText("수량은 0보다 커야 합니다.");
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

  await expect(page.getByTestId("sales-order-validation-summary")).toBeVisible();
  await expect(page.getByTestId("sales-order-validation-summary-first-message")).toContainText("단가은(는) 0 이상이어야 합니다.");
  await expect(
    page.getByTestId(`sales-order-line-grid-cell-container-${firstLineKey}-UM_SO`)
  ).toHaveClass(/erp-data-grid__cell--invalid/);
});

test("Validation E: 오류 값을 수정하면 오류 표시가 즉시 해제된다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await headerCell(page, headerRowKey, "CD_PARTNER").fill("");
  await lineCell(page, firstLineKey, "QT_SO").fill("0");
  await page.getByTestId("btn-save").click();
  const quantityCell = page.getByTestId(
    `sales-order-line-grid-cell-container-${firstLineKey}-QT_SO`
  );
  const partnerCell = page.getByTestId(
    `sales-order-header-grid-cell-container-${headerRowKey}-CD_PARTNER`
  );
  await expect(quantityCell).toHaveClass(/erp-data-grid__cell--invalid/);
  await expect(partnerCell).toHaveClass(/erp-data-grid__cell--invalid/);

  await lineCell(page, firstLineKey, "QT_SO").fill("1");
  await expect(quantityCell).not.toHaveClass(/erp-data-grid__cell--invalid/);
  await expect(partnerCell).toHaveClass(/erp-data-grid__cell--invalid/);
  await expect(page.getByTestId("sales-order-validation-summary-count")).toHaveText("입력 오류 1건");
});

test("Validation F: 정상 입력값이면 저장 완료 대화상자 확인 후 화면을 저장한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);

  await page.getByTestId("btn-save").click();

  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하시겠습니까?");
  await page.getByTestId("confirm-dialog-confirm").click();

  await expect(page.getByTestId("confirm-dialog")).toContainText("저장되었습니다.");
  await page.getByTestId("confirm-dialog-confirm").press("Enter");
  await expect(page.getByTestId("sales-order-validation-summary")).toHaveCount(0);
  await expect(page.getByTestId("status-message")).toHaveText("저장되었습니다.");
});

test("UX A: 저장 확인 취소와 완료 대화상자의 후속 처리 및 접근성을 보장한다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineCell(page, firstLineKey, "QT_SO").fill("3");

  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하시겠습니까?");
  expect(await page.getByTestId("confirm-dialog").locator("button").evaluateAll(
    (buttons) => buttons.map((button) => button.getAttribute("data-testid")).filter(Boolean)
  )).toEqual(["confirm-dialog-confirm", "confirm-dialog-cancel"]);
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("status-message")).not.toHaveText("저장되었습니다");

  await page.getByTestId("btn-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  const resultDialog = page.getByRole("dialog", { name: "저장 완료" });
  const resultConfirm = resultDialog.getByTestId("confirm-dialog-confirm");
  await expect(resultDialog).toContainText("저장되었습니다.");
  await expect(page.getByTestId("sales-order-dirty-indicator")).toBeVisible();
  await expect(resultDialog.getByTestId("confirm-dialog-cancel")).toHaveCount(0);
  await expect(resultDialog.getByRole("button", { name: "저장 완료 닫기" })).toHaveCount(0);
  await expect(resultConfirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(resultConfirm).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(resultConfirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(resultDialog).toBeVisible();
  await page.locator(".erp-dialog-backdrop").click({ position: { x: 2, y: 2 } });
  await expect(resultDialog).toBeVisible();
  await resultConfirm.press("Space");
  await expect(resultDialog).toHaveCount(0);
  await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveCount(0);
  await expect(page.locator(".erp-snackbar--success")).toHaveCount(0);
});

test("UX B: 변경 중 Header 이동은 계속 편집 또는 폐기를 선택할 수 있다", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineCell(page, firstLineKey, "QT_SO").fill("3");

  await page.getByTestId("sales-order-header-grid-cell-container-1000::SO2026070002-DT_SO").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항이 있습니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(lineRow(page, firstLineKey)).toBeVisible();

  await page.getByTestId("sales-order-header-grid-cell-container-1000::SO2026070002-DT_SO").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(lineRow(page, "1000::SO2026070002::1")).toBeVisible();
});

test("Dirty guard: sales search keeps edits on cancel and clears state after discard", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await lineCell(page, firstLineKey, "QT_SO").fill("3");

  await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveText("수정됨");
  await page.getByTestId("btn-search").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(lineCell(page, firstLineKey, "QT_SO")).toHaveValue("3");
  await expect(page.getByTestId("sales-order-dirty-indicator")).toBeVisible();

  await page.getByTestId("btn-search").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(headerRow(page)).toBeVisible();
  await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveCount(0);
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

test("Mail A: 정상 수주 메일을 분석하고 신규 수주로 반영한다", async ({ page }) => {
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

test("Paste: detail grid applies a valid clipboard matrix atomically and adds rows", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t2\t100\nITM-1204\tignored\tignored\tignored\t3\t200"));
  await lineCell(page, secondLineKey, "CD_ITEM").click();
  await page.keyboard.press("Control+V");

  await expect(lineCell(page, secondLineKey, "CD_ITEM")).toHaveValue("ITM-1001");
  await expect(lineCell(page, secondLineKey, "NM_ITEM")).not.toHaveValue("ignored");
  await expect(lineCell(page, "1000::SO2026070001::3", "CD_ITEM")).toHaveValue("ITM-1204");
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 3건");
});

test("Paste: an invalid lookup code leaves sales detail rows unchanged", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const before = await lineCell(page, secondLineKey, "CD_ITEM").inputValue();
  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t2\t100\nNOT-FOUND\tignored\tignored\tignored\t3\t200"));
  await lineCell(page, secondLineKey, "CD_ITEM").click();
  await page.keyboard.press("Control+V");

  await expect(lineCell(page, secondLineKey, "CD_ITEM")).toHaveValue(before);
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 2건");
  await expect(page.getByRole("alert")).toContainText("붙여넣기 실패");
});

test("Paste: a middle blank row is preserved as an empty detail row", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("first note\n\nthird note"));
  await lineCell(page, secondLineKey, "DC_RMK").click();
  await page.keyboard.press("Control+V");

  await expect(lineCell(page, secondLineKey, "DC_RMK")).toHaveValue("first note");
  await expect(lineCell(page, "1000::SO2026070001::4", "DC_RMK")).toHaveValue("third note");
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 4건");
});

test("Gate 3: whitespace-only paste is rejected and the next Unicode paste recovers", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const remark = lineCell(page, secondLineKey, "DC_RMK");
  const before = await remark.inputValue();

  await page.evaluate(() => navigator.clipboard.writeText("   "));
  await remark.click();
  await page.keyboard.press("Control+V");

  await expect(remark).toHaveValue(before);
  await expect(page.getByRole("alert")).toContainText("붙여넣기 실패");

  await page.evaluate(() => navigator.clipboard.writeText("테스트 🚀 / Ω"));
  await remark.click();
  await page.keyboard.press("Control+V");
  await expect(remark).toHaveValue("테스트 🚀 / Ω");
});

test("Gate 3: parser row and cell limits reject a matrix before changing detail rows", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const remark = lineCell(page, secondLineKey, "DC_RMK");
  const before = await remark.inputValue();

  await page.evaluate((matrix) => navigator.clipboard.writeText(matrix), Array.from({ length: 1_001 }, () => "row").join("\n"));
  await remark.click();
  await page.keyboard.press("Control+V");
  await expect(remark).toHaveValue(before);
  await expect(page.locator(".erp-snackbar--error")).toContainText("붙여넣기 실패");
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 2건");

  await page.evaluate((matrix) => navigator.clipboard.writeText(matrix), Array.from({ length: 20_001 }, () => "cell").join("\t"));
  await remark.click();
  await page.keyboard.press("Control+V");
  await expect(remark).toHaveValue(before);
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 2건");
});

test("Gate 3: rapid repeated Ctrl+V keeps one deterministic detail transaction", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("first\nsecond"));
  await lineCell(page, secondLineKey, "DC_RMK").click();
  await page.keyboard.down("Control");
  await page.keyboard.press("v");
  await page.keyboard.press("v");
  await page.keyboard.up("Control");

  await expect(lineCell(page, secondLineKey, "DC_RMK")).toHaveValue("first");
  await expect(lineCell(page, "1000::SO2026070001::3", "DC_RMK")).toHaveValue("second");
  await expect(page.getByTestId("sales-order-line-grid-row-1000::SO2026070001::3")).toHaveCount(1);
  await expect(page.getByTestId("sales-order-line-grid-total-count")).toHaveText("전체 3건");
});

test("Gate 3: header grid retains its normal single-cell clipboard behavior", async ({ page }) => {
  await openSalesOrder(page);
  await searchSalesOrders(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const partnerCode = headerCell(page, headerRowKey, "CD_PARTNER");

  await page.evaluate(() => navigator.clipboard.writeText("P-10021"));
  await partnerCode.click();
  await page.keyboard.press("Control+V");

  await expect(partnerCode).toHaveValue("P-10021P-10021");
  await expect(page.locator(".erp-snackbar--error")).toHaveCount(0);
});
