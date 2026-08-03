import type { SolutionPriorities } from "./solutionTypes";

export interface SolutionScenario {
  id: string;
  title: string;
  category: string;
  problem: string;
  currentMethod: string;
  desiredStandard: string;
  constraints: string;
  involvedDepartments: string;
  priorityPreset: SolutionPriorities;
  expectedKnowledgeCategories: readonly string[];
}

function priorities(overrides: Partial<SolutionPriorities>): SolutionPriorities {
  return { traceability: 3, fieldBurden: 3, implementationEase: 3, costEfficiency: 3, deploymentSpeed: 3, scalability: 3, ...overrides };
}

export const solutionScenarios: readonly SolutionScenario[] = [
  {
    id: "supplier-internal-lot-link",
    title: "공급업체 LOT와 자사 LOT 연결",
    category: "LOT·추적성",
    problem: "공급업체 LOT와 자사 관리 LOT가 달라 입고부터 생산·검사까지 추적이 어렵습니다.",
    currentMethod: "입고 시 공급업체 LOT를 기록하지만 자사 생산 LOT와의 연결은 수기 문서로 확인합니다.",
    desiredStandard: "입고·생산·검사 이력에서 공급업체 LOT와 자사 LOT 연결을 확인할 수 있어야 합니다.",
    constraints: "기존 입고와 생산 입력 흐름을 크게 늘리지 않고 시범 품목부터 적용해야 합니다.",
    involvedDepartments: "구매, 자재, 생산, 품질",
    priorityPreset: priorities({ traceability: 5, fieldBurden: 4 }),
    expectedKnowledgeCategories: ["LOT", "추적성", "자재"]
  },
  {
    id: "serial-start-point",
    title: "시리얼 관리 시작 시점",
    category: "시리얼·추적성",
    problem: "전체 공정 스캔은 어렵지만 검사·포장 이후 개별 추적이 필요합니다.",
    currentMethod: "생산 수량은 LOT 단위로 관리하고 완제품 개별 이력은 별도로 작성합니다.",
    desiredStandard: "검사 또는 포장 시점부터 시리얼을 부여해 출하 이후 개별 이력을 확인합니다.",
    constraints: "전 공정 스캔은 현장 부담이 커서 단계적으로 적용해야 합니다.",
    involvedDepartments: "생산, 품질, 포장, 출하",
    priorityPreset: priorities({ traceability: 5, fieldBurden: 5, scalability: 4 }),
    expectedKnowledgeCategories: ["추적성", "검사", "현장"]
  },
  {
    id: "production-input-burden",
    title: "생산팀 입력 부담",
    category: "현장 입력",
    problem: "품질팀은 상세 추적을 원하지만 생산팀은 추가 입력이 공정 속도를 떨어뜨린다고 합니다.",
    currentMethod: "작업자는 생산실적만 입력하고 품질 추적 정보는 사후에 별도 정리합니다.",
    desiredStandard: "필수 추적 항목을 최소 입력으로 확보하고 부서별 책임 범위를 구분합니다.",
    constraints: "작업 정지나 중복 입력 없이 기존 단말과 바코드를 우선 활용해야 합니다.",
    involvedDepartments: "생산, 품질, 정보시스템",
    priorityPreset: priorities({ fieldBurden: 5, implementationEase: 5, deploymentSpeed: 4 }),
    expectedKnowledgeCategories: ["현장", "생산", "추적성"]
  },
  {
    id: "inspection-rework-history",
    title: "검사 부적합·재작업",
    category: "검사·재작업",
    problem: "검사 부적합 발생 후 재작업·재검사 이력이 원래 생산실적과 연결되지 않습니다.",
    currentMethod: "부적합과 재작업 결과를 엑셀과 작업일보에 각각 기록합니다.",
    desiredStandard: "원 생산실적에서 부적합·재작업·재검사 결과를 순서대로 추적할 수 있어야 합니다.",
    constraints: "재작업 승인 기준과 책임 부서는 회사 업무 규칙으로 별도 확정해야 합니다.",
    involvedDepartments: "생산, 품질, 기술",
    priorityPreset: priorities({ traceability: 5, implementationEase: 4 }),
    expectedKnowledgeCategories: ["검사", "생산", "추적성"]
  },
  {
    id: "warehouse-location-control",
    title: "창고·재고 위치 관리",
    category: "재고·창고",
    problem: "시스템 재고는 있지만 실제 어느 창고·구역·선반에 있는지 찾기 어렵습니다.",
    currentMethod: "창고 단위 수량만 등록하고 세부 위치는 작업자가 기억하거나 메모합니다.",
    desiredStandard: "품목과 LOT별 현재 창고·구역·선반 위치를 조회할 수 있어야 합니다.",
    constraints: "모든 이동을 한 번에 통제하기 어려워 주요 자재와 창고부터 시범 적용합니다.",
    involvedDepartments: "자재, 창고, 생산",
    priorityPreset: priorities({ implementationEase: 4, deploymentSpeed: 5, scalability: 4 }),
    expectedKnowledgeCategories: ["재고", "창고", "LOT"]
  },
  {
    id: "sales-work-order-link",
    title: "수주·작업지시 연결",
    category: "수주·생산",
    problem: "수주 변경 이후 작업지시 수량이나 납기가 일치하지 않는 경우가 발생합니다.",
    currentMethod: "수주 변경 내용을 생산 담당자가 확인한 뒤 작업지시를 수동으로 수정합니다.",
    desiredStandard: "수주 변경과 관련 작업지시의 수량·납기 차이를 검토할 수 있어야 합니다.",
    constraints: "자동 변경보다 담당자 확인과 승인 흐름을 우선 검토해야 합니다.",
    involvedDepartments: "영업, 생산관리, 생산",
    priorityPreset: priorities({ traceability: 4, implementationEase: 4 }),
    expectedKnowledgeCategories: ["생산", "작업지시", "추적성"]
  },
  {
    id: "packing-shipping-trace",
    title: "포장·출하 추적성",
    category: "포장·출하",
    problem: "포장 단위와 출하 단위가 달라 어떤 생산 LOT가 어느 고객에게 출하됐는지 확인이 어렵습니다.",
    currentMethod: "포장 라벨과 출하 문서를 별도로 관리하고 문제가 생기면 수기로 대조합니다.",
    desiredStandard: "포장 단위와 출하 문서에서 생산 LOT와 고객 납품 이력을 연결합니다.",
    constraints: "고객별 라벨 규격과 포장 단위 차이를 함께 확인해야 합니다.",
    involvedDepartments: "생산, 포장, 출하, 영업",
    priorityPreset: priorities({ traceability: 5, scalability: 4 }),
    expectedKnowledgeCategories: ["LOT", "추적성", "출하"]
  },
  {
    id: "equipment-production-impact",
    title: "설비 이상·생산 영향",
    category: "설비·생산",
    problem: "설비 이상 기록과 생산실적·불량 발생 시점이 서로 연결되지 않습니다.",
    currentMethod: "설비 점검일지와 생산실적을 별도 문서로 관리합니다.",
    desiredStandard: "설비 이상 시간대와 작업지시·생산실적·불량 후보를 함께 검토할 수 있어야 합니다.",
    constraints: "PLC 실시간 연동 없이 현재 수집 가능한 설비 로그와 생산 시각부터 비교합니다.",
    involvedDepartments: "생산, 설비보전, 품질",
    priorityPreset: priorities({ implementationEase: 4, scalability: 5 }),
    expectedKnowledgeCategories: ["생산", "설비", "검사"]
  },
  {
    id: "duplicate-master-data",
    title: "기준정보 중복",
    category: "기준정보",
    problem: "같은 품목이나 거래처가 여러 코드로 등록되어 조회와 실적 집계가 일치하지 않습니다.",
    currentMethod: "부서별 엑셀과 시스템 코드를 수기로 대조합니다.",
    desiredStandard: "중복 후보를 검토하고 대표 코드와 사용 중지 기준을 관리합니다.",
    constraints: "자동 통합하지 않고 영향 범위와 담당자 승인을 먼저 확인해야 합니다.",
    involvedDepartments: "영업, 구매, 생산관리, 정보시스템",
    priorityPreset: priorities({ implementationEase: 5, costEfficiency: 4 }),
    expectedKnowledgeCategories: ["자재", "재고", "기타"]
  },
  {
    id: "urgent-work-order",
    title: "긴급 작업지시",
    category: "생산계획",
    problem: "긴급 작업지시가 들어오면 기존 계획과 자재·설비 배정 변경 이력이 남지 않습니다.",
    currentMethod: "전화나 메신저로 우선순위를 바꾸고 작업 완료 후 문서를 정리합니다.",
    desiredStandard: "긴급 사유와 변경 전후 우선순위, 관련 수주와 자재 영향을 검토할 수 있어야 합니다.",
    constraints: "자동 재계획이 아니라 담당자 판단을 지원하는 변경 기록부터 적용합니다.",
    involvedDepartments: "영업, 생산관리, 자재, 생산",
    priorityPreset: priorities({ deploymentSpeed: 5, fieldBurden: 4 }),
    expectedKnowledgeCategories: ["생산", "작업지시", "자재"]
  }
];

export function scenarioById(id: string) {
  return solutionScenarios.find((scenario) => scenario.id === id);
}
