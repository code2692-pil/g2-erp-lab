import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

type WorkerWarmupTarget = "sales" | "purchase" | "work-order" | "development-data";
type WorkerFrontendWarmup = {
  context: BrowserContext;
  page: Page;
  claimed: boolean;
};

const preparedPages = new WeakSet<Page>();
const frontendUrl = "http://127.0.0.1:5173";

async function warmWorkerFrontend(browser: Browser, target: WorkerWarmupTarget): Promise<WorkerFrontendWarmup> {
  const context = await browser.newContext({ baseURL: frontendUrl });
  const page = await context.newPage();
  try {
    await page.goto(`${frontendUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("page-title").waitFor();

    if (target === "purchase") {
      await page.getByTestId("nav-purchase-order").click();
      await page.getByTestId("purchase-page-title").waitFor();
    }
    if (target === "work-order") {
      await page.getByTestId("nav-work-order").click();
      await page.getByTestId("work-order-page-title").waitFor();
    }
    if (target === "development-data") {
      await page.goto(`${frontendUrl}/development-data`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("development-data-page-title").waitFor();
    }
    preparedPages.add(page);
    return { context, page, claimed: false };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export function consumeWorkerPreparedPage(page: Page) {
  const isPrepared = preparedPages.has(page);
  if (isPrepared) preparedPages.delete(page);
  return isPrepared;
}

export function createWorkerWarmupTest(target: WorkerWarmupTarget) {
  return base.extend<{}, { workerFrontendWarmup: WorkerFrontendWarmup }>({
    workerFrontendWarmup: [async ({ browser }, use) => {
      const warmup = await warmWorkerFrontend(browser, target);
      try {
        await use(warmup);
      } finally {
        await warmup.context.close();
      }
    }, { scope: "worker", auto: true }],
    context: async ({ browser, workerFrontendWarmup }, use) => {
      if (!workerFrontendWarmup.claimed) {
        workerFrontendWarmup.claimed = true;
        await use(workerFrontendWarmup.context);
        await workerFrontendWarmup.context.close();
        return;
      }

      const context = await browser.newContext({ baseURL: frontendUrl });
      try {
        await use(context);
      } finally {
        await context.close();
      }
    },
    page: async ({ context, workerFrontendWarmup }, use) => {
      const page = context === workerFrontendWarmup.context ? workerFrontendWarmup.page : await context.newPage();
      await use(page);
    }
  });
}

export { expect };
export type { Page };
