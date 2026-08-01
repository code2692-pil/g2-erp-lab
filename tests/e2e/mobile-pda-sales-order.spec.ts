import { expect, test, type Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, { console: string[]; page: string[] }>();

test.beforeEach(async ({ page }) => {
  const errors = { console: [] as string[], page: [] as string[] };
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
});

test.afterEach(async ({ page }) => {
  const errors = runtimeErrors.get(page);
  expect(errors?.console ?? []).toEqual([]);
  expect(errors?.page ?? []).toEqual([]);
});

async function choosePartner(page: Page, prefix: "mobile-sales" | "pda-sales", code = "P-10021") {
  await page.getByTestId(`${prefix}-partner-lookup`).click();
  await page.getByTestId(`${prefix}-partner-dialog-search-input`).fill(code);
  await page.getByTestId(`${prefix}-partner-dialog-search-button`).click();
  await page.getByTestId(`${prefix}-partner-dialog-grid-row-1000::${code}`).click();
  await page.getByTestId(`${prefix}-partner-dialog-confirm`).click();
}

async function chooseItem(
  page: Page,
  prefix: "mobile-sales" | "pda-sales",
  code = "ITM-1001"
) {
  await page.getByTestId(`${prefix}-item-dialog-search-input`).fill(code);
  await page.getByTestId(`${prefix}-item-dialog-search-button`).click();
  await page.getByTestId(`${prefix}-item-dialog-grid-row-1000::${code}`).click();
  await page.getByTestId(`${prefix}-item-dialog-confirm`).click();
}

async function saveCompactOrder(page: Page, prefix: "mobile-sales" | "pda-sales") {
  await page.getByTestId(`${prefix}-save`).click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장되었습니다.");
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId(`${prefix}-message`)).toHaveText("저장되었습니다.");
  await expect(page.getByTestId(`${prefix}-dirty-indicator`)).toHaveCount(0);
  return page.getByTestId(`${prefix}-order-no`).inputValue();
}

test("Gate 12-8 mobile A: queries card results and opens the same sales header and lines", async ({ page }) => {
  await page.goto("/mobile/sales-orders");
  await expect(page.getByTestId("page-title")).toHaveText("모바일 수주등록 PoC");
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId("mobile-sales-result-SO2026070001")).toBeVisible();
  await page.getByTestId("mobile-sales-result-SO2026070001").click();
  await expect(page.getByTestId("mobile-sales-order-no")).toHaveValue("SO2026070001");
  await expect(page.getByTestId("mobile-sales-partner")).toHaveValue(/세명테크/);
  await expect(page.getByTestId("mobile-sales-line-1")).toContainText("산업용 컨트롤러 A");
  await expect(page.getByTestId("mobile-sales-line-2")).toContainText("센서 모듈 B");
  await expect(page.getByTestId("mobile-sales-totals")).toContainText("5,676,000원");
});

test("Gate 12-8 mobile B: creates, saves, and requeries through partner and item dialogs", async ({ page }) => {
  await page.goto("/mobile/sales-orders");
  await page.getByTestId("mobile-sales-new").click();
  await choosePartner(page, "mobile-sales");
  await page.getByTestId("mobile-sales-add-line").click();
  await chooseItem(page, "mobile-sales", "ITM-1204");
  await page.getByTestId("mobile-sales-line-quantity-1").fill("3");
  await page.getByTestId("mobile-sales-line-price-1").fill("1000");
  await expect(page.getByTestId("mobile-sales-line-amount-1")).toHaveValue("3,300");
  await expect(page.getByTestId("mobile-sales-totals")).toContainText("3,300원");

  const savedOrderNo = await saveCompactOrder(page, "mobile-sales");
  expect(savedOrderNo).toMatch(/^SOR\d{10}$/);
  await page.getByTestId("mobile-sales-back-list").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(savedOrderNo);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId(`mobile-sales-result-${savedOrderNo}`)).toBeVisible();
});

