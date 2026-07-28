import type { ClarificationAnswer, CompanyKnowledgeArticle, InputEvidence, SolutionResult, SolutionRevision, SolutionSession, SolutionSource } from "./solutionTypes";

const maximumAnalysisRevision = 3;

export interface ConsultantHandoverDetail {
  label: string;
  value: string;
}

function escapeMarkdownText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function bulletSection(title: string, values: readonly string[]) {
  return values.length > 0 ? `## ${title}\n${values.map((value) => `- ${escapeMarkdownText(value)}`).join("\n")}` : `## ${title}\n- 없음`;
}

function evidenceDisplay(item: InputEvidence) {
  const file = item.fileName ? ` · 파일: ${item.fileName}` : "";
  const keywords = item.relatedKeywords.length > 0 ? item.relatedKeywords.join(", ") : "업무영역 기준";
  return `${item.sourceLabel}${file} · 발췌: ${item.excerpt} · 관련 키워드: ${keywords} · 추천 반영: ${item.usedInRecommendation ? "사용됨" : "참고"}`;
}

function firstEvidence(result: SolutionResult, sourceTypes: readonly InputEvidence["sourceType"][]) {
  return result.inputEvidence.find((item) => sourceTypes.includes(item.sourceType));
}

function firstEvidenceValue(result: SolutionResult, sourceTypes: readonly InputEvidence["sourceType"][], fallback: string) {
  const item = firstEvidence(result, sourceTypes);
  if (!item) return fallback;
  return item.fileName ? `${item.fileName}: ${item.excerpt}` : item.excerpt;
}

export function createSolutionSession(mode: SolutionSource, originalRequest: SolutionSession["originalRequest"], result: SolutionResult, companyKnowledgeSnapshot: readonly CompanyKnowledgeArticle[] = [], createdAt = new Date().toISOString()): SolutionSession {
  const revision: SolutionRevision = { revision: 1, createdAt, result, clarificationAnswers: [], currentConfidence: result.confidence };
  return { mode, originalRequest, companyKnowledgeSnapshot, revisions: [revision], activeResult: result };
}

export function appendSolutionRevision(session: SolutionSession, result: SolutionResult, clarificationAnswers: readonly ClarificationAnswer[], createdAt = new Date().toISOString()): SolutionSession {
  const previous = session.revisions.at(-1);
  const revision: SolutionRevision = {
    revision: (previous?.revision ?? 0) + 1,
    createdAt,
    result,
    clarificationAnswers,
    previousConfidence: previous?.currentConfidence,
    currentConfidence: result.confidence
  };
  return { ...session, revisions: [...session.revisions, revision], activeResult: result };
}

export function activeRevision(session: SolutionSession) {
  return session.revisions.at(-1);
}

export function analysisRevision(session: SolutionSession | undefined) {
  return session ? activeRevision(session)?.revision ?? 0 : 0;
}

export function canRefineSession(session: SolutionSession | undefined) {
  return Boolean(session && analysisRevision(session) < maximumAnalysisRevision && session.activeResult.clarifyingQuestions.length > 0);
}

export function pendingClarifyingQuestions(result: SolutionResult, answerMap: Readonly<Record<string, string>>) {
  return result.clarifyingQuestions.filter((question) => !answerMap[question.id]?.trim());
}

export function unresolvedItems(result: SolutionResult, answerMap: Readonly<Record<string, string>>) {
  const pending = pendingClarifyingQuestions(result, answerMap).map((question) => question.question);
  const items = [...pending, ...result.additionalInfo.map((item) => `${item} 확인 필요`)];
  return [...new Set(items)].slice(0, 5);
}

export function clarificationAnswersFor(result: SolutionResult, answerMap: Readonly<Record<string, string>>) {
  return result.clarifyingQuestions
    .map((question) => ({ questionId: question.id, question: question.question, answer: answerMap[question.id]?.trim() ?? "" }))
    .filter((answer) => answer.answer.length > 0);
}

export function analysisModeLabel(mode: SolutionSource) {
  return mode === "consultant-file" ? "컨설턴트 파일 분석" : "고객 업무 Q&A";
}

