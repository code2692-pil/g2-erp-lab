import type { SolutionOption, SolutionOptionComparison, SolutionPriorities, SolutionRequest, SolutionResult } from "./solutionTypes";

export const defaultSolutionPriorities: SolutionPriorities = {
  traceability: 3,
  fieldBurden: 3,
  implementationEase: 3,
  costEfficiency: 3,
  deploymentSpeed: 3,
  scalability: 3
};

export const solutionPriorityLabels: Readonly<Record<keyof SolutionPriorities, string>> = {
  traceability: "추적성·정보 연결",
  fieldBurden: "현장 입력 부담 최소화",
  implementationEase: "구현 용이성",
  costEfficiency: "도입 비용 부담",
  deploymentSpeed: "빠른 도입",
  scalability: "향후 확장성"
};

export const solutionPriorityPresets = [
  { id: "balanced", label: "균형형", priorities: defaultSolutionPriorities },
  { id: "traceability", label: "추적성 우선", priorities: { traceability: 5, fieldBurden: 2, implementationEase: 2, costEfficiency: 2, deploymentSpeed: 2, scalability: 4 } },
  { id: "field-burden", label: "현장 부담 최소", priorities: { traceability: 3, fieldBurden: 5, implementationEase: 4, costEfficiency: 3, deploymentSpeed: 4, scalability: 3 } },
  { id: "quick-start", label: "빠른 도입", priorities: { traceability: 3, fieldBurden: 4, implementationEase: 5, costEfficiency: 4, deploymentSpeed: 5, scalability: 2 } },
  { id: "scalability", label: "확장성 우선", priorities: { traceability: 4, fieldBurden: 2, implementationEase: 1, costEfficiency: 1, deploymentSpeed: 1, scalability: 5 } }
] as const;

interface OptionDefinition extends Omit<SolutionOption, "weightedScore" | "rank" | "recommended" | "humanReviewRequired"> {
  inputMatchScore: number;
}