test("Gate 12-8 mobile C: blocks invalid save and protects unsaved navigation", async ({ page }) => {
  const apiSaveRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/sales-orders")) {
      apiSaveRequests.push(request.url());
    }
  });
  await page.goto("/mobile/sales-orders");
  await page.getByTestId("mobile-sales-new").click();
  await page.getByTestId("mobile-sales-save").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("mobile-sales-validation-count")).toContainText("입력 오류");
  await expect(page.getByTestId("mobile-sales-partner")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("mobile-sales-partner")).toBeFocused();
  expect(apiSaveRequests).toEqual([]);

  await choosePartner(page, "mobile-sales");
  await page.getByTestId("mobile-sales-nav-pda").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항이 있습니다.");
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
  await expect(page.getByTestId("mobile-sales-partner")).toHaveValue(/세명테크/);
  await page.getByTestId("mobile-sales-nav-pda").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("pda-sales-page")).toBeVisible();
});

test("Gate 12-8 PDA A: Enter moves item to quantity to price and adds a line", async ({ page }) => {
  await page.goto("/pda/sales-orders");
  await page.getByTestId("pda-sales-new").click();
  await choosePartner(page, "pda-sales");
  await page.getByTestId("pda-sales-quick-item").fill("ITM-1001");
  await page.getByTestId("pda-sales-quick-item").press("Enter");
  await expect(page.getByTestId("pda-sales-quick-quantity")).toBeFocused();
  await page.getByTestId("pda-sales-quick-quantity").fill("2");
  await page.getByTestId("pda-sales-quick-quantity").press("Enter");
  await expect(page.getByTestId("pda-sales-quick-price")).toBeFocused();
  await page.getByTestId("pda-sales-quick-price").fill("1500");
  await page.getByTestId("pda-sales-quick-price").press("Enter");
  await expect(page.getByTestId("pda-sales-line-1")).toContainText("산업용 컨트롤러 A");
  await expect(page.getByTestId("pda-sales-totals")).toContainText("3,300원");
  await expect(page.getByTestId("pda-sales-quick-item")).toBeFocused();
});

test("Gate 12-8 PDA B: rejects an unknown item and recalculates after line edits", async ({ page }) => {
  await page.goto("/pda/sales-orders");
  await page.getByTestId("pda-sales-new").click();
  await page.getByTestId("pda-sales-quick-item").fill("UNKNOWN-ITEM");
  await page.getByTestId("pda-sales-quick-item").press("Enter");
  await expect(page.getByTestId("pda-sales-quick-error")).toContainText("사용 가능한 품목코드");
  await expect(page.getByTestId("pda-sales-empty-lines")).toBeVisible();

  await page.getByTestId("pda-sales-quick-item").fill("ITM-1204");
  await page.getByTestId("pda-sales-quick-item").press("Enter");
  await page.getByTestId("pda-sales-quick-quantity").fill("4");
  await page.getByTestId("pda-sales-quick-quantity").press("Enter");
  await page.getByTestId("pda-sales-quick-price").fill("500");
  await page.getByTestId("pda-sales-quick-price").press("Enter");
  await expect(page.getByTestId("pda-sales-totals")).toContainText("2,200원");
  await page.getByTestId("pda-sales-line-quantity-1").fill("5");
  await expect(page.getByTestId("pda-sales-line-amount-1")).toHaveValue("2,750");
  await page.getByTestId("pda-sales-delete-line-1").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("pda-sales-empty-lines")).toBeVisible();
});

