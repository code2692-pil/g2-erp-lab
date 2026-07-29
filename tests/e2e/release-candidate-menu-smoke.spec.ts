import { expect, test, type Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, { console: string[]; page: string[] }>();

test.beforeEach(async ({ page }) => {
  const errors = { console: [] as string[], page: [] as string[] };
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
});

test.afterEach(async ({ page }) => {
  const errors = runtimeErrors.get(page);
  expect(errors?.console ?? []).toEqual([]);
  expect(errors?.page ?? []).toEqual([]);
});

test("RC1 menu smoke: major PoC screens navigate, return, and keep the application shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");

  await page.getByTestId("nav-purchase-order").click();
  await expect(page.getByTestId("purchase-page-title")).toHaveText("발주등록");
  await page.getByTestId("nav-work-order").click();
  await expect(page.getByTestId("work-order-page-title")).toHaveText("작업지시등록");
  await page.getByTestId("nav-sales-order").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");

  await page.getByTestId("nav-mobile-sales-order").click();
  await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
  await page.getByTestId("mobile-sales-nav-pda").click();
  await expect(page.getByTestId("pda-sales-page")).toBeVisible();
  await page.getByTestId("pda-sales-nav-pc").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");

  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toHaveText("AI 솔루션 센터");
  await page.goBack();
  await expect(page.getByTestId("pda-sales-page")).toBeVisible();
  await page.getByTestId("pda-sales-nav-pc").click();
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");

  await page.getByTestId("nav-development-data").click();
  await expect(page.getByTestId("development-data-page-title")).toHaveText("테스트 데이터 관리");
});

test("RC1 compact mobile smoke: direct sales-order route is actionable without horizontal overflow", async ({ page }) => {
  await page.goto("/mobile/sales-orders");
  await expect(page.getByTestId("mobile-sales-page")).toBeVisible();
  await expect(page.getByTestId("mobile-sales-search")).toBeVisible();
  await expect(page.getByTestId("mobile-sales-nav-pda")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("RC1 compact PDA smoke: direct sales-order route is actionable without horizontal overflow", async ({ page }) => {
  await page.goto("/pda/sales-orders");
  await expect(page.getByTestId("pda-sales-page")).toBeVisible();
  await expect(page.getByTestId("pda-sales-search")).toBeVisible();
  await expect(page.getByTestId("pda-sales-nav-pc")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
