import { activeRevision, analysisModeLabel, analysisRevision } from "./solutionSession.ts";
import { defaultSolutionPriorities } from "./solutionOptions.ts";
import { reviewChecklistKeys, reviewerRoles, reviewStatuses, type ReviewChecklist, type ReviewChecklistKey, type ReviewPackage, type ReviewRecord, type ReviewStatus, type ReviewerRole, type SolutionPriorities, type SolutionSession } from "./solutionTypes.ts";
import { fileCategories, fileProcessingStatuses, fileSupportLevels, sensitiveCategories } from "./file-analysis/fileAnalysisTypes.ts";
import { redactSensitiveData } from "./file-analysis/sensitiveDataRedactor.ts";

export const reviewStatusLabels: Readonly<Record<ReviewStatus, string>> = {
  PENDING: "검토 대기",
  APPLY: "적용 검토",
  HOLD: "보류",
  REJECT: "반려",
  NEEDS_BUSINESS_DECISION: "업무결정 필요"
};

export const reviewerRoleLabels: Readonly<Record<ReviewerRole, string>> = {
  CONSULTANT: "컨설턴트",
  DEVELOPER: "개발 담당자",
  FIELD: "현장 담당자",
  CUSTOMER: "고객 담당자"
};

export const reviewChecklistDefinitions: readonly { key: ReviewChecklistKey; group: "consultant" | "developer" | "field"; label: string }[] = [
  { key: "CONSULTANT_CURRENT_PROCESS", group: "consultant", label: "현재 업무 방식을 확인함" },
  { key: "CONSULTANT_TARGET_STANDARD", group: "consultant", label: "희망 관리 기준을 확인함" },
  { key: "CONSULTANT_FIELD_CONSTRAINT", group: "consultant", label: "현장 제약사항을 확인함" },
  { key: "CONSULTANT_RELATED_TEAM", group: "consultant", label: "관련 부서 협의가 필요함" },
  { key: "CONSULTANT_BUSINESS_OWNER", group: "consultant", label: "고객 또는 업무 책임자 결정이 필요함" },
  { key: "DEVELOPER_EXISTING_FEATURE", group: "developer", label: "기존 ERP·MES 기능 확인 필요" },
  { key: "DEVELOPER_MASTER_STRUCTURE", group: "developer", label: "기준정보 구조 확인 필요" },
  { key: "DEVELOPER_API_INTEGRATION", group: "developer", label: "API·연계 가능성 확인 필요" },
  { key: "DEVELOPER_DATA_MODEL", group: "developer", label: "데이터 관리 구조 확인 필요" },
  { key: "DEVELOPER_EXCEPTION_REWORK", group: "developer", label: "예외·재작업 처리 확인 필요" },
  { key: "FIELD_INPUT_LOCATION", group: "field", label: "실제 입력 가능한 위치 확인 필요" },
  { key: "FIELD_BARCODE_OR_QR", group: "field", label: "바코드·QR 사용 가능 여부 확인" },
  { key: "FIELD_INPUT_BURDEN", group: "field", label: "작업자 입력 부담 확인 필요" },
  { key: "FIELD_PILOT_SCOPE", group: "field", label: "시범 적용 대상 확인 필요" }
];

export interface ReviewDraft {
  caseTitle: string;
  reviewStatus: ReviewStatus;
  reviewerRole: ReviewerRole | "";
  reviewerDisplayName: string;
  consultantReview: string;
  developerReview: string;
  fieldReview: string;
  decisionReason: string;
  checklist: ReviewChecklist;
}

export function emptyChecklist(): ReviewChecklist {
  return Object.fromEntries(reviewChecklistKeys.map((key) => [key, false])) as ReviewChecklist;
}

export function emptyReviewDraft(): ReviewDraft {
  return { caseTitle: "", reviewStatus: "PENDING", reviewerRole: "", reviewerDisplayName: "", consultantReview: "", developerReview: "", fieldReview: "", decisionReason: "", checklist: emptyChecklist() };
}

function compact(value: string, maximum: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maximum ? `${normalized.slice(0, Math.max(0, maximum - 3))}...` : normalized;
}

function dateOnly(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
}

export function reviewAnalysisFingerprint(session: SolutionSession) {
  const result = session.activeResult;
  const options = session.optionComparison?.options.map((option) => `${option.id}:${option.rank}`).join("|") ?? result.recommendation.title;
  return stableHash([session.mode, analysisRevision(session), result.inferredDomain, result.confidence, options].join("|"));
}

