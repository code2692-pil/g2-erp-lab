import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:5080";

function salesRequest(number: string, quantity = 3, price = 101) {
  return { Header: { CD_FIRM: "1000", NO_SO: number, DT_SO: "2026-07-16", CD_PARTNER: "P-10021", NM_PARTNER: "Ignored", CD_EMP: "E2E", ST_SO: "New", DC_RMK: "E2E" }, Lines: [{ CD_FIRM: "1000", NO_SO: number, NO_LINE: 1, CD_ITEM: "ITM-1001", NM_ITEM: "Ignored", STND_ITEM: "Ignored", UNIT_ITEM: "EA", QT_SO: quantity, UM_SO: price, AM_SUPPLY: 1, AM_VAT: 1, AM_TOTAL: 1, DT_DLV: "2026-07-20", DC_RMK: "E2E" }] };
}

function purchaseRequest(number: string, quantity = 3, price = 101) {
  return { Header: { CD_FIRM: "1000", NO_PO: number, DT_PO: "2026-07-16", CD_PARTNER: "P-10021", NM_PARTNER: "Ignored", CD_EMP: "E2E", NM_EMP: "Tester", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "New", DC_RMK: "E2E" }, Lines: [{ CD_FIRM: "1000", NO_PO: number, NO_LINE: 1, CD_ITEM: "ITM-1001", NM_ITEM: "Ignored", STND_ITEM: "Ignored", UNIT_ITEM: "EA", QT_PO: quantity, UM_PO: price, AM_SUPPLY: 1, AM_VAT: 1, AM_TOTAL: 1, DT_DLV: "2026-07-20", CD_WH: "WH-100", NM_WH: "Ignored", DC_RMK: "E2E" }] };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("API mode: sales order CRUD, lookup, validation, and server amounts", async ({ page, request }, testInfo) => {
  test.slow();
  const number = `E2E-SO-${testInfo.workerIndex}-${Date.now()}`;
  await page.goto("/");
  await expect(page.getByTestId("page-title")).toBeVisible();
  expect((await request.get(`${apiBaseUrl}/api/sales-orders`)).ok()).toBeTruthy();
  expect((await request.get(`${apiBaseUrl}/api/partners`)).ok()).toBeTruthy();
  expect((await request.get(`${apiBaseUrl}/api/items`)).ok()).toBeTruthy();
  expect((await request.post(`${apiBaseUrl}/api/sales-orders`, { data: salesRequest(`E2E-SO-INVALID-${Date.now()}`, 0) })).status()).toBe(400);
  try {
    const created = await request.post(`${apiBaseUrl}/api/sales-orders`, { data: salesRequest(number) });
    expect(created.status()).toBe(201); expect((await created.json()).Lines[0].AM_TOTAL).toBe(333);
    expect((await request.get(`${apiBaseUrl}/api/sales-orders/1000/${number}`)).ok()).toBeTruthy();
    const updated = await request.put(`${apiBaseUrl}/api/sales-orders/1000/${number}`, { data: salesRequest(number, 4, 200) });
    expect(updated.status()).toBe(200); expect((await updated.json()).Lines[0].AM_TOTAL).toBe(880);
  } finally {
    await request.delete(`${apiBaseUrl}/api/sales-orders/1000/${number}`);
  }
  expect((await request.get(`${apiBaseUrl}/api/sales-orders/1000/${number}`)).status()).toBe(404);
});

test("API mode: purchase order CRUD, lookup, validation, and server amounts", async ({ page, request }, testInfo) => {
  test.slow();
  const number = `E2E-PO-${testInfo.workerIndex}-${Date.now()}`;
  await page.goto("/"); await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toBeVisible();
  expect((await request.get(`${apiBaseUrl}/api/purchase-orders`)).ok()).toBeTruthy();
  expect((await request.get(`${apiBaseUrl}/api/partners`)).ok()).toBeTruthy();
  expect((await request.get(`${apiBaseUrl}/api/items`)).ok()).toBeTruthy();
  expect((await request.get(`${apiBaseUrl}/api/warehouses`)).ok()).toBeTruthy();
  expect((await request.post(`${apiBaseUrl}/api/purchase-orders`, { data: purchaseRequest(`E2E-PO-INVALID-${Date.now()}`, 0) })).status()).toBe(400);
  try {
    const created = await request.post(`${apiBaseUrl}/api/purchase-orders`, { data: purchaseRequest(number) });
    expect(created.status()).toBe(201); expect((await created.json()).Lines[0].AM_TOTAL).toBe(333);
    expect((await request.get(`${apiBaseUrl}/api/purchase-orders/1000/${number}`)).ok()).toBeTruthy();
    const updated = await request.put(`${apiBaseUrl}/api/purchase-orders/1000/${number}`, { data: purchaseRequest(number, 4, 200) });
    expect(updated.status()).toBe(200); expect((await updated.json()).Lines[0].AM_TOTAL).toBe(880);
  } finally {
    await request.delete(`${apiBaseUrl}/api/purchase-orders/1000/${number}`);
  }
  expect((await request.get(`${apiBaseUrl}/api/purchase-orders/1000/${number}`)).status()).toBe(404);
});

test("API UI: sales order save, delete, dirty header navigation, and notifications", async ({ page, request }, testInfo) => {
  const first = `E2E-SO-UX-${testInfo.workerIndex}-${Date.now()}-A`;
  const second = `E2E-SO-UX-${testInfo.workerIndex}-${Date.now()}-B`;
  await request.post(`${apiBaseUrl}/api/sales-orders`, { data: salesRequest(first, 3, 101) });
  await request.post(`${apiBaseUrl}/api/sales-orders`, { data: salesRequest(second, 3, 101) });
  try {
    await page.goto("/");
    await page.getByTestId("btn-search").click();
    await page.getByTestId(`sales-order-header-grid-row-1000::${first}`).click();
    await page.getByTestId(`sales-order-line-grid-cell-1000::${first}::1-QT_SO`).fill("4");
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-cancel").click();
    expect((await request.get(`${apiBaseUrl}/api/sales-orders/1000/${first}`)).ok()).toBeTruthy();
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");

    await page.getByTestId(`sales-order-line-grid-cell-1000::${first}::1-QT_SO`).fill("5");
    await page.getByTestId(`sales-order-header-grid-row-1000::${second}`).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항");
    await page.getByTestId("confirm-dialog-cancel").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await page.getByTestId(`sales-order-header-grid-row-1000::${second}`).click();
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.getByTestId(`sales-order-header-grid-row-1000::${first}`).click();
    await page.getByTestId("btn-delete-order").click();
    await page.getByTestId("confirm-dialog-cancel").click();
    await expect(page.getByTestId(`sales-order-header-grid-row-1000::${first}`)).toBeVisible();
    await page.getByTestId("btn-delete-order").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
  } finally {
    await request.delete(`${apiBaseUrl}/api/sales-orders/1000/${first}`);
    await request.delete(`${apiBaseUrl}/api/sales-orders/1000/${second}`);
  }
});

test("API UI: purchase order lookup, save/delete dialogs, dirty navigation, and pending state", async ({ page, request }, testInfo) => {
  test.slow();
  const number = "TEMP_PO_001";
  try {
    await page.goto("/");
    await page.getByTestId("nav-purchase-order").click();
    await page.getByTestId("po-btn-new").click();
    await page.getByTestId("po-btn-add-line").click();
    await expect(page.getByTestId(`purchase-line-grid-row-1000::${number}::1`)).toBeVisible();

    await page.getByTestId(`purchase-header-grid-cell-1000::${number}-CD_PARTNER`).fill("");
    await page.getByTestId("po-btn-save").click();
    await expect(page.getByTestId("purchase-validation-summary")).toBeVisible();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId(`purchase-header-grid-cell-1000::${number}-CD_PARTNER`)).toHaveAttribute("aria-invalid", "true");
    await page.getByTestId("purchase-validation-close").click();
    await expect(page.getByTestId("purchase-validation-summary")).toHaveCount(0);

    await page.getByTestId("po-btn-partner-lookup").click();
    await page.getByTestId("po-partner-lookup-grid-row-1000::P-10021").click();
    await page.getByTestId("po-partner-lookup-confirm").click();
    await page.getByTestId(`purchase-line-grid-row-1000::${number}::1`).click();
    await expect(page.getByTestId("po-btn-item-lookup")).toHaveCount(0);
    await page.getByTestId(`purchase-line-grid-cell-container-1000::${number}::1-CD_ITEM`).dblclick();
    await page.getByTestId("po-item-lookup-grid-row-1000::ITM-1001").click();
    await page.getByTestId("po-item-lookup-confirm").click();
    await expect(page.getByTestId("po-btn-warehouse-lookup")).toHaveCount(0);
    await page.getByTestId(`purchase-line-grid-cell-container-1000::${number}::1-CD_WH`).dblclick();
    await page.getByTestId("po-warehouse-lookup-grid-row-1000::WH-100").click();
    await page.getByTestId("po-warehouse-lookup-confirm").click();
    await page.getByTestId(`purchase-line-grid-cell-1000::${number}::1-QT_PO`).fill("3");

    await page.getByTestId("po-btn-save").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("저장하시겠습니까?");
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");

    const purchaseRemark = page.getByTestId(`purchase-header-grid-cell-1000::${number}-DC_RMK`);
    await purchaseRemark.fill("saved purchase order update");
    await expect(purchaseRemark).toHaveValue("saved purchase order update");
    let updateRequestBody: { Header: { DC_RMK: string } } | undefined;
    page.once("request", (request) => {
      if (request.url() === `${apiBaseUrl}/api/purchase-orders/1000/${number}` && request.method() === "PUT") {
        updateRequestBody = request.postDataJSON() as { Header: { DC_RMK: string } };
      }
    });
    const updateResponse = page.waitForResponse((response) => response.url() === `${apiBaseUrl}/api/purchase-orders/1000/${number}` && response.request().method() === "PUT");
    await page.getByTestId("po-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    expect((await updateResponse).status()).toBe(200);
    expect(updateRequestBody?.Header.DC_RMK).toBe("saved purchase order update");
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");
    const updatedPurchaseOrder = await request.get(`${apiBaseUrl}/api/purchase-orders/1000/${number}`);
    expect(updatedPurchaseOrder.status()).toBe(200);
    expect((await updatedPurchaseOrder.json()).Header.DC_RMK).toBe("saved purchase order update");

    const purchaseQuantity = page.getByTestId(`purchase-line-grid-cell-1000::${number}::1-QT_PO`);
    await purchaseQuantity.fill("4");
    await expect(purchaseQuantity).toHaveValue("4");
    let lineUpdateRequestBody: { Lines: Array<{ QT_PO: number }> } | undefined;
    page.once("request", (request) => {
      if (request.url() === `${apiBaseUrl}/api/purchase-orders/1000/${number}` && request.method() === "PUT") {
        lineUpdateRequestBody = request.postDataJSON() as { Lines: Array<{ QT_PO: number }> };
      }
    });
    const lineUpdateResponse = page.waitForResponse((response) => response.url() === `${apiBaseUrl}/api/purchase-orders/1000/${number}` && response.request().method() === "PUT");
    await page.getByTestId("po-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    expect((await lineUpdateResponse).status()).toBe(200);
    expect(lineUpdateRequestBody?.Lines[0]?.QT_PO).toBe(4);
    const lineUpdatedPurchaseOrder = await request.get(`${apiBaseUrl}/api/purchase-orders/1000/${number}`);
    expect(lineUpdatedPurchaseOrder.status()).toBe(200);
    expect((await lineUpdatedPurchaseOrder.json()).Lines[0]).toMatchObject({ QT_PO: 4, AM_TOTAL: 0 });

    await page.getByTestId(`purchase-line-grid-row-1000::${number}::1`).click();
    await page.getByTestId("po-btn-delete-line").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("발주상세 1건");
    await page.getByTestId("confirm-dialog-cancel").click();
    await page.getByTestId("po-btn-delete-line").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("선택한 1건이 삭제되었습니다.");

    await page.getByTestId("nav-sales-order").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("저장하지 않은 변경사항");
    await page.getByTestId("confirm-dialog-cancel").click();
    await expect(page.getByTestId("purchase-page-title")).toBeVisible();
    await page.getByTestId("nav-sales-order").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("page-title")).toBeVisible();
    await page.getByTestId("nav-purchase-order").click();
    await page.getByTestId("po-btn-search").click();
    await page.getByTestId(`purchase-header-grid-row-1000::${number}`).click();
    await expect(page.getByTestId(`purchase-line-grid-row-1000::${number}::1`)).toBeVisible();
    await page.getByTestId("po-btn-delete").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("발주번호");
    await page.getByTestId("confirm-dialog-cancel").click();
    await page.getByTestId("po-btn-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
  } finally {
    await request.delete(`${apiBaseUrl}/api/purchase-orders/1000/${number}`);
  }
});

test("API UI: sales order shows 400 and network save errors, then recovers", async ({ page, request }, testInfo) => {
  test.slow();
  const number = `E2E-SO-ERROR-${testInfo.workerIndex}-${Date.now()}`;
  const endpoint = `${apiBaseUrl}/api/sales-orders/1000/${number}`;
  let badRequestCount = 0;
  let networkFailureCount = 0;

  try {
    expect((await request.post(`${apiBaseUrl}/api/sales-orders`, { data: salesRequest(number) })).status()).toBe(201);
    await page.goto("/");
    await page.getByTestId("btn-search").click();
    await page.getByTestId(`sales-order-header-grid-row-1000::${number}`).click();
    const quantity = page.getByTestId(`sales-order-line-grid-cell-1000::${number}::1-QT_SO`);
    await quantity.fill("4");

    const badRequest = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "PUT") return route.continue();
      badRequestCount += 1;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid save request" }) });
    };
    await page.route(endpoint, badRequest);
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("status-message")).toContainText("저장 중 오류가 발생했습니다.");
    await expect(page.getByTestId("btn-save")).toBeEnabled();
    await expect(page.getByTestId("sales-order-dirty-indicator")).toBeVisible();
    expect(badRequestCount).toBe(1);
    await page.unroute(endpoint, badRequest);

    const recoveredFrom400 = page.waitForResponse((response) => response.url() === endpoint && response.request().method() === "PUT");
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    expect((await recoveredFrom400).status()).toBe(200);
    await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveCount(0);

    await quantity.fill("5");
    const networkFailure = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "PUT") return route.continue();
      networkFailureCount += 1;
      await route.abort("failed");
    };
    await page.route(endpoint, networkFailure);
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("status-message")).toContainText("저장 중 오류가 발생했습니다.");
    await expect(page.getByTestId("btn-save")).toBeEnabled();
    await expect(page.getByTestId("sales-order-dirty-indicator")).toBeVisible();
    expect(networkFailureCount).toBe(1);
    await page.unroute(endpoint, networkFailure);

    const recoveredFromNetworkFailure = page.waitForResponse((response) => response.url() === endpoint && response.request().method() === "PUT");
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    expect((await recoveredFromNetworkFailure).status()).toBe(200);
    await expect(page.getByTestId("sales-order-dirty-indicator")).toHaveCount(0);
  } finally {
    await request.delete(endpoint);
  }
});

