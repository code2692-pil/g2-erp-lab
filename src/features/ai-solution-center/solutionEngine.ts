import { solutionKnowledge } from "./solutionKnowledge";
import type { BusinessDomain, ClarifyingQuestion, CompanyKnowledgeArticle, KnowledgeArticle, KnowledgeSourceType, RecommendationEvidence, SolutionConfidence, SolutionRequest, SolutionResult } from "./solutionTypes";

interface KnowledgeCandidate {
  id: string;
  title: string;
  category: string;
  domains: readonly BusinessDomain[];
  keywords: readonly string[];
  symptoms: readonly string[];
  recommendations: readonly string[];
  alternatives: readonly string[];
  requiredInformation: readonly string[];
  risks: readonly string[];
  applicableProcesses: readonly string[];
  summary: string;
  phasedPlan: readonly string[];
  priorities: readonly string[];
  additionalInfo: readonly string[];
  consultantQuestions: readonly string[];
  developmentQuestions: readonly string[];
  confidenceWeight: number;
  sourceType: KnowledgeSourceType;
  companySpecific: boolean;
}

const domainKeywords: ReadonlyArray<readonly [BusinessDomain, readonly string[]]> = [
  ["LOT", ["lot", "로트"]], ["추적성", ["추적", "trace", "이력"]], ["자재", ["자재", "입고", "구매"]], ["재고", ["재고", "창고", "재고실사"]], ["생산", ["생산", "작업지시", "실적"]], ["공정", ["공정", "작업"]], ["검사", ["검사", "품질", "불량"]], ["현장", ["현장", "작업자", "단말"]], ["MES", ["mes", "시스템"]]
];

function combinedInput(request: SolutionRequest) {
  return [request.situation, request.extractedText, request.currentManagement, request.desiredStandard, request.fieldConstraints]
    .concat((request.clarificationAnswers ?? []).map((answer) => `${answer.question}\n${answer.answer}`))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function generalCandidate(article: KnowledgeArticle): KnowledgeCandidate {
  return {
    id: article.id,
    title: article.title,
    category: article.category ?? article.domains[0] ?? "기타",
    domains: article.domains,
    keywords: article.keywords,
    symptoms: article.symptoms ?? [],
    recommendations: article.recommendations ?? article.basicPlan,
    alternatives: article.alternatives ?? [],
    requiredInformation: article.requiredInformation ?? article.additionalInfo,
    risks: article.risks,
    applicableProcesses: article.applicableProcesses ?? article.domains.filter(Boolean),
    summary: article.summary,
    phasedPlan: article.phasedPlan,
    priorities: article.priorities,
    additionalInfo: article.additionalInfo,
    consultantQuestions: article.consultantQuestions,
    developmentQuestions: article.developmentQuestions,
    confidenceWeight: article.confidenceWeight ?? 0.65,
    sourceType: article.sourceType ?? "GENERAL",
    companySpecific: article.companySpecific ?? false
  };
}

function companyCandidate(article: CompanyKnowledgeArticle): KnowledgeCandidate {
  return {
    id: article.id,
    title: article.title,
    category: article.category,
    domains: [],
    keywords: article.keywords,
    symptoms: article.symptoms,
    recommendations: article.recommendations,
    alternatives: article.alternatives,
    requiredInformation: article.requiredInformation,
    risks: article.risks,
    applicableProcesses: article.applicableProcesses,
    summary: article.symptoms[0] ?? "회사 지식팩에서 불러온 검토 항목입니다.",
    phasedPlan: article.recommendations,
    priorities: article.requiredInformation,
    additionalInfo: article.requiredInformation,
    consultantQuestions: article.requiredInformation.map((item) => `${item} 기준을 확인해 주세요.`),
    developmentQuestions: ["기존 ERP 메뉴·테이블·API에서 연결 가능한 기준정보를 확인해 주세요.", "입력·조회 화면의 예외 처리와 성능 영향을 확인해 주세요."],
    confidenceWeight: article.confidenceWeight,
    sourceType: "COMPANY",
    companySpecific: true
  };
}

function symptomMatchCount(symptoms: readonly string[], input: string) {
  const normalized = input.toLocaleLowerCase("ko-KR");
  return symptoms.reduce((score, symptom) => {
    const words = symptom.toLocaleLowerCase("ko-KR").split(/[\s·,./()]+/).filter((word) => word.length >= 2);
    return score + Number(words.some((word) => normalized.includes(word)));
  }, 0);
}

function rankedCandidates(request: SolutionRequest, input: string, companyKnowledge: readonly CompanyKnowledgeArticle[]) {
  const normalized = input.toLocaleLowerCase("ko-KR");
  const candidates = [...solutionKnowledge.map(generalCandidate), ...companyKnowledge.map(companyCandidate)];
  return candidates.map((candidate) => {
    const matchedKeywords = candidate.keywords.filter((keyword) => normalized.includes(keyword.toLocaleLowerCase("ko-KR")));
    const domainMatch = request.domain !== "" && (candidate.domains.includes(request.domain) || candidate.category === request.domain);
    const symptoms = symptomMatchCount(candidate.symptoms, input);
    return { candidate, matchedKeywords, score: matchedKeywords.length * 3 + Number(domainMatch) * 2 + symptoms * 2 };
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.score > 0 && left.candidate.sourceType !== right.candidate.sourceType) return left.candidate.sourceType === "COMPANY" ? -1 : 1;
    if (left.score === 0 && left.candidate.sourceType !== right.candidate.sourceType) return left.candidate.sourceType === "GENERAL" ? -1 : 1;
    if (right.candidate.confidenceWeight !== left.candidate.confidenceWeight) return right.candidate.confidenceWeight - left.candidate.confidenceWeight;
    return left.candidate.id.localeCompare(right.candidate.id);
  });
}

