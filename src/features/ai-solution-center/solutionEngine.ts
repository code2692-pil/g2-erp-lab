import { solutionKnowledge } from "./solutionKnowledge";
import type { BusinessDomain, ClarifyingQuestion, KnowledgeArticle, SolutionConfidence, SolutionRequest, SolutionResult } from "./solutionTypes";

const domainKeywords: ReadonlyArray<readonly [BusinessDomain, readonly string[]]> = [
  ["LOT", ["lot", "로트"]], ["추적성", ["추적", "trace", "이력"]], ["자재", ["자재", "입고", "구매"]], ["재고", ["재고", "창고", "재고실사"]], ["생산", ["생산", "작업지시", "실적"]], ["공정", ["공정", "작업"]], ["검사", ["검사", "품질", "불량"]], ["현장", ["현장", "작업자", "단말"]], ["MES", ["mes", "시스템"]]
];

function combinedInput(request: SolutionRequest) {
  return [request.situation, request.extractedText, request.currentManagement, request.desiredStandard, request.fieldConstraints]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function findArticle(request: SolutionRequest, input: string): { article: KnowledgeArticle; matchedKeywords: number } {
  const normalized = input.toLocaleLowerCase("ko-KR");
  const ranked = solutionKnowledge.map((article) => {
    const keywordScore = article.keywords.reduce((score, keyword) => score + Number(normalized.includes(keyword.toLocaleLowerCase("ko-KR"))), 0);
    const domainScore = request.domain !== "" && article.domains.includes(request.domain) ? 2 : 0;
    return { article, score: keywordScore + domainScore, matchedKeywords: keywordScore };
  }).sort((left, right) => right.score - left.score || left.article.id.localeCompare(right.article.id));
  return { article: ranked[0].article, matchedKeywords: ranked[0].matchedKeywords };
}

function inferDomain(request: SolutionRequest, input: string, article: KnowledgeArticle): string {
  if (request.domain) return request.domain;
  const normalized = input.toLocaleLowerCase("ko-KR");
  const found = domainKeywords.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return found?.[0] ?? article.domains[0] ?? "기타";
}

function confidenceFor(input: string, matchedKeywords: number, hasDomain: boolean): SolutionConfidence {
  if (input.length >= 180 && matchedKeywords >= 2 && hasDomain) return "높음";
  if (input.length >= 45 || matchedKeywords >= 1) return "보통";
  return "낮음";
}

function pickQuestions(article: KnowledgeArticle, confidence: SolutionConfidence): ClarifyingQuestion[] {
  if (confidence === "높음") return [];
  const questions: ClarifyingQuestion[] = [
    ...article.consultantQuestions.map((question) => ({ audience: "컨설턴트" as const, question })),
    ...article.developmentQuestions.map((question) => ({ audience: "개발 담당자" as const, question }))
  ];
  return questions.slice(0, 3);
}

export function buildSolutionResult(request: SolutionRequest): SolutionResult {
  const input = combinedInput(request);
  const { article, matchedKeywords } = findArticle(request, input);
  const confidence = confidenceFor(input, matchedKeywords, request.domain !== "");
  const inferredDomain = inferDomain(request, input, article);

  return {
    inputSummary: input.length > 220 ? `${input.slice(0, 220)}…` : input,
    inferredDomain,
    mainProblem: `${inferredDomain} 업무에서 관리 기준과 현장 실행 부담을 함께 확인해야 하는 상황으로 정리했습니다.`,
    recommendation: { title: article.title, rationale: article.summary, actions: article.basicPlan },
    phasedPlan: article.phasedPlan,
    priorities: article.priorities,
    additionalInfo: article.additionalInfo,
    risks: article.risks,
    clarifyingQuestions: pickQuestions(article, confidence),
    confidence,
    externalReviewRequired: true,
    guideNotice: "이 결과는 로컬 지식 템플릿을 바탕으로 한 기본 검토 가이드이며, 회사의 확정 정책이나 실제 운영 기준을 뜻하지 않습니다."
  };
}
