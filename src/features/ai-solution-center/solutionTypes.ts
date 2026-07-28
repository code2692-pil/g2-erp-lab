export const businessDomains = ["자재", "재고", "LOT", "추적성", "생산", "공정", "검사", "현장", "MES", "기타"] as const;

export type BusinessDomain = (typeof businessDomains)[number] | "";
export type SolutionSource = "consultant-file" | "customer-qa";
export type SolutionConfidence = "높음" | "보통" | "낮음";

export interface SolutionRequest {
  source: SolutionSource;
  domain: BusinessDomain;
  situation: string;
  extractedText?: string;
  currentManagement?: string;
  desiredStandard?: string;
  fieldConstraints?: string;
}

export interface SolutionRecommendation {
  title: string;
  rationale: string;
  actions: readonly string[];
}

export interface ClarifyingQuestion {
  audience: "컨설턴트" | "개발 담당자";
  question: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  domains: readonly BusinessDomain[];
  keywords: readonly string[];
  summary: string;
  basicPlan: readonly string[];
  phasedPlan: readonly string[];
  priorities: readonly string[];
  additionalInfo: readonly string[];
  risks: readonly string[];
  consultantQuestions: readonly string[];
  developmentQuestions: readonly string[];
}

export interface SolutionResult {
  inputSummary: string;
  inferredDomain: string;
  mainProblem: string;
  recommendation: SolutionRecommendation;
  phasedPlan: readonly string[];
  priorities: readonly string[];
  additionalInfo: readonly string[];
  risks: readonly string[];
  clarifyingQuestions: readonly ClarifyingQuestion[];
  confidence: SolutionConfidence;
  externalReviewRequired: true;
  guideNotice: string;
}
