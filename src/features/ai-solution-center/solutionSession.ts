import type { ClarificationAnswer, CompanyKnowledgeArticle, InputEvidence, ReviewRecord, SolutionOptionComparison, SolutionResult, SolutionRevision, SolutionSession, SolutionSource } from "./solutionTypes";

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

export function createSolutionSession(mode: SolutionSource, originalRequest: SolutionSession["originalRequest"], result: SolutionResult, companyKnowledgeSnapshot: readonly CompanyKnowledgeArticle[] = [], createdAt = new Date().toISOString(), optionComparison?: SolutionOptionComparison): SolutionSession {
  const revision: SolutionRevision = { revision: 1, createdAt, result, clarificationAnswers: [], currentConfidence: result.confidence };
  return { mode, originalRequest, companyKnowledgeSnapshot, revisions: [revision], activeResult: result, optionComparison };
}

export function appendSolutionRevision(session: SolutionSession, result: SolutionResult, clarificationAnswers: readonly ClarificationAnswer[], createdAt = new Date().toISOString(), optionComparison?: SolutionOptionComparison): SolutionSession {
  const previous = session.revisions.at(-1);
  const revision: SolutionRevision = {
    revision: (previous?.revision ?? 0) + 1,
    createdAt,
    result,
    clarificationAnswers,
    previousConfidence: previous?.currentConfidence,
    currentConfidence: result.confidence
  };
  return { ...session, revisions: [...session.revisions, revision], activeResult: result, optionComparison: optionComparison ?? session.optionComparison };
}

