import { expect, test } from "@playwright/test";

test("API UI: work order lookup, save warning, and delete", async ({ page }) => {
  const workOrderRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/work-orders") && ["POST", "PUT", "DELETE"].includes(request.method())) {
      workOrderRequests.push(request.method());
    }
  });

  await page.goto("/");
  await page.getByTestId("nav-work-order").click();
  await page.getByTestId("wo-btn-new").click();
  await page.getByTestId("wo-btn-add-process").click();
  await page.getByTestId("wo-btn-item-lookup").click();
  await page.getByTestId("wo-item-lookup-grid-row-1000::ITM-1001").click();
  await page.getByTestId("wo-item-lookup-confirm").click();
  await page.getByTestId("wo-btn-line-lookup").click();
  await page.getByTestId("wo-line-lookup-grid-row-1000::LINE-A").click();
  await page.getByTestId("wo-line-lookup-confirm").click();
  await expect(page.getByTestId("wo-btn-process-lookup")).toHaveCount(0);
  await page.getByTestId(/work-order-process-grid-cell-container-1000::TEMP-WO-\d+::10-CD_PROC/).dblclick();
  await page.getByTestId("wo-process-lookup-grid-row-1000::PROC-010").click();
  await page.getByTestId("wo-process-lookup-confirm").click();
  await expect(page.getByTestId("wo-btn-equipment-lookup")).toHaveCount(0);
  await page.getByTestId(/work-order-process-grid-cell-container-1000::TEMP-WO-\d+::10-CD_EQUIP/).dblclick();
  await page.getByTestId("wo-equipment-lookup-grid-row-1000::EQ-A01").click();
  await page.getByTestId("wo-equipment-lookup-confirm").click();

  const temporaryHeader = page.getByTestId(/work-order-header-grid-cell-1000::TEMP-WO-\d+-QT_WO/);
  const temporaryProcess = page.getByTestId(/work-order-process-grid-cell-1000::TEMP-WO-\d+::10-QT_PLAN/);
  await temporaryHeader.fill("3");
  await page.getByTestId(/work-order-header-grid-cell-1000::TEMP-WO-\d+-QT_RESULT/).fill("4");
  await temporaryProcess.fill("3");
  await page.getByTestId(/work-order-process-grid-cell-1000::TEMP-WO-\d+::10-QT_RESULT/).fill("4");

  let injectedFailureCount = 0;
  const createFailure = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "POST") return route.continue();
    injectedFailureCount += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "temporary save failure" }) });
  };
  await page.route("**/api/work-orders", createFailure);
  await page.getByTestId("wo-btn-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("status-message")).toContainText("temporary save failure");
  await expect(page.getByTestId("wo-btn-save")).toBeEnabled();
  expect(injectedFailureCount).toBe(1);
  await page.unroute("**/api/work-orders", createFailure);

  await page.getByTestId("wo-btn-save").click();
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/work-orders") && response.request().method() === "POST");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect((await createResponse).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText("저장되었습니다.");
  await expect(page.getByRole("status")).toContainText("실적수량");
  await expect(page.getByTestId("work-order-warning")).toContainText("실적수량");

  const savedHeader = page.getByTestId(/work-order-header-grid-cell-1000::WO\d+-QT_WO/).first();
  const savedProcess = page.getByTestId(/work-order-process-grid-cell-1000::WO\d+::10-QT_PLAN/).first();
  await savedHeader.fill("5");
  await savedProcess.fill("5");
  await page.getByTestId("wo-btn-save").click();
  const updateResponse = page.waitForResponse((response) => response.url().includes("/api/work-orders/") && response.request().method() === "PUT");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect((await updateResponse).status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("저장되었습니다.");
  await page.getByTestId("wo-btn-search").click();
  await expect(savedHeader).toHaveValue("5");

  await page.getByTestId("wo-btn-delete").click();
  await page.getByTestId("confirm-dialog-cancel").click();
  await page.getByTestId("wo-btn-delete").click();
  const deleteResponse = page.waitForResponse((response) => response.url().includes("/api/work-orders/") && response.request().method() === "DELETE");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
  await expect(workOrderRequests).toEqual(["POST", "POST", "PUT", "DELETE"]);
});