function reviewSnapshot(session: SolutionSession, unresolved: readonly string[]) {
  const result = session.activeResult;
  const top = session.optionComparison?.options[0];
  const second = session.optionComparison?.options[1];
  const files = session.originalRequest.fileProcessingSummaries ?? [];
  const findingCategories = [...new Set(files.flatMap((file) => file.sensitiveCategories))];
  return {
    analysisMode: session.mode,
    analysisRevision: analysisRevision(session),
    detectedAreas: [compact(result.inferredDomain || "기타", 80)],
    inputSummary: compact(result.inputSummary, 300),
    recommendedOption: compact(top?.title ?? result.recommendation.title, 150),
    secondOption: compact(second?.title ?? result.alternatives[0] ?? "없음", 150),
    priorityProfile: { ...(session.optionComparison?.priorities ?? defaultSolutionPriorities) },
    roadmapSummary: (top?.roadmap ?? []).slice(0, 3).map((phase) => ({ title: compact(phase.title, 150), steps: phase.steps.slice(0, 5).map((step) => compact(step, 300)) })),
    unresolvedItems: unresolved.slice(0, 5).map((item) => compact(item, 300)),
    knowledgeReferences: result.evidence.slice(0, 3).map((evidence) => ({ title: compact(evidence.title, 150), category: compact(evidence.category, 80), sourceType: evidence.sourceType, matchedKeywords: evidence.matchedKeywords.slice(0, 8).map((keyword) => compact(keyword, 80)) })),
    evidenceSummaries: result.inputEvidence.slice(0, 8).map((evidence) => ({
      source: compact(evidence.sourceLabel, 120),
      excerpt: "사용자 입력 및 원문 파일 내용은 분석 결과 파일에 포함하지 않습니다."
    })),
    fileCount: files.length,
    includedFileCount: files.filter((file) => file.includeInAnalysis).length,
    fileCategories: [...new Set(files.map((file) => file.category))],
    fileProcessingSummaries: files.slice(0, 10).map((file) => ({
      displayName: compact(file.displayName, 80),
      category: file.category,
      supportLevel: file.supportLevel,
      processingStatus: file.processingStatus,
      includeInAnalysis: file.includeInAnalysis,
      structureSummary: compact(file.structureSummary, 300),
      sensitiveCategories: [...file.sensitiveCategories],
      redactionApplied: file.redactionApplied,
      userDescriptionUsed: file.userDescriptionUsed
    })),
    sensitiveFindingCategories: findingCategories,
    redactionApplied: files.some((file) => file.redactionApplied),
    selectedScenarioId: compact(session.originalRequest.selectedScenarioId ?? "", 80),
    selectedScenarioTitle: compact(session.originalRequest.selectedScenarioTitle ?? "", 150),
    confidence: result.confidence,
    humanReviewRequired: true as const
  };
}

function automaticCaseTitle(session: SolutionSession, createdAt: string) {
  const result = session.activeResult;
  return compact(`AI 솔루션 검토 · ${analysisModeLabel(session.mode)} · ${result.inferredDomain || "기타"} · ${dateOnly(createdAt)}`, 150);
}

export function validateReviewDraft(draft: ReviewDraft) {
  const textFields: readonly [keyof Pick<ReviewDraft, "caseTitle" | "reviewerDisplayName" | "consultantReview" | "developerReview" | "fieldReview" | "decisionReason">, number][] = [["caseTitle", 150], ["reviewerDisplayName", 100], ["consultantReview", 2000], ["developerReview", 2000], ["fieldReview", 2000], ["decisionReason", 2000]];
  for (const [key, maximum] of textFields) if (draft[key].trim().length > maximum) return `${key}: 최대 ${maximum}자까지 입력할 수 있습니다.`;
  if (draft.reviewStatus === "APPLY" && !draft.reviewerRole) return "적용 검토 상태에는 검토자 역할을 선택해 주세요.";
  if (draft.reviewStatus === "APPLY" && !Object.values(draft.checklist).some(Boolean)) return "적용 검토 상태에는 체크리스트를 최소 1개 확인해 주세요.";
  if (draft.reviewStatus === "HOLD" && !draft.decisionReason.trim()) return "보류 상태에는 보류 사유를 입력해 주세요.";
  if (draft.reviewStatus === "REJECT" && !draft.decisionReason.trim()) return "반려 상태에는 반려 사유를 입력해 주세요.";
  if (draft.reviewStatus === "NEEDS_BUSINESS_DECISION" && !draft.decisionReason.trim()) return "업무결정 필요 상태에는 결정이 필요한 항목을 입력해 주세요.";
  return "";
}

