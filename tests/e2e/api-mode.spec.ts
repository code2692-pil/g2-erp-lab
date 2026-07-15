import { expect, test } from "@playwright/test";

const apiBaseUrl = "http://127.0.0.1:5080";

function salesRequest(number: string, quantity = 3, price = 101) {
  return { Header: { CD_FIRM: "1000", NO_SO: number, DT_SO: "2026-07-16", CD_PARTNER: "P-10021", NM_PARTNER: "Ignored", CD_EMP: "E2E", ST_SO: "New", DC_RMK: "E2E" }, Lines: [{ CD_FIRM: "1000", NO_SO: number, NO_LINE: 1, CD_ITEM: "ITM-1001", NM_ITEM: "Ignored", STND_ITEM: "Ignored", UNIT_ITEM: "EA", QT_SO: quantity, UM_SO: price, AM_SUPPLY: 1, AM_VAT: 1, AM_TOTAL: 1, DT_DLV: "2026-07-20", DC_RMK: "E2E" }] };
}

function purchaseRequest(number: string, quantity = 3, price = 101) {
  return { Header: { CD_FIRM: "1000", NO_PO: number, DT_PO: "2026-07-16", CD_PARTNER: "P-10021", NM_PARTNER: "Ignored", CD_EMP: "E2E", NM_EMP: "Tester", CD_CURRENCY: "KRW", RT_EXCHANGE: 1, ST_PO: "New", DC_RMK: "E2E" }, Lines: [{ CD_FIRM: "1000", NO_PO: number, NO_LINE: 1, CD_ITEM: "ITM-1001", NM_ITEM: "Ignored", STND_ITEM: "Ignored", UNIT_ITEM: "EA", QT_PO: quantity, UM_PO: price, AM_SUPPLY: 1, AM_VAT: 1, AM_TOTAL: 1, DT_DLV: "2026-07-20", CD_WH: "WH-100", NM_WH: "Ignored", DC_RMK: "E2E" }] };
}

test("API mode: sales order CRUD, lookup, validation, and server amounts", async ({ page, request }, testInfo) => {
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
