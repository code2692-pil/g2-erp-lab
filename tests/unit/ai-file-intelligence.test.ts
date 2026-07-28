import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeFile, classifyFile } from "../../src/features/ai-solution-center/file-analysis/fileAnalysisPipeline.ts";
import { redactSensitiveData } from "../../src/features/ai-solution-center/file-analysis/sensitiveDataRedactor.ts";
import { analyzeCsvContent, analyzeJsonContent, analyzeLogContent, analyzeTextContent, analyzeXmlContent, parseCsv } from "../../src/features/ai-solution-center/file-analysis/structuredFileAnalyzers.ts";
import { validateReviewPackage } from "../../src/features/ai-solution-center/reviewPackage.ts";
import { solutionScenarios } from "../../src/features/ai-solution-center/solutionScenarios.ts";

function localFile(name: string, content: string, type = "text/plain") {
  return new File([content], name, { type, lastModified: 1_725_000_000_000 });
}

test("MIME과 확장자를 함께 사용해 파일 유형을 분류한다", () => {
  assert.equal(classifyFile("lot.csv", ""), "CSV");
  assert.equal(classifyFile("payload.bin", "application/json"), "JSON");
  assert.equal(classifyFile("manual.pdf", "application/octet-stream"), "PDF");
  assert.equal(classifyFile("image.png", "image/png"), "IMAGE");
});

test("실행파일은 내용을 읽지 않고 BLOCKED 처리한다", async () => {
  const file = localFile("unsafe.exe", "LOT secret=do-not-read", "application/octet-stream");
  Object.defineProperty(file, "text", { value: () => { throw new Error("must not read"); } });
  const result = await analyzeFile({ file, fileId: "file-1", userNote: "", includeInAnalysis: true });
  assert.equal(result.category, "EXECUTABLE");
  assert.equal(result.supportLevel, "BLOCKED");
  assert.equal(result.includeInAnalysis, false);
  assert.equal(result.processingStatus, "EXCLUDED");
});

test("TXT와 Markdown을 결정적으로 요약하고 코드 블록을 실행하지 않는다", () => {
  const input = "# LOT 검사 계획\n- 입고 LOT 확인\n\n```js\nalert('text only')\n```\n2026-07-29";
  const first = analyzeTextContent(input, true);
  const second = analyzeTextContent(input, true);
  assert.deepEqual(first, second);
  assert.equal(first.structuredMetadata.lineCount, 7);
  assert.equal(first.structuredMetadata.codeFenceDetected, true);
  assert.match(first.summary, /ERP·MES 관련 키워드/);
});

test("LOG의 오류 후보와 반복 메시지를 집계하고 민감값을 가린다", () => {
  const result = analyzeLogContent("2026-07-29 ERROR timeout token=abcdefgh123456789012345678901234\n2026-07-29 WARN timeout\n2026-07-29 ERROR timeout token=abcdefgh123456789012345678901234");
  assert.equal(result.structuredMetadata.errorCount, 2);
  assert.equal(result.structuredMetadata.warnCount, 1);
  assert.match(result.redactedText, /REDACTED/);
  assert.doesNotMatch(result.redactedText, /abcdefgh123456/);
  assert.match(result.warnings[0], /원인 확정이 아니라/);
});

test("CSV parser는 quoted comma와 여러 줄 값을 처리한다", () => {
  const parsed = parseCsv('LOT,QTY,NOTE\r\nA-1,10,"검사, 포장"\r\nA-2,20,"두 줄\n메모"');
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[1][2], "검사, 포장");
  assert.equal(parsed.rows[2][2], "두 줄\n메모");
});

test("CSV 구조 요약은 불규칙 행을 경고하고 최대 5행만 미리 본다", () => {
  const result = analyzeCsvContent("LOT,QTY\nA,1\nB,2,EXTRA");
  assert.equal(result.analysisSucceeded, true);
  assert.match(result.warnings.join(" "), /일정하지 않습니다/);
  assert.deepEqual(result.structuredMetadata.erpMesHeaders, ["LOT", "QTY"]);
});

test("JSON은 key path와 중첩 깊이를 요약하고 위험 key를 병합하지 않는다", () => {
  const result = analyzeJsonContent('{"orders":[{"LOT":"A","password":"hidden","__proto__":{"polluted":true}}]}');
  assert.equal(result.analysisSucceeded, true);
  assert.equal(result.structuredMetadata.topLevelType, "object");
  assert.ok(Number(result.structuredMetadata.maximumDepth) >= 3);
  assert.match(result.redactedText, /SENSITIVE_KEY/);
  assert.doesNotMatch(result.redactedText, /hidden/);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("잘못된 JSON은 구조 성공으로 표시하지 않는다", () => {
  const result = analyzeJsonContent("{");
  assert.equal(result.analysisSucceeded, false);
  assert.match(result.summary, /JSON 구조 오류/);
});

test("XML은 root·element 수를 요약한다", () => {
  const result = analyzeXmlContent("<orders><order LOT=\"A\"/><order LOT=\"B\"/></orders>");
  assert.equal(result.analysisSucceeded, true);
  assert.equal(result.structuredMetadata.rootElement, "orders");
  assert.equal(result.structuredMetadata.elementCount, 3);
});

test("잘못된 XML은 parser error로 분리한다", () => {
  const result = analyzeXmlContent("<orders><order></orders>");
  assert.equal(result.analysisSucceeded, false);
  assert.equal(result.structuredMetadata.parserError, true);
});

test("민감정보 category를 탐지하고 원문 값을 일관되게 가린다", () => {
  const source = "mail user@example.com phone 010-1234-5678 password=TopSecret123 bearer Bearer TEST_ONLY_BEARER_123456789 token?api_key=abcdefghi123456";
  const result = redactSensitiveData(source);
  assert.ok(result.findings.some((finding) => finding.category === "EMAIL"));
  assert.ok(result.findings.some((finding) => finding.category === "PHONE"));
  assert.ok(result.findings.some((finding) => finding.category === "SECRET"));
  assert.doesNotMatch(result.redactedText, /user@example\.com|010-1234-5678|TopSecret123|TEST_ONLY_BEARER_123456789/);
  assert.match(result.redactedText, /REDACTED/);
});

test("같은 파일과 메모는 동일한 분석 결과를 반환한다", async () => {
  const file = localFile("lot.log", "INFO LOT A\nWARN timeout");
  const request = { file, fileId: "file-1", userNote: "검사", includeInAnalysis: true };
  assert.deepEqual(await analyzeFile(request), await analyzeFile(request));
});

test("ERP·MES 시나리오 id는 10개 모두 안정적이고 중복되지 않는다", () => {
  const ids = solutionScenarios.map((scenario) => scenario.id);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 3), ["supplier-internal-lot-link", "serial-start-point", "production-input-burden"]);
});

test("검토 패키지 1.0 샘플을 하위 호환으로 불러온다", async () => {
  const sample = JSON.parse(await readFile(new URL("../../docs/ai-solution-center/review-package-sample.json", import.meta.url), "utf8"));
  const validation = validateReviewPackage(sample);
  assert.equal(validation.success, true);
  if (validation.success) assert.equal(validation.value.schemaVersion, "1.0");
});
