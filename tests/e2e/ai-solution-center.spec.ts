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

async function applyCompanyKnowledgeSample(page: Page) {
  await page.getByTestId("company-knowledge-input").setInputFiles(resolve("docs/ai-solution-center/company-knowledge-sample.json"));
  await expect(page.getByTestId("company-knowledge-count")).toHaveText("현재 적용된 회사 지식 3개");
  await expect(page.getByTestId("company-knowledge-list")).toContainText("PoC 예시: 자재 LOT 연결 관리");
}

async function openCompanyLotQuestion(page: Page) {
  await page.getByRole("tab", { name: "고객 업무 Q&A" }).click();
  await page.getByTestId("ai-customer-inquiry").fill("공급업체 LOT와 내부 LOT 연결 기준이 달라 입고 이후 추적이 어렵습니다. 현장에 부담이 적은 관리 방식을 검토하고 싶습니다.");
  await page.getByTestId("ai-customer-current-management").fill("입고 때 공급업체 LOT를 확인하지만 내부 관리 기준은 분리되어 있습니다.");
  await page.getByTestId("ai-customer-guide").click();
}

async function openCustomerAnalysis(page: Page) {
  await page.getByRole("tab").nth(1).click();
  await page.getByTestId("ai-customer-inquiry").fill("Supplier LOT traceability must continue from receiving through production and packaging. The field team needs a practical ERP guide.");
  await page.getByTestId("ai-customer-current-management").fill("Receiving checks supplier LOT, but production and packaging records are separated.");
  await page.getByTestId("ai-customer-desired-standard").fill("One trace record must connect receiving, production, inspection, and packaging.");
  await page.getByTestId("ai-customer-field-constraints").fill("Operators need a short barcode-based input flow.");
  await page.getByTestId("ai-customer-guide").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
}

async function fillTwoFollowupAnswers(page: Page) {
  const fields = page.locator("[data-testid^='followup-answer-']");
  const ids = await fields.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")).filter((id): id is string => Boolean(id)));
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await page.getByTestId(ids[0]).fill("Receiving creates the supplier LOT and packaging confirms the final trace label.");
  await page.getByTestId(ids[1]).fill("Barcode scanning is available at the receiving and packaging workstations.");
}

test("회사 지식 A: 정상 JSON을 적용하면 두 탭의 추천 근거에 회사 지식이 표시된다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await expect(page.getByTestId("company-knowledge-input")).toHaveAttribute("accept", ".json,application/json");
  await applyCompanyKnowledgeSample(page);
  await page.getByTestId("ai-situation-input").fill("공급업체 LOT와 내부 LOT 연결 기준을 입고 단계에서 정리하고 싶습니다.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("ai-evidence-poc-material-lot-001")).toContainText("회사 지식");
  await openCompanyLotQuestion(page);
  await expect(page.getByTestId("ai-evidence-poc-material-lot-001")).toContainText("회사 지식");
  await expect(page.getByTestId("company-knowledge-reference")).toContainText("컨설턴트와 개발자의 검토가 필요합니다.");
  await expect(page.getByTestId("ai-result-questions")).toContainText("컨설턴트 확인");
  await expect(page.getByTestId("ai-result-questions")).toContainText("개발 담당자 확인");
  expectNoBrowserProblems(problems);
});

test("회사 지식 B: JSON parse 오류는 기존 적용 지식을 보존하고 추천에 계속 사용한다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await applyCompanyKnowledgeSample(page);
  await page.getByTestId("company-knowledge-input").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByTestId("company-knowledge-error")).toContainText("JSON 형식을 읽지 못했습니다.");
  await expect(page.getByTestId("company-knowledge-count")).toHaveText("현재 적용된 회사 지식 3개");
  await openCompanyLotQuestion(page);
  await expect(page.getByTestId("ai-evidence-poc-material-lot-001")).toBeVisible();
  expectNoBrowserProblems(problems);
});

test("회사 지식 C: schema 오류는 문제 field를 안내하고 부분 적용하지 않는다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("company-knowledge-input").setInputFiles({ name: "missing-field.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ id: "missing-title" }])) });
  await expect(page.getByTestId("company-knowledge-error")).toContainText("필수 field 'title'");
  await expect(page.getByTestId("company-knowledge-count")).toHaveText("현재 적용된 회사 지식 0개");
  await expect(page.getByTestId("company-knowledge-input")).toHaveAttribute("aria-invalid", "true");
  expectNoBrowserProblems(problems);
});

