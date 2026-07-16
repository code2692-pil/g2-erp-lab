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
  const number = `E2E-PO-UX-${testInfo.workerIndex}-${Date.now()}`;
  await request.post(`${apiBaseUrl}/api/purchase-orders`, { data: purchaseRequest(number, 3, 101) });
  try {
    await page.goto("/");
    await page.getByTestId("nav-purchase-order").click();
    const orderRow = page.getByTestId(`api-po-order-${number}`);
    await expect(orderRow).toBeVisible();
    await orderRow.getByRole("button").click();
    await expect(page.getByTestId("api-po-line-row-0")).toBeVisible();

    await page.getByTestId("api-po-header-CD_PARTNER").fill("");
    await page.getByTestId("api-po-save").click();
    await expect(page.getByTestId("api-po-validation-summary")).toBeVisible();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("api-po-header-CD_PARTNER")).toBeFocused();
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByTestId("api-po-validation-summary")).toHaveCount(0);

    await page.getByTestId("api-po-partner-lookup").click();
    await page.getByTestId("api-po-partner-lookup-grid-row-P-10021").click();
    await page.getByTestId("api-po-partner-lookup-confirm").click();
    await page.getByTestId("api-po-item-lookup-0").click();
    await page.getByTestId("api-po-item-lookup-grid-row-ITM-1001").click();
    await page.getByTestId("api-po-item-lookup-confirm").click();
    await page.getByTestId("api-po-warehouse-lookup-0").click();
    await page.getByTestId("api-po-warehouse-lookup-grid-row-WH-100").click();
    await page.getByTestId("api-po-warehouse-lookup-confirm").click();

    await page.getByTestId("api-po-save").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("저장하시겠습니까?");
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");

    await page.getByTestId("api-po-line-row-0").click();
    await page.getByTestId("api-po-delete-line").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("발주상세 1건");
    await page.getByTestId("confirm-dialog-cancel").click();
    await page.getByTestId("api-po-delete-line").click();
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
    await page.getByTestId(`api-po-order-${number}`).getByRole("button").click();
    await expect(page.getByTestId("api-po-line-row-0")).toBeVisible();
    await page.getByTestId("api-po-delete").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("발주번호");
    await page.getByTestId("confirm-dialog-cancel").click();
    await page.getByTestId("api-po-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
  } finally {
    await request.delete(`${apiBaseUrl}/api/purchase-orders/1000/${number}`);
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
    await page.getByTestId(`api-po-order-${number}`).getByRole("button").click();
    await expect(page.getByTestId("api-po-line-row-0")).toBeVisible();
    await page.getByTestId("api-po-line-0-QT_PO").fill("4");

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
    await page.getByTestId("api-po-save").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await saveStarted.promise;
    await expect(page.getByTestId("api-po-save")).toBeDisabled();
    await expect(page.getByTestId("api-po-delete")).toBeDisabled();
    await page.getByTestId("api-po-save").evaluate((button) => (button as HTMLButtonElement).click());
    expect(saveRequestCount).toBe(1);
    saveGate.resolve();
    await expect(page.getByRole("status")).toContainText("저장되었습니다.");
    await expect(page.getByTestId("api-po-save")).toBeEnabled();
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
    await page.getByTestId("api-po-delete").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await deleteStarted.promise;
    await expect(page.getByTestId("api-po-delete")).toBeDisabled();
    await expect(page.getByTestId("api-po-save")).toBeDisabled();
    await page.getByTestId("api-po-delete").evaluate((button) => (button as HTMLButtonElement).click());
    expect(deleteRequestCount).toBe(1);
    deleteGate.resolve();
    await expect(page.getByRole("status")).toContainText("삭제되었습니다.");
    await expect(page.getByTestId(`api-po-order-${number}`)).toHaveCount(0);
  } finally {
    saveGate.resolve();
    deleteGate.resolve();
    await request.delete(endpoint);
  }
});
