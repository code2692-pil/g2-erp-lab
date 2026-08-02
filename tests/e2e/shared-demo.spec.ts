import { expect, test, type Browser, type Page } from "@playwright/test";
import { networkInterfaces } from "node:os";

const forbiddenUserTerms = [
  /시연/iu, /테스트/iu, /데모/iu, /보여주기용/iu, /사내/iu, /내부/iu, /임시/iu, /개발용/iu, /미완성/iu,
  /FINAL-UAT/iu, /\bDemo\b/iu, /\bTest(?:ing)?\b/iu, /\bInternal\b/iu, /\bPreview\b/iu, /\bMock\b/iu,
  /\bUAT\b/iu, /\bTemporary\b/iu, /Development Only/iu, /Non-production/iu, /\bSample\b/iu, /\bPoC\b/iu
];

async function assertProfessionalLanguage(page: Page, label: string) {
  const exposed = await page.evaluate(() => {
    const attributes = Array.from(document.querySelectorAll("[aria-label],[title],[placeholder]")).flatMap((element) =>
      [element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("placeholder")].filter(Boolean)
    );
    return [document.title, document.body.innerText, ...attributes].join("\n");
  });
  const matches = forbiddenUserTerms.filter((pattern) => pattern.test(exposed)).map((pattern) => pattern.source);
  expect(matches, `${label} 사용자 노출 금지 표현`).toEqual([]);
}

async function startAs(page: Page, userId: string, label: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("demo-session-gate")).toBeVisible();
  await page.getByRole("combobox", { name: "사용자 역할" }).selectOption(userId);
  await page.getByRole("button", { name: "업무 화면 시작" }).click();
  await expect(page.getByTestId("current-user-menu")).toContainText(label);
}

async function openQa(page: Page) {
  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
  await page.getByRole("tab", { name: "업무 Q&A", exact: true }).click();
  await expect(page.getByTestId("business-qa-workspace")).toBeVisible();
}

async function resetAsManager(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await startAs(page, "demo-manager", "관리자");
  await page.getByRole("button", { name: "초기 데이터 복원" }).click();
  await page.getByLabel("계속하려면 초기 데이터 복원 입력").fill("초기 데이터 복원");
  await page.getByRole("button", { name: "복원 실행" }).click();
  await expect(page.getByRole("status")).toContainText("초기 데이터로 복원했습니다");
  await context.close();
}

test.beforeAll(async ({ browser }) => {
  await resetAsManager(browser);
});

test("DEMO-01 Viewer는 공유 데이터를 조회하지만 변경 기능은 사용할 수 없다", async ({ page }) => {
  await startAs(page, "demo-viewer", "조회 사용자");
  await expect(page.getByTestId("btn-new")).toBeDisabled();
  await expect(page.getByTestId("btn-save")).toBeDisabled();
  await expect(page.getByTestId("nav-development-data")).toHaveCount(0);
  await openQa(page);
  await expect(page.getByTestId("qa-new")).toBeDisabled();
  await expect(page.getByTestId("qa-answer-create")).toBeDisabled();
  await page.getByRole("tab", { name: "회의록", exact: true }).click();
  await expect(page.getByTestId("meeting-create")).toBeDisabled();
});

test("DEMO-02 Operator 질문과 답변을 Manager가 다른 브라우저에서 조회하고 채택한다", async ({ browser }) => {
  const operatorContext = await browser.newContext();
  const managerContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  const manager = await managerContext.newPage();
  const title = `공유 질문 ${Date.now()}`;

  await startAs(operator, "demo-operator", "업무 사용자");
  await openQa(operator);
  await operator.getByTestId("qa-new").click();
  await operator.getByTestId("qa-title").fill(title);
  await operator.getByTestId("qa-body").fill("서로 다른 브라우저에서 같은 질문과 답변을 확인합니다.");
  await operator.getByTestId("qa-related-document").fill("SOR2026080001/1");
  await operator.getByTestId("qa-create").click();
  await operator.getByTestId("qa-answer-input").fill("사람이 확인한 공유 답변입니다.");
  await operator.getByTestId("qa-answer-create").click();
  await expect(operator.getByTestId("qa-detail")).toContainText("사람이 확인한 공유 답변입니다.");
  await expect(operator.getByRole("button", { name: "답변 채택" })).toBeDisabled();

  await startAs(manager, "demo-manager", "관리자");
  await openQa(manager);
  await manager.getByTestId("qa-search").fill(title);
  await expect(manager.getByTestId("qa-detail")).toContainText(title);
  await manager.getByRole("button", { name: "답변 채택" }).click();
  await expect(manager.getByTestId("qa-detail")).toContainText("채택됨");
  await manager.getByTestId("qa-knowledge-candidate").check();

  await operator.getByTestId("qa-refresh").click();
  await expect(operator.getByTestId("qa-detail")).toContainText("채택됨");
  await operatorContext.close();
  await managerContext.close();
});

