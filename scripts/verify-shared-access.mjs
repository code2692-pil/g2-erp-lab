import { chromium, expect } from "@playwright/test";
import { networkInterfaces } from "node:os";
import { connect } from "node:net";

const forbiddenUserTerms = [
  /시연/iu, /테스트/iu, /데모/iu, /보여주기용/iu, /사내/iu, /내부/iu, /임시/iu, /개발용/iu, /미완성/iu,
  /FINAL-UAT/iu, /\bDemo\b/iu, /\bTest(?:ing)?\b/iu, /\bInternal\b/iu, /\bPreview\b/iu, /\bMock\b/iu,
  /\bUAT\b/iu, /\bTemporary\b/iu, /Development Only/iu, /Non-production/iu, /\bSample\b/iu, /\bPoC\b/iu
];

function privateIpv4Addresses() {
  return Object.values(networkInterfaces()).flatMap((entries) => entries ?? []).filter((entry) => {
    if (entry.family !== "IPv4" || entry.internal) return false;
    return entry.address.startsWith("10.")
      || entry.address.startsWith("192.168.")
      || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address);
  }).map((entry) => entry.address);
}

function canConnect(host, port, timeout = 1_500) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeout, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function watchFailures(page) {
  const failures = [];
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
  return failures;
}

async function assertProfessionalLanguage(page, label) {
  const exposed = await page.evaluate(() => {
    const attributes = Array.from(document.querySelectorAll("[aria-label],[title],[placeholder]")).flatMap((element) =>
      [element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("placeholder")].filter(Boolean)
    );
    return [document.title, document.body.innerText, ...attributes].join("\n");
  });
  const matches = forbiddenUserTerms.filter((pattern) => pattern.test(exposed)).map((pattern) => pattern.source);
  if (matches.length) throw new Error(`${label} 사용자 노출 금지 표현: ${matches.join(", ")}`);
}

async function enterAs(page, userId, expectedName) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "사용자 선택" })).toBeVisible();
  expect(await page.getByRole("combobox", { name: "사용자 역할" }).locator("option").allTextContents()).toEqual([
    "조회 사용자", "업무 사용자", "관리자", "시스템 관리자"
  ]);
  await page.getByRole("combobox", { name: "사용자 역할" }).selectOption(userId);
  await page.getByRole("button", { name: "업무 화면 시작" }).click();
  await expect(page.getByTestId("current-user-menu")).toContainText(expectedName);
  await expect(page.getByTestId("page-title")).toBeVisible();
  await assertProfessionalLanguage(page, `${expectedName} 수주 화면`);
}

