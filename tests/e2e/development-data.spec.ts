import { consumeWorkerPreparedPage, createWorkerWarmupTest, expect, type Page } from "./worker-frontend-warmup.fixture";

const test = createWorkerWarmupTest("development-data");

async function text(page: Page, selector: string) {
  const values = await page.locator(selector).allTextContents();
  return values.join(" | ").replace(/\s+/g, " ").trim() || "(not rendered)";
}

async function diagnostic(page: Page, error: unknown) {
  const [environment, status, summary, snackbar, latestLog] = await Promise.all([
    text(page, ".development-data-environment"),
    text(page, "[data-testid='tdm-safety-status']"),
    text(page, ".development-data-summary"),
    text(page, "[role='status']"),
    text(page, ".development-data-log tbody tr:first-child")
  ]);
  const cause = error instanceof Error ? error.message : String(error);
  return new Error(["Development-data verification failed.", `Mode / RepositoryMode: ${environment}`, `Safety status: ${status}`, `Snackbar: ${snackbar}`, `Latest log: ${latestLog}`, `Summary: ${summary}`, `Cause: ${cause}`].join("\n"));
}

async function openDevelopmentDataManager(page: Page) {
  if (!consumeWorkerPreparedPage(page)) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("nav-development-data")).toBeVisible();
    await page.getByTestId("nav-development-data").click();
  }
  await expect(page.getByTestId("development-data-page-title")).toHaveText("기준 데이터 관리");
}

test("기준 데이터 관리에서 변경 예상, 생성, 재실행, 확인 문구 기반 초기화를 처리한다", async ({ page }) => {
  try {
    await openDevelopmentDataManager(page);
    await expect(page.getByTestId("tdm-safety-status")).toContainText("데이터 관리 사용 가능");

    await page.getByTestId("tdm-btn-preview-all").click();
    await expect(page.getByTestId("tdm-preview-result")).toContainText("데이터 변경 없음");

    await page.getByTestId("tdm-btn-seed-all").click();
    await expect(page.locator(".development-data-log tbody tr:first-child")).toContainText(/seed\s*\/\s*all[\s\S]*Success/);
    await expect(page.locator(".development-data-summary")).toContainText(/기준 품목\s*6/);

    await page.getByTestId("tdm-btn-seed-all").click();
    await expect(page.locator(".development-data-log tbody tr:first-child")).toContainText("동일한 기준 데이터가 이미 있습니다.");

    await expect(page.getByTestId("tdm-btn-cleanup-all")).toBeDisabled();
    await page.getByTestId("tdm-cleanup-confirmation").fill("기준 데이터 삭제");
    await page.getByTestId("tdm-btn-cleanup-all").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("선택한 기준 데이터를 삭제하시겠습니까?");
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.locator(".development-data-log tbody tr:first-child")).toContainText(/cleanup\s*\/\s*all[\s\S]*Success/);
    await expect(page.locator(".development-data-summary")).toContainText(/기준 품목\s*0/);
  } catch (error) {
    throw await diagnostic(page, error);
  }
});