test("회사 지식 D: 초기화하면 기본 지식만 남고 회사 지식 근거가 사라진다", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await applyCompanyKnowledgeSample(page);
  await page.getByTestId("company-knowledge-reset").focus();
  await expect(page.getByTestId("company-knowledge-reset")).toBeFocused();
  await page.getByTestId("company-knowledge-reset").click();
  await expect(page.getByTestId("company-knowledge-count")).toHaveText("현재 적용된 회사 지식 0개");
  await openCompanyLotQuestion(page);
  await expect(page.getByTestId("company-knowledge-reference")).toHaveCount(0);
  await expect(page.getByTestId("ai-result-evidence")).toContainText("일반 지식");
  expectNoBrowserProblems(problems);
});

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

test("Gate 12-3 A: customer answers create a second recommendation revision", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await openCustomerAnalysis(page);
  await expect(page.getByTestId("followup-panel")).toBeVisible();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("1 / 3");
  await fillTwoFollowupAnswers(page);
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("2 / 3");
  await expect(page.getByTestId("revision-summary")).toContainText("Receiving creates the supplier LOT");
  await expect(page.getByTestId("ai-result")).toContainText("Barcode scanning is available");
  await expect(page.getByTestId("ai-result-external-review")).toBeVisible();
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("3 / 3");
  await expect(page.getByTestId("followup-refine")).toHaveCount(0);
  await expect(page.getByTestId("analysis-limit-notice")).toBeVisible();
  expectNoBrowserProblems(problems);
});

test("Gate 12-3 B: a blank follow-up is blocked without losing the first revision", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await openCustomerAnalysis(page);
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("followup-error")).toHaveText("추가 질문 중 하나 이상에 답변해 주세요.");
  await expect(page.getByTestId("analysis-revision-status")).toContainText("1 / 3");
  await expect(page.getByTestId("ai-result")).toHaveCount(1);
  expectNoBrowserProblems(problems);
});

test("Gate 12-3 C: company evidence is retained through refinement with no more than three sources", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await applyCompanyKnowledgeSample(page);
  await openCustomerAnalysis(page);
  await expect(page.getByTestId("ai-evidence-poc-material-lot-001")).toBeVisible();
  await expect(page.getByTestId("ai-evidence-lot-traceability")).toBeVisible();
  await fillTwoFollowupAnswers(page);
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("2 / 3");
  await expect(page.getByTestId("ai-evidence-poc-material-lot-001")).toBeVisible();
  expect(await page.getByTestId("ai-result-evidence").locator("li").count()).toBeLessThanOrEqual(3);
  expectNoBrowserProblems(problems);
});

test("Gate 12-3 D: session reset clears analysis state but preserves the company knowledge pack", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await applyCompanyKnowledgeSample(page);
  await openCustomerAnalysis(page);
  await fillTwoFollowupAnswers(page);
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("2 / 3");
  await page.getByTestId("analysis-session-reset").focus();
  await expect(page.getByTestId("analysis-session-reset")).toBeFocused();
  await page.getByTestId("analysis-session-reset").click();
  await expect(page.getByTestId("ai-result")).toHaveCount(0);
  await expect(page.getByTestId("company-knowledge-count")).toContainText("3");
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByTestId("ai-customer-inquiry")).toHaveValue("");
  expectNoBrowserProblems(problems);
});

test("Gate 12-3 E: copy and Markdown download export the active result without external requests", async ({ page }) => {
  await page.addInitScript(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = (value) => {
      const url = originalCreateObjectUrl.call(URL, value);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      originalRevokeObjectUrl.call(URL, url);
    };
    (window as Window & { gate12ObjectUrls?: { created: string[]; revoked: string[] } }).gate12ObjectUrls = { created, revoked };
  });
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await openCustomerAnalysis(page);
  await page.getByTestId("result-copy").click();
  await expect(page.getByTestId("result-export-status")).toHaveText("결과를 클립보드에 복사했습니다.");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("# AI 솔루션 센터 분석 결과");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("result-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ai-solution-customer-\d{14}\.md$/);
  await expect(page.getByTestId("result-export-status")).toContainText("Markdown");
  await expect.poll(() => page.evaluate(() => window.gate12ObjectUrls)).toEqual(expect.objectContaining({ created: expect.any(Array), revoked: expect.any(Array) }));
  const objectUrls = await page.evaluate(() => window.gate12ObjectUrls);
  expect(objectUrls?.created).toHaveLength(1);
  expect(objectUrls?.revoked).toEqual(objectUrls?.created);
  expectNoBrowserProblems(problems);
});

