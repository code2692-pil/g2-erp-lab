import { expect, test, type Page, type Route } from "@playwright/test";

type Prefix = "mobile-sales" | "pda-sales";

function record(noSo: string, quantity = 3) {
  return {
    Header: {
      CD_FIRM: "1000",
      NO_SO: noSo,
      DT_SO: "2026-07-29",
      CD_PARTNER: "P-10021",
      NM_PARTNER: "E2E partner",
      CD_EMP: "E2E",
      ST_SO: "New",
      DC_RMK: noSo
    },
    Lines: [{
      CD_FIRM: "1000",
      NO_SO: noSo,
      NO_LINE: 1,
      CD_ITEM: "ITM-1001",
      NM_ITEM: "E2E item",
      STND_ITEM: "",
      UNIT_ITEM: "EA",
      QT_SO: quantity,
      UM_SO: 1000,
      AM_SUPPLY: quantity * 1000,
      AM_VAT: quantity * 100,
      AM_TOTAL: quantity * 1100,
      DT_DLV: "2026-07-30",
      DC_RMK: ""
    }]
  };
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body)
  });
}

async function selectPartner(page: Page, prefix: Prefix) {
  await page.getByTestId(`${prefix}-partner-lookup`).click();
  await page.getByTestId(`${prefix}-partner-dialog-search-input`).fill("P-10021");
  await page.getByTestId(`${prefix}-partner-dialog-search-button`).click();
  await page.getByTestId(`${prefix}-partner-dialog-grid-row-1000::P-10021`).click();
  await page.getByTestId(`${prefix}-partner-dialog-confirm`).click();
}

async function fillValidOrder(page: Page, prefix: Prefix) {
  await page.getByTestId(`${prefix}-new`).click();
  await selectPartner(page, prefix);
  if (prefix === "mobile-sales") {
    await page.getByTestId("mobile-sales-add-line").click();
    await page.getByTestId("mobile-sales-item-dialog-search-input").fill("ITM-1001");
    await page.getByTestId("mobile-sales-item-dialog-search-button").click();
    await page.getByTestId("mobile-sales-item-dialog-grid-row-1000::ITM-1001").click();
    await page.getByTestId("mobile-sales-item-dialog-confirm").click();
    await page.getByTestId("mobile-sales-line-quantity-1").fill("2");
    await page.getByTestId("mobile-sales-line-price-1").fill("1000");
    return;
  }
  await page.getByTestId("pda-sales-quick-item").fill("ITM-1001");
  await page.getByTestId("pda-sales-quick-item").press("Enter");
  await page.getByTestId("pda-sales-quick-quantity").fill("2");
  await page.getByTestId("pda-sales-quick-quantity").press("Enter");
  await page.getByTestId("pda-sales-quick-price").fill("1000");
  await page.getByTestId("pda-sales-quick-price").press("Enter");
}

async function confirmSave(page: Page, prefix: Prefix) {
  await page.getByTestId(`${prefix}-save`).click();
  await page.getByTestId("confirm-dialog-confirm").click();
}

test("Gate 12-9 compact query: mobile and PDA cancel A and retain only latest B", async ({ page }) => {
  for (const target of [
    { path: "/mobile/sales-orders", prefix: "mobile-sales" as const },
    { path: "/pda/sales-orders", prefix: "pda-sales" as const }
  ]) {
    const a = record(`E2E-${target.prefix}-STALE-A`);
    const b = record(`E2E-${target.prefix}-STALE-B`, 7);
    let requestCount = 0;
    let signalFirstRequest!: () => void;
    let releaseFirstRequest!: () => void;
    const firstRequest = new Promise<void>((resolve) => { signalFirstRequest = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirstRequest = resolve; });

    await page.route("**/api/sales-orders**", async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        signalFirstRequest();
        await release;
        try { await fulfillJson(route, 200, [a]); } catch { /* the abort disposes route A by design */ }
        return;
      }
      await fulfillJson(route, 200, [b]);
    });

    await page.goto(target.path);
    await page.getByTestId(`${target.prefix}-filter-order-no`).fill("STALE-A");
    await page.getByTestId(`${target.prefix}-search`).click();
    await firstRequest;
    await page.getByTestId(`${target.prefix}-filter-order-no`).fill("STALE-B");
    await page.getByTestId(`${target.prefix}-search`).click();

    if (target.prefix === "mobile-sales") {
      await expect(page.getByTestId(`mobile-sales-result-${b.Header.NO_SO}`)).toBeVisible();
      await expect(page.getByTestId(`mobile-sales-result-${a.Header.NO_SO}`)).toHaveCount(0);
    } else {
      await expect(page.getByTestId("pda-sales-order-no")).toHaveValue(b.Header.NO_SO);
      await expect(page.getByTestId("pda-sales-line-quantity-1")).toHaveValue("7");
    }
    expect(requestCount).toBe(2);
    releaseFirstRequest();
    await page.unroute("**/api/sales-orders**");
  }
});

test("Gate 12-9 compact query: navigating away aborts an in-flight request without stale UI state", async ({ page }) => {
  let signalFirstRequest!: () => void;
  let releaseFirstRequest!: () => void;
  let signalRouteFinished!: () => void;
  const firstRequest = new Promise<void>((resolve) => { signalFirstRequest = resolve; });
  const release = new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
  const routeFinished = new Promise<void>((resolve) => { signalRouteFinished = resolve; });

  await page.route("**/api/sales-orders**", async (route) => {
    signalFirstRequest();
    await release;
    try { await fulfillJson(route, 200, [record("E2E-UNMOUNT-STALE")]); } catch { /* abort is expected */ }
    signalRouteFinished();
  });
  await page.goto("/mobile/sales-orders");
  await page.getByTestId("mobile-sales-search").click();
  await firstRequest;
  await page.getByTestId("mobile-sales-nav-pc").click();
  await expect(page.getByTestId("page-title")).toBeVisible();
  releaseFirstRequest();
  await routeFinished;
  await expect(page.getByTestId("page-title")).toBeVisible();
});

