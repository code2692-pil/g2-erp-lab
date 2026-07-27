import { expect, test, type Page } from "@playwright/test";

function temporaryHeaderCell(page: Page, field: string) {
  return page.getByTestId(new RegExp(`work-order-header-grid-cell-1000::TEMP-WO-\\d+-${field}`));
}

function temporaryProcessCell(page: Page, field: string) {
  return page.getByTestId(new RegExp(`work-order-process-grid-cell-1000::TEMP-WO-\\d+::10-${field}`));
}

async function openNewWorkOrder(page: Page, addProcess = false) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("nav-work-order").click();
  await page.getByTestId("wo-btn-new").click();
  if (addProcess) await page.getByTestId("wo-btn-add-process").click();
}

function temporaryHeaderCellContainer(page: Page, field: string) {
  return page.getByTestId(new RegExp(`work-order-header-grid-cell-container-1000::TEMP-WO-\\d+-${field}`));
}

function temporaryProcessCellContainer(page: Page, field: string) {
  return page.getByTestId(new RegExp(`work-order-process-grid-cell-container-1000::TEMP-WO-\\d+::10-${field}`));
}

async function createWorkOrderDraftFromLookups(page: Page) {
  await test.step("화면 진입과 Lookup 선택", async () => {
    await openNewWorkOrder(page, true);

    await temporaryHeaderCellContainer(page, "CD_ITEM").dblclick();
    await page.getByTestId("wo-item-lookup-grid-row-1000::ITM-1001").click();
    await page.getByTestId("wo-item-lookup-confirm").click();
    await Promise.all([
      expect(temporaryHeaderCell(page, "CD_ITEM")).toHaveValue("ITM-1001"),
      expect(temporaryHeaderCell(page, "NM_ITEM")).toHaveValue(/\S/),
      expect(temporaryHeaderCell(page, "STND_ITEM")).toHaveValue(/\S/),
      expect(temporaryHeaderCell(page, "UNIT_ITEM")).toHaveValue(/\S/)
    ]);

    await temporaryHeaderCellContainer(page, "CD_LINE").dblclick();
    await page.getByTestId("wo-line-lookup-grid-row-1000::LINE-A").click();
    await page.getByTestId("wo-line-lookup-confirm").click();
    await Promise.all([
      expect(temporaryHeaderCell(page, "CD_LINE")).toHaveValue("LINE-A"),
      expect(temporaryHeaderCell(page, "NM_LINE")).toHaveValue(/\S/)
    ]);

    await temporaryProcessCellContainer(page, "CD_PROC").dblclick();
    await page.getByTestId("wo-process-lookup-grid-row-1000::PROC-010").click();
    await page.getByTestId("wo-process-lookup-confirm").click();
    await Promise.all([
      expect(temporaryProcessCell(page, "CD_PROC")).toHaveValue("PROC-010"),
      expect(temporaryProcessCell(page, "NM_PROC")).toHaveValue(/\S/)
    ]);

    await temporaryProcessCellContainer(page, "CD_EQUIP").dblclick();
    await page.getByTestId("wo-equipment-lookup-grid-row-1000::EQ-A01").click();
    await page.getByTestId("wo-equipment-lookup-confirm").click();
    await Promise.all([
      expect(temporaryProcessCell(page, "CD_EQUIP")).toHaveValue("EQ-A01"),
      expect(temporaryProcessCell(page, "NM_EQUIP")).toHaveValue(/\S/)
    ]);

    await temporaryHeaderCell(page, "QT_WO").fill("3");
    await temporaryHeaderCell(page, "QT_RESULT").fill("4");
    await temporaryProcessCell(page, "QT_PLAN").fill("3");
    await temporaryProcessCell(page, "QT_RESULT").fill("4");
  });
}

test("API UI: work order item and production line lookup", async ({ page }) => {
  await test.step("Header Lookup", async () => {
    await openNewWorkOrder(page);
    await page.getByTestId("wo-btn-item-lookup").click();
    await page.getByTestId("wo-item-lookup-grid-row-1000::ITM-1001").click();
    await page.getByTestId("wo-item-lookup-confirm").click();
    await expect(temporaryHeaderCell(page, "CD_ITEM")).toHaveValue("ITM-1001");
    await page.getByTestId("wo-btn-line-lookup").click();
    await page.getByTestId("wo-line-lookup-grid-row-1000::LINE-A").click();
    await page.getByTestId("wo-line-lookup-confirm").click();
    await expect(temporaryHeaderCell(page, "CD_LINE")).toHaveValue("LINE-A");
  });
});

test("API UI: work order process and equipment lookup", async ({ page }) => {
  await test.step("공정과 설비 Lookup", async () => {
    await openNewWorkOrder(page, true);
    await expect(page.getByTestId("wo-btn-process-lookup")).toHaveCount(0);
    await temporaryProcessCell(page, "CD_PROC").dblclick();
    await page.getByTestId("wo-process-lookup-grid-row-1000::PROC-010").click();
    await page.getByTestId("wo-process-lookup-confirm").click();
    await expect(temporaryProcessCell(page, "CD_PROC")).toHaveValue("PROC-010");
    await expect(page.getByTestId("wo-btn-equipment-lookup")).toHaveCount(0);
    await temporaryProcessCell(page, "CD_EQUIP").dblclick();
    await page.getByTestId("wo-equipment-lookup-grid-row-1000::EQ-A01").click();
    await page.getByTestId("wo-equipment-lookup-confirm").click();
    await expect(temporaryProcessCell(page, "CD_EQUIP")).toHaveValue("EQ-A01");
  });
});