test("Gate 12-4 A: an unsupported MP4 note drives a local recommendation and input evidence", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openCenter(page);
  await page.getByTestId("ai-file-input").setInputFiles({ name: "process-video.mp4", mimeType: "video/mp4", buffer: Buffer.from("not-a-real-video") });
  await expect(page.locator("[data-testid^='file-note-']")).toHaveCount(1);
  await page.locator("[data-testid^='file-note-']").fill("검사와 포장 공정에서만 바코드 스캔이 가능합니다. 시작 단계에는 기존 수기 기록 이력도 함께 확인해야 합니다.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  await expect(page.getByTestId("ai-result-phased-plan")).toContainText("process-video.mp4 메모");
  await expect(page.getByTestId("input-evidence-file-1-note")).toContainText("process-video.mp4");
  await expect(page.getByTestId("input-evidence-file-1-note")).toContainText("추천 반영: 사용됨");
  expectNoBrowserProblems(problems);
});

test("Gate 12-4 B: extracted TXT and an added note remain separate evidence entries", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("ai-file-input").setInputFiles(resolve("tests/e2e/fixtures/ai-solution-consultant.txt"));
  await expect(page.getByTestId("ai-file-list")).toContainText("자동 텍스트 추출 가능");
  await page.locator("[data-testid^='file-note-']").fill("LOT 생성은 입고 시점에 확정하고 검사 이력까지 연결해야 합니다.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("input-evidence-file-1-extracted")).toBeVisible();
  await expect(page.getByTestId("input-evidence-file-1-note")).toBeVisible();
  await expect(page.getByTestId("input-evidence-file-1-extracted")).toContainText("자동 추출 텍스트");
  await expect(page.getByTestId("input-evidence-file-1-note")).toContainText("파일별 주요 내용·의사결정");
  await expect(page.getByTestId("input-evidence-file-1-note")).toHaveCount(1);
  expectNoBrowserProblems(problems);
});

test("Gate 12-4 C: removing a file retains the prior result until a new analysis omits its evidence", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("ai-file-input").setInputFiles({ name: "process-video.mp4", mimeType: "video/mp4", buffer: Buffer.from("not-a-real-video") });
  await page.locator("[data-testid^='file-note-']").fill("검사와 포장 공정에서 바코드 스캔을 적용합니다.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("input-evidence-file-1-note")).toBeVisible();
  await page.getByRole("button", { name: "process-video.mp4 제거" }).click();
  await expect(page.getByTestId("ai-file-list")).toHaveCount(0);
  await expect(page.getByTestId("input-evidence-file-1-note")).toBeVisible();
  await page.getByTestId("ai-situation-input").fill("검사 공정의 입력 시점과 작업 이력을 정리해야 합니다.");
  await page.getByTestId("ai-consultant-analyze").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  await expect(page.getByTestId("input-evidence")).not.toContainText("process-video.mp4");
  expectNoBrowserProblems(problems);
});

test("Gate 12-4 D: customer analysis exposes and copies a consultant handover summary", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await openCustomerAnalysis(page);
  await fillTwoFollowupAnswers(page);
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("2 / 3");
  await expect(page.getByTestId("consultant-handover")).toContainText("현재 상황");
  await expect(page.getByTestId("consultant-handover")).toContainText("추천 기본 방향");
  await expect(page.getByTestId("consultant-handover")).toContainText("아직 확인이 필요한 사항");
  await page.getByTestId("handover-copy").focus();
  await expect(page.getByTestId("handover-copy")).toBeFocused();
  await page.getByTestId("handover-copy").click();
  await expect(page.getByTestId("handover-copy-status")).toHaveText("컨설턴트 인계 요약을 복사했습니다.");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("# 컨설턴트 인계 요약");
  expect(clipboard).toContain("분석 차수: 2차 분석");
  expectNoBrowserProblems(problems);
});

test("Gate 12-5 A: balanced priorities compare four traceability options with a roadmap", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openCenter(page);
  await page.getByTestId("priority-preset-balanced").focus();
  await expect(page.getByTestId("priority-preset-balanced")).toBeFocused();
  await page.getByTestId("priority-preset-balanced").click();
  await expect(page.getByTestId("priority-value-traceability")).toContainText("3 / 5");
  await openCustomerAnalysis(page);
  await expect(page.getByTestId("option-comparison")).toBeVisible();
  await expect(page.locator("[data-testid^='option-trace-']")).toHaveCount(4);
  await expect(page.getByTestId("option-trace-integrated-lot")).toContainText("1순위");
  await expect(page.getByTestId("option-recommended-trace-integrated-lot")).toHaveText("추천 1순위");
  await expect(page.getByTestId("option-roadmap").locator("article")).toHaveCount(3);
  await expect(page.getByTestId("option-reconsideration")).toBeVisible();
  expectNoBrowserProblems(problems);
});