export function createReviewRecord(session: SolutionSession, unresolved: readonly string[], draft: ReviewDraft, existing?: ReviewRecord, now = new Date().toISOString()): ReviewRecord {
  const error = validateReviewDraft(draft);
  if (error) throw new Error(error);
  const snapshot = reviewSnapshot(session, unresolved);
  const caseId = `review-${stableHash([session.mode, snapshot.analysisRevision, snapshot.detectedAreas.join("|"), snapshot.recommendedOption, session.optionComparison?.options.map((option) => option.id).join("|") ?? ""].join("|"))}`;
  const safe = (value: string, maximum: number) => compact(redactSensitiveData(value).redactedText, maximum);
  return {
    ...snapshot,
    caseId,
    caseTitle: safe(draft.caseTitle || automaticCaseTitle(session, now), 150),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    reviewStatus: draft.reviewStatus,
    reviewerRole: draft.reviewerRole || null,
    reviewerDisplayName: safe(draft.reviewerDisplayName, 100),
    consultantReview: safe(draft.consultantReview, 2000),
    developerReview: safe(draft.developerReview, 2000),
    fieldReview: safe(draft.fieldReview, 2000),
    decisionReason: safe(draft.decisionReason, 2000),
    checklist: { ...draft.checklist },
    limitations: ["검토 상태는 실제 승인·전자결재 또는 적용 완료를 의미하지 않습니다.", "분석 결과 파일은 별도 승인·전자결재·감사 기록과 연결하지 않습니다.", "민감정보 탐지는 기초 패턴 기반이며 실제 공유 전 담당자 검토가 필요합니다."],
    analysisFingerprint: reviewAnalysisFingerprint(session)
  };
}

export function reviewDraftFromRecord(record: ReviewRecord): ReviewDraft {
  return { caseTitle: record.caseTitle, reviewStatus: record.reviewStatus, reviewerRole: record.reviewerRole ?? "", reviewerDisplayName: record.reviewerDisplayName, consultantReview: record.consultantReview, developerReview: record.developerReview, fieldReview: record.fieldReview, decisionReason: record.decisionReason, checklist: { ...record.checklist } };
}

export function toReviewPackage(record: ReviewRecord): ReviewPackage {
  const { analysisFingerprint: _analysisFingerprint, ...reviewCase } = record;
  return { packageType: "AI_SOLUTION_REVIEW_PACKAGE", schemaVersion: "1.1", case: reviewCase };
}

