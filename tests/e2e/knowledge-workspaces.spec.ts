import { expect, test, type Page } from "@playwright/test";

function storedZip(entries: Record<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, central, end]);
}

async function openAiCenter(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("nav-ai-solution-center").click();
  await expect(page.getByTestId("ai-solution-center-title")).toBeVisible();
}

test("업무 Q&A는 질문·사람 답변·단일 채택·검색·재오픈을 한 흐름으로 처리한다", async ({ page }) => {
  await openAiCenter(page);
  await page.getByRole("tab", { name: "업무 Q&A", exact: true }).click();
  await page.getByTestId("qa-new").click();
  await page.getByTestId("qa-title").fill("작업지시 분할 기준은 무엇인가요?");
  await page.getByTestId("qa-body").fill("수주수량 60을 25와 35로 나누어 작업지시할 때 잔량 기준을 확인합니다.");
  await page.getByTestId("qa-category").selectOption("생산");
  await page.getByTestId("qa-tags").fill("수주,작업지시,분할");
  await page.getByTestId("qa-related-document").fill("SOR2026080001/1");
  await page.getByTestId("qa-create").click();
  await expect(page.getByTestId("qa-detail")).toContainText("작업지시 분할 기준");
  await expect(page.getByTestId("qa-related-link")).toHaveText("SOR2026080001/1");

  await page.getByTestId("qa-answer-input").fill("취소되지 않은 작업지시수량 합계를 원본 수주수량에서 차감하고 초과를 막습니다.");
  await page.getByTestId("qa-answer-create").click();
  await page.getByRole("button", { name: "답변 채택" }).click();
  await expect(page.getByTestId("qa-detail")).toContainText("채택됨");
  await page.getByTestId("qa-knowledge-candidate").check();
  await expect(page.getByTestId("qa-knowledge-candidate")).toBeChecked();

  await page.getByTestId("qa-search").fill("작업지시 분할");
  await expect(page.getByText("검색 결과 1건")).toBeVisible();
  await page.getByTestId("qa-reopen").click();
  await expect(page.getByTestId("qa-detail")).toContainText("재오픈");
});

test("회의록은 복수 TXT/MD 원문을 추출하고 근거 이동·회의 Q&A·승인을 처리한다", async ({ page }) => {
  await openAiCenter(page);
  await page.getByRole("tab", { name: "회의록", exact: true }).click();
  await page.getByTestId("meeting-create").click();
  await page.getByTestId("meeting-files").setInputFiles([
    { name: "agenda.txt", mimeType: "text/plain", buffer: Buffer.from("생산 일정 회의\n결정: 8월 10일까지 시제품 20개를 생산한다.\n할 일: 김담당이 8월 5일까지 자재를 확인한다.") },
    { name: "quality.md", mimeType: "text/markdown", buffer: Buffer.from("# 품질\n합의: 최종검사를 전수 검사로 진행한다.\n조치: 품질팀이 검사 기준서를 보완한다.") },
    { name: "minutes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: storedZip({ "word/document.xml": "<?xml version=\"1.0\"?><w:document xmlns:w=\"urn:w\"><w:body><w:p><w:r><w:t>DOCX 결정사항</w:t></w:r></w:p></w:body></w:document>" }) },
    { name: "actions.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: storedZip({ "xl/sharedStrings.xml": "<?xml version=\"1.0\"?><sst><si><t>XLSX 담당자</t></si></sst>", "xl/worksheets/sheet1.xml": "<?xml version=\"1.0\"?><worksheet><sheetData><row><c r=\"A1\" t=\"s\"><v>0</v></c></row></sheetData></worksheet>" }) },
    { name: "briefing.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: storedZip({ "ppt/slides/slide1.xml": "<?xml version=\"1.0\"?><p:sld xmlns:p=\"urn:p\" xmlns:a=\"urn:a\"><a:p><a:r><a:t>PPTX 합의사항</a:t></a:r></a:p></p:sld>" }) }
  ]);
  await page.getByTestId("meeting-process").click();
  await expect(page.getByTestId("meeting-status")).toHaveText("검토 대기");
  await expect(page.getByTestId("meeting-file-grid")).toContainText("agenda.txt");
  await expect(page.getByTestId("meeting-file-grid")).toContainText("quality.md");
  await expect(page.getByTestId("meeting-file-grid")).toContainText("minutes.docx");
  await expect(page.getByTestId("meeting-file-grid")).toContainText("actions.xlsx");
  await expect(page.getByTestId("meeting-file-grid")).toContainText("briefing.pptx");
  await expect(page.getByTestId("meeting-segment-grid")).toContainText("DOCX 문단 1");
  await expect(page.getByTestId("meeting-segment-grid")).toContainText("XLSX Sheet1!A1");
  await expect(page.getByTestId("meeting-segment-grid")).toContainText("PPTX 슬라이드 1");
  await expect(page.getByTestId("meeting-decisions")).toContainText("시제품 20개");
  await expect(page.getByTestId("meeting-tasks")).toContainText("김담당");

  await page.getByTestId("meeting-question").fill("시제품 생산 기한은 언제인가요?");
  await page.getByTestId("meeting-ask").click();
  await expect(page.getByText(/회의 원문에서 확인된 내용/)).toBeVisible();
  await page.getByRole("button", { name: "인용 근거로 이동" }).click();
  await page.getByTestId("meeting-approve").click();
  await expect(page.getByTestId("meeting-status")).toHaveText("승인");
});
