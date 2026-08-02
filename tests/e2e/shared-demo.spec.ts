import { expect, test, type Browser, type Page } from "@playwright/test";

async function startAs(page: Page, userId: string, label: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("demo-session-gate")).toBeVisible();
  await page.getByRole("combobox", { name: "시연 역할" }).selectOption(userId);
  await page.getByRole("button", { name: "사내 시연 시작" }).click();
  await expect(page.getByTestId("demo-environment-banner")).toContainText(label);
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
  await startAs(page, "demo-manager", "Demo Manager (Manager)");
  await page.getByRole("button", { name: "시연 데이터 초기화" }).click();
  await page.getByLabel("계속하려면 DEMO RESET 입력").fill("DEMO RESET");
  await page.getByRole("button", { name: "초기화 실행" }).click();
  await expect(page.getByRole("status")).toContainText("FINAL-UAT-202608");
  await context.close();
}

test.beforeAll(async ({ browser }) => {
  await resetAsManager(browser);
});

test("DEMO-01 Viewer는 공유 데이터를 조회하지만 변경 기능은 사용할 수 없다", async ({ page }) => {
  await startAs(page, "demo-viewer", "Demo Viewer (Viewer)");
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

  await startAs(operator, "demo-operator", "Demo Operator (Operator)");
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

  await startAs(manager, "demo-manager", "Demo Manager (Manager)");
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
  await startAs(page, "demo-operator", "Demo Operator (Operator)");
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
  await startAs(page, "demo-manager", "Demo Manager (Manager)");
  await openQa(page);
  await page.getByTestId("qa-search").fill("부분 발주 후 발주 가능 잔량");
  await expect(page.getByText("검색 결과 1건")).toBeVisible();
  await page.getByRole("button", { name: "시연 데이터 초기화" }).click();
  const resetButton = page.getByRole("button", { name: "초기화 실행" });
  await expect(resetButton).toBeDisabled();
  await page.getByLabel("계속하려면 DEMO RESET 입력").fill("RESET");
  await expect(resetButton).toBeDisabled();
  await page.getByLabel("계속하려면 DEMO RESET 입력").fill("DEMO RESET");
  await expect(resetButton).toBeEnabled();
});

test("DEMO-05 직접 경로 새로고침에서도 세션과 개발·사내 시연 표시가 유지된다", async ({ page }) => {
  await startAs(page, "demo-operator", "Demo Operator (Operator)");
  await page.goto("/ai-solution-center", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("demo-environment-banner")).toContainText("실제 운영 데이터가 아닙니다");
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("demo-environment-banner")).toContainText("Demo Operator (Operator)");
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
});
