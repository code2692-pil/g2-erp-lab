import { defineConfig } from "@playwright/test";

const viewport = process.env.PLAYWRIGHT_VIEWPORT?.match(/^(\d+)x(\d+)$/);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".artifacts/playwright/test-results",
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: ".artifacts/playwright/report" }]
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: process.env.PLAYWRIGHT_TRACE === "on" ? "on" : "retain-on-failure",
    video: "off",
    viewport: viewport ? { width: Number(viewport[1]), height: Number(viewport[2]) } : { width: 1440, height: 1200 }
  }
});
