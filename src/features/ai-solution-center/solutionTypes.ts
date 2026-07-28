export const businessDomains = ["자재", "재고", "LOT", "추적성", "생산", "공정", "검사", "현장", "MES", "기타"] as const;

export type BusinessDomain = (typeof businessDomains)[number] | "";
export type SolutionSource = "consultant-file" | "customer-qa";
export type SolutionConfidence = "높음" | "보통" | "낮음";
export type KnowledgeSourceType = "GENERAL" | "COMPANY";
export type InputEvidenceSourceType =
  | "EXTRACTED_FILE_TEXT"
  | "FILE_NOTE"
  | "COMMON_CONTEXT"
  | "CUSTOMER_QUESTION"
  | "CUSTOMER_CONTEXT"
  | "CLARIFICATION_ANSWER"
  | "GENERAL_KNOWLEDGE"
  | "COMPANY_KNOWLEDGE";

export interface FileAnalysisInput {
  id: string;
  fileName: string;
  extractedText?: string;
  note?: string;
  attachmentOrder: number;
}

export interface InputEvidence {
  id: string;
  sourceType: InputEvidenceSourceType;
  sourceLabel: string;
  fileName?: string;
  excerpt: string;
  relatedKeywords: readonly string[];
  usedInRecommendation: boolean;
}

export interface SolutionRequest {
  source: SolutionSource;
  domain: BusinessDomain;
  situation: string;
  extractedText?: string;
  currentManagement?: string;
  desiredStandard?: string;
  fieldConstraints?: string;
  clarificationAnswers?: readonly ClarificationAnswer[];
  fileInputs?: readonly FileAnalysisInput[];
}

export interface SolutionRecommendation {
  title: string;
  rationale: string;
  actions: readonly string[];
}

export const solutionPriorityKeys = ["traceability", "fieldBurden", "implementationEase", "costEfficiency", "deploymentSpeed", "scalability"] as const;

export type SolutionPriorityKey = (typeof solutionPriorityKeys)[number];

export interface SolutionPriorities {
  traceability: number;
  fieldBurden: number;
  implementationEase: number;
  costEfficiency: number;
  deploymentSpeed: number;
  scalability: number;
}

export interface SolutionOptionRoadmapPhase {
  title: string;
  steps: readonly string[];
}

export interface SolutionOption {
  id: string;
  title: string;
  summary: string;
  description: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  suitableWhen: readonly string[];
  unsuitableWhen: readonly string[];
  prerequisites: readonly string[];
  risks: readonly string[];
  dimensionScores: SolutionPriorities;
  weightedScore: number;
  rank: number;
  recommended: boolean;
  humanReviewRequired: true;
  roadmap: readonly SolutionOptionRoadmapPhase[];
  reconsiderationConditions: readonly string[];
}

export interface SolutionOptionComparison {
  priorities: SolutionPriorities;
  options: readonly SolutionOption[];
  recommendationReason: string;
  scoreNotice: string;
}

export const reviewStatuses = ["PENDING", "APPLY", "HOLD", "REJECT", "NEEDS_BUSINESS_DECISION"] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export const reviewerRoles = ["CONSULTANT", "DEVELOPER", "FIELD", "CUSTOMER"] as const;
export type ReviewerRole = (typeof reviewerRoles)[number];

export const reviewChecklistKeys = [
  "CONSULTANT_CURRENT_PROCESS",
  "CONSULTANT_TARGET_STANDARD",
  "CONSULTANT_FIELD_CONSTRAINT",
  "CONSULTANT_RELATED_TEAM",
  "CONSULTANT_BUSINESS_OWNER",
  "DEVELOPER_EXISTING_FEATURE",
  "DEVELOPER_MASTER_STRUCTURE",
  "DEVELOPER_API_INTEGRATION",
  "DEVELOPER_DATA_MODEL",
  "DEVELOPER_EXCEPTION_REWORK",
  "FIELD_INPUT_LOCATION",
  "FIELD_BARCODE_OR_QR",
  "FIELD_INPUT_BURDEN",
  "FIELD_PILOT_SCOPE"
] as const;

export type ReviewChecklistKey = (typeof reviewChecklistKeys)[number];
export type ReviewChecklist = Record<ReviewChecklistKey, boolean>;

export interface ReviewRoadmapSummary {
  title: string;
  steps: readonly string[];
}