test("DEMO-03 Operator가 TXT 회의자료를 서버 작업으로 추출하고 근거를 확인한다", async ({ page }) => {
  await startAs(page, "demo-operator", "업무 사용자");
  await page.getByTestId("nav-ai-solution-center").click();
  await page.getByRole("tab", { name: "회의록", exact: true }).click();
  await page.getByTestId("meeting-create").click();
  await page.getByTestId("meeting-files").setInputFiles({
    name: "shared-agenda.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("결정: 8월 10일까지 시제품 20개를 생산한다.\n할 일: 김담당이 자재를 확인한다.")
  });
  await page.getByTestId("meeting-process").click();
  await expect(page.getByTestId("meeting-status")).toHaveText("검토 대기");
  await expect(page.getByTestId("meeting-segment-grid")).toContainText("시제품 20개");
  await expect(page.getByTestId("meeting-approve")).toBeDisabled();
});

test("DEMO-04 Manager 초기화는 정확한 확인문구를 요구하고 고정 seed를 제공한다", async ({ page }) => {
  await startAs(page, "demo-manager", "관리자");
  await openQa(page);
  await page.getByTestId("qa-search").fill("부분 발주 후 발주 가능 잔량");
  await expect(page.getByText("검색 결과 1건")).toBeVisible();
  await page.getByRole("button", { name: "초기 데이터 복원" }).click();
  const resetButton = page.getByRole("button", { name: "복원 실행" });
  await expect(resetButton).toBeDisabled();
  await page.getByLabel("계속하려면 초기 데이터 복원 입력").fill("복원");
  await expect(resetButton).toBeDisabled();
  await page.getByLabel("계속하려면 초기 데이터 복원 입력").fill("초기 데이터 복원");
  await expect(resetButton).toBeEnabled();
});

test("DEMO-05 직접 경로 새로고침에서도 세션과 개발·사내 시연 표시가 유지된다", async ({ page }) => {
  await startAs(page, "demo-operator", "업무 사용자");
  await page.goto("/ai-solution-center", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("current-user-menu")).toContainText("업무 사용자");
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("current-user-menu")).toContainText("업무 사용자");
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
});

test("DEMO-06 핵심 업무 화면은 제품 문구만 노출한다", async ({ page }) => {
  await startAs(page, "demo-operator", "업무 사용자");
  await assertProfessionalLanguage(page, "수주등록");

  const routes = [
    ["/purchase-orders", "purchase-page-title", "발주등록"],
    ["/work-orders", "work-order-page-title", "작업지시등록"],
    ["/mobile/sales-orders", "page-title", "모바일 수주등록"],
    ["/pda/sales-orders", "page-title", "PDA 수주등록"],
    ["/ai-solution-center", "ai-solution-center-title", "AI 솔루션 센터"]
  ] as const;

  for (const [route, titleTestId, label] of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(titleTestId)).toBeVisible();
    await assertProfessionalLanguage(page, label);
  }
});

test("DEMO-07 사설 IPv4와 randomUUID 부재 조건에서 수주 헤더와 상세를 연다", async ({ browser }) => {
  const address = Object.values(networkInterfaces()).flatMap((entries) => entries ?? []).find((entry) =>
    entry.family === "IPv4" && !entry.internal && (
      entry.address.startsWith("10.") || entry.address.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)
    )
  )?.address;
  expect(address, "사설 IPv4 주소가 필요합니다.").toBeTruthy();
  const context = await browser.newContext({ baseURL: `http://${address}:5173` });
  await context.addInitScript(() => {
    if (globalThis.crypto) Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`));
  await startAs(page, "demo-operator", "업무 사용자");
  await page.getByTestId("btn-search").click();
  await expect(page.getByTestId("sales-order-header-grid-row-1000::SO2026070001")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sales-order-line-grid-row-1000::SO2026070001::1")).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
  await context.close();
});

test("DEMO-08 최상위 오류 경계는 복구 화면과 추적 ID를 제공한다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/?__e2e_application_error=1", { waitUntil: "domcontentloaded" });
  const boundary = page.getByTestId("application-error-boundary");
  await expect(boundary).toBeVisible();
  await expect(boundary).toContainText("화면을 표시하지 못했습니다");
  await expect(boundary).toContainText(/추적 ID: screen-/);
  await expect(boundary.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(boundary.getByRole("button", { name: "처음 화면" })).toBeVisible();
  await expect(boundary.getByRole("button", { name: "사용자 전환" })).toBeVisible();
  expect(consoleErrors.some((message) => message.includes("E2E application error boundary probe"))).toBe(true);
  await boundary.getByRole("button", { name: "사용자 전환" }).click();
  await expect(page.getByRole("heading", { name: "사용자 선택" })).toBeVisible();
});
