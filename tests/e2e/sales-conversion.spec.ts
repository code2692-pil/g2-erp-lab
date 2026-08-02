import { expect, test, type Page } from "@playwright/test";

const headerKey = "1000::SO2026070001";
const lineKey = "1000::SO2026070001::1";

async function selectSourceLine(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-header-grid-row-${headerKey}`).click();
  await page.getByTestId(`sales-order-line-grid-row-${lineKey}`).click();
}

test("수주상세를 공급처·창고 확인 후 부분 발주로 전환한다", async ({ page }) => {
  await selectSourceLine(page);
  await page.getByTestId("btn-convert-purchase").click();
  await expect(page.getByTestId("sales-to-purchase-dialog")).toBeVisible();
  await expect(page.getByTestId("purchase-conversion-supplier")).toHaveValue(/SUP-001/);

  await page.getByTestId("sales-to-purchase-dialog").getByRole("button", { name: "도움창" }).first().click();
  await page.getByTestId("purchase-conversion-supplier-lookup-search-input").fill("SUP-002");
  await page.getByTestId("purchase-conversion-supplier-lookup-search-button").click();
  await page.getByTestId("purchase-conversion-supplier-lookup-grid-row-1000:SUP-002").click();
  await page.getByTestId("purchase-conversion-supplier-lookup-confirm").click();
  await expect(page.getByTestId("purchase-conversion-supplier")).toHaveValue(/SUP-002/);

  await page.getByTestId("sales-to-purchase-dialog").getByRole("button", { name: "도움창" }).nth(1).click();
  await page.getByTestId("purchase-conversion-warehouse-lookup-search-input").fill("WH-RM-01");
  await page.getByTestId("purchase-conversion-warehouse-lookup-search-button").click();
  await page.getByTestId("purchase-conversion-warehouse-lookup-grid-row-1000:WH-RM-01").click();
  await page.getByTestId("purchase-conversion-warehouse-lookup-confirm").click();
  await expect(page.getByTestId("purchase-conversion-warehouse")).toHaveValue(/WH-RM-01/);

  await page.getByTestId("purchase-conversion-quantity-1").fill("5");
  await page.getByTestId("sales-to-purchase-submit").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("SUP-002");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("sales-to-purchase-result")).toContainText(/POR\d{10}/);
  await expect(page.getByTestId("sales-to-purchase-result")).toContainText("잔량 7");
  await expect(page.getByTestId("sales-to-purchase-navigate")).toBeVisible();
});

test("승인 BOM·공정경로를 미리 본 뒤 작업지시와 공정·자재 소요를 생성한다", async ({ page }) => {
  await selectSourceLine(page);
  await page.getByTestId("btn-convert-work").click();
  await expect(page.getByTestId("work-conversion-preview")).toContainText("공정 미리보기 (5)");
  await expect(page.getByTestId("work-conversion-preview")).toContainText("자재 소요 미리보기 (5)");
  const previousStart = await page.getByTestId("work-conversion-start").inputValue();
  await page.getByTestId("work-conversion-start").fill("2099-12-31");
  await expect(page.getByTestId("range-validation-dialog")).toBeVisible();
  await expect(page.getByTestId("work-conversion-start")).toHaveValue(previousStart);
  await page.getByTestId("range-validation-confirm").click();
  await expect(page.getByTestId("work-conversion-start")).toBeFocused();
  await page.getByTestId("work-conversion-quantity").fill("4");
  await page.getByTestId("work-conversion-line").selectOption("LINE-C");
  await page.getByTestId("sales-to-work-order-submit").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("승인된 BOM·공정경로 적용");
  await expect(page.getByTestId("confirm-dialog")).toContainText("LINE-C");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("sales-to-work-order-result")).toContainText(/WMO\d{10}/);
  await expect(page.getByTestId("sales-to-work-order-result")).toContainText("공정 5개, 자재 소요 5개");
  await expect(page.getByTestId("sales-to-work-order-result")).toContainText("잔량 8");
});