test("Gate 12-9 compact save: mobile 400 and PDA 500 preserve dirty input and recover", async ({ page }) => {
  for (const target of [
    { path: "/mobile/sales-orders", prefix: "mobile-sales" as const, failure: 400 },
    { path: "/pda/sales-orders", prefix: "pda-sales" as const, failure: 500 }
  ]) {
    let failSave = true;
    let saved: ReturnType<typeof record> | null = null;
    await page.route("**/api/sales-orders**", async (route) => {
      const method = route.request().method();
      if (method === "GET") return fulfillJson(route, 200, saved ? [saved] : []);
      if (method === "POST") {
        if (failSave) return fulfillJson(route, target.failure, { error: "planned save failure" });
        const request = route.request().postDataJSON() as ReturnType<typeof record>;
        const generatedNumber = "SOR2026070001";
        saved = {
          Header: { ...request.Header, NO_SO: generatedNumber },
          Lines: request.Lines.map((line) => ({ ...line, NO_SO: generatedNumber }))
        };
        return fulfillJson(route, 201, saved);
      }
      return fulfillJson(route, 500, { error: "unexpected request" });
    });
    await page.goto(target.path);
    await fillValidOrder(page, target.prefix);
    await confirmSave(page, target.prefix);
    await expect(page.getByRole("dialog", { name: "저장 실패" })).toBeVisible();
    await expect(page.getByTestId(`${target.prefix}-dirty-indicator`)).toBeVisible();
    await expect(page.getByTestId(`${target.prefix}-line-quantity-1`)).toHaveValue("2");
    await page.getByTestId("confirm-dialog-confirm").click();
    failSave = false;
    await confirmSave(page, target.prefix);
    await expect(page.getByRole("dialog", { name: "저장 완료" })).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId(`${target.prefix}-dirty-indicator`)).toHaveCount(0);
    await expect(page.getByTestId(`${target.prefix}-order-no`)).toHaveValue(/^SOR\d{10}$/);
    await page.unroute("**/api/sales-orders**");
  }
});

test("Gate 12-9 compact mutation: save and delete first action wins and delete failure keeps the order", async ({ page }) => {
  const existing = record("E2E-DELETE-GUARD");
  let records = [existing];
  let saveRequests = 0;
  let deleteRequests = 0;
  let failDelete = true;
  await page.route("**/api/sales-orders**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return fulfillJson(route, 200, records);
    if (method === "POST") {
      saveRequests += 1;
      const request = route.request().postDataJSON() as ReturnType<typeof record>;
      const generatedNumber = "SOR2026070001";
      const saved = {
        Header: { ...request.Header, NO_SO: generatedNumber },
        Lines: request.Lines.map((line) => ({ ...line, NO_SO: generatedNumber }))
      };
      records = [saved, ...records];
      return fulfillJson(route, 201, saved);
    }
    if (method === "DELETE") {
      deleteRequests += 1;
      if (failDelete) return fulfillJson(route, 500, { error: "planned delete failure" });
      records = [];
      return route.fulfill({ status: 204 });
    }
    return fulfillJson(route, 500, { error: "unexpected request" });
  });

  await page.goto("/mobile/sales-orders");
  await fillValidOrder(page, "mobile-sales");
  await page.getByTestId("mobile-sales-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("mobile-sales-save")).toBeDisabled();
  expect(saveRequests).toBe(1);
  await expect(page.getByRole("dialog", { name: "저장 완료" })).toBeVisible();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("mobile-sales-order-no")).toHaveValue(/^SOR\d{10}$/);

  await page.getByTestId("mobile-sales-back-list").click();
  await page.getByTestId("mobile-sales-filter-order-no").fill(existing.Header.NO_SO);
  await page.getByTestId("mobile-sales-search").click();
  await page.getByTestId(`mobile-sales-result-${existing.Header.NO_SO}`).click();
  await page.getByTestId("mobile-sales-delete-order").click();
  const failedDelete = page.waitForResponse((response) =>
    response.request().method() === "DELETE" && response.url().endsWith(`/api/sales-orders/1000/${existing.Header.NO_SO}`)
  );
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await failedDelete).status()).toBe(500);
  await expect(page.getByRole("dialog", { name: "삭제 실패" })).toBeVisible();
  await expect(page.getByTestId("mobile-sales-order-no")).toHaveValue(existing.Header.NO_SO);
  expect(deleteRequests).toBe(1);
  await page.getByTestId("confirm-dialog-confirm").click();
  failDelete = false;
  await page.getByTestId("mobile-sales-delete-order").click();
  const completedDelete = page.waitForResponse((response) =>
    response.request().method() === "DELETE" && response.url().endsWith(`/api/sales-orders/1000/${existing.Header.NO_SO}`)
  );
  await page.getByTestId("confirm-dialog-confirm").click();
  expect((await completedDelete).status()).toBe(204);
  await expect(page.getByRole("dialog", { name: "삭제 완료" })).toBeVisible();
  await expect(page.getByTestId("mobile-sales-order-no")).toHaveValue(existing.Header.NO_SO);
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(page.getByTestId("mobile-sales-order-no")).toHaveCount(0);
  expect(deleteRequests).toBe(2);
});
