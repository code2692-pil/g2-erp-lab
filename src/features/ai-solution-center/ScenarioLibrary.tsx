import { ChevronDown, ClipboardPenLine } from "lucide-react";
import { solutionScenarios, type SolutionScenario } from "./solutionScenarios";

export function ScenarioLibrary({ onApply }: { onApply: (scenario: SolutionScenario) => void }) {
  return <details className="ai-solution-center__scenario-library" data-testid="scenario-library">
    <summary><span><strong>ERP·MES 업무 예시</strong><small>자주 발생하는 업무 상황을 선택해 입력 예시와 추천 흐름을 빠르게 확인할 수 있습니다.</small></span><ChevronDown size={17} /></summary>
    <p className="ai-solution-center__scenario-notice">일반적인 업무 예시이며 회사 기준과 현장 조건에 따라 결과가 달라질 수 있습니다. 예시 적용 후 자동 분석하지 않습니다.</p>
    <div className="ai-solution-center__scenario-grid">{solutionScenarios.map((scenario) => <article key={scenario.id} data-testid={`scenario-${scenario.id}`}>
      <div><span>{scenario.category}</span><h3>{scenario.title}</h3></div>
      <p>{scenario.problem}</p>
      <dl><div><dt>관련 부서</dt><dd>{scenario.involvedDepartments}</dd></div><div><dt>검토 지식영역</dt><dd>{scenario.expectedKnowledgeCategories.join(", ")}</dd></div></dl>
      <button type="button" data-testid={`scenario-apply-${scenario.id}`} onClick={() => onApply(scenario)}><ClipboardPenLine size={15} />이 예시로 입력</button>
    </article>)}</div>
  </details>;
}