export function reviewPackageFilename(record: ReviewRecord) {
  return `ai-solution-review-${record.updatedAt.replace(/[-:TZ.]/g, "").slice(0, 14)}.json`;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function schemaKeyError(value: UnknownRecord, keys: readonly string[], location: string) {
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) return `${location}.${unknown}: 허용되지 않은 field입니다.`;
  const missing = keys.find((key) => !(key in value));
  return missing ? `${location}.${missing}: 필수 field가 없습니다.` : "";
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function plainText(value: unknown, maximum: number) {
  return typeof value === "string"
    && value.length <= maximum
    && !/<\/?[a-z][^>]*>/i.test(value)
    && !/(?:file:\/\/|[a-z]:\\|\/users\/|<script)/i.test(value)
    && redactSensitiveData(value).redactedText === value;
}

function prioritiesAreValid(value: unknown): value is SolutionPriorities {
  return isRecord(value) && hasExactKeys(value, ["traceability", "fieldBurden", "implementationEase", "costEfficiency", "deploymentSpeed", "scalability"])
    && Object.values(value).every((score) => Number.isInteger(score) && typeof score === "number" && score >= 1 && score <= 5);
}

function checklistIsValid(value: unknown): value is ReviewChecklist {
  return isRecord(value) && hasExactKeys(value, reviewChecklistKeys) && Object.values(value).every((checked) => typeof checked === "boolean");
}

function stringArray(value: unknown, maximumCount: number, maximumLength: number) {
  return Array.isArray(value) && value.length <= maximumCount && value.every((item) => plainText(item, maximumLength));
}

const v10CaseKeys = ["caseId", "caseTitle", "createdAt", "updatedAt", "analysisMode", "analysisRevision", "detectedAreas", "inputSummary", "recommendedOption", "secondOption", "priorityProfile", "roadmapSummary", "unresolvedItems", "knowledgeReferences", "evidenceSummaries", "confidence", "humanReviewRequired", "reviewStatus", "reviewerRole", "reviewerDisplayName", "consultantReview", "developerReview", "fieldReview", "decisionReason", "checklist", "limitations"] as const;
const v11ExtraKeys = ["fileCount", "includedFileCount", "fileCategories", "fileProcessingSummaries", "sensitiveFindingCategories", "redactionApplied", "selectedScenarioId", "selectedScenarioTitle"] as const;

function validateFileSummary(value: unknown) {
  const keys = ["displayName", "category", "supportLevel", "processingStatus", "includeInAnalysis", "structureSummary", "sensitiveCategories", "redactionApplied", "userDescriptionUsed"];
  return isRecord(value)
    && hasExactKeys(value, keys)
    && plainText(value.displayName, 80)
    && fileCategories.includes(value.category as (typeof fileCategories)[number])
    && fileSupportLevels.includes(value.supportLevel as (typeof fileSupportLevels)[number])
    && fileProcessingStatuses.includes(value.processingStatus as (typeof fileProcessingStatuses)[number])
    && typeof value.includeInAnalysis === "boolean"
    && plainText(value.structureSummary, 300)
    && Array.isArray(value.sensitiveCategories)
    && value.sensitiveCategories.length <= sensitiveCategories.length
    && value.sensitiveCategories.every((category) => sensitiveCategories.includes(category))
    && typeof value.redactionApplied === "boolean"
    && typeof value.userDescriptionUsed === "boolean";
}

function validateCase(value: unknown, schemaVersion: "1.0" | "1.1"): string | UnknownRecord {
  const caseKeys = schemaVersion === "1.1" ? [...v10CaseKeys, ...v11ExtraKeys] : [...v10CaseKeys];
  if (!isRecord(value)) return "case: 객체여야 합니다.";
  if (!hasExactKeys(value, caseKeys)) return schemaKeyError(value, caseKeys, "case");
  if (!plainText(value.caseId, 80) || typeof value.caseId !== "string" || !/^review-[a-z0-9]{7}$/.test(value.caseId)) return "case.caseId: 허용되지 않은 형식입니다.";
  if (!plainText(value.caseTitle, 150)) return "case.caseTitle: 허용되지 않은 값입니다.";
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) return "case: 생성·수정 시각 형식이 올바르지 않습니다.";
  if (value.analysisMode !== "consultant-file" && value.analysisMode !== "customer-qa") return "case.analysisMode: 허용되지 않은 값입니다.";
  if (!Number.isInteger(value.analysisRevision) || typeof value.analysisRevision !== "number" || value.analysisRevision < 1 || value.analysisRevision > 3) return "case.analysisRevision: 허용 범위를 벗어났습니다.";
  if (!stringArray(value.detectedAreas, 5, 80) || !plainText(value.inputSummary, 300) || !plainText(value.recommendedOption, 150) || !plainText(value.secondOption, 150)) return "case: 분석 요약 field가 올바르지 않습니다.";
  if (!prioritiesAreValid(value.priorityProfile)) return "case.priorityProfile: 점수 구조가 올바르지 않습니다.";
  if (!Array.isArray(value.roadmapSummary) || value.roadmapSummary.length > 3 || !value.roadmapSummary.every((phase) => isRecord(phase) && hasExactKeys(phase, ["title", "steps"]) && plainText(phase.title, 150) && stringArray(phase.steps, 5, 300))) return "case.roadmapSummary: 올바르지 않습니다.";
  if (!stringArray(value.unresolvedItems, 5, 300)) return "case.unresolvedItems: 올바르지 않습니다.";
  if (!Array.isArray(value.knowledgeReferences) || value.knowledgeReferences.length > 3 || !value.knowledgeReferences.every((reference) => isRecord(reference) && hasExactKeys(reference, ["title", "category", "sourceType", "matchedKeywords"]) && plainText(reference.title, 150) && plainText(reference.category, 80) && (reference.sourceType === "GENERAL" || reference.sourceType === "COMPANY") && stringArray(reference.matchedKeywords, 8, 80))) return "case.knowledgeReferences: 올바르지 않습니다.";
  if (!Array.isArray(value.evidenceSummaries) || value.evidenceSummaries.length > 8 || !value.evidenceSummaries.every((evidence) => isRecord(evidence) && hasExactKeys(evidence, ["source", "excerpt"]) && plainText(evidence.source, 120) && plainText(evidence.excerpt, 300))) return "case.evidenceSummaries: 올바르지 않습니다.";
  if (value.confidence !== "높음" && value.confidence !== "보통" && value.confidence !== "낮음") return "case.confidence: 허용되지 않은 값입니다.";
  if (value.humanReviewRequired !== true || !reviewStatuses.includes(value.reviewStatus as ReviewStatus)) return "case.reviewStatus: 허용되지 않은 값입니다.";
  if (!(value.reviewerRole === null || reviewerRoles.includes(value.reviewerRole as ReviewerRole)) || !plainText(value.reviewerDisplayName, 100) || !plainText(value.consultantReview, 2000) || !plainText(value.developerReview, 2000) || !plainText(value.fieldReview, 2000) || !plainText(value.decisionReason, 2000)) return "case: 검토자 또는 검토 의견 field가 올바르지 않습니다.";
  if (!checklistIsValid(value.checklist) || !stringArray(value.limitations, 5, 300)) return "case: 체크리스트 또는 제한사항이 올바르지 않습니다.";
  if (schemaVersion === "1.1") {
    if (!Number.isInteger(value.fileCount) || !Number.isInteger(value.includedFileCount) || typeof value.fileCount !== "number" || typeof value.includedFileCount !== "number" || value.fileCount < 0 || value.fileCount > 10 || value.includedFileCount < 0 || value.includedFileCount > value.fileCount) return "case.fileCount: 파일 집계가 올바르지 않습니다.";
    if (!Array.isArray(value.fileCategories) || value.fileCategories.length > fileCategories.length || !value.fileCategories.every((category) => fileCategories.includes(category))) return "case.fileCategories: 파일 분류가 올바르지 않습니다.";
    if (!Array.isArray(value.fileProcessingSummaries) || value.fileProcessingSummaries.length > 10 || !value.fileProcessingSummaries.every(validateFileSummary)) return "case.fileProcessingSummaries: 파일 처리 요약이 올바르지 않습니다.";
    if (!Array.isArray(value.sensitiveFindingCategories) || value.sensitiveFindingCategories.length > sensitiveCategories.length || !value.sensitiveFindingCategories.every((category) => sensitiveCategories.includes(category)) || typeof value.redactionApplied !== "boolean") return "case.sensitiveFindingCategories: 민감정보 집계가 올바르지 않습니다.";
    if (!plainText(value.selectedScenarioId, 80) || !plainText(value.selectedScenarioTitle, 150)) return "case.selectedScenarioId: 시나리오 정보가 올바르지 않습니다.";
  }
  return value;
}

