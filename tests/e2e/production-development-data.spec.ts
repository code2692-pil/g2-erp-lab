import { expect, test } from "@playwright/test";

test("Production build hides the development-data menu and blocks direct entry without API calls", async ({ page }) => {
  const developmentDataRequests: string[] = [];
  const runtimeErrors = { console: [] as string[], page: [] as string[] };
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/development-data")) developmentDataRequests.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.console.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.page.push(error.message));

  await page.goto("/");
  await page.goto("/development-data");

  await expect(page.getByTestId("nav-development-data")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  await expect(page.getByTestId("work-order-page-title")).toHaveCount(0);
  expect(await page.evaluate(() => window.history.state?.g2ErpAppNavigation?.page)).toBe("sales");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  expect(developmentDataRequests).toEqual([]);
  expect(runtimeErrors.console).toEqual([]);
  expect(runtimeErrors.page).toEqual([]);
});
