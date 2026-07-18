import { expect, test } from "@playwright/test";

test("Production build hides the development-data menu and blocks direct entry without API calls", async ({ page }) => {
  const developmentDataRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/development-data")) developmentDataRequests.push(request.url());
  });

  await page.goto("/development-data");

  await expect(page.getByTestId("nav-development-data")).toHaveCount(0);
  await expect(page.getByTestId("page-title")).toHaveText("수주등록");
  expect(developmentDataRequests).toEqual([]);
});
