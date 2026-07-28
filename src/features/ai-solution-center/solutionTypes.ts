export const businessDomains = ["자재", "재고", "LOT", "추적성", "생산", "공정", "검사", "현장", "MES", "기타"] as const;

export type BusinessDomain = (typeof businessDomains)[number] | "";
export type SolutionSource = "consultant-file" | "customer-qa";
export type SolutionConfidence = "높음" | "보통" | "낮음";
export type KnowledgeSourceType = "GENERAL" | "COMPANY";

export interface SolutionRequest {
  source: SolutionSource;
  domain: BusinessDomain;
  situation: string;
  extractedText?: string;
  currentManagement?: string;
  desiredStandard?: string;
  fieldConstraints?: string;
  clarificationAnswers?: readonly ClarificationAnswer[];
}

export interface SolutionRecommendation {
  title: string;
  rationale: string;
  actions: readonly string[];
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
}