test("Gate 12-8 shared data: PC save, mobile update, PDA update, and PC requery use one source", async ({ page }, testInfo) => {
  const salesApiPaths = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/sales-orders")) salesApiPaths.add(url.pathname);
  });

  await page.goto("/");
  await page.getByTestId("btn-search").click();
  await expect(page.getByTestId("sales-order-header-grid-row-1000::SO2026070001")).toBeVisible();
  const headersBeforeNew = await page.locator('[data-testid^="sales-order-header-grid-row-"]').evaluateAll(
    (rows) => rows.map((row) => row.getAttribute("data-testid"))
  );
  await page.getByTestId("btn-new").click();
  const tempHeaderKey = "1000::TEMP_SO_001";
  const tempLineKey = `${tempHeaderKey}::1`;
  const temporaryOrderDate = await page
    .getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-DT_SO`)
    .inputValue();
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-CD_PARTNER`).fill("P-10021");
  await page.getByTestId(`sales-order-header-grid-cell-${tempHeaderKey}-NM_PARTNER`).fill("세명테크");
  await page.getByTestId("btn-add-line").click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await page.evaluate(() => navigator.clipboard.writeText("ITM-1001\tignored\tignored\tignored\t3\t1000"));
  await page.getByTestId(`sales-order-line-grid-cell-${tempLineKey}-CD_ITEM`).click();
  await page.keyboard.press("Control+V");
  await expect(page.getByTestId(`sales-order-line-grid-cell-${tempLineKey}-NM_ITEM`)).toHaveValue("산업용 컨트롤러 A");
  await expect(page.getByTestId(`sales-order-line-grid-cell-${tempLineKey}-QT_SO`)).toHaveValue("3");
  await page.getByTestId("btn-save").click();
  const createResponse = salesApiPaths.size > 0
    ? page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/sales-orders"
      )
    : null;
  await page.getByTestId("confirm-dialog-confirm").click();
  if (createResponse) expect((await createResponse).ok()).toBeTruthy();
  await expect(page.getByTestId("confirm-dialog")).toContainText("저장되었습니다.");
  await page.getByTestId("confirm-dialog-confirm").click();
  const selectedDocumentAfterSave = await page
    .getByTestId("sales-order-header-grid-selected-document")
    .textContent();
  await page.getByLabel("수주일자 To").fill(temporaryOrderDate);
  const desktopRowsAfterSave = await page.locator('[data-testid^="sales-order-header-grid-row-"]').evaluateAll(
    (rows) => rows.map((row) => row.dataset.rowKey ?? null)
  );
  const existingHeaderKeys = new Set(headersBeforeNew.map((testId) => testId?.replace("sales-order-header-grid-row-", "")));
  const savedHeaderKeys = desktopRowsAfterSave.filter(
    (rowKey): rowKey is string => Boolean(rowKey) && !rowKey.includes("TEMP_SO_") && !existingHeaderKeys.has(rowKey)
  );
  expect(savedHeaderKeys).toHaveLength(1);
  const savedHeaderKey = savedHeaderKeys[0];
  const savedOrderNo = savedHeaderKey.split("::").at(-1);
  expect(savedOrderNo).toMatch(/^SOR\d{10}$/);
  expect(selectedDocumentAfterSave).toBe(`선택 문서 ${savedOrderNo}`);
  await page.getByTestId(`sales-order-header-grid-cell-container-${savedHeaderKey}-NO_SO`).click();
  const pcSavedLineQuantity = await page
    .getByTestId(`sales-order-line-grid-cell-${savedHeaderKey}::1-QT_SO`)
    .inputValue();
  await expect(page.getByTestId("sales-order-header-grid-selected-document")).toHaveText(`선택 문서 ${savedOrderNo}`);
  const selectedDocumentLabel = page.getByTestId("sales-order-header-grid-selected-document");
  const selectedDocument = await selectedDocumentLabel.textContent();

  await page.getByLabel("수주일자 To").fill("2026-07-31");
  await page.getByTestId("btn-search").click();
  await expect(selectedDocumentLabel).toHaveText("선택 문서 SO2026070001");
  await expect(page.getByTestId("sales-order-line-grid-cell-1000::SO2026070001::1-QT_SO")).toHaveValue("12");

  await page.getByLabel("수주일자 To").fill(temporaryOrderDate);
  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-header-grid-cell-container-${savedHeaderKey}-NO_SO`).click();
  await expect(selectedDocumentLabel).toHaveText(`선택 문서 ${savedOrderNo}`);
  await expect(page.getByTestId(`sales-order-line-grid-cell-${savedHeaderKey}::1-QT_SO`)).toHaveValue("3");

  await page.getByLabel("수주일자 To").fill("2026-07-31");
  await expect(selectedDocumentLabel).toHaveText("선택 문서 SO2026070001");
  await expect(page.getByTestId("sales-order-line-grid-cell-1000::SO2026070001::1-QT_SO")).toHaveValue("12");

  await page.getByTestId("nav-mobile-sales-order").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(savedOrderNo!);
  await page.getByTestId("mobile-sales-search").click();
  const selectedResult = page.getByTestId(`mobile-sales-result-${savedOrderNo}`);
  const mobileResultCards = await page.locator('[data-testid^="mobile-sales-result-"]').evaluateAll(
    (cards) => cards.map((card) => ({
      testId: card.getAttribute("data-testid"),
      text: card.textContent
    }))
  );
  await selectedResult.click();
  const openedMobileOrderNo = await page.getByTestId("mobile-sales-order-no").inputValue();
  const openedMobileItemCode = await page.getByTestId("mobile-sales-line-item-1").inputValue();
  const openedMobileLineQuantity = await page.getByTestId("mobile-sales-line-quantity-1").inputValue();
  const documentIdentity = {
    pc: {
      selectedDocument,
      savedOrderNo,
      line1Quantity: pcSavedLineQuantity,
      headersBeforeNew,
      temporaryOrderDate
    },
    mobile: {
      filterOrderNo: await page.getByTestId("mobile-sales-filter-order-no").inputValue(),
      resultCards: mobileResultCards,
      openedOrderNo: openedMobileOrderNo,
      openedLine1ItemCode: openedMobileItemCode,
      openedLine1Quantity: openedMobileLineQuantity
    },
    salesApiPaths: [...salesApiPaths]
  };
  await testInfo.attach("gate-12-8-document-identity.json", {
    body: Buffer.from(JSON.stringify(documentIdentity, null, 2)),
    contentType: "application/json"
  });
  await expect(page.getByTestId("mobile-sales-line-quantity-1")).toHaveValue("3");
  await page.getByTestId("mobile-sales-line-quantity-1").fill("7");
  await saveCompactOrder(page, "mobile-sales");

  await page.getByTestId("mobile-sales-nav-pda").click();
  await page.getByTestId("pda-sales-filter-order-no").fill(savedOrderNo!);
  await page.getByTestId("pda-sales-search").click();
  await expect(page.getByTestId("pda-sales-line-quantity-1")).toHaveValue("7");
  await page.getByTestId("pda-sales-line-quantity-1").fill("9");
  await saveCompactOrder(page, "pda-sales");

  await page.getByTestId("pda-sales-nav-pc").click();
  await page.getByLabel("수주일자 To").fill(temporaryOrderDate);
  await page.getByTestId("btn-search").click();
  await page.getByTestId(`sales-order-header-grid-cell-container-1000::${savedOrderNo}-NO_SO`).click();
  await expect(page.getByTestId(`sales-order-line-grid-cell-1000::${savedOrderNo}::1-QT_SO`)).toHaveValue("9");
  await expect(page.getByTestId("sales-order-total-summary")).toContainText("9,900");

  if (salesApiPaths.size > 0) {
    expect([...salesApiPaths].every((path) => path.startsWith("/api/sales-orders"))).toBeTruthy();
    const deleted = await page.request.delete(`http://127.0.0.1:5080/api/sales-orders/1000/${savedOrderNo}`);
    expect(deleted.ok()).toBeTruthy();
    return;
  }

  await page.getByTestId("btn-delete-order").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("삭제되었습니다.");
  await page.getByTestId("confirm-dialog-confirm").click();
  await page.getByTestId("nav-mobile-sales-order").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(savedOrderNo!);
  await page.getByTestId("mobile-sales-search").click();
  await expect(page.getByTestId(`mobile-sales-result-${savedOrderNo}`)).toHaveCount(0);
  await expect(page.getByTestId("mobile-sales-message")).toHaveText("조회된 수주가 없습니다.");
});

test("Gate 12-8 responsive: mobile and PDA keep key controls inside four target viewports", async ({ page }) => {
  const targets = [
    { path: "/mobile/sales-orders", width: 360, height: 800, prefix: "mobile-sales" },
    { path: "/mobile/sales-orders", width: 375, height: 812, prefix: "mobile-sales" },
    { path: "/mobile/sales-orders", width: 390, height: 844, prefix: "mobile-sales" },
    { path: "/mobile/sales-orders", width: 412, height: 915, prefix: "mobile-sales" },
    { path: "/pda/sales-orders", width: 320, height: 480, prefix: "pda-sales" },
    { path: "/pda/sales-orders", width: 360, height: 640, prefix: "pda-sales" },
    { path: "/pda/sales-orders", width: 480, height: 800, prefix: "pda-sales" }
  ] as const;

  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height });
    await page.goto(target.path);
    await expect(page.getByTestId(`${target.prefix}-search`)).toBeVisible();
    await expect(page.getByTestId(`${target.prefix}-new`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  }
});