test("API UI: purchase order shows 409 save error, then recovers", async ({ page, request }, testInfo) => {
  test.slow();
  const number = `E2E-PO-ERROR-${testInfo.workerIndex}-${Date.now()}`;
  const endpoint = `${apiBaseUrl}/api/purchase-orders/1000/${number}`;
  let conflictCount = 0;

  try {
    expect((await request.post(`${apiBaseUrl}/api/purchase-orders`, { data: purchaseRequest(number) })).status()).toBe(201);
    await page.goto("/");
    await page.getByTestId("nav-purchase-order").click();
    await page.getByTestId("po-btn-search").click();
    await page.getByTestId(`purchase-header-grid-row-1000::${number}`).click();
    await page.getByTestId(`purchase-line-grid-cell-1000::${number}::1-QT_PO`).fill("4");

    const conflict = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "PUT") return route.continue();
      conflictCount += 1;
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "conflicting save request" }) });
    };
    await page.route(endpoint, conflict);
    await page.getByTestId("po-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("status-message")).toContainText("저장 중 오류가 발생했습니다.");
    await expect(page.getByTestId("po-btn-save")).toBeEnabled();
    expect(conflictCount).toBe(1);
    await page.unroute(endpoint, conflict);

    const recovered = page.waitForResponse((response) => response.url() === endpoint && response.request().method() === "PUT");
    await page.getByTestId("po-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    expect((await recovered).status()).toBe(200);
  } finally {
    await request.delete(endpoint);
  }
});

