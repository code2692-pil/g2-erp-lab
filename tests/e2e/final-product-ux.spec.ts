import { expect, test, type Page } from "@playwright/test";

const roleCases = [
  ["demo-viewer", "조회 사용자"],
  ["demo-operator", "일반 사용자"],
  ["demo-manager", "일반 관리자"],
  ["demo-admin", "시스템 관리자"]
] as const;

async function startAs(page: Page, userId: string, label: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="demo-user"][value="${userId}"]`).check();
  const roleText = page.locator(`input[name="demo-user"][value="${userId}"]`).locator("xpath=following-sibling::span/strong");
  await expect(roleText).toHaveText(label);
  await page.getByRole("button", { name: "업무 화면 시작" }).click();
  await expect(page.getByTestId("current-user-menu")).toContainText(label);
}

test("사용자 선택 역할명과 한글 text box가 모든 역할에서 잘리지 않는다", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle("SMART SNOTES DEMO");
  for (const [userId, label] of roleCases) {
    const radio = page.locator(`input[name="demo-user"][value="${userId}"]`);
    await radio.check();
    const text = radio.locator("xpath=following-sibling::span/strong");
    await expect(text).toHaveText(label);
    const metrics = await text.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, top: box.top, bottom: box.bottom, parentTop: parent.top, parentBottom: parent.bottom };
    });
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
    expect(metrics.top).toBeGreaterThanOrEqual(metrics.parentTop);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.parentBottom);
  }
});

test("좌측 메뉴는 정확한 최상단 순서와 AI 세 화면을 제공한다", async ({ page }) => {
  await startAs(page, "demo-admin", "시스템 관리자");
  const roots = await page.locator("[data-menu-root]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-menu-root")));
  expect(roots).toEqual(["영업관리", "구매관리", "생산관리", "시스템관리", "모바일", "PDA"]);
  await expect(page.getByTestId("app-navigation")).not.toContainText(/^PC$/);
  for (const name of ["AI 시스템 관리", "AI 솔루션 센터", "AI Q&A"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "AI 시스템 관리", exact: true }).click();
  await expect(page).toHaveURL(/\/ai-system-management$/);
  await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI 시스템 관리");
  await page.getByRole("button", { name: "AI Q&A", exact: true }).click();
  await expect(page).toHaveURL(/\/ai-qa$/);
  await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI Q&A");
  for (const [testId, route] of [
    ["nav-mobile-sales-order", "/mobile/sales-orders"],
    ["nav-mobile-purchase-order", "/mobile/purchase-orders"],
    ["nav-mobile-work-order", "/mobile/work-orders"],
    ["nav-pda-sales-order", "/pda/sales-orders"],
    ["nav-pda-purchase-order", "/pda/purchase-orders"],
    ["nav-pda-work-order", "/pda/work-orders"]
  ] as const) {
    await page.goto("/ai-qa", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-navigation")).toBeVisible();
    await page.getByTestId(testId).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    if (testId === "nav-mobile-sales-order") await expect(page.getByTestId("page-title")).toHaveText("모바일 수주등록");
    else if (testId === "nav-pda-sales-order") await expect(page.getByTestId("page-title")).toHaveText("PDA 수주등록");
    else await expect(page.getByTestId(testId)).toHaveAttribute("aria-current", "page");
  }
});

test("세 업무 화면은 수동 조회·날짜 통제·툴바·설정·도움창 계약을 지킨다", async ({ page }) => {
  await startAs(page, "demo-operator", "일반 사용자");
  await page.getByTestId("btn-search").click();
  await expect(page.getByTestId("status-message")).toHaveCount(0);
  await page.getByTestId("filter-date-to").fill("2026-06-30");
  await expect(page.getByTestId("range-validation-dialog")).toBeVisible();
  await expect(page.getByTestId("filter-date-to")).toHaveValue("2026-07-31");
  await page.getByTestId("range-validation-confirm").click();
  const salesToolbar = await page.locator(".button-bar button").allTextContents();
  expect(salesToolbar.slice(0, 6).map((text) => text.trim())).toEqual(["조회", "신규", "저장", "삭제", "행추가", "행삭제"]);
  await expect(page.getByTestId("btn-partner-lookup")).toHaveCount(0);
  await page.getByTestId("sales-order-line-grid-view-settings").click();
  await expect(page.getByRole("dialog")).toContainText("설정");
  await page.getByRole("button", { name: /닫기/ }).click();

  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("po-filter-firm")).toHaveValue("1000");
  expect((await page.locator(".button-bar button").allTextContents()).slice(0, 6).map((text) => text.trim())).toEqual(["조회", "신규", "저장", "삭제", "행추가", "행삭제"]);
  await expect(page.getByTestId("po-btn-partner-lookup")).toHaveCount(0);

  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("wo-filter-firm")).toHaveValue("1000");
  expect((await page.locator(".button-bar button").allTextContents()).slice(0, 6).map((text) => text.trim())).toEqual(["조회", "신규", "저장", "삭제", "행추가", "행삭제"]);
  await expect(page.getByTestId("wo-btn-item-lookup")).toHaveCount(0);
  await expect(page.getByTestId("wo-btn-line-lookup")).toHaveCount(0);
});

test("회사 지식은 자유형 텍스트 분석 후 사용자 저장 전에는 등록하지 않는다", async ({ page }) => {
  await startAs(page, "demo-manager", "일반 관리자");
  await page.getByTestId("nav-ai-system-management").click();
  await page.getByTestId("company-knowledge-text").fill("수주 확정 후 발주 전환을 진행한다. 납기 변경은 담당자 확인 후 반영한다.");
  await page.getByTestId("company-knowledge-analyze").click();
  await expect(page.getByTestId("company-knowledge-preview")).toBeVisible();
  await expect(page.getByTestId("company-knowledge-count")).toContainText("0개");
  await page.getByTestId("company-knowledge-save").click();
  await expect(page.getByTestId("company-knowledge-count")).toContainText("1개");
  let meetingListRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === "/api/demo/meetings") meetingListRequests += 1;
  });
  await page.getByRole("tab", { name: "회의록", exact: true }).click();
  await expect(page.getByTestId("meeting-source-disclosure")).toHaveJSProperty("open", false);
  await expect.poll(() => meetingListRequests).toBeGreaterThan(0);
  meetingListRequests = 0;
  await page.getByTestId("meeting-filter-date-from").fill("2026-08-01");
  await page.getByTestId("meeting-filter-date-to").fill("2026-08-31");
  await expect.poll(() => meetingListRequests).toBe(0);
  await page.getByTestId("meeting-search").click();
  await expect.poll(() => meetingListRequests).toBe(1);
  const meetingTitle = `사용자 검증 회의 ${Date.now()}`;
  await page.getByTestId("meeting-title").fill(meetingTitle);
  await page.getByTestId("meeting-date").fill("2026-08-03");
  await page.getByTestId("meeting-create").click();
  await expect(page.getByTestId("meeting-list-grid")).toContainText(meetingTitle);
});

test("세 업무 화면은 조건 편집 중 목록 API를 호출하지 않고 조회 클릭마다 한 번만 호출한다", async ({ page }) => {
  await startAs(page, "demo-operator", "일반 사용자");

  const listRequestCounts = new Map<string, number>();
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && ["/api/sales-orders", "/api/purchase-orders", "/api/work-orders"].includes(pathname)) {
      listRequestCounts.set(pathname, (listRequestCounts.get(pathname) ?? 0) + 1);
    }
  });
  const reset = (pathname: string) => listRequestCounts.set(pathname, 0);
  const count = (pathname: string) => listRequestCounts.get(pathname) ?? 0;

  reset("/api/sales-orders");
  await page.getByTestId("filter-partner-code").fill("P001");
  await page.getByTestId("filter-date-from").fill("2026-07-02");
  await page.getByTestId("filter-date-to").fill("2026-07-30");
  expect(count("/api/sales-orders")).toBe(0);
  await page.getByTestId("btn-search").click();
  await expect.poll(() => count("/api/sales-orders")).toBe(1);

  await page.getByTestId("nav-purchase-order").click();
  reset("/api/purchase-orders");
  await page.getByTestId("po-filter-no").fill("PO");
  await page.getByTestId("po-filter-partner").fill("P001");
  await page.getByTestId("po-filter-date-from").fill("2026-07-02");
  expect(count("/api/purchase-orders")).toBe(0);
  await page.getByTestId("po-btn-search").click();
  await expect.poll(() => count("/api/purchase-orders")).toBe(1);

  await page.getByTestId("nav-work-order").click();
  reset("/api/work-orders");
  await page.getByTestId("wo-filter-no").fill("WO");
  await page.getByTestId("wo-filter-item").fill("ITEM");
  await page.getByTestId("wo-filter-date-from").fill("2026-07-02");
  expect(count("/api/work-orders")).toBe(0);
  await page.getByTestId("wo-btn-search").click();
  await expect.poll(() => count("/api/work-orders")).toBe(1);
});