test("Gate 12-5 B: traceability re-comparison preserves the analysis revision and company snapshot", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await applyCompanyKnowledgeSample(page);
  await openCustomerAnalysis(page);
  await expect(page.getByTestId("analysis-revision-status")).toContainText("1 / 3");
  await expect(page.getByTestId("company-knowledge-reference")).toBeVisible();
  await page.getByTestId("priority-preset-traceability").click();
  await page.getByTestId("recompare-options").click();
  await expect(page.getByTestId("comparison-status")).toHaveText("비교 기준이 변경되었습니다.");
  await expect(page.getByTestId("analysis-revision-status")).toContainText("1 / 3");
  await expect(page.getByTestId("company-knowledge-reference")).toBeVisible();
  await expect(page.getByTestId("option-trace-integrated-lot")).toContainText("1순위");
  expectNoBrowserProblems(problems);
});

test("Gate 12-5 C: field-burden priority changes the baseline to the low-burden option", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("priority-preset-field-burden").click();
  await expect(page.getByTestId("priority-value-fieldBurden")).toContainText("5 / 5");
  await openCustomerAnalysis(page);
  await expect(page.getByTestId("option-trace-lot-centered")).toContainText("1순위");
  await expect(page.getByTestId("ai-result-recommendation")).toHaveText("LOT 중심 관리");
  expectNoBrowserProblems(problems);
});

test("Gate 12-5 D: scalability priority exposes a staged serial expansion roadmap", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("priority-preset-scalability").click();
  await openCustomerAnalysis(page);
  await expect(page.getByTestId("option-trace-staged-serial")).toContainText("1순위");
  await expect(page.getByTestId("option-roadmap")).toContainText("시범 품목");
  await expect(page.getByTestId("option-roadmap")).toContainText("시범 공정");
  await expect(page.getByTestId("option-reconsideration")).toBeVisible();
  expectNoBrowserProblems(problems);
});

test("Gate 12-5 E: handover and Markdown include priorities, comparison, and roadmap without estimates", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await openCustomerAnalysis(page);
  await fillTwoFollowupAnswers(page);
  await page.getByTestId("followup-refine").click();
  await expect(page.getByTestId("analysis-revision-status")).toContainText("2 / 3");
  await page.getByTestId("priority-preset-scalability").click();
  await page.getByTestId("recompare-options").click();
  await page.getByTestId("handover-copy").click();
  const handover = await page.evaluate(() => navigator.clipboard.readText());
  expect(handover).toContain("선택 우선순위");
  expect(handover).toContain("추천 1순위");
  expect(handover).toContain("3단계 로드맵");
  await page.getByTestId("result-copy").click();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toContain("## 솔루션 대안 비교");
  expect(markdown).toContain("## 적용 로드맵");
  expect(markdown).toContain("비교 점수는 PoC의 상대 우선순위");
  expect(markdown).not.toMatch(/\b\d+\s*(원|일|개월|주)\b/);
  expectNoBrowserProblems(problems);
});

test("Gate 12-6 A: apply review requires a role and checklist without changing the analysis", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openCenter(page);
  await openCustomerAnalysis(page);
  const recommendation = await page.getByTestId("ai-result-recommendation").textContent();
  await page.getByTestId("review-status").selectOption("APPLY");
  await page.getByTestId("reviewer-role").selectOption("CONSULTANT");
  await page.getByTestId("review-check-CONSULTANT_CURRENT_PROCESS").check();
  await page.getByTestId("review-record-save").click();
  await expect(page.getByTestId("review-summary")).toContainText("적용 검토");
  await expect(page.getByTestId("review-summary")).toContainText(recommendation ?? "");
  await expect(page.getByTestId("ai-result-recommendation")).toHaveText(recommendation ?? "");
  expectNoBrowserProblems(problems);
});

test("Gate 12-6 B: business-decision status blocks a blank reason and extends Markdown", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await openCustomerAnalysis(page);
  await page.getByTestId("review-status").selectOption("NEEDS_BUSINESS_DECISION");
  await page.getByTestId("review-record-save").click();
  await expect(page.getByTestId("review-error")).toContainText("결정이 필요한 항목");
  await page.getByTestId("review-decision-reason").fill("시리얼 생성 시점과 재작업 기준은 업무 책임자의 결정이 필요합니다.");
  await page.getByTestId("review-record-save").click();
  await expect(page.getByTestId("review-summary")).toContainText("업무결정 필요");
  await page.getByTestId("result-copy").click();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toContain("## 솔루션 검토 및 판단");
  expect(markdown).toContain("NEEDS_BUSINESS_DECISION");
  await page.getByTestId("handover-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("검토 상태");
  expectNoBrowserProblems(problems);
});