test("API UI: sales order disables duplicate save and delete requests while pending", async ({ page, request }, testInfo) => {
  test.slow();
  const number = `E2E-SO-DUP-${testInfo.workerIndex}-${Date.now()}`;
  const endpoint = `${apiBaseUrl}/api/sales-orders/1000/${number}`;
  const saveGate = deferred();
  const deleteGate = deferred();
  let saveRequestCount = 0;
  let deleteRequestCount = 0;

  try {
    expect((await request.post(`${apiBaseUrl}/api/sales-orders`, { data: salesRequest(number) })).status()).toBe(201);
    await page.goto("/");
    await page.getByTestId("btn-search").click();
    await page.getByTestId(`sales-order-header-grid-row-1000::${number}`).click();
    await page.getByTestId(`sales-order-line-grid-cell-1000::${number}::1-QT_SO`).fill("4");

    const saveStarted = deferred();
    const holdSave = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "PUT") return route.continue();
      saveRequestCount += 1;
      if (saveRequestCount === 1) {
        saveStarted.resolve();
        await saveGate.promise;
      }
      await route.continue();
    };
    await page.route(endpoint, holdSave);
    await page.getByTestId("btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await saveStarted.promise;
    await expect(page.getByTestId("btn-save")).toBeDisabled();
    await expect(page.getByTestId("btn-delete-order")).toBeDisabled();
    await page.getByTestId("btn-save").evaluate((button) => (button as HTMLButtonElement).click());
    expect(saveRequestCount).toBe(1);
    saveGate.resolve();
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");
    await expect(page.getByTestId("btn-save")).toBeEnabled();
    await page.unroute(endpoint, holdSave);

    const deleteStarted = deferred();
    const holdDelete = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      deleteRequestCount += 1;
      if (deleteRequestCount === 1) {
        deleteStarted.resolve();
        await deleteGate.promise;
      }
      await route.continue();
    };
    await page.route(endpoint, holdDelete);
    await page.getByTestId("btn-delete-order").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await deleteStarted.promise;
    await expect(page.getByTestId("btn-delete-order")).toBeDisabled();
    await expect(page.getByTestId("btn-save")).toBeDisabled();
    await page.getByTestId("btn-delete-order").evaluate((button) => (button as HTMLButtonElement).click());
    expect(deleteRequestCount).toBe(1);
    deleteGate.resolve();
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
    await expect(page.getByTestId(`sales-order-header-grid-row-1000::${number}`)).toHaveCount(0);
  } finally {
    saveGate.resolve();
    deleteGate.resolve();
    await request.delete(endpoint);
  }
});