export function consultantHandoverDetails(session: SolutionSession, unresolved: readonly string[]): readonly ConsultantHandoverDetail[] {
  const revision = activeRevision(session);
  const result = session.activeResult;
  const request = session.originalRequest;
  const fileNames = request.fileInputs?.map((file) => file.fileName).filter(Boolean) ?? [];
  const currentSituation = session.mode === "customer-qa"
    ? firstEvidenceValue(result, ["CUSTOMER_QUESTION"], "정보 미입력으로 컨설턴트 확인 필요")
    : firstEvidenceValue(result, ["FILE_NOTE", "EXTRACTED_FILE_TEXT", "COMMON_CONTEXT"], "정보 미입력으로 컨설턴트 확인 필요");
  const needs = session.mode === "customer-qa"
    ? [request.currentManagement, request.desiredStandard].filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()).join(" / ")
    : firstEvidenceValue(result, ["FILE_NOTE", "COMMON_CONTEXT"], "정보 미입력으로 컨설턴트 확인 필요");

  return [
    { label: "문의 유형", value: analysisModeLabel(session.mode) },
    { label: "현재 상황", value: currentSituation },
    { label: "고객·현장 요구", value: needs || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "주요 제약사항", value: request.fieldConstraints?.trim() || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "추천 기본 방향", value: result.recommendation.title },
    { label: "대안", value: result.alternatives.join(" / ") || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "관련 업무영역", value: result.inferredDomain },
    { label: "관련 부서", value: "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "확인할 추가 정보", value: result.additionalInfo.join(" / ") || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "아직 확인이 필요한 사항", value: unresolved.join(" / ") || "현재 입력 범위에서 주요 확인사항은 충분히 답변되었습니다." },
    { label: "컨설턴트 결정 필요사항", value: result.consultantQuestions.join(" / ") || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "개발 담당자 확인 필요사항", value: result.developmentQuestions.join(" / ") || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "참고한 파일", value: fileNames.join(", ") || "파일 미첨부" },
    { label: "회사 지식 사용", value: result.companyKnowledgeUsed ? "사용" : "미사용" },
    { label: "현재 신뢰도", value: result.confidence },
    { label: "분석 차수", value: `${revision?.revision ?? 1}차 분석` },
    { label: "PoC 범위", value: "로컬 템플릿 기반 검토 요약이며 확정 업무 규칙 또는 실제 운영 판단이 아닙니다." }
  ];
}

function handoverMarkdown(session: SolutionSession, unresolved: readonly string[], heading: string) {
  return [heading, ...consultantHandoverDetails(session, unresolved).map((item) => `- ${item.label}: ${escapeMarkdownText(item.value)}`)].join("\n");
}

export function buildConsultantHandoverMarkdown(session: SolutionSession, unresolved: readonly string[]) {
  return handoverMarkdown(session, unresolved, "# 컨설턴트 인계 요약");
}

export function buildSolutionMarkdown(session: SolutionSession, unresolved: readonly string[]) {
  const revision = activeRevision(session);
  const result = session.activeResult;
  const answers = revision?.clarificationAnswers ?? [];
  const knowledgeEvidence = result.evidence.map((item) => `${item.title} (${item.category}, ${item.sourceType === "COMPANY" ? "회사 지식" : "일반 지식"}) · ${item.reason}`);
  return [
    "# AI 솔루션 센터 분석 결과",
    `- 생성 시각: ${revision?.createdAt ?? ""}`,
    `- 분석 유형: ${analysisModeLabel(session.mode)}`,
    `- 분석 차수: ${revision?.revision ?? 1}차 분석`,
    "",
    "## 입력 내용 요약",
    escapeMarkdownText(result.inputSummary),
    "",
    bulletSection("추가 답변", answers.map((answer) => `${answer.question}: ${answer.answer}`)),
    `\n## 감지 업무영역\n${escapeMarkdownText(result.inferredDomain)}`,
    `\n## 핵심 문제\n${escapeMarkdownText(result.mainProblem)}`,
    `\n## 추천 기본안\n### ${escapeMarkdownText(result.recommendation.title)}\n${escapeMarkdownText(result.recommendation.rationale)}\n${result.recommendation.actions.map((item) => `- ${escapeMarkdownText(item)}`).join("\n")}`,
    bulletSection("적용 단계", result.phasedPlan),
    bulletSection("대안", result.alternatives),
    bulletSection("필요한 추가 정보", result.additionalInfo),
    bulletSection("분석에 사용한 입력 근거", result.inputEvidence.map(evidenceDisplay)),
    bulletSection("참고한 지식 근거", knowledgeEvidence),
    bulletSection("아직 확인이 필요한 사항", unresolved),
    bulletSection("위험·주의사항", result.risks),
    bulletSection("컨설턴트 확인사항", result.consultantQuestions),
    bulletSection("개발 담당자 확인사항", result.developmentQuestions),
    handoverMarkdown(session, unresolved, "## 컨설턴트 인계 요약"),
    `\n## 신뢰도\n${result.confidence}`,
    `\n## 외부·사내 검토 필요 여부\n${result.externalReviewRequired ? "필요" : "불필요"}`,
    "\n## PoC 범위 안내\n현재 분석 세션과 내보내기는 브라우저 메모리에서만 동작합니다. 외부 AI, 서버, DB, 고객 상담 이력과 연결하지 않습니다."
  ].join("\n");
}

export function buildExportFilename(session: SolutionSession) {
  const revision = activeRevision(session);
  const timestamp = (revision?.createdAt ?? new Date().toISOString()).replace(/[-:TZ.]/g, "").slice(0, 14);
  const mode = session.mode === "consultant-file" ? "consultant" : "customer";
  return `ai-solution-${mode}-${timestamp}.md`;
}

export { maximumAnalysisRevision };