test("API UI: work order lookup, warning, and create", async ({ page }) => {
  const workOrderRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/work-orders") && ["POST", "PUT", "DELETE"].includes(request.method())) workOrderRequests.push(request.method());
  });
  await createWorkOrderDraftFromLookups(page);

  await test.step("신규 저장과 경고", async () => {
    await page.getByTestId("wo-btn-save").click();
    await expect(page.getByTestId("work-order-dialog-validation-summary")).toHaveCount(0);
    const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/work-orders") && response.request().method() === "POST");
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");
    await expect(page.getByRole("status")).toContainText("실적수량");
    await expect(page.getByTestId("work-order-warning")).toContainText("실적수량");
  });
  await expect(workOrderRequests).toEqual(["POST"]);
});

test("API UI: work order save failure recovery and retry", async ({ page }) => {
  const workOrderRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/work-orders") && ["POST", "PUT", "DELETE"].includes(request.method())) workOrderRequests.push(request.method());
  });
  const existingHeader = page.getByTestId("work-order-header-grid-row-1000::WO2026070004");
  const savedHeader = page.getByTestId("work-order-header-grid-cell-1000::WO2026070004-QT_WO");
  const savedProcess = page.getByTestId("work-order-process-grid-cell-1000::WO2026070004::10-QT_PLAN");
  const itemName = page.getByTestId("work-order-header-grid-cell-1000::WO2026070004-NM_ITEM");
  const lineName = page.getByTestId("work-order-header-grid-cell-1000::WO2026070004-NM_LINE");
  const processName = page.getByTestId("work-order-process-grid-cell-1000::WO2026070004::10-NM_PROC");
  const endpoint = "**/api/work-orders/1000/WO2026070004";
  await test.step("수정 대상 조회", async () => {
    await page.goto("/");
    await page.getByTestId("nav-work-order").click();
    await page.getByTestId("wo-btn-search").click();
    await expect(existingHeader).toBeVisible();
    await existingHeader.click();
    await expect(savedProcess).toBeVisible();
    await expect(itemName).toHaveValue(/\S/);
    await expect(lineName).toHaveValue(/\S/);
    await expect(processName).toHaveValue(/\S/);
  });
  await test.step("PUT 500 오류 복구", async () => {
    await savedHeader.fill("55");
    await savedProcess.fill("55");
    let failedPutCount = 0;
    const updateFailure = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "PUT") return route.continue();
      failedPutCount += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "temporary update failure" }) });
    };
    await page.route(endpoint, updateFailure);
    await page.getByTestId("wo-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("status-message")).toContainText("temporary update failure");
    await expect(page.getByTestId("wo-btn-save")).toBeEnabled();
    await expect(savedHeader).toHaveValue("55");
    await expect(savedProcess).toHaveValue("55");
    await expect(itemName).toHaveValue(/\S/);
    await expect(lineName).toHaveValue(/\S/);
    await expect(processName).toHaveValue(/\S/);
    expect(failedPutCount).toBe(1);
    await page.unroute(endpoint, updateFailure);
  });
  await test.step("정상 재저장과 재조회", async () => {
    const updateResponse = page.waitForResponse((response) => response.url().endsWith("/api/work-orders/1000/WO2026070004") && response.request().method() === "PUT");
    await page.getByTestId("wo-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await updateResponse).status()).toBe(200);
    await page.getByTestId("wo-btn-search").click();
    await expect(existingHeader).toBeVisible();
    await existingHeader.click();
    await expect(savedHeader).toHaveValue("55");
    await expect(savedProcess).toHaveValue("55");
  });
  await expect(workOrderRequests).toEqual(["PUT", "PUT"]);
});

test("API UI: work order delete cancel and confirm", async ({ page }) => {
  const workOrderRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/work-orders") && ["POST", "PUT", "DELETE"].includes(request.method())) workOrderRequests.push(request.method());
  });
  const existingHeader = page.getByTestId("work-order-header-grid-row-1000::WO2026070005");
  await test.step("삭제 대상 조회", async () => {
    await page.goto("/");
    await page.getByTestId("nav-work-order").click();
    await page.getByTestId("wo-btn-search").click();
    await expect(existingHeader).toBeVisible();
    await existingHeader.click();
  });
  await test.step("삭제 취소", async () => {
    await page.getByTestId("wo-btn-delete").click();
    await page.getByTestId("confirm-dialog-cancel").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(existingHeader).toBeVisible();
    await expect(workOrderRequests).toEqual([]);
  });
  await test.step("삭제 확인", async () => {
    await page.getByTestId("wo-btn-delete").click();
    const deleteResponse = page.waitForResponse((response) => response.url().includes("/api/work-orders/") && response.request().method() === "DELETE");
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await deleteResponse).status()).toBe(204);
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
    await expect(existingHeader).toHaveCount(0);
    await expect(workOrderRequests).toEqual(["DELETE"]);
  });
});