function inferDomain(request: SolutionRequest, input: string, candidate: KnowledgeCandidate): string {
  if (request.domain) return request.domain;
  const normalized = input.toLocaleLowerCase("ko-KR");
  const found = domainKeywords.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return found?.[0] ?? candidate.category ?? candidate.domains[0] ?? "기타";
}

function confidenceFor(input: string, matchedKeywords: number, hasDomain: boolean): SolutionConfidence {
  if (input.length >= 180 && matchedKeywords >= 2 && hasDomain) return "높음";
  if (input.length >= 45 || matchedKeywords >= 1) return "보통";
  return "낮음";
}

function evidenceFor(entry: ReturnType<typeof rankedCandidates>[number]): RecommendationEvidence {
  const matchedLabel = entry.matchedKeywords.length > 0 ? entry.matchedKeywords.join(", ") : "업무영역";
  return {
    id: entry.candidate.id,
    title: entry.candidate.title,
    category: entry.candidate.category,
    sourceType: entry.candidate.sourceType,
    companySpecific: entry.candidate.companySpecific,
    matchedKeywords: entry.matchedKeywords,
    reason: entry.matchedKeywords.length > 0 ? `입력의 ${matchedLabel} 키워드가 지식 항목과 일치했습니다.` : "선택한 업무영역과 기본 검토 범위를 기준으로 참고했습니다.",
    confidenceWeight: entry.candidate.confidenceWeight
  };
}

function questionSets(primary: KnowledgeCandidate, confidence: SolutionConfidence, companyKnowledgeUsed: boolean) {
  if (confidence === "높음" && !companyKnowledgeUsed) return { consultant: [] as readonly string[], development: [] as readonly string[] };
  const consultant = primary.consultantQuestions.length > 0 ? primary.consultantQuestions : primary.requiredInformation.map((item) => `${item}을 확인해 주세요.`);
  const development = primary.developmentQuestions.length > 0 ? primary.developmentQuestions : ["기존 ERP 화면·테이블·API 영향 범위를 확인해 주세요."];
  return { consultant: consultant.slice(0, 2), development: development.slice(0, 1) };
}

export function buildSolutionResult(request: SolutionRequest, companyKnowledge: readonly CompanyKnowledgeArticle[] = []): SolutionResult {
  const input = combinedInput(request);
  const ranked = rankedCandidates(request, input, companyKnowledge);
  const primary = ranked[0];
  const confidence = confidenceFor(input, primary.matchedKeywords.length, request.domain !== "");
  const evidence = ranked.filter((entry, index) => index === 0 || entry.score > 0).slice(0, 3).map(evidenceFor);
  const companyKnowledgeUsed = evidence.some((item) => item.sourceType === "COMPANY");
  const questions = questionSets(primary.candidate, confidence, companyKnowledgeUsed);
  const clarifyingQuestions: ClarifyingQuestion[] = [
    ...questions.consultant.map((question, index) => ({ id: `${primary.candidate.id}-consultant-${index + 1}`, audience: "컨설턴트" as const, question, required: index === 0, purpose: "실제 업무 기준과 현장 적용 가능성을 확인합니다." })),
    ...questions.development.map((question, index) => ({ id: `${primary.candidate.id}-development-${index + 1}`, audience: "개발 담당자" as const, question, required: false, purpose: "기존 ERP 화면·데이터·예외 처리 영향을 확인합니다." }))
  ];

  return {
    inputSummary: input.length > 220 ? `${input.slice(0, 220)}…` : input,
    inferredDomain: inferDomain(request, input, primary.candidate),
    mainProblem: `${primary.candidate.category} 업무에서 관리 기준과 현장 실행 부담을 함께 확인해야 하는 상황으로 정리했습니다.`,
    recommendation: { title: primary.candidate.title, rationale: primary.candidate.summary, actions: primary.candidate.recommendations },
    phasedPlan: primary.candidate.phasedPlan.length > 0 ? primary.candidate.phasedPlan : primary.candidate.recommendations,
    priorities: primary.candidate.priorities.length > 0 ? primary.candidate.priorities : primary.candidate.requiredInformation,
    additionalInfo: primary.candidate.additionalInfo.length > 0 ? primary.candidate.additionalInfo : primary.candidate.requiredInformation,
    alternatives: primary.candidate.alternatives,
    risks: primary.candidate.risks,
    clarifyingQuestions,
    consultantQuestions: questions.consultant,
    developmentQuestions: questions.development,
    evidence,
    companyKnowledgeUsed,
    confidence,
    externalReviewRequired: true,
    guideNotice: "이 결과는 로컬 지식 템플릿과 현재 브라우저 세션의 회사 지식팩을 바탕으로 한 기본 검토 가이드이며, 회사의 확정 정책이나 실제 운영 기준을 뜻하지 않습니다."
  };
}
