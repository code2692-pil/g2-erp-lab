import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

function collectBrowserProblems(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  return { consoleErrors, pageErrors, externalRequests };
}

async function openCenter(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI 솔루션 센터");
}

function expectNoBrowserProblems(problems: ReturnType<typeof collectBrowserProblems>) {
  expect(problems.consoleErrors).toEqual([]);
  expect(problems.pageErrors).toEqual([]);
  expect(problems.externalRequests).toEqual([]);
}

test("AI 센터 A: 컨설턴트 TXT를 로컬에서 읽어 기본 가이드를 만든다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openCenter(page);
  await expect(page.locator("label[for='ai-file-input']")).toBeVisible();
  await expect(page.getByTestId("ai-file-status")).toHaveAttribute("aria-live", "polite");
  await page.getByTestId("ai-file-input").setInputFiles(resolve("tests/e2e/fixtures/ai-solution-consultant.txt"));
  await expect(page.getByTestId("ai-file-list")).toContainText("ai-solution-consultant.txt");
  await expect(page.getByTestId("ai-file-status")).toContainText("첨부 파일 1건");
  await expect(page.getByTestId("ai-file-list")).toContainText("자동 텍스트 추출 가능");
  await page.getByTestId("ai-domain-select").selectOption("LOT");
  await page.getByTestId("ai-situation-input").fill("핵심 품목부터 단계적으로 LOT와 검사 이력을 연결하는 기준을 검토하고 싶습니다.");
  const analyzeButton = page.getByTestId("ai-consultant-analyze");
  await analyzeButton.focus();
  await expect(analyzeButton).toBeFocused();
  await analyzeButton.click();
  await expect(page.getByTestId("ai-result-recommendation")).toHaveText("통합형 LOT·추적성 관리");
  await expect(page.getByTestId("ai-result-confidence")).toBeVisible();
  await expect(page.getByTestId("ai-result-external-review")).toContainText("검토 필요");
  await expect(page.getByTestId("ai-result-heading")).toBeFocused();
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("ai-result")).toHaveCount(1);
  expectNoBrowserProblems(problems);
});

test("AI 센터 B: 지원하지 않는 MP4도 첨부를 유지하고 상황 설명으로 가이드를 만든다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("ai-file-input").setInputFiles({ name: "process-video.mp4", mimeType: "video/mp4", buffer: Buffer.from("not-a-real-video") });
  await expect(page.getByTestId("ai-file-list")).toContainText("process-video.mp4");
  await expect(page.getByTestId("ai-file-list")).toContainText("현재 PoC에서는 내용을 자동 추출하지 않습니다.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByRole("alert")).toHaveText("분석할 수 있는 텍스트 내용이나 상황 설명을 입력해 주세요.");
  await page.getByTestId("ai-situation-input").fill("현장 작업 영상에는 핵심 공정의 검사 누락과 입력 부담이 나타납니다. 우선 적용 기준을 검토해 주세요.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  await expect(page.getByTestId("ai-result-external-review")).toContainText("검토 필요");
  expectNoBrowserProblems(problems);
});

test("AI 센터 C: 고객 추적성 질문에 LOT 중심 단계 적용과 확인 질문을 제시한다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByRole("tab", { name: "고객 업무 Q&A" }).click();
  await page.getByTestId("ai-customer-guide").click();
  await expect(page.getByRole("alert")).toHaveText("현재 상황, 원하는 기준, 현장 제약을 조금 더 설명해 주세요.");
  await expect(page.getByTestId("ai-customer-inquiry")).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "예시 질문 넣기" }).click();
  await page.getByTestId("ai-customer-guide").click();
  await expect(page.getByTestId("ai-result-recommendation")).toHaveText("통합형 LOT·추적성 관리");
  await expect(page.getByTestId("ai-result-phased-plan")).toBeVisible();
  await expect(page.getByTestId("ai-result-questions")).toBeVisible();
  await expect(page.getByTestId("ai-result-external-review")).toContainText("검토 필요");
  expectNoBrowserProblems(problems);
});

test("AI 센터 D: 기존 업무 화면과 AI 메뉴 전환 뒤 기본 도구모음을 유지한다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await expect(page.getByTestId("btn-search")).toBeVisible();
  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
  await expect(page.getByTestId("po-btn-search")).toBeVisible();
  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
  await expect(page.getByTestId("wo-btn-search")).toBeVisible();
  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
  expectNoBrowserProblems(problems);
});