export function updateSolutionOptionComparison(session: SolutionSession, optionComparison: SolutionOptionComparison): SolutionSession {
  return { ...session, optionComparison };
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

function priorityLabel(key: string) {
  const labels: Record<string, string> = {
    traceability: "추적성",
    fieldBurden: "현장 부담",
    implementationEase: "구현 용이성",
    costEfficiency: "비용 부담",
    deploymentSpeed: "도입 속도",
    scalability: "확장성"
  };
  return labels[key] ?? key;
}

export function consultantHandoverDetails(session: SolutionSession, unresolved: readonly string[], review?: ReviewRecord): readonly ConsultantHandoverDetail[] {
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

  const comparison = session.optionComparison;
  const top = comparison?.options[0];
  const second = comparison?.options[1];
  const comparisonDetails: readonly ConsultantHandoverDetail[] = comparison && top ? [
    { label: "선택 우선순위", value: Object.entries(comparison.priorities).map(([key, value]) => `${priorityLabel(key)} ${value}/5`).join(" / ") },
    { label: "비교 대안 수", value: `${comparison.options.length}개` },
    { label: "추천 1순위", value: top.title },
    { label: "추천 2순위", value: second?.title ?? "없음" },
    { label: "1순위 선정 이유", value: comparison.recommendationReason },
    { label: "1순위 주요 강점", value: top.strengths.join(" / ") },
    { label: "1순위 주요 유의점", value: top.weaknesses.join(" / ") },
    { label: "1순위 적용 전제", value: top.prerequisites.join(" / ") },
    { label: "1순위 3단계 로드맵", value: top.roadmap.map((phase) => phase.title).join(" / ") },
    { label: "적용 중 재검토 조건", value: top.reconsiderationConditions.join(" / ") }
  ] : [];

  return [
    { label: "문의 유형", value: analysisModeLabel(session.mode) },
    { label: "현재 상황", value: currentSituation },
    { label: "고객·현장 요구", value: needs || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "주요 제약사항", value: request.fieldConstraints?.trim() || "정보 미입력으로 컨설턴트 확인 필요" },
    { label: "추천 기본 방향", value: top?.title ?? result.recommendation.title },
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
    ...comparisonDetails,
    ...(review ? [
      { label: "검토 상태", value: review.reviewStatus },
      { label: "검토자 역할", value: review.reviewerRole ?? "선택 안 함" },
      { label: "컨설턴트 검토 의견", value: review.consultantReview || "없음" },
      { label: "개발 검토 의견", value: review.developerReview || "없음" },
      { label: "현장 확인 의견", value: review.fieldReview || "없음" },
      { label: "보류·반려·업무결정 사유", value: review.decisionReason || "없음" },
      { label: "검토 기록 시각", value: review.updatedAt }
    ] : []),
    { label: "PoC 범위", value: "로컬 템플릿 기반 검토 요약이며 확정 업무 규칙 또는 실제 운영 판단이 아닙니다." }
  ];
}

function handoverMarkdown(session: SolutionSession, unresolved: readonly string[], heading: string, review?: ReviewRecord) {
  return [heading, ...consultantHandoverDetails(session, unresolved, review).map((item) => `- ${item.label}: ${escapeMarkdownText(item.value)}`)].join("\n");
}

export function buildConsultantHandoverMarkdown(session: SolutionSession, unresolved: readonly string[], review?: ReviewRecord) {
  return handoverMarkdown(session, unresolved, "# 컨설턴트 인계 요약", review);
}

export function buildSolutionMarkdown(session: SolutionSession, unresolved: readonly string[], review?: ReviewRecord) {
  const revision = activeRevision(session);
  const result = session.activeResult;
  const answers = revision?.clarificationAnswers ?? [];
  const knowledgeEvidence = result.evidence.map((item) => `${item.title} (${item.category}, ${item.sourceType === "COMPANY" ? "회사 지식" : "일반 지식"}) · ${item.reason}`);
  const comparison = session.optionComparison;
  const top = comparison?.options[0];
  const comparisonMarkdown = comparison ? [
    "## 솔루션 선택 우선순위",
    Object.entries(comparison.priorities).map(([key, value]) => `- ${priorityLabel(key)}: ${value}/5`).join("\n"),
    "\n## 솔루션 대안 비교",
    ...comparison.options.map((option) => [
      `### ${option.rank}순위 · ${escapeMarkdownText(option.title)}${option.recommended ? " (추천 1순위)" : ""}`,
      escapeMarkdownText(option.summary),
      `- 강점: ${option.strengths.map(escapeMarkdownText).join(" / ")}`,
      `- 유의점: ${option.weaknesses.map(escapeMarkdownText).join(" / ")}`,
      `- 적합한 상황: ${option.suitableWhen.map(escapeMarkdownText).join(" / ")}`,
      `- 부적합한 상황: ${option.unsuitableWhen.map(escapeMarkdownText).join(" / ")}`,
      `- 적용 전제: ${option.prerequisites.map(escapeMarkdownText).join(" / ")}`
    ].join("\n")),
    `\n## 추천 1순위 선정 이유\n${escapeMarkdownText(comparison.recommendationReason)}`,
    top ? `\n## 적용 로드맵 · ${escapeMarkdownText(top.title)}\n${top.roadmap.map((phase) => `### ${escapeMarkdownText(phase.title)}\n${phase.steps.map((step) => `- ${escapeMarkdownText(step)}`).join("\n")}`).join("\n\n")}` : "",
    top ? bulletSection("적용 중 재검토가 필요한 조건", top.reconsiderationConditions) : "",
    `\n## 비교 점수 안내\n${escapeMarkdownText(comparison.scoreNotice)}`
  ] : [];
  const reviewMarkdown = review ? [
    "## 솔루션 검토 및 판단",
    `- 검토 상태: ${review.reviewStatus}`,
    `- 검토자 역할: ${review.reviewerRole ?? "선택 안 함"}`,
    `- 컨설턴트 검토 의견: ${escapeMarkdownText(review.consultantReview || "없음")}`,
    `- 개발 검토 의견: ${escapeMarkdownText(review.developerReview || "없음")}`,
    `- 현장 확인 의견: ${escapeMarkdownText(review.fieldReview || "없음")}`,
    `- 보류·반려·업무결정 사유: ${escapeMarkdownText(review.decisionReason || "없음")}`,
    `- 체크리스트 확인 수: ${Object.values(review.checklist).filter(Boolean).length}`,
    `- 검토 기록 시각: ${review.updatedAt}`
  ] : ["## 솔루션 검토 및 판단", "아직 담당자 검토가 완료되지 않았습니다."];
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
    `\n## 추천 기본안\n### ${escapeMarkdownText(top?.title ?? result.recommendation.title)}\n${escapeMarkdownText(top?.summary ?? result.recommendation.rationale)}\n${(top?.prerequisites ?? result.recommendation.actions).map((item) => `- ${escapeMarkdownText(item)}`).join("\n")}`,
    ...comparisonMarkdown,
    ...reviewMarkdown,
    bulletSection("적용 단계", result.phasedPlan),
    bulletSection("대안", result.alternatives),
    bulletSection("필요한 추가 정보", result.additionalInfo),
    bulletSection("분석에 사용한 입력 근거", result.inputEvidence.map(evidenceDisplay)),
    bulletSection("참고한 지식 근거", knowledgeEvidence),
    bulletSection("아직 확인이 필요한 사항", unresolved),
    bulletSection("위험·주의사항", result.risks),
    bulletSection("컨설턴트 확인사항", result.consultantQuestions),
    bulletSection("개발 담당자 확인사항", result.developmentQuestions),
    handoverMarkdown(session, unresolved, "## 컨설턴트 인계 요약", review),
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