export function validateReviewPackage(value: unknown): { success: true; value: ReviewPackage } | { success: false; error: string } {
  const topKeys = ["packageType", "schemaVersion", "case"];
  if (!isRecord(value)) return { success: false, error: "최상위 구조는 객체여야 합니다." };
  if (!hasExactKeys(value, topKeys)) return { success: false, error: schemaKeyError(value, topKeys, "package") };
  if (value.packageType !== "AI_SOLUTION_REVIEW_PACKAGE" || (value.schemaVersion !== "1.0" && value.schemaVersion !== "1.1")) return { success: false, error: "지원하지 않는 packageType 또는 schemaVersion입니다." };
  const reviewCase = validateCase(value.case, value.schemaVersion);
  if (typeof reviewCase === "string") return { success: false, error: reviewCase };
  return value.schemaVersion === "1.1"
    ? { success: true, value: { packageType: "AI_SOLUTION_REVIEW_PACKAGE", schemaVersion: "1.1", case: reviewCase as unknown as Omit<ReviewRecord, "analysisFingerprint"> } }
    : { success: true, value: { packageType: "AI_SOLUTION_REVIEW_PACKAGE", schemaVersion: "1.0", case: reviewCase as unknown as Extract<ReviewPackage, { schemaVersion: "1.0" }>["case"] } };
}
