import { useState } from "react";
import { FileJson, RotateCcw } from "lucide-react";
import { companyKnowledgeFileLimit, validateCompanyKnowledge } from "./companyKnowledgeValidator";
import type { CompanyKnowledgeArticle } from "./solutionTypes";

interface CompanyKnowledgeSettingsProps {
  companyKnowledge: readonly CompanyKnowledgeArticle[];
  generalKnowledgeCount: number;
  onApply: (articles: readonly CompanyKnowledgeArticle[]) => void;
  onReset: () => void;
}

function isJsonFile(file: File) {
  return file.name.toLocaleLowerCase("ko-KR").endsWith(".json") || file.type === "application/json";
}

export function CompanyKnowledgeSettings({ companyKnowledge, generalKnowledgeCount, onApply, onReset }: CompanyKnowledgeSettingsProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("브라우저 메모리 안에서만 적용되며, 서버로 전송하지 않습니다.");

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || processing) return;
    setError("");
    if (!isJsonFile(file)) {
      setError("회사 지식팩은 .json 또는 application/json 파일만 불러올 수 있습니다.");
      return;
    }
    if (file.size === 0) {
      setError("비어 있는 JSON 파일은 불러올 수 없습니다.");
      return;
    }
    if (file.size > companyKnowledgeFileLimit) {
      setError("회사 지식팩 파일은 최대 256KB까지만 불러올 수 있습니다.");
      return;
    }
    setProcessing(true);
    try {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        setError("회사 지식팩은 UTF-8 JSON 파일이어야 합니다.");
        return;
      }
      if (text.trim().length === 0) {
        setError("비어 있는 JSON 파일은 불러올 수 없습니다.");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        setError("JSON 형식을 읽지 못했습니다. 쉼표와 따옴표를 확인해 주세요.");
        return;
      }
      const validation = validateCompanyKnowledge(parsed);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      onApply(validation.articles);
      setStatus(`${validation.articles.length}개의 회사 지식 항목을 현재 브라우저 세션에 적용했습니다.`);
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    onReset();
    setError("");
    setStatus("회사 지식팩을 초기화했습니다. 기본 지식만 사용합니다.");
  };

  return <section className="ai-solution-center__knowledge-card" data-testid="company-knowledge-settings" aria-busy={processing} aria-labelledby="company-knowledge-heading">
    <div className="ai-solution-center__knowledge-heading"><div><h2 id="company-knowledge-heading">회사 지식 설정</h2><p>회사 ERP·MES 기준을 JSON 파일로 추가하면 컨설턴트 분석과 고객 업무 Q&amp;A의 추천 근거로 함께 사용합니다.</p></div><button className="ai-solution-center__reset-button" data-testid="company-knowledge-reset" type="button" onClick={reset}><RotateCcw size={15} />회사 지식 초기화</button></div>
    <div className="ai-solution-center__knowledge-actions">
      <label className="ai-solution-center__file-label" htmlFor="company-knowledge-input"><FileJson size={16} />회사 지식 불러오기<input id="company-knowledge-input" data-testid="company-knowledge-input" type="file" accept=".json,application/json" aria-invalid={Boolean(error)} onChange={(event) => void handleFile(event)} /></label>
      <span data-testid="company-knowledge-count">현재 적용된 회사 지식 {companyKnowledge.length}개</span>
      <span data-testid="general-knowledge-count">기본 지식 {generalKnowledgeCount}개</span>
    </div>
    <p className="ai-solution-center__file-status" data-testid="company-knowledge-status" role="status" aria-live="polite">{status}</p>
    {error && <p className="ai-solution-center__error" data-testid="company-knowledge-error" role="alert" aria-live="assertive">{error}</p>}
    <section className="ai-solution-center__knowledge-list" aria-labelledby="company-knowledge-list-heading"><h3 id="company-knowledge-list-heading">현재 적용된 회사 지식 목록</h3>{companyKnowledge.length === 0 ? <p>현재 적용된 회사 지식이 없습니다.</p> : <ul data-testid="company-knowledge-list">{companyKnowledge.map((article) => <li key={article.id}><strong>{article.title}</strong><span>{article.category} · 회사 고유 지식</span></li>)}</ul>}</section>
  </section>;
}