async function verifySalesFlow(page, mutationExpected) {
  await page.getByTestId("btn-search").click();
  const header = page.getByTestId("sales-order-header-grid-row-1000::SO2026070001");
  const line = page.getByTestId("sales-order-line-grid-row-1000::SO2026070001::1");
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute("aria-selected", "true");
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("aria-selected", "true");
  const secondHeader = page.getByTestId("sales-order-header-grid-row-1000::SO2026070002");
  await page.getByTestId("sales-order-header-grid-cell-container-1000::SO2026070002-DT_SO").click();
  await expect(secondHeader).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sales-order-line-grid-row-1000::SO2026070002::1")).toHaveCount(1);
  await expect(page.getByTestId("sales-order-line-grid-row-1000::SO2026070002::1")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("sales-order-header-grid-cell-container-1000::SO2026070001-DT_SO").click();
  await expect(line).toHaveAttribute("aria-selected", "true");
  if (mutationExpected) await expect(page.getByTestId("btn-convert-work")).toBeEnabled();
  else await expect(page.getByTestId("btn-convert-work")).toBeDisabled();
  await assertProfessionalLanguage(page, "수주 조회 결과");
}

const addresses = privateIpv4Addresses();
if (!addresses.length) throw new Error("검증에 사용할 사설 IPv4 주소를 찾지 못했습니다.");
const address = process.env.G2ERP_SHARED_HOST ?? addresses[0];
const baseURL = `http://${address}:5173`;

if (!(await canConnect(address, 5173))) throw new Error(`${baseURL}에 연결할 수 없습니다. 공유 실행 모드를 먼저 시작하세요.`);
if (await canConnect(address, 5080)) throw new Error("직원 PC에서 API 포트 5080에 직접 연결할 수 있습니다. 동일 출처 프록시 구성을 확인하세요.");
const usersResponse = await fetch(`${baseURL}/api/demo/users`);
if (!usersResponse.ok || (await usersResponse.json()).length !== 4) throw new Error("동일 출처 사용자 API 계약이 올바르지 않습니다.");

const browser = await chromium.launch({ headless: true });
const runs = [
  ["RUN-01", "demo-viewer", "조회 사용자", false, { width: 1366, height: 768 }],
  ["RUN-02", "demo-operator", "업무 사용자", true, { width: 1398, height: 900 }],
  ["RUN-03", "demo-manager", "관리자", true, { width: 1920, height: 1080 }],
  ["RUN-04", "demo-admin", "시스템 관리자", true, { width: 1398, height: 900 }]
];

try {
  for (const [run, userId, name, mutationExpected, viewport] of runs) {
    const context = await browser.newContext({ baseURL, viewport });
    await context.addInitScript(() => {
      if (globalThis.crypto) Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
    });
    const page = await context.newPage();
    const failures = watchFailures(page);
    const browserApiOrigins = new Set();
    page.on("request", (request) => { if (request.url().includes("/api/")) browserApiOrigins.add(new URL(request.url()).origin); });
    await enterAs(page, userId, name);
    await verifySalesFlow(page, mutationExpected);
    await page.goto("/purchase-orders", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("purchase-page-title")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("purchase-page-title")).toBeVisible();
    await assertProfessionalLanguage(page, `${name} 발주 화면`);
    if (userId === "demo-operator") {
      await page.goto("/mobile/sales-orders", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("page-title")).toHaveText("모바일 수주등록");
      await assertProfessionalLanguage(page, "모바일 수주등록");
      await page.goto("/pda/sales-orders", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("page-title")).toHaveText("PDA 수주등록");
      await assertProfessionalLanguage(page, "PDA 수주등록");
    }
    if (userId === "demo-admin") {
      await page.goto("/ai-solution-center", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
      await assertProfessionalLanguage(page, "AI 솔루션 화면");
      await page.getByRole("tab", { name: "업무 Q&A", exact: true }).click();
      await page.getByTestId("qa-new").click();
      await assertProfessionalLanguage(page, "업무 Q&A 화면");
      await page.getByRole("tab", { name: "회의록", exact: true }).click();
      await assertProfessionalLanguage(page, "회의록 화면");
    }
    expect([...browserApiOrigins]).toEqual([baseURL]);
    expect(failures).toEqual([]);
    console.log(`${run} PASS · ${name} · ${page.url()}`);
    await context.close();
  }

  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
  await context.addInitScript(() => {
    if (globalThis.crypto) Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  const failures = watchFailures(page);
  await enterAs(page, "demo-operator", "업무 사용자");
  await page.goto("/work-orders", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("work-order-page-title")).toBeVisible();
  await assertProfessionalLanguage(page, "작업지시 화면");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("work-order-page-title")).toBeVisible();
  await page.getByRole("button", { name: "사용자 전환" }).click();
  await expect(page.getByRole("heading", { name: "사용자 선택" })).toBeVisible();
  await page.evaluate(() => window.sessionStorage.setItem("g2erp.demo.session", "outdated-session-format"));
  await page.goto("/purchase-orders", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "사용자 선택" })).toBeVisible();
  await assertProfessionalLanguage(page, "오래된 세션 복구 화면");
  expect(failures).toEqual([]);
  console.log(`RUN-05 PASS · 새로고침/직접 경로/사용자 전환 · ${page.url()}`);
  await context.close();
} finally {
  await browser.close();
}

console.log(`공유 접속 검증 PASS · ${baseURL} · API 동일 출처 · randomUUID 비활성 조건`);