export interface ReviewKnowledgeReference {
  title: string;
  category: string;
  sourceType: KnowledgeSourceType;
  matchedKeywords: readonly string[];
}

export interface ReviewEvidenceSummary {
  source: string;
  excerpt: string;
}

export interface ReviewAnalysisSnapshot {
  analysisMode: SolutionSource;
  analysisRevision: number;
  detectedAreas: readonly string[];
  inputSummary: string;
  recommendedOption: string;
  secondOption: string;
  priorityProfile: SolutionPriorities;
  roadmapSummary: readonly ReviewRoadmapSummary[];
  unresolvedItems: readonly string[];
  knowledgeReferences: readonly ReviewKnowledgeReference[];
  evidenceSummaries: readonly ReviewEvidenceSummary[];
  confidence: SolutionConfidence;
  humanReviewRequired: true;
}

export interface ReviewRecord extends ReviewAnalysisSnapshot {
  caseId: string;
  caseTitle: string;
  createdAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
  reviewerRole: ReviewerRole | null;
  reviewerDisplayName: string;
  consultantReview: string;
  developerReview: string;
  fieldReview: string;
  decisionReason: string;
  checklist: ReviewChecklist;
  limitations: readonly string[];
  analysisFingerprint: string;
}

export interface ReviewPackage {
  packageType: "AI_SOLUTION_REVIEW_PACKAGE";
  schemaVersion: "1.0";
  case: Omit<ReviewRecord, "analysisFingerprint">;
}

export interface ClarifyingQuestion {
  id: string;
  audience: "컨설턴트" | "개발 담당자";
  question: string;
  required: boolean;
  purpose: string;
}

export interface ClarificationAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  domains: readonly BusinessDomain[];
  category?: string;
  keywords: readonly string[];
  symptoms?: readonly string[];
  recommendations?: readonly string[];
  alternatives?: readonly string[];
  requiredInformation?: readonly string[];
  applicableProcesses?: readonly string[];
  sourceType?: KnowledgeSourceType;
  companySpecific?: boolean;
  confidenceWeight?: number;
  summary: string;
  basicPlan: readonly string[];
  phasedPlan: readonly string[];
  priorities: readonly string[];
  additionalInfo: readonly string[];
  risks: readonly string[];
  consultantQuestions: readonly string[];
  developmentQuestions: readonly string[];
}

export interface CompanyKnowledgeArticle {
  id: string;
  title: string;
  category: string;
  keywords: readonly string[];
  symptoms: readonly string[];
  recommendations: readonly string[];
  alternatives: readonly string[];
  requiredInformation: readonly string[];
  risks: readonly string[];
  applicableProcesses: readonly string[];
  confidenceWeight: number;
  sourceType: "COMPANY";
  companySpecific: true;
}

export interface RecommendationEvidence {
  id: string;
  title: string;
  category: string;
  sourceType: KnowledgeSourceType;
  companySpecific: boolean;
  matchedKeywords: readonly string[];
  reason: string;
  confidenceWeight: number;
}

export interface SolutionResult {
  inputSummary: string;
  inferredDomain: string;
  mainProblem: string;
  recommendation: SolutionRecommendation;
  phasedPlan: readonly string[];
  priorities: readonly string[];
  additionalInfo: readonly string[];
  alternatives: readonly string[];
  risks: readonly string[];
  clarifyingQuestions: readonly ClarifyingQuestion[];
  consultantQuestions: readonly string[];
  developmentQuestions: readonly string[];
  evidence: readonly RecommendationEvidence[];
  inputEvidence: readonly InputEvidence[];
  companyKnowledgeUsed: boolean;
  confidence: SolutionConfidence;
  externalReviewRequired: true;
  guideNotice: string;
}

export interface SolutionRevision {
  revision: number;
  createdAt: string;
  result: SolutionResult;
  clarificationAnswers: readonly ClarificationAnswer[];
  previousConfidence?: SolutionConfidence;
  currentConfidence: SolutionConfidence;
}

export interface SolutionSession {
  mode: SolutionSource;
  originalRequest: SolutionRequest;
  companyKnowledgeSnapshot: readonly CompanyKnowledgeArticle[];
  revisions: readonly SolutionRevision[];
  activeResult: SolutionResult;
  optionComparison?: SolutionOptionComparison;
}