const traceabilityOptions: readonly OptionDefinition[] = [
  {
    id: "trace-full-serial",
    title: "전 공정 시리얼 관리",
    summary: "초기 시리얼 생성부터 주요 공정별 개별 스캔까지 연결해 제품 단위 추적을 강화합니다.",
    description: "개별 제품 또는 단위별 상태 전환을 중심으로 공정 이력을 일관되게 남기는 대안입니다.",
    strengths: ["제품 단위 추적 범위가 넓음", "공정별 책임과 상태를 확인하기 쉬움"],
    weaknesses: ["현장 입력과 스캔 부담이 큼", "초기 데이터·장비·절차 준비가 많음"],
    suitableWhen: ["개별 제품 단위의 고객 추적 요구가 높을 때", "주요 공정의 책임 구분이 명확할 때"],
    unsuitableWhen: ["모든 공정에서 추가 입력을 수용하기 어려울 때", "단기간에 최소 범위만 검증해야 할 때"],
    prerequisites: ["시리얼 생성 규칙과 상태 전환 기준", "공정별 입력 책임자와 스캔 가능 여부"],
    risks: ["누락 스캔이 반복되면 이력 신뢰도가 낮아질 수 있음", "작업 흐름을 방해하지 않는 입력 위치 검토가 필요함"],
    dimensionScores: { traceability: 5, fieldBurden: 1, implementationEase: 1, costEfficiency: 1, deploymentSpeed: 1, scalability: 4 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["대상 품목·공정과 시리얼 관리 단위를 정합니다.", "공정별 입력 책임자, 스캔 장비, 누락 방지 기준을 확인합니다."] },
      { title: "2단계 · 시범 적용", steps: ["시리얼 생성·상태 전환 기준을 등록합니다.", "작업·검사·포장 공정에서 개별 스캔과 예외·재작업 처리를 연결합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["공정별 누락과 현장 부담을 점검합니다.", "제품 단위 추적 결과와 예외 이력을 검증한 뒤 확대 여부를 결정합니다."] }
    ],
    reconsiderationConditions: ["공정별 입력 누락이 반복되는 경우", "스캔 작업이 생산 속도를 방해하는 경우", "시리얼 상태 전환 책임이 불명확한 경우"],
    inputMatchScore: 3
  },
  {
    id: "trace-integrated-lot",
    title: "통합형 LOT·추적성 관리",
    summary: "입고·보관 LOT를 기준으로 핵심 시점만 연결해 추적성과 현장 부담의 균형을 맞춥니다.",
    description: "입고·창고 LOT를 중심으로 작업, 검사, 포장, 출하의 핵심 기록을 이어 보는 균형형 대안입니다.",
    strengths: ["LOT 기반 추적 흐름을 여러 업무 단계에 연결", "핵심 시점만 입력해 현장 부담을 조절"],
    weaknesses: ["모든 개별 제품 단위 이력에는 한계가 있음", "핵심 입력 시점을 사전에 합의해야 함"],
    suitableWhen: ["입고부터 포장·출하까지 LOT 연결이 필요한 경우", "추적성과 현장 입력 부담을 함께 고려해야 할 때"],
    unsuitableWhen: ["모든 제품의 개별 시리얼 이력이 필수인 경우", "LOT 기준 자체가 아직 정리되지 않은 경우"],
    prerequisites: ["입고·보관 LOT 규칙", "작업·검사·포장·출하의 핵심 연결 시점"],
    risks: ["LOT·시리얼 연결 규칙이 누락되면 이력 공백이 생길 수 있음", "예외·재작업 이력의 처리 기준을 확인해야 함"],
    dimensionScores: { traceability: 5, fieldBurden: 4, implementationEase: 4, costEfficiency: 4, deploymentSpeed: 3, scalability: 4 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["대상 품목·공정과 LOT 관리 단위를 정합니다.", "입고·보관 LOT, 핵심 입력 위치, 책임 팀을 확인합니다."] },
      { title: "2단계 · 시범 적용", steps: ["기준 정보를 등록하고 바코드·QR 또는 기존 입력 방식을 정합니다.", "작업·검사·포장 기록을 LOT와 연결하고 예외·재작업 흐름을 교육합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["입력 누락·현장 부담·LOT 추적 결과를 점검합니다.", "예외 처리 결과와 확대 적용 여부를 담당자가 검토합니다."] }
    ],
    reconsiderationConditions: ["LOT·시리얼 연결 관계가 누락되는 경우", "재작업 이력을 일관되게 이어 볼 수 없는 경우", "고객 요구 추적 범위를 충족하지 못하는 경우"],
    inputMatchScore: 5
  },
  {
    id: "trace-lot-centered",
    title: "LOT 중심 관리",
    summary: "개별 시리얼 없이 LOT 단위 이력을 우선 연결해 빠르고 단순한 적용 범위를 만듭니다.",
    description: "개별 제품 추적 대신 LOT 단위의 입고·생산·검사·포장 이력을 중심으로 정리하는 대안입니다.",
    strengths: ["현장 입력 부담을 낮추기 쉬움", "단순한 LOT 흐름부터 빠르게 검증 가능"],
    weaknesses: ["개별 제품 단위 추적에는 한계", "세밀한 공정 책임 구분이 제한될 수 있음"],
    suitableWhen: ["LOT 단위 관리가 우선인 경우", "짧은 입력 흐름부터 검증하려는 경우"],
    unsuitableWhen: ["개별 제품·개별 시리얼 이력이 필수인 경우", "공정별 세밀한 책임 추적이 필요한 경우"],
    prerequisites: ["LOT 생성·분할·병합 기준", "입고·검사·포장의 최소 연결 지점"],
    risks: ["LOT 단위가 너무 넓으면 원인 추적이 어려울 수 있음", "분할·혼합 예외를 별도로 확인해야 함"],
    dimensionScores: { traceability: 2, fieldBurden: 5, implementationEase: 5, costEfficiency: 4, deploymentSpeed: 5, scalability: 2 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["대상 LOT와 적용 공정을 정하고 관리 단위를 확인합니다.", "입고·검사·포장의 최소 입력 위치와 담당자를 정합니다."] },
      { title: "2단계 · 시범 적용", steps: ["LOT 기준정보와 입력 방법을 등록합니다.", "핵심 공정 연결과 분할·혼합·재작업 예외를 교육합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["LOT 누락, 현장 부담, 추적 결과를 점검합니다.", "개별 시리얼 확장 필요성과 적용 범위를 검토합니다."] }
    ],
    reconsiderationConditions: ["고객이 개별 제품 추적을 요구하는 경우", "LOT 분할·혼합 이력이 반복 누락되는 경우", "LOT 단위만으로 원인 추적이 부족한 경우"],
    inputMatchScore: 2
  },
  {
    id: "trace-staged-serial",
    title: "단계별 시리얼 확장",
    summary: "선택 품목·공정부터 시리얼을 시범 적용한 뒤 검증 결과에 따라 확장합니다.",
    description: "초기 부담을 제한하면서도 시리얼 기반 추적성을 단계적으로 넓힐 수 있는 대안입니다.",
    strengths: ["시범 품목·공정으로 초기 부담을 제한", "검증 후 확장 경로를 확보"],
    weaknesses: ["초기에는 전체 범위의 이력이 완성되지 않음", "확장 기준과 전환 시점 관리가 필요"],
    suitableWhen: ["시리얼 추적 필요성은 높지만 한 번에 전면 적용하기 어려울 때", "품목·공정별 시범 결과를 보고 확장하려는 경우"],
    unsuitableWhen: ["즉시 전 공정의 개별 추적이 필요한 경우", "시범 범위와 책임 팀을 정할 수 없는 경우"],
    prerequisites: ["시범 품목·공정과 성공 기준", "시리얼 생성·입력 책임과 확장 의사결정자"],
    risks: ["시범과 비시범 범위의 관리 기준이 혼재될 수 있음", "확장 전 누락·부담 지표를 검토해야 함"],
    dimensionScores: { traceability: 5, fieldBurden: 4, implementationEase: 3, costEfficiency: 3, deploymentSpeed: 3, scalability: 5 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["시범 품목·시범 공정과 시리얼 관리 단위를 정합니다.", "입력 위치, 책임 팀, 확대 판단 기준을 합의합니다."] },
      { title: "2단계 · 시범 적용", steps: ["시범 대상의 시리얼 생성과 바코드·QR 입력 방법을 등록합니다.", "시범 공정의 작업·검사·포장 연결, 예외·재작업 처리와 교육을 진행합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["시범 공정의 누락, 현장 부담, 추적 결과를 검증합니다.", "확대 대상 품목·공정과 단계별 전환 여부를 결정합니다."] }
    ],
    reconsiderationConditions: ["시범 공정의 입력 누락이 반복되는 경우", "시범 결과가 생산 흐름을 방해하는 경우", "확대 기준이나 책임자가 정해지지 않은 경우"],
    inputMatchScore: 4
  }
];

const generalOptions: readonly OptionDefinition[] = [
  {
    id: "general-integrated",
    title: "통합 기준 적용",
    summary: "핵심 업무 기준과 입력 흐름을 함께 정리해 관련 화면에 일관되게 적용합니다.",
    description: "여러 업무 단계의 기준과 입력 지점을 함께 조정하는 포괄형 대안입니다.",
    strengths: ["업무 흐름의 일관성을 높이기 쉬움", "확장 기준을 함께 준비 가능"], weaknesses: ["초기 조율 범위가 넓음", "현장 교육 준비가 필요"],
    suitableWhen: ["여러 화면·공정의 기준을 함께 맞춰야 할 때"], unsuitableWhen: ["한 공정의 빠른 시범만 필요한 경우"], prerequisites: ["대상 업무 기준과 책임 팀", "핵심 입력 위치"], risks: ["범위가 넓으면 결정이 지연될 수 있음"],
    dimensionScores: { traceability: 4, fieldBurden: 3, implementationEase: 3, costEfficiency: 3, deploymentSpeed: 2, scalability: 5 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["대상 업무·공정과 관리 기준을 정합니다.", "입력 위치와 책임 팀을 확인합니다."] },
      { title: "2단계 · 시범 적용", steps: ["기준정보와 입력 방식을 준비합니다.", "핵심 업무 연결과 예외 처리, 사용자 교육을 진행합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["누락·부담·업무 결과를 검증합니다.", "확대 범위와 보완 과제를 결정합니다."] }
    ], reconsiderationConditions: ["핵심 기준의 합의가 지연되는 경우", "입력 부담이 현장 기준을 넘는 경우"], inputMatchScore: 4
  },
  {
    id: "general-lightweight",
    title: "간소화 적용",
    summary: "필수 입력과 핵심 확인 지점만 먼저 적용해 현장 부담을 낮춥니다.",
    description: "현재 업무 흐름을 크게 바꾸지 않고 최소 기준부터 검증하는 대안입니다.",
    strengths: ["현장 부담을 낮추기 쉬움", "짧은 범위에서 검증 가능"], weaknesses: ["정보 범위가 제한될 수 있음", "나중 확장 기준이 필요"],
    suitableWhen: ["현장 입력 시간이 가장 큰 제약일 때"], unsuitableWhen: ["처음부터 전체 업무 이력이 필요한 경우"], prerequisites: ["필수 입력 항목과 예외 기준", "현장 담당자 확인"], risks: ["누락된 정보가 나중에 필요해질 수 있음"],
    dimensionScores: { traceability: 2, fieldBurden: 5, implementationEase: 5, costEfficiency: 4, deploymentSpeed: 5, scalability: 2 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["필수 입력과 대상 업무를 정합니다.", "입력 위치와 담당자를 확인합니다."] },
      { title: "2단계 · 시범 적용", steps: ["최소 기준정보와 입력 방식을 적용합니다.", "예외·재작업 처리와 사용자 교육을 진행합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["누락과 현장 부담을 점검합니다.", "추가 연결과 확대 여부를 결정합니다."] }
    ], reconsiderationConditions: ["필수 정보 누락이 반복되는 경우", "간소화 범위가 업무 판단에 부족한 경우"], inputMatchScore: 2
  },
  {
    id: "general-staged",
    title: "단계적 적용",
    summary: "우선순위가 높은 업무부터 시범 적용하고 검증 결과로 다음 범위를 정합니다.",
    description: "업무 단위별로 적용 범위를 넓혀 초기 위험과 부담을 조절하는 대안입니다.",
    strengths: ["시범 결과를 보고 범위를 조절 가능", "확장 판단을 체계화하기 쉬움"], weaknesses: ["단계별 기준 관리가 필요", "전체 효과 확인까지 시간이 걸릴 수 있음"],
    suitableWhen: ["우선순위가 다른 여러 업무가 있을 때"], unsuitableWhen: ["단일 기준을 즉시 전면 적용해야 할 때"], prerequisites: ["시범 업무와 성공 기준", "단계별 책임자와 확대 기준"], risks: ["단계 사이 기준이 달라질 수 있음"],
    dimensionScores: { traceability: 4, fieldBurden: 4, implementationEase: 3, costEfficiency: 3, deploymentSpeed: 3, scalability: 5 },
    roadmap: [
      { title: "1단계 · 기준 확인 및 시범 범위", steps: ["시범 업무·공정과 관리 단위를 정합니다.", "입력 위치, 책임 팀, 확대 기준을 확인합니다."] },
      { title: "2단계 · 시범 적용", steps: ["기준정보와 입력 방법을 적용합니다.", "업무 연결, 예외·재작업 처리와 사용자 교육을 진행합니다."] },
      { title: "3단계 · 검증 및 확대", steps: ["누락·현장 부담·업무 결과를 검증합니다.", "다음 적용 범위와 확대 여부를 결정합니다."] }
    ], reconsiderationConditions: ["시범 결과가 성공 기준에 미달하는 경우", "단계별 책임이나 확대 기준이 불명확한 경우"], inputMatchScore: 3
  }
];

function isTraceabilityRequest(request: SolutionRequest, result: SolutionResult) {
  const text = [request.situation, request.currentManagement, request.desiredStandard, request.fieldConstraints, result.inferredDomain, ...result.evidence.flatMap((evidence) => evidence.matchedKeywords)].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
  return result.inferredDomain === "LOT" || text.includes("lot") || text.includes("추적") || text.includes("trace") || text.includes("시리얼");
}

const optionMatchKeywords: Readonly<Record<string, readonly string[]>> = {
  "trace-full-serial": ["시리얼", "개별", "공정", "스캔"],
  "trace-integrated-lot": ["lot", "입고", "보관", "검사", "포장", "출하", "추적", "trace"],
  "trace-lot-centered": ["lot", "단순", "빠른", "부담"],
  "trace-staged-serial": ["시리얼", "시범", "품목", "공정", "확장"],
  "general-integrated": ["통합", "기준", "연결", "업무"],
  "general-lightweight": ["간소", "부담", "입력", "빠른"],
  "general-staged": ["단계", "시범", "확장", "우선순위"]
};

function inputAndKnowledgeMatchScore(option: OptionDefinition, request: SolutionRequest, result: SolutionResult) {
  const fileText = request.fileInputs?.flatMap((file) => [file.extractedText, file.note]) ?? [];
  const evidenceText = result.evidence.flatMap((evidence) => [evidence.title, ...evidence.matchedKeywords]);
  const text = [request.situation, request.currentManagement, request.desiredStandard, request.fieldConstraints, ...fileText, ...evidenceText].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
  return option.inputMatchScore + (optionMatchKeywords[option.id] ?? []).reduce((score, keyword) => score + Number(text.includes(keyword)), 0);
}

function weightedScore(option: OptionDefinition, priorities: SolutionPriorities) {
  return (Object.keys(priorities) as (keyof SolutionPriorities)[]).reduce((total, key) => total + priorities[key] * option.dimensionScores[key], 0);
}

export function buildSolutionOptionComparison(request: SolutionRequest, result: SolutionResult, priorities: SolutionPriorities): SolutionOptionComparison {
  const definitions = isTraceabilityRequest(request, result) ? traceabilityOptions : generalOptions;
  const options = definitions
    .map((option) => ({ ...option, inputMatchScore: inputAndKnowledgeMatchScore(option, request, result), weightedScore: weightedScore(option, priorities), rank: 0, recommended: false as boolean, humanReviewRequired: true as const }))
    .sort((left, right) => right.weightedScore - left.weightedScore
      || right.inputMatchScore - left.inputMatchScore
      || right.dimensionScores.traceability - left.dimensionScores.traceability
      || left.id.localeCompare(right.id))
    .map(({ inputMatchScore: _inputMatchScore, ...option }, index) => ({ ...option, rank: index + 1, recommended: index === 0 }));
  const top = options[0];
  const second = options[1];
  return {
    priorities: { ...priorities },
    options,
    recommendationReason: `${top.title}은(는) 현재 입력과 선택한 우선순위에서 ${solutionPriorityLabels.traceability} ${top.dimensionScores.traceability}/5, ${solutionPriorityLabels.fieldBurden} ${top.dimensionScores.fieldBurden}/5를 기준으로 상대 비교 1순위입니다${second ? ` (${second.title}와 비교)` : ""}. 동점은 입력·지식 일치 점수, 추적성 점수, option id 순으로 결정합니다.`,
    scoreNotice: "비교 점수는 상대 우선순위이며 실제 비용·기간·효과를 보장하지 않습니다. 최종 적용은 컨설턴트와 회사 업무 규칙·기술 조건을 확인해 결정해야 합니다."
  };
}
