import assert from "node:assert/strict";
import test from "node:test";
import { buildSolutionResult } from "../../src/features/ai-solution-center/solutionEngine.ts";
import type { SolutionRequest } from "../../src/features/ai-solution-center/solutionTypes.ts";

function answer(question: string) {
  const request: SolutionRequest = { source: "customer-qa", domain: "", situation: question };
  return buildSolutionResult(request);
}

const evaluationCases = [
  ["수주등록 메뉴는 어디에 있나요?", "product-menu-location"],
  ["수주등록 방법과 거래처 선택 순서를 알려주세요.", "product-sales-order"],
  ["수주를 발주로 전환하는 방법은 무엇인가요?", "product-conversion"],
  ["수주를 작업지시로 전환할 때 무엇을 확인하나요?", "product-conversion"],
  ["조회 사용자와 일반 관리자의 버튼 권한 차이는 무엇인가요?", "product-role-permissions"],
  ["조회기간 시작일이 종료일보다 늦다는 안내가 나옵니다.", "product-date-range"],
  ["거래처 도움창을 키보드로 어떻게 여나요?", "product-lookup"],
  ["회의록을 등록하고 여러 파일을 넣는 방법을 알려주세요.", "product-meeting"],
  ["자유롭게 쓴 메모를 회사 지식으로 등록하려면 어떻게 하나요?", "product-company-knowledge"],
  ["BOM 메뉴에서 공정경로를 저장하는 방법을 알려주세요.", "product-unsupported-feature"],
  ["출하등록 메뉴에서 출하를 확정할 수 있나요?", "product-unsupported-feature"]
] as const;

for (const [question, expectedEvidenceId] of evaluationCases) {
  test(`제품 도움말 근거: ${question}`, () => {
    const result = answer(question);
    assert.equal(result.evidence[0]?.id, expectedEvidenceId);
    assert.ok(result.recommendation.actions.length > 0);
    assert.ok(result.recommendation.actions.join(" ").length < 1_200);
    assert.equal(result.externalReviewRequired, true);
  });
}

test("모호한 업무 문의는 낮은 확신과 확인 질문을 반환한다", () => {
  const result = answer("업무를 좀 더 편하게 하고 싶습니다.");
  assert.equal(result.confidence, "낮음");
  assert.ok(result.clarifyingQuestions.length > 0);
  assert.match(result.guideNotice, /프로그램의 기본 지식과 현재 등록된 회사 지식/);
});

test("첨부 메타정보는 사용자가 작성한 현장 메모보다 우선하지 않는다", () => {
  const request: SolutionRequest = {
    source: "consultant-file",
    domain: "",
    situation: "",
    fileInputs: [{
      id: "file-1",
      fileName: "process-video.mp4",
      safeDisplayName: "첨부 1 (VIDEO)",
      extractedText: "VIDEO 파일 메타정보와 파일 분석 안내",
      note: "검사와 포장 공정에서만 바코드 스캔이 가능하며 기존 수기 기록 이력도 확인해야 합니다.",
      attachmentOrder: 0,
      analyzerType: "VIDEO",
      supportLevel: "METADATA_ONLY",
      includeInAnalysis: true,
      userDescriptionUsed: true
    }]
  };
  const result = buildSolutionResult(request);
  assert.notEqual(result.evidence[0]?.id, "product-company-knowledge");
  assert.ok(result.inputEvidence.some((item) => item.sourceType === "FILE_NOTE" && item.usedInRecommendation));
  assert.match(result.phasedPlan.join(" "), /첨부 1 \(VIDEO\) 메모/);
});