test("API UI: purchase order disables duplicate save and delete requests while pending", async ({ page, request }, testInfo) => {
  test.slow();
  const number = `E2E-PO-DUP-${testInfo.workerIndex}-${Date.now()}`;
  const endpoint = `${apiBaseUrl}/api/purchase-orders/1000/${number}`;
  const saveGate = deferred();
  const deleteGate = deferred();
  let saveRequestCount = 0;
  let deleteRequestCount = 0;

  try {
    expect((await request.post(`${apiBaseUrl}/api/purchase-orders`, { data: purchaseRequest(number) })).status()).toBe(201);
    await page.goto("/");
    await page.getByTestId("nav-purchase-order").click();
    await page.getByTestId("po-btn-search").click();
    await Promise.all([
      page.waitForResponse(`${apiBaseUrl}/api/purchase-orders/1000/${number}`),
      page.getByTestId(`purchase-header-grid-row-1000::${number}`).click()
    ]);
    await expect(page.getByTestId(`purchase-line-grid-row-1000::${number}::1`)).toBeVisible();
    await page.getByTestId(`purchase-line-grid-cell-1000::${number}::1-QT_PO`).fill("4");

    const saveStarted = deferred();
    const holdSave = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "PUT") return route.continue();
      saveRequestCount += 1;
      if (saveRequestCount === 1) {
        saveStarted.resolve();
        await saveGate.promise;
      }
      await route.continue();
    };
    await page.route(endpoint, holdSave);
    await page.getByTestId("po-btn-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await saveStarted.promise;
    await expect(page.getByTestId("po-btn-save")).toBeDisabled();
    await expect(page.getByTestId("po-btn-delete")).toBeDisabled();
    await page.getByTestId("po-btn-save").evaluate((button) => (button as HTMLButtonElement).click());
    expect(saveRequestCount).toBe(1);
    saveGate.resolve();
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");
    await expect(page.getByTestId("po-btn-save")).toBeEnabled();
    await page.unroute(endpoint, holdSave);

    const deleteStarted = deferred();
    const holdDelete = async (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      deleteRequestCount += 1;
      if (deleteRequestCount === 1) {
        deleteStarted.resolve();
        await deleteGate.promise;
      }
      await route.continue();
    };
    await page.route(endpoint, holdDelete);
    await page.getByTestId("po-btn-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await deleteStarted.promise;
    await expect(page.getByTestId("po-btn-delete")).toBeDisabled();
    await expect(page.getByTestId("po-btn-save")).toBeDisabled();
    await page.getByTestId("po-btn-delete").evaluate((button) => (button as HTMLButtonElement).click());
    expect(deleteRequestCount).toBe(1);
    deleteGate.resolve();
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
    await expect(page.getByTestId(`purchase-header-grid-row-1000::${number}`)).toHaveCount(0);
  } finally {
    saveGate.resolve();
    deleteGate.resolve();
    await request.delete(endpoint);
  }
});