test("Gate 12-6 C: review package download contains the strict safe summary only", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await openCustomerAnalysis(page);
  await page.getByTestId("review-status").selectOption("APPLY");
  await page.getByTestId("reviewer-role").selectOption("CONSULTANT");
  await page.getByTestId("review-check-CONSULTANT_CURRENT_PROCESS").check();
  await page.getByTestId("review-record-save").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("review-package-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ai-solution-review-\d{14}\.json$/);
  const stream = await download.createReadStream();
  let body = "";
  for await (const chunk of stream ?? []) body += chunk.toString();
  const reviewPackage = JSON.parse(body) as { packageType: string; schemaVersion: string; case: Record<string, unknown> };
  expect(reviewPackage.packageType).toBe("AI_SOLUTION_REVIEW_PACKAGE");
  expect(reviewPackage.schemaVersion).toBe("1.0");
  expect(reviewPackage.case.recommendedOption).toBeTruthy();
  expect(JSON.stringify(reviewPackage)).not.toContain("Supplier LOT traceability must continue");
  expect(JSON.stringify(reviewPackage)).not.toContain("C:\\Users\\");
  expect(JSON.stringify(reviewPackage)).not.toMatch(/password|secret|fileBinary|rawFileContent/i);
  expectNoBrowserProblems(problems);
});

test("Gate 12-6 D: a valid review package loads separately from the current analysis", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await openCustomerAnalysis(page);
  const inquiry = await page.getByTestId("ai-customer-inquiry").inputValue();
  await page.getByTestId("review-package-input").setInputFiles(resolve("docs/ai-solution-center/review-package-sample.json"));
  await expect(page.getByTestId("loaded-review-package")).toContainText("통합형 LOT·추적성 관리");
  await expect(page.getByTestId("loaded-review-package")).toContainText("업무결정 필요");
  await expect(page.getByTestId("ai-customer-inquiry")).toHaveValue(inquiry);
  await expect(page.getByTestId("ai-result")).toBeVisible();
  expectNoBrowserProblems(problems);
});

test("Gate 12-6 E: a dangerous package is rejected atomically and a changed analysis keeps the review baseline", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.getByTestId("review-package-input").setInputFiles(resolve("docs/ai-solution-center/review-package-sample.json"));
  await expect(page.getByTestId("loaded-review-package")).toBeVisible();
  await page.getByTestId("review-package-input").setInputFiles({ name: "dangerous.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ packageType: "AI_SOLUTION_REVIEW_PACKAGE", schemaVersion: "1.0", case: {}, script: "alert(1)" })) });
  await expect(page.getByTestId("review-package-import-error")).toContainText("package.script");
  await expect(page.getByTestId("loaded-review-package")).toBeVisible();
  await openCustomerAnalysis(page);
  await page.getByTestId("review-status").selectOption("APPLY");
  await page.getByTestId("reviewer-role").selectOption("CONSULTANT");
  await page.getByTestId("review-check-CONSULTANT_CURRENT_PROCESS").check();
  await page.getByTestId("review-record-save").click();
  await page.getByTestId("priority-preset-field-burden").click();
  await page.getByTestId("recompare-options").click();
  await expect(page.getByTestId("review-analysis-changed")).toBeVisible();
  await expect(page.getByTestId("review-summary")).toContainText("적용 검토");
  expectNoBrowserProblems(problems);
});

test("Gate 12-4 E: full Markdown includes evidence and handover without copying the whole inquiry", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await openCenter(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await applyCompanyKnowledgeSample(page);
  await page.getByRole("tab").nth(1).click();
  const fullInquiry = `LOT traceability needs inspection and packaging evidence. ${"비공개전체본문".repeat(90)}`;
  await page.getByTestId("ai-customer-inquiry").fill(fullInquiry);
  await page.getByTestId("ai-customer-current-management").fill("Receiving and packaging records are separated.");
  await page.getByTestId("ai-customer-guide").click();
  await expect(page.getByTestId("company-knowledge-reference")).toBeVisible();
  await page.getByTestId("result-copy").click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("## 분석에 사용한 입력 근거");
  expect(clipboard).toContain("## 참고한 지식 근거");
  expect(clipboard).toContain("## 컨설턴트 인계 요약");
  expect(clipboard).not.toContain(fullInquiry);
  expect(clipboard).not.toContain("C:\\Users\\");
  expectNoBrowserProblems(problems);
});
