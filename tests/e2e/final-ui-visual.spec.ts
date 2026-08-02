import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const roleEvidence = resolve(".local-runtime", "qa-evidence", "user-selection");
const finalEvidence = resolve(".local-runtime", "qa-evidence", "final-ui");

async function selectRole(page: Page, userId: string) {
  await page.locator(`input[name="demo-user"][value="${userId}"]`).check();
}

async function screenshot(page: Page, folder: string, name: string) {
  await page.screenshot({ path: resolve(folder, name), fullPage: false });
}

test("최종 제품 UI 시각 증거를 생성한다", async ({ page }) => {
  await mkdir(roleEvidence, { recursive: true });
  await mkdir(finalEvidence, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/", { waitUntil: "networkidle" });
  await screenshot(page, roleEvidence, "1366x768-100.png");

  await page.evaluate(() => { document.documentElement.style.zoom = "125%"; });
  await screenshot(page, roleEvidence, "1366x768-125.png");
  await page.evaluate(() => { document.documentElement.style.zoom = "150%"; });
  await screenshot(page, roleEvidence, "1366x768-150.png");
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });

  await page.setViewportSize({ width: 1398, height: 900 });
  await screenshot(page, roleEvidence, "1398x900-100.png");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await screenshot(page, roleEvidence, "1920x1080-100.png");

  for (const [userId, name] of [["demo-viewer", "role-viewer-selected.png"], ["demo-operator", "role-user-selected.png"], ["demo-manager", "role-manager-selected.png"], ["demo-admin", "role-admin-selected.png"]] as const) {
    await selectRole(page, userId);
    await screenshot(page, roleEvidence, name);
  }

  await selectRole(page, "demo-admin");
  await page.getByRole("button", { name: "업무 화면 시작" }).click();
  await expect(page.getByTestId("page-title")).toBeVisible();
  await page.setViewportSize({ width: 1398, height: 900 });
  await screenshot(page, finalEvidence, "menu-and-sales-order.png");

  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toBeVisible();
  await screenshot(page, finalEvidence, "purchase-order.png");

  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toBeVisible();
  await screenshot(page, finalEvidence, "work-order.png");

  await page.getByTestId("nav-ai-system-management").click();
  await expect(page.getByTestId("company-knowledge-settings")).toBeVisible();
  await screenshot(page, finalEvidence, "ai-system-management.png");
  await page.getByRole("tab", { name: "회의록", exact: true }).click();
  await page.getByTestId("meeting-title").fill("시각 검증 회의록");
  await page.getByTestId("meeting-date").fill("2026-08-03");
  await page.getByTestId("meeting-create").click();
  await expect(page.getByTestId("meeting-list-grid")).toContainText("시각 검증 회의록");
  await screenshot(page, finalEvidence, "meeting-minutes.png");
  await page.getByTestId("meeting-list-grid").getByText("시각 검증 회의록", { exact: true }).dblclick();
  await expect(page.getByTestId("meeting-minutes-workspace")).toHaveClass(/meeting-fullscreen/);
  await screenshot(page, finalEvidence, "meeting-fullscreen.png");
  await page.getByTestId("meeting-close-fullscreen").click();
  await page.getByTestId("meeting-security-disclosure").click();
  await screenshot(page, finalEvidence, "meeting-disclosure-open.png");

  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI 솔루션 센터");
  await screenshot(page, finalEvidence, "ai-solution-center.png");

  await page.getByTestId("nav-ai-qa").click();
  await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI Q&A");
  await screenshot(page, finalEvidence, "ai-qa.png");

  await page.getByTestId("nav-mobile-sales-order").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("page-title")).toHaveText("모바일 수주등록");
  await screenshot(page, finalEvidence, "mobile-sales-order.png");
  await page.getByTestId("mobile-sales-nav-pda").click();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByTestId("page-title")).toHaveText("PDA 수주등록");
  await screenshot(page, finalEvidence, "pda-sales-order.png");
});
